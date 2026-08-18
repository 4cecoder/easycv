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

  # GitLab-managed HTTP state. Address and credentials are injected in CI
  # via TF_HTTP_* (see terraform/.gitlab-ci.yml). For local runs:
  #   terraform init -backend=false
  backend "http" {}
}

provider "vultr" {
  # Auth: VULTR_API_KEY environment variable (GitLab CI/CD variable).
  rate_limit  = 700
  retry_limit = 3
}
