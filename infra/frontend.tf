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
# Le pipeline Edge Services (domaine, TLS, routage /api vs statique, cache) se
# configure via les ressources scaleway_edge_services_* (pipeline, dns_stage,
# tls_stage, cache_stage, backend_stage, route_stage). L'offre évolue vite côté
# provider : valider les arguments avec `terraform plan` sur la version épinglée
# avant d'appliquer. Schéma cible :
#
#   pipeline
#     └─ dns_stage (var.app_domain)
#         └─ tls_stage (certificat managé)
#             └─ route_stage
#                  ├─ rule: path_prefix "/api" → backend_stage(container api)
#                  └─ défaut                   → cache_stage → backend_stage(bucket spa)
#
# Cache : uniquement sur les assets fingerprintés de la SPA (immutable).
# JAMAIS de cache sur /api (réponses contenant des PII, §5).
