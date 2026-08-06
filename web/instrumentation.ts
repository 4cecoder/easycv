export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      // OpenTelemetry Node.js SDK setup
      const { NodeSDK } = await import("@opentelemetry/sdk-node");
      const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-grpc");
      const { Resource } = await import("@opentelemetry/resources");
      const { SEMRESATTRS_SERVICE_NAME } = await import("@opentelemetry/semantic-conventions");
      const { SimpleSpanProcessor } = await import("@opentelemetry/sdk-trace-node");

      const resourceObj = typeof Resource === "function" ? new Resource({ [SEMRESATTRS_SERVICE_NAME]: "easycv-web" }) : undefined;
      const sdk = new NodeSDK({
        resource: resourceObj,
        spanProcessor: new SimpleSpanProcessor(new OTLPTraceExporter()),
      });

      sdk.start();
      console.log("OpenTelemetry initialized successfully.");
    } catch (error) {
      // Telemetry error should not break dev server
    }
  }
}
