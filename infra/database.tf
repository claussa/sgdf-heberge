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

# Sans ACL déclarée, une instance RDB est ouverte à 0.0.0.0/0 par défaut — on
# rend cet état EXPLICITE plutôt que d'en hériter silencieusement. Restriction
# par IP impossible ici : ni les Serverless Containers ni les runners GitHub
# (migrations de la CI) n'ont d'IP sortante fixe. Défenses réelles : TLS
# obligatoire (sslmode=require dans l'URL), mot de passe fort de 32 caractères,
# chiffrement au repos + chiffrement applicatif des champs PII (§6).
# Durcissement (private network + relais de migration) : hors scope v1.
resource "scaleway_rdb_acl" "main" {
  instance_id = scaleway_rdb_instance.main.id

  acl_rules {
    ip          = "0.0.0.0/0"
    description = "Containers serverless + runners GitHub (IP non fixes) — TLS + mdp requis"
  }
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
