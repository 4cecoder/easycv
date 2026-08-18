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
  description = "VKE Kubernetes version (vultr-cli kubernetes versions). Pin close to the GitLab kubectl image (1.32.x)."
  type        = string
  default     = "v1.32.3+1"
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
