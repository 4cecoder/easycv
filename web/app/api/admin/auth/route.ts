import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const correctPassword = process.env.ADMIN_PASSWORD || "admin123";

    if (password === correctPassword) {
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  } catch (err) {
    return NextResponse.json({ error: "Authentication error" }, { status: 500 });
  }
}
