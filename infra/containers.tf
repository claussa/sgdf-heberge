# Container Registry + Serverless Container pour l'API (§3).

resource "scaleway_registry_namespace" "main" {
  name      = "${var.project_name}-registry"
  region    = "fr-par"
  is_public = false
}

resource "scaleway_container_namespace" "main" {
  name   = "${var.project_name}-api-ns"
  region = "fr-par"
}

resource "scaleway_container" "api" {
  name         = "${var.project_name}-api"
  namespace_id = scaleway_container_namespace.main.id

  image    = "${scaleway_registry_namespace.main.endpoint}/api:${var.api_image_tag}"
  port     = 3001
  protocol = "http1"

  cpu_limit          = 1000               # mvCPU
  memory_limit_bytes = 1024 * 1024 * 1024 # 1 Gio

  min_scale = var.container_min_scale
  max_scale = var.container_max_scale

  # v2 (gVisor) = cold starts rapides — important tant que min_scale = 0.
  # Défaut de l'API pour les nouveaux containers depuis sept. 2024, épinglé ici
  # pour ne pas dépendre d'un défaut silencieux. Compatible avec la stack :
  # Prisma 6 en moteur library (in-process), pas d'écriture /tmp en prod.
  sandbox = "v2"

  # ⚠️ POINT CRITIQUE (§3) : concurrence par instance EXPLICITEMENT > 1, sinon
  # saturation des connexions PostgreSQL garantie pendant le pic.
  scaling_option {
    concurrent_requests_threshold = var.container_max_concurrency
  }

  https_connections_only = true

  environment_variables = {
    NODE_ENV     = "production"
    PORT         = "3001"
    EMAIL_DRIVER = "resend"
    EMAIL_FROM   = "Connexion <auth@${var.app_domain}>"
    APP_ORIGIN   = "https://${var.app_domain}"
  }

  # Secrets injectés chiffrés — jamais en clair dans le code (§9).
  # PRÉREQUIS : poser les versions AVANT le premier apply (scw secret version create …),
  # sinon les data sources de secrets.tf échouent — c'est voulu (fail fast, pas de "" qui
  # ferait planter EnvSchema au boot).
  secret_environment_variables = {
    DATABASE_URL                      = scaleway_secret_version.database_url.data
    PRISMA_FIELD_ENCRYPTION_KEY       = data.scaleway_secret_version.encryption_key.data
    PRISMA_FIELD_ENCRYPTION_HASH_SALT = data.scaleway_secret_version.hash_salt.data
    RESEND_API_KEY                    = data.scaleway_secret_version.resend_api_key.data
    RESEND_WEBHOOK_SECRET             = data.scaleway_secret_version.resend_webhook_secret.data
    JOB_SECRET                        = data.scaleway_secret_version.job_secret.data
  }

  liveness_probe {
    http {
      path = "/api/health"
    }
    interval          = "10s"
    timeout           = "5s"
    failure_threshold = 3
  }

  # L'image est pilotée par la CI (deploy.yml : tag = SHA git, rollback = ancien
  # SHA). Terraform ne pose que l'image initiale (var.api_image_tag) et n'y
  # touche plus — sinon chaque apply écraserait la version déployée.
  lifecycle {
    ignore_changes = [image]
  }
}

# ---------------------------------------------------------------------------
# Job quotidien (expiration des demandes, relances, masquage, purges) — §plan v1.
# Serverless Job : même image que l'API, commande dédiée, AUCUN HTTP à exposer.
# (POST /api/internal/jobs/daily reste disponible comme déclenchement manuel de secours,
# protégé par JOB_SECRET.)
# ---------------------------------------------------------------------------

resource "scaleway_job_definition" "daily" {
  name                   = "${var.project_name}-daily-job"
  region                 = "fr-par"
  cpu_limit              = 500
  memory_limit           = 512
  local_storage_capacity = 1000
  image_uri              = "${scaleway_registry_namespace.main.endpoint}/api:${var.api_image_tag}"
  startup_command        = ["node", "dist/jobs/daily.js"]
  timeout                = "10m"

  cron {
    # 07:00 Europe/Paris, tous les jours — avant les heures d'activité.
    schedule = "0 7 * * *"
    timezone = "Europe/Paris"
  }

  env = {
    NODE_ENV     = "production"
    EMAIL_DRIVER = "resend"
    EMAIL_FROM   = "Connexion <auth@${var.app_domain}>"
    APP_ORIGIN   = "https://${var.app_domain}"
  }

  # Secrets via références Secret Manager — jamais dans `env` : les valeurs y
  # seraient visibles en clair dans la console/API Scaleway (§9).
  secret_reference {
    secret_id   = scaleway_secret.database_url.id
    environment = "DATABASE_URL"
  }
  secret_reference {
    secret_id   = scaleway_secret.encryption_key.id
    environment = "PRISMA_FIELD_ENCRYPTION_KEY"
  }
  secret_reference {
    secret_id   = scaleway_secret.hash_salt.id
    environment = "PRISMA_FIELD_ENCRYPTION_HASH_SALT"
  }
  secret_reference {
    secret_id   = scaleway_secret.resend_api_key.id
    environment = "RESEND_API_KEY"
  }
  secret_reference {
    secret_id   = scaleway_secret.job_secret.id
    environment = "JOB_SECRET"
  }

  # Même pilotage par la CI que le container : deploy.yml aligne image_uri sur
  # le SHA déployé (`scw jobs definition update`).
  lifecycle {
    ignore_changes = [image_uri]
  }
}
