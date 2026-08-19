terraform {
  required_version = ">= 1.6.0"

  required_providers {
    vultr = {
      source  = "vultr/vultr"
      version = "~> 2.27"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.5"
    }
  }

  # Vultr Object Storage (atl2). Credentials: AWS_ACCESS_KEY_ID /
  # AWS_SECRET_ACCESS_KEY (GitLab: VULTR_S3_ACCESS_KEY / VULTR_S3_SECRET_KEY).
  backend "s3" {
    bucket                      = "easycvtfstate"
    key                         = "vke/terraform.tfstate"
    region                      = "us-east-1"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
    endpoints = {
      s3 = "https://atl2.vultrobjects.com"
    }
  }
}

provider "vultr" {
  # Auth: VULTR_API_KEY environment variable (GitLab CI/CD variable).
  rate_limit  = 700
  retry_limit = 3
}
