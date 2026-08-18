import { Resend } from "resend";

let resendInstance: Resend | null = null;

export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!resendInstance) {
    resendInstance = new Resend(apiKey);
  }
  return resendInstance;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "easyCV <support@easycv.dev>";

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
  isSimulated?: boolean;
}

/**
 * Send 6-digit magic sign-in code via Resend.
 */
export async function sendVerificationCodeEmail(
  to: string,
  code: string
): Promise<SendEmailResult> {
  const resend = getResendClient();

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; margin: 0; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background-color: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 32px; }
          .logo { font-size: 18px; font-weight: 800; color: #f4f4f5; display: inline-flex; align-items: center; margin-bottom: 24px; }
          .logo-badge { background-color: #2563eb; color: white; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-left: 6px; }
          h1 { font-size: 20px; font-weight: 700; margin: 0 0 12px 0; color: #ffffff; }
          p { font-size: 14px; line-height: 1.6; color: #a1a1aa; margin: 0 0 20px 0; }
          .code-box { background-color: #27272a; border: 1px solid #3f3f46; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
          .code { font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #38bdf8; }
          .footer { font-size: 12px; color: #71717a; border-top: 1px solid #27272a; padding-top: 20px; margin-top: 28px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">easyCV <span class="logo-badge">AI</span></div>
          <h1>Sign in to your Resume Vault</h1>
          <p>Use the following 6-digit verification code to access your saved career documents and synchronize your workspace across devices:</p>
          <div class="code-box">
            <div class="code">${code}</div>
          </div>
          <p>This code will expire in <strong>15 minutes</strong>. If you did not request this email, you can safely disregard it.</p>
          <div class="footer">
            &copy; ${new Date().getFullYear()} easyCV. All rights reserved. Encrypted zero-password security.
          </div>
        </div>
      </body>
    </html>
  `;

  if (!resend) {
    // Simulated in dev or when API key is unconfigured
    return { success: true, isSimulated: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Your easyCV Verification Code: ${code}`,
      html,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to send email" };
  }
}

/**
 * Send Pro Purchase Confirmation and Vector PDF download link.
 */
export async function sendProPurchaseEmail(
  to: string,
  downloadToken: string,
  appUrl: string,
  candidateName?: string
): Promise<SendEmailResult> {
  const resend = getResendClient();
  const downloadUrl = `${appUrl.replace(/\/$/, "")}/api/download/${downloadToken}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; margin: 0; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background-color: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 32px; }
          .logo { font-size: 18px; font-weight: 800; color: #f4f4f5; display: inline-flex; align-items: center; margin-bottom: 24px; }
          .logo-badge { background-color: #10b981; color: white; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-left: 6px; }
          h1 { font-size: 20px; font-weight: 700; margin: 0 0 12px 0; color: #ffffff; }
          p { font-size: 14px; line-height: 1.6; color: #a1a1aa; margin: 0 0 20px 0; }
          .btn-box { text-align: center; margin: 28px 0; }
          .btn { background-color: #2563eb; color: #ffffff !important; padding: 14px 28px; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 8px; display: inline-block; }
          .features { background-color: #27272a; border-radius: 10px; padding: 16px; margin: 20px 0; font-size: 13px; color: #d4d4d8; }
          .feature-item { margin-bottom: 8px; display: flex; align-items: center; }
          .footer { font-size: 12px; color: #71717a; border-top: 1px solid #27272a; padding-top: 20px; margin-top: 28px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">easyCV <span class="logo-badge">PRO</span></div>
          <h1>Thank you for your order${candidateName ? `, ${candidateName}` : ""}!</h1>
          <p>Your easyCV Pro package is ready. Your unwatermarked high-resolution Vector PDF and source files are compiled and available for immediate download.</p>
          
          <div class="btn-box">
            <a href="${downloadUrl}" class="btn">Download Recruiter-Ready PDF</a>
          </div>

          <div class="features">
            <div class="feature-item">&bull; 100% Unwatermarked Vector PDF</div>
            <div class="feature-item">&bull; Modular Document Source (.tex)</div>
            <div class="feature-item">&bull; Unlimited Autonomous Auto-Improvements</div>
          </div>

          <p style="font-size: 12px; color: #71717a;">You can re-download this resume anytime using your link.</p>

          <div class="footer">
            &copy; ${new Date().getFullYear()} easyCV. All rights reserved.
          </div>
        </div>
      </body>
    </html>
  `;

  if (!resend) {
    return { success: true, isSimulated: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Your easyCV Pro Resume Download is Ready`,
      html,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to send email" };
  }
}
