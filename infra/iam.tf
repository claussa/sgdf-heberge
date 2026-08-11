# Identité IAM de la CI GitHub Actions (deploy.yml) — permissions minimales.
#
# ⚠️ La secret key générée ici transite par l'état Terraform — même compromis
# que les data sources de secrets.tf : le backend d'état est un bucket à accès
# restreint (versions.tf). Alternative si ce compromis ne convient plus : créer
# l'application/policy ici mais la clé API à la main en console, avec la même
# liste de permission sets.
#
# L'opérateur qui applique ce fichier doit avoir les droits IAM (portée
# organisation), pas seulement projet.

resource "scaleway_iam_application" "ci" {
  name        = "${var.project_name}-ci"
  description = "GitHub Actions — deploy.yml (push image, sync SPA, migrations, bascule)"
}

resource "scaleway_iam_policy" "ci" {
  name           = "${var.project_name}-ci"
  application_id = scaleway_iam_application.ci.id

  rule {
    project_ids = [scaleway_container_namespace.main.project_id]
    permission_set_names = [
      "ContainerRegistryFullAccess", # docker push de l'image API
      "ObjectStorageFullAccess",     # sync de la SPA vers le bucket
      "ContainersFullAccess",        # scw container container update (bascule)
      "ServerlessJobsFullAccess",    # scw jobs definition update (alignement du job)
      "EdgeServicesFullAccess",      # purge du cache après déploiement SPA
      "SecretManagerReadOnly",       # métadonnées des secrets
      "SecretManagerSecretAccess",   # lecture de la VALEUR de database_url (migrations)
    ]
  }
}

resource "scaleway_iam_api_key" "ci" {
  application_id = scaleway_iam_application.ci.id
  description    = "Clé CI GitHub Actions (SCW_ACCESS_KEY / SCW_SECRET_KEY)"
}
