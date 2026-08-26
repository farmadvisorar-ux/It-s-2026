import nodemailer, { Transporter } from "nodemailer";

/**
 * Email delivery via SMTP.
 *
 * Free options that work out of the box:
 *   - Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=you@gmail.com,
 *     SMTP_PASS=<16-char App Password from myaccount.google.com/apppasswords>
 *     (500 messages/day, requires 2-Step Verification on the Google account)
 *   - Any other SMTP provider with a free tier works by setting the same vars.
 *
 * When SMTP is not configured the service falls back to console logging so
 * local development works without credentials.
 */
export class EmailService {
  private transporter: Transporter | null = null;
  private from: string;
  private appUrl: string;

  constructor(private log: { info: (msg: string) => void; error: (msg: unknown) => void }) {
    this.from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@sikads.com";
    this.appUrl = process.env.APP_URL || "http://localhost:5173";

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
      const port = parseInt(process.env.SMTP_PORT || "587", 10);
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS
        auth: { user, pass },
        // Bound every stage so a wrong host or blocked port fails fast
        // instead of holding the HTTP request open.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
    }
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  private async send(to: string, subject: string, text: string, html: string): Promise<void> {
    if (!this.transporter) {
      // Dev fallback: no SMTP configured, print the message instead of sending
      this.log.info(`[email:console] to=${to} subject="${subject}"\n${text}`);
      return;
    }

    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text, html });
      this.log.info(`[email:sent] to=${to} subject="${subject}"`);
    } catch (err) {
      this.log.error(err);
      throw err;
    }
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const link = `${this.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const text = [
      "Reset your Sikas admin password",
      "",
      "Use the link below to choose a new password. It expires in 1 hour.",
      link,
      "",
      "If you didn't request this, you can ignore this email — your password won't change.",
    ].join("\n");

    const html = this.layout(
      "Reset your password",
      `<p>Use the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
       <p style="margin:28px 0;">
         <a href="${link}" style="background:#3b82f6;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Reset password</a>
       </p>
       <p style="color:#64748b;font-size:13px;">Or paste this into your browser:<br><span style="word-break:break-all;">${link}</span></p>
       <p style="color:#64748b;font-size:13px;">If you didn't request this, ignore this email — your password won't change.</p>`
    );

    await this.send(to, "Reset your Sikas admin password", text, html);
  }

  async sendLoginCode(to: string, code: string): Promise<void> {
    const text = [
      `Your Sikas admin login code is ${code}`,
      "",
      "It expires in 10 minutes. If you didn't try to sign in, change your password.",
    ].join("\n");

    const html = this.layout(
      "Your login code",
      `<p>Enter this code to finish signing in. It expires in <strong>10 minutes</strong>.</p>
       <p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:28px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${code}</p>
       <p style="color:#64748b;font-size:13px;">If you didn't try to sign in, change your password right away.</p>`
    );

    await this.send(to, `Sikas admin login code: ${code}`, text, html);
  }

  private layout(heading: string, body: string): string {
    return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;padding:32px;">
    <p style="margin:0 0 24px;font-weight:700;font-size:15px;letter-spacing:0.5px;color:#3b82f6;">SIKAS ADMIN</p>
    <h1 style="margin:0 0 16px;font-size:21px;">${heading}</h1>
    ${body}
  </div>
</body></html>`;
  }
}
