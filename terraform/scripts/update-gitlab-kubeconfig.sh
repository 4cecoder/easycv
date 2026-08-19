#!/bin/sh
# Write Terraform's kubeconfig into the GitLab CI/CD file variable KUBECONFIG.
#
# CI_JOB_TOKEN cannot update CI/CD variables. Set GITLAB_API_TOKEN once:
#   GitLab → Settings → Access Tokens
#     Token name: ci-kubeconfig
#     Role: Maintainer
#     Scope: api
#   then Settings → CI/CD → Variables:
#     GITLAB_API_TOKEN  (Masked; Protected is fine — cluster:apply only runs on master)
#
# Usage: update-gitlab-kubeconfig.sh /tmp/kubeconfig.yaml

set -eu

KUBECONFIG_FILE="${1:-}"
TOKEN="${GITLAB_API_TOKEN:-${GITLAB_TOKEN:-}}"

if [ -z "$KUBECONFIG_FILE" ] || [ ! -s "$KUBECONFIG_FILE" ]; then
  echo "usage: update-gitlab-kubeconfig.sh /path/to/kubeconfig.yaml"
  exit 1
fi

if ! grep -q "apiVersion" "$KUBECONFIG_FILE"; then
  echo "Refusing to upload: ${KUBECONFIG_FILE} does not look like a kubeconfig."
  exit 1
fi

if [ -z "$TOKEN" ]; then
  echo "GITLAB_API_TOKEN is not set, so KUBECONFIG cannot be updated from CI."
  echo "Create a Project Access Token (Maintainer, api scope) and add it as a masked CI/CD variable."
  echo "GitLab deploy already reads kubeconfig from Terraform state; this token only syncs the KUBECONFIG file variable."
  exit 1
fi

if [ -z "${CI_API_V4_URL:-}" ] || [ -z "${CI_PROJECT_ID:-}" ]; then
  echo "CI_API_V4_URL / CI_PROJECT_ID are unset; this script is meant to run in GitLab CI."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  if command -v apk >/dev/null 2>&1; then
    apk add --no-cache curl jq >/dev/null
  else
    echo "curl and jq are required to update the GitLab KUBECONFIG variable."
    exit 1
  fi
fi

VARS_URL="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/variables"
AUTH_HEADER="PRIVATE-TOKEN: ${TOKEN}"

list_code="$(curl -sS -o /tmp/gl-vars.json -w "%{http_code}" \
  --header "$AUTH_HEADER" \
  "${VARS_URL}?per_page=100")"

if [ "$list_code" != "200" ]; then
  echo "Could not list project CI/CD variables (HTTP ${list_code})."
  echo "GITLAB_API_TOKEN needs Maintainer role and the api scope (CI_JOB_TOKEN cannot do this)."
  cat /tmp/gl-vars.json
  echo
  exit 1
fi

write_payload() {
  scope="$1"
  protected="$2"
  jq -n --rawfile value "$KUBECONFIG_FILE" \
    --arg scope "$scope" \
    --argjson protected "$protected" \
    '{
      value: $value,
      variable_type: "file",
      raw: true,
      masked: false,
      protected: $protected,
      environment_scope: $scope,
      description: "VKE kubeconfig written by cluster:apply"
    }' > /tmp/gl-kubeconfig-payload.json
}

put_kubeconfig() {
  scope="$1"
  protected="$2"
  enc_scope="$(printf '%s' "$scope" | jq -sRr @uri | tr -d '\n')"
  write_payload "$scope" "$protected"
  put_code="$(curl -sS -o /tmp/gl-var.json -w "%{http_code}" \
    --request PUT \
    --globoff \
    --header "$AUTH_HEADER" \
    --header "Content-Type: application/json" \
    --data @/tmp/gl-kubeconfig-payload.json \
    "${VARS_URL}/KUBECONFIG?filter[environment_scope]=${enc_scope}")"
  if [ "$put_code" = "200" ]; then
    echo "Updated GitLab file variable KUBECONFIG (environment_scope=${scope})."
    return 0
  fi
  echo "PUT KUBECONFIG (scope=${scope}) returned HTTP ${put_code}:"
  cat /tmp/gl-var.json
  echo
  return 1
}

create_kubeconfig() {
  write_payload "*" "false"
  jq '. + {key: "KUBECONFIG"}' /tmp/gl-kubeconfig-payload.json > /tmp/gl-kubeconfig-create.json
  post_code="$(curl -sS -o /tmp/gl-var.json -w "%{http_code}" \
    --request POST \
    --header "$AUTH_HEADER" \
    --header "Content-Type: application/json" \
    --data @/tmp/gl-kubeconfig-create.json \
    "$VARS_URL")"
  if [ "$post_code" = "201" ] || [ "$post_code" = "200" ]; then
    echo "Created GitLab file variable KUBECONFIG (environment_scope=*)."
    return 0
  fi
  echo "POST KUBECONFIG returned HTTP ${post_code}:"
  cat /tmp/gl-var.json
  echo
  return 1
}

jq -c '.[] | select(.key=="KUBECONFIG")' /tmp/gl-vars.json > /tmp/gl-kubeconfig-rows.jsonl

if [ ! -s /tmp/gl-kubeconfig-rows.jsonl ]; then
  create_kubeconfig
else
  while IFS= read -r row; do
    scope="$(printf '%s' "$row" | jq -r '.environment_scope // "*"')"
    protected="$(printf '%s' "$row" | jq -r '.protected // false')"
    put_kubeconfig "$scope" "$protected"
  done < /tmp/gl-kubeconfig-rows.jsonl
fi

rm -f /tmp/gl-kubeconfig-payload.json /tmp/gl-kubeconfig-create.json \
  /tmp/gl-kubeconfig-rows.jsonl /tmp/gl-vars.json /tmp/gl-var.json
