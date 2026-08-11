# Secret Manager (§3) : JAMAIS de secret en variable d'env en clair dans le container.
# Les VALEURS des secrets applicatifs (clé de chiffrement, sel du blind index,
# clé Resend) sont créées ici en coquille vide et renseignées HORS Terraform :
#   scw secret version create <id> data=@fichier
# pour qu'elles ne transitent ni par le code, ni par l'état Terraform.

resource "scaleway_secret" "encryption_key" {
  name = "${var.project_name}-prisma-field-encryption-key"
  # Format k1.aesgcm256.<base64url> (§6). Prévoir PRISMA_FIELD_DECRYPTION_KEYS pour la rotation.
}

resource "scaleway_secret" "hash_salt" {
  name = "${var.project_name}-blind-index-salt"
  # DISTINCT de la clé de chiffrement (§6).
}

resource "scaleway_secret" "resend_api_key" {
  name = "${var.project_name}-resend-api-key"
}

resource "scaleway_secret" "resend_webhook_secret" {
  name = "${var.project_name}-resend-webhook-secret"
}

resource "scaleway_secret" "job_secret" {
  name = "${var.project_name}-job-secret"
  # Secret d'appel de POST /api/internal/jobs/daily (déclenchement manuel de secours ;
  # le déclenchement nominal est le Serverless Job planifié, sans HTTP).
}

# Lecture des versions posées HORS Terraform (scw secret version create …).
# ⚠️ Ces data sources font transiter les valeurs par l'état Terraform : le backend
# d'état doit être un bucket à accès restreint (voir versions.tf). C'est le compromis
# assumé pour que le container démarre avec ses secrets sans pipeline supplémentaire.
data "scaleway_secret_version" "encryption_key" {
  secret_id = scaleway_secret.encryption_key.id
  revision  = "latest_enabled"
}

data "scaleway_secret_version" "hash_salt" {
  secret_id = scaleway_secret.hash_salt.id
  revision  = "latest_enabled"
}

data "scaleway_secret_version" "resend_api_key" {
  secret_id = scaleway_secret.resend_api_key.id
  revision  = "latest_enabled"
}

data "scaleway_secret_version" "resend_webhook_secret" {
  secret_id = scaleway_secret.resend_webhook_secret.id
  revision  = "latest_enabled"
}

data "scaleway_secret_version" "job_secret" {
  secret_id = scaleway_secret.job_secret.id
  revision  = "latest_enabled"
}

# L'URL de connexion est composée ici (mot de passe géré par Terraform) et stockée
# comme secret. Pool explicite dans l'URL (§5).
resource "scaleway_secret" "database_url" {
  name = "${var.project_name}-database-url"
}

# ⚠️ Composée dans un local et référencée PARTOUT via local.database_url :
# l'attribut .data relu depuis l'API (ressource comme data source) revient
# encodé en base64 — l'injecter tel quel casse Prisma au runtime.
locals {
  database_url = format(
    "postgresql://%s:%s@%s:%d/%s?connection_limit=10&pool_timeout=20&sslmode=require",
    scaleway_rdb_user.app.name,
    random_password.db_user.result,
    scaleway_rdb_instance.main.endpoint_ip,
    scaleway_rdb_instance.main.endpoint_port,
    scaleway_rdb_database.app.name,
  )
}

resource "scaleway_secret_version" "database_url" {
  secret_id = scaleway_secret.database_url.id
  data      = local.database_url
}
