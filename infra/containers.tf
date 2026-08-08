# Container Registry + Serverless Container pour l'API (§3).

resource "scaleway_registry_namespace" "main" {
  name       = "${var.project_name}-registry"
  region     = "fr-par"
  is_public  = false
}

resource "scaleway_container_namespace" "main" {
  name   = "${var.project_name}-api-ns"
  region = "fr-par"
}

resource "scaleway_container" "api" {
  name         = "${var.project_name}-api"
  namespace_id = scaleway_container_namespace.main.id

  registry_image = "${scaleway_registry_namespace.main.endpoint}/api:${var.api_image_tag}"
  port           = 3001
  protocol       = "http1"

  cpu_limit          = 1000                # mvCPU
  memory_limit_bytes = 1024 * 1024 * 1024 # 1 Gio

  min_scale = var.container_min_scale
  max_scale = var.container_max_scale

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

  # Secrets injectés chiffrés — jamais en clair dans le code ou l'état applicatif (§9).
  # NOTE : renseigner les versions de secrets AVANT le premier déploiement (voir secrets.tf).
  secret_environment_variables = {
    DATABASE_URL                      = scaleway_secret_version.database_url.data
    PRISMA_FIELD_ENCRYPTION_KEY       = "" # scw secret : ${scaleway_secret.encryption_key.id}
    PRISMA_FIELD_ENCRYPTION_HASH_SALT = "" # scw secret : ${scaleway_secret.hash_salt.id}
    RESEND_API_KEY                    = "" # scw secret : ${scaleway_secret.resend_api_key.id}
    RESEND_WEBHOOK_SECRET             = "" # scw secret : ${scaleway_secret.resend_webhook_secret.id}
  }

  liveness_probe {
    http {
      path = "/api/health"
    }
    interval          = "10s"
    timeout           = "5s"
    failure_threshold = 3
  }
}
