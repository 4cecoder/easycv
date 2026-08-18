output "cluster_id" {
  description = "VKE cluster UUID."
  value       = vultr_kubernetes.easycv.id
}

output "cluster_label" {
  value = vultr_kubernetes.easycv.label
}

output "region" {
  value = vultr_kubernetes.easycv.region
}

output "endpoint" {
  description = "Kubernetes API endpoint hostname."
  value       = vultr_kubernetes.easycv.endpoint
}

output "cluster_ip" {
  description = "Kubernetes API IPv4 address. Deploy uses this when DNS for the VKE hostname fails."
  value       = vultr_kubernetes.easycv.ip
}

output "status" {
  value = vultr_kubernetes.easycv.status
}

output "kubernetes_version" {
  value = vultr_kubernetes.easycv.version
}

output "available_kubernetes_versions" {
  description = "Versions Vultr currently allows for new clusters."
  value       = local.vke_versions
}

output "kube_config" {
  description = "Decoded kubeconfig YAML for kubectl. Sensitive — do not print in CI logs."
  value       = local.kube_config_yaml
  sensitive   = true
}
