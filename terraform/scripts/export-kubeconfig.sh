#!/bin/sh
# Write a kubectl-ready kubeconfig from the current Terraform state.
# Vultr stores kube_config as base64; terraform output -raw on a sensitive
# value can also leave it encoded. This always ends as YAML.
#
# Usage: export-kubeconfig.sh /tmp/kubeconfig.yaml
# Optional: TF_DIR (defaults to $CI_PROJECT_DIR/terraform)

set -eu

DEST="${1:-}"
if [ -z "$DEST" ]; then
  echo "usage: export-kubeconfig.sh /path/to/kubeconfig.yaml"
  exit 1
fi

TF_DIR="${TF_DIR:-${CI_PROJECT_DIR:-.}/terraform}"
if [ ! -f "${TF_DIR}/versions.tf" ] && [ -f ./versions.tf ]; then
  TF_DIR="."
fi

if ! command -v jq >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
  if command -v apk >/dev/null 2>&1; then
    apk add --no-cache curl jq >/dev/null
  else
    echo "jq is required to read terraform output -json kube_config."
    exit 1
  fi
fi

is_kubeconfig() {
  [ -s "$1" ] && grep -aqE 'apiVersion:[[:space:]]*v1|kind:[[:space:]]*Config' "$1"
}

try_base64_decode() {
  tr -d '\n\r\t ' < "$1" | base64 -d > "$2" 2>/dev/null || return 1
  [ -s "$2" ]
}

terraform -chdir="$TF_DIR" output -json kube_config | jq -r '.' > "$DEST"

if [ ! -s "$DEST" ] || grep -aqE '^<sensitive>|^sensitive value' "$DEST"; then
  echo "terraform output -json kube_config was empty or redacted; reading state."
  terraform -chdir="$TF_DIR" state pull | jq -r '
    (.outputs.kube_config.value // empty)
    as $out
    | if ($out | type) == "string" and ($out | length) > 0 then $out
      else
        [.resources[] | select(.type=="vultr_kubernetes") | .instances[].attributes.kube_config]
        | first // empty
      end
  ' > "$DEST"
fi

n=0
while [ "$n" -lt 3 ]; do
  if is_kubeconfig "$DEST"; then
    bytes="$(wc -c < "$DEST" | tr -d ' ')"
    echo "Kubeconfig YAML ready (${bytes} bytes)."
    exit 0
  fi
  if try_base64_decode "$DEST" "${DEST}.decoded"; then
    mv "${DEST}.decoded" "$DEST"
    echo "Decoded base64 kubeconfig layer ${n}."
  else
    rm -f "${DEST}.decoded"
    break
  fi
  n=$((n + 1))
done

bytes="$(wc -c < "$DEST" | tr -d ' ')"
echo "Could not turn Terraform kube_config into YAML (${bytes} bytes). Not printing the file."
exit 1
