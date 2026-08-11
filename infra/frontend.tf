# SPA servie depuis Object Storage derrière Edge Services (§3).
#
# ⚠️ CONTRAINTE ACTÉE ICI, PAS APRÈS (§9) : la SPA et l'API partagent LE MÊME
# domaine (var.app_domain). Edge Services route :
#   - /api/* → Serverless Container (API)
#   - /*     → bucket Object Storage (SPA)
# C'est ce qui permet le cookie de session SameSite=Lax. Ne pas séparer les
# domaines, sinon bascule forcée en SameSite=None (plus faible, parfois bloqué).

resource "scaleway_object_bucket" "spa" {
  name   = "${var.project_name}-spa"
  region = "fr-par"
}

resource "scaleway_object_bucket_website_configuration" "spa" {
  bucket = scaleway_object_bucket.spa.id
  index_document {
    suffix = "index.html"
  }
  error_document {
    key = "index.html" # SPA : toute route inconnue retombe sur index.html
  }
}

# --- Edge Services -----------------------------------------------------------
# Un seul domaine (var.app_domain) pour la SPA ET l'API — condition du cookie
# SameSite=Lax (§9). Chaîne réelle du pipeline (l'ordre est imposé par l'offre) :
#
#   head → dns_stage (var.app_domain)
#        → tls_stage (certificat managé Let's Encrypt)
#        → cache_stage (fallback_ttl = 0 — voir ⚠️ ci-dessous)
#        → route_stage ── /api/* → backend_stage.api (Serverless Container)
#                       └─ défaut → backend_stage.spa (bucket, mode website)
#
# ⚠️ Le cache Edge est GLOBAL au pipeline et placé AVANT le routage : impossible
# de ne cacher que la SPA par construction. fallback_ttl = 0 signifie « rien
# n'est caché sauf directive Cache-Control explicite de l'origine » :
#   - les assets fingerprintés sont uploadés avec `public, max-age=31536000, immutable`
#   - index.html est uploadé en `no-cache`
#   - l'API répond `no-store` (middleware apps/api) — réponses avec PII (§5)
# NE JAMAIS monter fallback_ttl > 0 : les réponses /api deviendraient cachables.
#
# NB : le backend container n'est configurable que par API/CLI/Terraform (pas
# la console). Le domaine doit être un SOUS-domaine : l'activation passe par un
# CNAME <pipeline-id>.svc.edge.scw.cloud, impossible sur un apex chez un
# registrar externe (voir infra/README.md).

resource "scaleway_edge_services_plan" "main" {
  # Abonnement requis avant tout pipeline. "starter" (0,99 €/mois) est
  # INSUFFISANT : backend_limit = 1, or ce pipeline a DEUX backend stages
  # (SPA + API) — c'est la condition du même-domaine / SameSite=Lax (§9).
  # "professional" (12,99 €/mois) : 10 pipelines, 10 backends, 1 To de cache.
  name = "professional"
}

resource "scaleway_edge_services_pipeline" "main" {
  name       = "${var.project_name}-pipeline"
  depends_on = [scaleway_edge_services_plan.main]
}

resource "scaleway_edge_services_backend_stage" "spa" {
  pipeline_id = scaleway_edge_services_pipeline.main.id

  s3_backend_config {
    bucket_name   = scaleway_object_bucket.spa.name
    bucket_region = "fr-par"
    # Mode website : error_document → index.html sert de fallback SPA.
    # ⚠️ L'endpoint website ne fait AUCUNE auth : les objets doivent être en
    # ACL public-read (posée par deploy.yml au sync), sinon 403 AccessDenied.
    is_website = true
  }
}

resource "scaleway_edge_services_backend_stage" "api" {
  pipeline_id = scaleway_edge_services_pipeline.main.id

  container_backend_config {
    container_id = scaleway_container.api.id
    region       = "fr-par"
  }
}

# WAF sur le trafic API uniquement (la SPA — assets statiques — n'en a pas
# besoin). Inclus dans le plan professional : 5 M de requêtes filtrées/mois,
# puis 0,60 €/M. Paranoia 1 : l'API accepte du texte libre (messages avec
# téléphones/adresses) — un niveau plus élevé bloquerait des requêtes légitimes
# pendant le pic. Monter en "log_only" d'abord si on veut tester un niveau 2.
resource "scaleway_edge_services_waf_stage" "api" {
  pipeline_id    = scaleway_edge_services_pipeline.main.id
  mode           = "enable"
  paranoia_level = 1
  # Après filtrage, le WAF forwarde vers le container API.
  backend_stage_id = scaleway_edge_services_backend_stage.api.id
}

resource "scaleway_edge_services_route_stage" "main" {
  pipeline_id = scaleway_edge_services_pipeline.main.id
  # Défaut : tout ce qui ne matche aucune règle → SPA.
  backend_stage_id = scaleway_edge_services_backend_stage.spa.id

  rule {
    # /api/* passe par le WAF, qui forwarde ensuite au backend API.
    waf_stage_id = scaleway_edge_services_waf_stage.api.id
    rule_http_match {
      path_filter {
        path_filter_type = "regex"
        value            = "^/api/.*"
      }
    }
  }
}

resource "scaleway_edge_services_cache_stage" "main" {
  pipeline_id    = scaleway_edge_services_pipeline.main.id
  route_stage_id = scaleway_edge_services_route_stage.main.id
  # 0 = aucun cache sans directive explicite de l'origine. NE PAS AUGMENTER (PII).
  fallback_ttl = 0
}

resource "scaleway_edge_services_tls_stage" "main" {
  pipeline_id         = scaleway_edge_services_pipeline.main.id
  cache_stage_id      = scaleway_edge_services_cache_stage.main.id
  managed_certificate = true # Let's Encrypt géré — requiert le CNAME déjà posé
}

resource "scaleway_edge_services_dns_stage" "main" {
  pipeline_id  = scaleway_edge_services_pipeline.main.id
  tls_stage_id = scaleway_edge_services_tls_stage.main.id
  fqdns        = [var.app_domain]
}

resource "scaleway_edge_services_head_stage" "main" {
  pipeline_id   = scaleway_edge_services_pipeline.main.id
  head_stage_id = scaleway_edge_services_dns_stage.main.id
}
