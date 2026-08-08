output "db_endpoint" {
  value       = "${scaleway_rdb_instance.main.load_balancer[0].ip}:${scaleway_rdb_instance.main.load_balancer[0].port}"
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
  description = "Bucket de la SPA (déployer apps/web/dist)"
}
