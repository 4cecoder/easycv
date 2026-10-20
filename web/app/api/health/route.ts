import { NextResponse } from "next/server";

/** Return a lightweight health response for hosting probes. */
export async function GET() {
  return NextResponse.json({ status: "healthy" });
}
