import { NextResponse } from "next/server";
import { withUserMonSpan } from "@/lib/usermon-server";

export const POST = withUserMonSpan("/api/dev/telemetry", async (req: Request) => {
  try {
    const data = await req.json();
    return NextResponse.json({ ok: true, received: data?.event });
  } catch {
    return NextResponse.json({ ok: true });
  }
});
