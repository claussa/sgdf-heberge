variable "project_name" {
  description = "Préfixe des ressources"
  type        = string
  default     = "sgdf-heberge"
}

variable "app_domain" {
  description = "Domaine unique servant la SPA ET l'API (/api) — requis par SameSite=Lax (§9)"
  type        = string
}

variable "db_node_type" {
  description = "Gamme de la Managed Database. Dev : DB-DEV-S (~11 €/mois). Pic : monter en gamme."
  type        = string
  default     = "DB-DEV-S"
}

variable "db_is_ha" {
  description = "HA de la DB (§3) : à activer pour la fenêtre de pic (facturation horaire, bascule à chaud)"
  type        = bool
  default     = false
}

variable "container_min_scale" {
  description = "0 = scale-to-zero (cold starts) ; passer à 1+ pendant la campagne d'inscription"
  type        = number
  default     = 0
}

variable "container_max_scale" {
  description = "Plafond d'instances. max_scale × max_concurrency doit rester sous max_connections de la DB (§2)"
  type        = number
  default     = 5
}

variable "container_max_concurrency" {
  description = "⚠️ DOIT être > 1 (§3) : sinon 200 requêtes = 200 instances = 200 connexions PostgreSQL. 80 = défaut plateforme ET maximum dur par instance ; charge I/O-bound → concurrence haute = moins d'instances, moins de cold starts, moins de connexions DB. À recaler pendant la charge de test (§11)."
  type        = number
  default     = 80

  validation {
    condition     = var.container_max_concurrency > 1 && var.container_max_concurrency <= 80
    error_message = "La concurrence par instance doit être > 1 (§3 du CLAUDE.md — saturation DB garantie sinon) et ≤ 80 (maximum dur Scaleway par instance)."
  }
}

variable "api_image_tag" {
  description = "Tag de l'image API dans le Container Registry"
  type        = string
  default     = "latest"
}

variable "posthog_api_key" {
  description = "Clé de projet PostHog Cloud EU (events + erreurs API). Vide = télémétrie désactivée. Ce n'est PAS un secret : la même clé est publique dans le bundle front."
  type        = string
  default     = ""
}

variable "cockpit_logs_retention_days" {
  description = "Rétention Cockpit COURTE (§7) : les logs sont une copie des PII"
  type        = number
  default     = 7
}
