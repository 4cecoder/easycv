#!/bin/sh
# GitLab CI: export Object Storage keys, terraform init, and one-time copy of
# GitLab HTTP state (name: vke) if the S3 state is empty.
#
# Source from the job so AWS_* exports stay in the current shell:
#   . "$CI_PROJECT_DIR/terraform/scripts/gitlab-init.sh"

set -eu

if [ -z "${CI_PROJECT_DIR:-}" ]; then
  echo "gitlab-init.sh is meant to run in GitLab CI (CI_PROJECT_DIR is unset)."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  if command -v apk >/dev/null 2>&1; then
    apk add --no-cache curl jq >/dev/null
  else
    echo "curl and jq are required to import GitLab HTTP state if S3 is empty."
    exit 1
  fi
fi

# shellcheck disable=SC1091
. "${CI_PROJECT_DIR}/terraform/scripts/configure-s3-backend.sh"

TF_DIR="${CI_PROJECT_DIR}/terraform"
if [ -n "${VULTR_API_KEY:-}" ]; then
  export TF_VAR_vultr_api_key="${VULTR_API_KEY}"
fi

terraform -chdir="$TF_DIR" init -input=false -reconfigure

STATE_NAME="${TF_STATE_NAME:-vke}"
listed="$(terraform -chdir="$TF_DIR" state list 2>/dev/null || true)"
if [ -n "$listed" ]; then
  echo "Vultr Object Storage already has Terraform state; skipping GitLab HTTP import."
elif [ -z "${CI_JOB_TOKEN:-}" ] || [ -z "${CI_API_V4_URL:-}" ] || [ -z "${CI_PROJECT_ID:-}" ]; then
  echo "S3 state is empty and GitLab HTTP credentials are unavailable; starting fresh."
else
  echo "S3 state is empty; trying GitLab HTTP backend '${STATE_NAME}'..."
  http_code="$(curl -sS -o /tmp/gitlab.tfstate -w "%{http_code}" \
    --user "gitlab-ci-token:${CI_JOB_TOKEN}" \
    "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/terraform/state/${STATE_NAME}" || true)"

  if [ "$http_code" != "200" ]; then
    echo "GitLab HTTP state not found (HTTP ${http_code}); using empty Object Storage state."
    rm -f /tmp/gitlab.tfstate
  elif ! jq -e '.serial' /tmp/gitlab.tfstate >/dev/null 2>&1; then
    echo "GitLab HTTP response was not Terraform state JSON; using empty Object Storage state."
    rm -f /tmp/gitlab.tfstate
  else
    resources="$(jq '.resources | length' /tmp/gitlab.tfstate)"
    if [ "$resources" = "0" ]; then
      echo "GitLab HTTP state has no resources; using empty Object Storage state."
      rm -f /tmp/gitlab.tfstate
    else
      terraform -chdir="$TF_DIR" state push -force /tmp/gitlab.tfstate
      echo "Imported GitLab HTTP state (${resources} resource block(s)) into Vultr Object Storage."
      rm -f /tmp/gitlab.tfstate
    fi
  fi
fi
