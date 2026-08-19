import { NextResponse } from "next/server";
import { createAdminSession, buildAdminCookie } from "../../../../lib/admin-session";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const correctPassword = process.env.ADMIN_PASSWORD || "admin123";

    if (password !== correctPassword) {
      return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
    }

    const token = createAdminSession();
    const response = NextResponse.json({ success: true });
    response.headers.set("Set-Cookie", buildAdminCookie(token));
    return response;
  } catch (err) {
    return NextResponse.json({ error: "Authentication error" }, { status: 500 });
  }
}
