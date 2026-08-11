# Cockpit — logs et métriques (§3, §7).
#
# ⚠️ Les logs sont une copie des PII potentielle : rétention COURTE et explicite.
# La rétention se règle par plan Cockpit / politique de rétention des data sources.
# Cible : var.cockpit_logs_retention_days (7 jours par défaut).
#
# Garde-fous applicatifs déjà en place (§7) :
#   - pino avec liste de champs redactés en dur (apps/api/src/lib/logger.ts)
#   - jamais log: ['query'] sur PrismaClient
#   - identifiants en logs = IDs, jamais d'emails
#   - le chemin loggé exclut la query string (token du magic link)

resource "scaleway_cockpit_source" "logs" {
  name           = "${var.project_name}-logs"
  type           = "logs"
  region         = "fr-par"
  retention_days = var.cockpit_logs_retention_days
}

resource "scaleway_cockpit_source" "metrics" {
  name           = "${var.project_name}-metrics"
  type           = "metrics"
  region         = "fr-par"
  retention_days = 31
}

# Alerte à câbler (Grafana/Cockpit) : taux d'erreur d'envoi Resend = alerte de
# DISPONIBILITÉ DE L'AUTHENTIFICATION (§8) — l'email est le seul moyen de connexion.
