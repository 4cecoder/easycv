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

output "status" {
  value = vultr_kubernetes.easycv.status
}

output "kubernetes_version" {
  value = vultr_kubernetes.easycv.version
}

output "kube_config" {
  description = "Decoded kubeconfig YAML for kubectl. Sensitive — do not print in CI logs."
  value       = local.kube_config_yaml
  sensitive   = true
}
