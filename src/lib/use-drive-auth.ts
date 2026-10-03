"use client";

// Shared Google Drive connection state. Connectors and Settings both mount this
// so the OAuth callback can land on either page (Google requires the redirect
// URI to be registered exactly, and the user may start the flow from either).
import { useCallback, useEffect, useState } from "react";
import {
  driveAccount,
  driveAuthUrl,
  driveExchangeCode,
  getStoredDriveToken,
  clearDriveToken,
  isDriveConfigured,
  DRIVE_ALLOWED_PATHS,
} from "./google-drive";

/** Paths Google may redirect back to. Each must be registered as an Authorized
 *  redirect URI in the Cloud Console. */
export const DRIVE_RETURN_PATHS = DRIVE_ALLOWED_PATHS;

export type DriveStatus = "disabled" | "signed-out" | "connecting" | "connected" | "error";

export interface DriveState {
  status: DriveStatus;
  email: string | null;
  name: string | null;
  message: string | null;
  /** true when the client id env var is missing */
  needsSetup: boolean;
  connect: (returnPath?: string) => void;
  disconnect: () => void;
  refresh: () => void;
  clearMessage: () => void;
}

export function useDriveAuth(): DriveState {
  const [status, setStatus] = useState<DriveStatus>("signed-out");
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(() => !isDriveConfigured());
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    // yield first so state updates never run synchronously inside the effect
    await Promise.resolve();
    const token = getStoredDriveToken();
    if (!token) {
      setStatus("signed-out");
      setEmail(null);
      setName(null);
      return;
    }
    const acct = await driveAccount();
    if (!acct) {
      // token present but Drive would not confirm it - likely revoked/expired
      setStatus("error");
      setMessage("Google Drive token is no longer valid - reconnect.");
      return;
    }
    setEmail(acct.email);
    setName(acct.name);
    setStatus("connected");
  }, []);

  useEffect(() => {
    // deferred so the read of localStorage/Drive never blocks first paint
    void Promise.resolve().then(load);
  }, [load, nonce]);

  // Google redirects back with ?code=... (or ?error=...). Complete the exchange
  // once, then scrub the query so a refresh does not re-run it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const err = params.get("error");
    if (!code && !err) return;
    // require Google's own fingerprint so unrelated query strings are ignored
    const looksLikeCallback = params.has("scope") || params.has("state") || params.has("authuser") || err !== null;
    if (!looksLikeCallback) return;

    let cancelled = false;
    (async () => {
      if (err) {
        setStatus("signed-out");
        setMessage(`Google Drive connect failed: ${params.get("error_description") || err}`);
      } else if (code) {
        setStatus("connecting");
        const { token: t, error } = await driveExchangeCode(code);
        if (cancelled) return;
        if (t) {
          const acct = await driveAccount(t.accessToken);
          if (cancelled) return;
          setEmail(acct?.email ?? null);
          setName(acct?.name ?? null);
          setStatus("connected");
          setMessage(acct ? `Connected as ${acct.email}` : "Connected to Google Drive");
        } else {
          setStatus("error");
          setMessage(error || "Could not exchange the authorization code with Google.");
        }
      }
      window.history.replaceState({}, "", window.location.pathname);
    })();

    return () => { cancelled = true; };
  }, []);

  const connect = useCallback((returnPath?: string) => {
    setMessage(null);
    (async () => {
      const url = await driveAuthUrl(returnPath);
      if (!url) {
        setNeedsSetup(true);
        setStatus("signed-out");
        setMessage("Add NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID to .env.local, then restart the dev server.");
        return;
      }
      setStatus("connecting");
      window.location.href = url;
    })();
  }, []);

  const disconnect = useCallback(() => {
    clearDriveToken();
    setEmail(null);
    setName(null);
    setStatus("signed-out");
    setMessage("Disconnected on this device. Files already uploaded stay in your Drive.");
  }, []);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const clearMessage = useCallback(() => setMessage(null), []);

  return { status, email, name, message, needsSetup, connect, disconnect, refresh, clearMessage };
}
