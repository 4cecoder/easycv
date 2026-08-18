data "http" "vke_versions" {
  url = "https://api.vultr.com/v2/kubernetes/versions"
  request_headers = {
    Accept        = "application/json"
    Authorization = "Bearer ${var.vultr_api_key}"
  }
}

locals {
  vke_versions_payload = jsondecode(data.http.vke_versions.response_body)
  vke_versions = try(
    local.vke_versions_payload.versions,
    local.vke_versions_payload.available_versions,
    [],
  )
  kubernetes_version = coalesce(
    var.kubernetes_version,
    try(reverse(sort(local.vke_versions))[0], ""),
  )
  kube_config_raw  = vultr_kubernetes.easycv.kube_config
  kube_config_yaml = startswith(trimspace(local.kube_config_raw), "apiVersion") ? local.kube_config_raw : base64decode(local.kube_config_raw)
}

resource "vultr_kubernetes" "easycv" {
  region           = var.region
  label            = var.cluster_label
  version          = local.kubernetes_version
  ha_controlplanes = var.ha_controlplanes
  enable_firewall  = var.enable_firewall

  node_pools {
    node_quantity = var.node_quantity
    plan          = var.node_plan
    label         = var.node_label
    auto_scaler   = var.auto_scaler
    min_nodes     = var.min_nodes
    max_nodes     = var.max_nodes
  }

  lifecycle {
    precondition {
      condition     = length(local.vke_versions) > 0
      error_message = "Vultr returned no Kubernetes versions. Check VULTR_API_KEY / TF_VAR_vultr_api_key."
    }
    precondition {
      condition     = contains(local.vke_versions, local.kubernetes_version)
      error_message = "Invalid VKE version ${local.kubernetes_version}. Currently offered: ${join(", ", local.vke_versions)}"
    }
  }
}
