# Infra Scaleway — tout en région fr-par (souveraineté UE, §1).
terraform {
  required_version = ">= 1.6"

  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = ">= 2.48"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.6"
    }
  }

  # Backend d'état : bucket Object Storage dédié (à créer hors Terraform, voir
  # README §« Ordre de mise en route »).
  # ⚠️ L'état contient des VALEURS de secrets (database_url composée ici, les
  # data sources secret_version, la clé API de la CI) — accès au bucket
  # strictement restreint. Credentials via AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY
  # (clé IAM de l'opérateur, PAS celle de la CI). Pas de verrou d'état : un seul
  # opérateur Terraform à la fois.
  backend "s3" {
    bucket                      = "sgdf-heberge-terraform-state"
    key                         = "prod/terraform.tfstate"
    region                      = "fr-par"
    endpoints                   = { s3 = "https://s3.fr-par.scw.cloud" }
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    # Requis avec Terraform >= 1.6.3 contre un endpoint S3 non-AWS (checksums SDK).
    skip_s3_checksum = true
  }
}

provider "scaleway" {
  region = "fr-par"
  zone   = "fr-par-1"
}
