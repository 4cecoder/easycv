#!/bin/sh
# Export AWS credentials for the Vultr Object Storage S3 backend.
# Bucket and hostname are in terraform/versions.tf (not secret).
# Keys must come from the environment — never commit them.
#
# GitLab CI/CD variables (Masked):
#   VULTR_S3_ACCESS_KEY   Object Storage access key
#   VULTR_S3_SECRET_KEY   Object Storage secret key
# AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are also accepted.
#
# Source this file so exports survive:
#   . ./terraform/scripts/configure-s3-backend.sh

set -eu

ACCESS="${AWS_ACCESS_KEY_ID:-${VULTR_S3_ACCESS_KEY:-}}"
SECRET="${AWS_SECRET_ACCESS_KEY:-${VULTR_S3_SECRET_KEY:-}}"

if [ -z "$ACCESS" ] || [ -z "$SECRET" ]; then
  echo "Set masked GitLab CI/CD variables VULTR_S3_ACCESS_KEY and VULTR_S3_SECRET_KEY"
  echo "(Vultr Object Storage access key and secret key). Do not put them in git."
  exit 1
fi

export AWS_ACCESS_KEY_ID="$ACCESS"
export AWS_SECRET_ACCESS_KEY="$SECRET"
export AWS_ACCESS_KEY="$ACCESS"
unset AWS_SESSION_TOKEN || true

echo "Using Vultr Object Storage s3://easycvtfstate via https://atl2.vultrobjects.com"
