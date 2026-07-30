export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // OpenTelemetry Node.js SDK setup
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-grpc");
    const { Resource } = await import("@opentelemetry/resources");
    const { SEMRESATTRS_SERVICE_NAME } = await import("@opentelemetry/semantic-conventions");
    const { SimpleSpanProcessor } = await import("@opentelemetry/sdk-trace-node");

    const sdk = new NodeSDK({
      resource: new Resource({
        [SEMRESATTRS_SERVICE_NAME]: "easycv-web",
      }),
      spanProcessor: new SimpleSpanProcessor(new OTLPTraceExporter()),
    });

    try {
      sdk.start();
      console.log("OpenTelemetry initialized successfully.");
    } catch (error) {
      console.error("Failed to initialize OpenTelemetry", error);
    }
  }
}
