import { NextRequest, NextResponse } from "next/server";

// Google requires a client secret for "Web application" OAuth clients, even with
// PKCE. The browser must never hold it, so the code/refresh exchange happens
// here. Set GOOGLE_DRIVE_CLIENT_SECRET in .env.local and as a Worker secret.
const ALLOWED_PATHS = new Set(["/connectors", "/settings"]);

function isAllowedRedirect(uri: string, req: NextRequest): boolean {
  try {
    const u = new URL(uri);
    if (!ALLOWED_PATHS.has(u.pathname)) return false;
    const allowed = new Set<string>();
    try { allowed.add(new URL(req.url).origin); } catch { /* ignore */ }
    allowed.add("http://localhost:3000");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (appUrl) { try { allowed.add(new URL(appUrl).origin); } catch { /* ignore */ } }
    return allowed.has(u.origin);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Google Drive is not configured on the server (missing client id/secret)." }, { status: 500 });
  }

  const { code, codeVerifier, redirectUri, refreshToken } = await req.json().catch(() => ({})) as {
    code?: string; codeVerifier?: string; redirectUri?: string; refreshToken?: string;
  };

  let body: URLSearchParams;
  if (code) {
    if (!codeVerifier || !redirectUri) return NextResponse.json({ error: "code, codeVerifier and redirectUri are required" }, { status: 400 });
    if (!isAllowedRedirect(redirectUri, req)) return NextResponse.json({ error: "redirectUri is not allowed" }, { status: 400 });
    body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
  } else if (refreshToken) {
    body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
  } else {
    return NextResponse.json({ error: "code or refreshToken is required" }, { status: 400 });
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const j = await res.json().catch(() => ({})) as {
      access_token?: string; expires_in?: number; refresh_token?: string; scope?: string;
      error?: string; error_description?: string;
    };
    if (!res.ok || !j.access_token) {
      return NextResponse.json(
        { error: j.error_description || j.error || "Google rejected the token request" },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      accessToken: j.access_token,
      expiresIn: j.expires_in || 3600,
      refreshToken: j.refresh_token,
      scope: j.scope,
    });
  } catch {
    return NextResponse.json({ error: "Could not reach Google's token endpoint" }, { status: 502 });
  }
}
