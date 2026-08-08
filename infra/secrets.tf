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

# L'URL de connexion est composée ici (mot de passe géré par Terraform) et stockée
# comme secret. Pool explicite dans l'URL (§5).
resource "scaleway_secret" "database_url" {
  name = "${var.project_name}-database-url"
}

resource "scaleway_secret_version" "database_url" {
  secret_id = scaleway_secret.database_url.id
  data = format(
    "postgresql://%s:%s@%s:%d/%s?connection_limit=10&pool_timeout=20&sslmode=require",
    scaleway_rdb_user.app.name,
    random_password.db_user.result,
    scaleway_rdb_instance.main.load_balancer[0].ip,
    scaleway_rdb_instance.main.load_balancer[0].port,
    scaleway_rdb_database.app.name,
  )
}
