import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convexServer";
import { api } from "@/convex/_generated/api";
import { sendVerificationCodeEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { email, sessionId } = await req.json();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
    }

    const convex = getConvexClient();
    const result = await convex.mutation(api.auth.createOrGetAccount, {
      email,
      sessionId: sessionId || "default_session",
    });

    const emailResult = await sendVerificationCodeEmail(result.email, result.verificationCode);

    return NextResponse.json({
      success: true,
      email: result.email,
      // In local dev without Resend key, include preview code for testing
      devCode: emailResult.isSimulated ? result.verificationCode : undefined,
    });
  } catch (err) {
    console.error("send-magic-link failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send verification code." },
      { status: 500 }
    );
  }
}
