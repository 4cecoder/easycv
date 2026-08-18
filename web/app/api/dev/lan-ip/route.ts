import { NextResponse } from "next/server";
import os from "os";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Disabled in production" }, { status: 403 });
  }

  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        addresses.push(net.address);
      }
    }
  }

  const lanIp = addresses[0] || "127.0.0.1";
  const port = process.env.PORT || 3000;

  return NextResponse.json({
    lanIp,
    addresses,
    networkUrl: `http://${lanIp}:${port}`,
  });
}
