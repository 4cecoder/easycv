import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convexServer";
import { api } from "@/convex/_generated/api";

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

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      // Send real email via Resend
      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
          <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 12px; color: #0f172a;">Sign in to easyCV</h2>
          <p style="font-size: 14px; line-height: 1.5; color: #475569;">
            Use the following 6-digit code to access your resume vault and saved career documents:
          </p>
          <div style="margin: 24px 0; padding: 16px; background-color: #f1f5f9; border-radius: 8px; text-align: center;">
            <span style="font-family: monospace; font-size: 28px; font-weight: 800; letter-spacing: 4px; color: #0f172a;">${result.verificationCode}</span>
          </div>
          <p style="font-size: 12px; color: #94a3b8;">
            This code expires in 15 minutes. If you did not request this email, you can safely ignore it.
          </p>
        </div>
      `;

      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || "easyCV <auth@easycv.dev>",
            to: [email],
            subject: `Your easyCV Verification Code: ${result.verificationCode}`,
            html: emailHtml,
          }),
        });
      } catch (emailErr) {
        console.error("Resend delivery warning", emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      email: result.email,
      // In local dev without Resend key, include preview code for seamless testing
      devCode: !resendApiKey ? result.verificationCode : undefined,
    });
  } catch (err) {
    console.error("send-magic-link failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send verification code." },
      { status: 500 }
    );
  }
}
