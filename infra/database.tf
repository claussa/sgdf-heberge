# PostgreSQL 16 managé, région fr-par (§2, §3).
resource "scaleway_rdb_instance" "main" {
  name      = "${var.project_name}-db"
  node_type = var.db_node_type
  engine    = "PostgreSQL-16"
  region    = "fr-par"

  # HA activable à chaud pour la fenêtre de pic (§3, §12)
  is_ha_cluster = var.db_is_ha

  disable_backup            = false
  backup_schedule_frequency = 24 # heures
  backup_schedule_retention = 7  # jours — rétention courte : les backups sont des copies de PII
  backup_same_region        = true

  volume_type       = "sbs_5k"
  volume_size_in_gb = 10

  encryption_at_rest = true

  # ⚠️ FIN DE RUN (§12) : détruire l'instance NE PURGE PAS snapshots et backups.
  # Procédure de purge explicite documentée dans infra/README.md — à exécuter.
}

resource "scaleway_rdb_database" "app" {
  instance_id = scaleway_rdb_instance.main.id
  name        = "adherents"
}

resource "random_password" "db_user" {
  length  = 32
  special = false
}

resource "scaleway_rdb_user" "app" {
  instance_id = scaleway_rdb_instance.main.id
  name        = "app"
  password    = random_password.db_user.result
  is_admin    = false
}

resource "scaleway_rdb_privilege" "app" {
  instance_id   = scaleway_rdb_instance.main.id
  user_name     = scaleway_rdb_user.app.name
  database_name = scaleway_rdb_database.app.name
  permission    = "all"
}
