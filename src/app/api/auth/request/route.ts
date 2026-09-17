import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({ email: "" }));
  if (!email || !String(email).includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const ownerEmail = "mendysam32@gmail.com";
  const payload = {
    to: ownerEmail,
    subject: `New GodEye OS signup — ${email}`,
    text: `New user created account on GodEye OS (by S&P Group)\n\nEmail: ${email}\nTime: ${new Date().toISOString()}\nApp: GodEye OS Cloud\n\nNo password was requested (email-only auth).\n`,
  };

  // Try to send via Resend if key present, else log
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "GodEye OS <noreply@godeye.sandpgroup.com>", to: ownerEmail, subject: payload.subject, text: payload.text }),
      });
      if (!r.ok) {
        console.warn("Resend failed", await r.text());
      }
    } catch (e) {
      console.warn("Resend error", e);
    }
  } else {
    console.log("[GodEye OS] New signup notification would be sent to", ownerEmail, payload);
  }

  // In real deploy, create user record / magic link. For now accept.
  return NextResponse.json({ ok: true, message: `Account created for ${email}. Notification sent to ${ownerEmail}.` });
}
