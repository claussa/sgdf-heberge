output "db_endpoint" {
  value       = "${scaleway_rdb_instance.main.endpoint_ip}:${scaleway_rdb_instance.main.endpoint_port}"
  description = "Endpoint PostgreSQL managé"
}

output "registry_endpoint" {
  value       = scaleway_registry_namespace.main.endpoint
  description = "Registry pour l'image API (docker push)"
}

output "container_endpoint" {
  value       = scaleway_container.api.public_endpoint
  description = "Endpoint natif du container (avant routage Edge Services)"
}

output "spa_bucket" {
  value       = scaleway_object_bucket.spa.name
  description = "Bucket de la SPA (variable GitHub SCW_SPA_BUCKET)"
}

# --- IDs consommés par la CI (variables GitHub, voir infra/README.md) --------
# basename() retire le préfixe régional des IDs Terraform (`fr-par/<uuid>`) :
# le CLI scw attend l'UUID nu.

output "container_id" {
  value       = basename(scaleway_container.api.id)
  description = "SCW_CONTAINER_ID — cible de `scw container container update`"
}

output "job_definition_id" {
  value       = basename(scaleway_job_definition.daily.id)
  description = "SCW_JOB_DEFINITION_ID — cible de `scw jobs definition update`"
}

output "edge_pipeline_id" {
  value       = basename(scaleway_edge_services_pipeline.main.id)
  description = "SCW_EDGE_PIPELINE_ID — cible de la purge de cache Edge Services"
}

output "edge_cname_target" {
  value       = "${basename(scaleway_edge_services_pipeline.main.id)}.svc.edge.scw.cloud"
  description = "Cible du CNAME à créer chez le registrar pour var.app_domain"
}

# --- IDs des secrets (runbook : `scw secret version create <id> …`) ----------

output "secret_encryption_key_id" {
  value       = basename(scaleway_secret.encryption_key.id)
  description = "Secret PRISMA_FIELD_ENCRYPTION_KEY (valeur à poser hors Terraform)"
}

output "secret_hash_salt_id" {
  value       = basename(scaleway_secret.hash_salt.id)
  description = "Secret PRISMA_FIELD_ENCRYPTION_HASH_SALT (valeur à poser hors Terraform)"
}

output "secret_resend_api_key_id" {
  value       = basename(scaleway_secret.resend_api_key.id)
  description = "Secret RESEND_API_KEY (valeur à poser hors Terraform)"
}

output "secret_resend_webhook_secret_id" {
  value       = basename(scaleway_secret.resend_webhook_secret.id)
  description = "Secret RESEND_WEBHOOK_SECRET (valeur à poser hors Terraform)"
}

output "secret_job_secret_id" {
  value       = basename(scaleway_secret.job_secret.id)
  description = "Secret JOB_SECRET (valeur à poser hors Terraform)"
}

output "secret_database_url_id" {
  value       = basename(scaleway_secret.database_url.id)
  description = "SCW_DATABASE_URL_SECRET_ID — lu par le job migrate de la CI"
}

# --- Clé API de la CI (à copier dans les secrets GitHub) ---------------------

output "ci_access_key" {
  value       = scaleway_iam_api_key.ci.access_key
  description = "SCW_ACCESS_KEY (secret GitHub)"
}

output "ci_secret_key" {
  value       = scaleway_iam_api_key.ci.secret_key
  description = "SCW_SECRET_KEY (secret GitHub) — `terraform output -raw ci_secret_key`"
  sensitive   = true
}
