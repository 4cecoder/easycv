variable "cluster_label" {
  description = "Vultr Kubernetes Engine cluster label."
  type        = string
  default     = "easycv"
}

variable "region" {
  description = "Vultr region code. Must match the container registry (atl.vultrcr.com)."
  type        = string
  default     = "atl"
}

variable "kubernetes_version" {
  description = "Exact VKE version string (vultr-cli kubernetes versions). Leave null to use the latest version Vultr currently offers — they reject stale patch versions."
  type        = string
  default     = null
  nullable    = true
}

variable "vultr_api_key" {
  description = "Vultr API key used to list valid VKE versions. CI sets TF_VAR_vultr_api_key from VULTR_API_KEY."
  type        = string
  sensitive   = true
}

variable "ha_controlplanes" {
  description = "High-availability control plane. Default off to match a typical demo cluster."
  type        = bool
  default     = false
}

variable "enable_firewall" {
  description = "Attach a Vultr Firewall to the cluster."
  type        = bool
  default     = false
}

variable "node_label" {
  description = "Prefix label for nodes in the default pool."
  type        = string
  default     = "easycv-workers"
}

variable "node_plan" {
  description = "Vultr plan ID for worker nodes. VKE requires at least 2 GB RAM. vc2-2c-4gb fits frontend + worker."
  type        = string
  default     = "vc2-2c-4gb"
}

variable "node_quantity" {
  description = "Worker count in the default node pool."
  type        = number
  default     = 2
}

variable "auto_scaler" {
  description = "Enable the VKE node autoscaler on the default pool."
  type        = bool
  default     = false
}

variable "min_nodes" {
  description = "Autoscaler minimum. Ignored unless auto_scaler is true."
  type        = number
  default     = 1
}

variable "max_nodes" {
  description = "Autoscaler maximum. Ignored unless auto_scaler is true."
  type        = number
  default     = 3
}
