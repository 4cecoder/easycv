import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin-session";

// Lightweight server-side check used by the dashboard to show an access message.
// Convex independently enforces the same verified-email ADMIN_EMAILS allowlist.
export async function GET(request: NextRequest) {
  const deny = await requireAdmin(request);
  return deny ?? NextResponse.json({ authorized: true });
}

/** Retired password admin login; admins now sign in with Seridian Auth (410 Gone). */
export async function POST() {
  return NextResponse.json({ error: "Password admin login has been retired. Sign in with Seridian Auth." }, { status: 410 });
}
