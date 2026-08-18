resource "vultr_kubernetes" "easycv" {
  region           = var.region
  label            = var.cluster_label
  version          = var.kubernetes_version
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
}

locals {
  kube_config_raw = vultr_kubernetes.easycv.kube_config
  kube_config_yaml = startswith(trimspace(local.kube_config_raw), "apiVersion") ? local.kube_config_raw : base64decode(local.kube_config_raw)
}
