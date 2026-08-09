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

  # Backend d'état : bucket Object Storage dédié (à créer hors Terraform).
  # ⚠️ L'état contient des VALEURS de secrets (database_url composée ici, et les
  # data sources secret_version) — accès au bucket strictement restreint.
  # backend "s3" {
  #   bucket                      = "sgdf-heberge-terraform-state"
  #   key                         = "prod/terraform.tfstate"
  #   region                      = "fr-par"
  #   endpoints                   = { s3 = "https://s3.fr-par.scw.cloud" }
  #   skip_credentials_validation = true
  #   skip_region_validation      = true
  #   skip_requesting_account_id  = true
  # }
}

provider "scaleway" {
  region = "fr-par"
  zone   = "fr-par-1"
}
