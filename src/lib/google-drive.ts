export type GDriveToken = {
  accessToken: string;
  expiresAt: number; // ms
  refreshToken?: string;
  scope?: string;
};

/** Shape of Drive's `files.list` / `files.create` responses we consume. */
type DriveFile = { id: string; name?: string; webViewLink?: string; webContentLink?: string };
type DriveList = { files?: DriveFile[] };

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || '';
// Redirect URIs must be registered byte-for-byte in the Cloud Console, so they
// stay query-free; Google appends ?code=... which the page picks up. Both paths
// below need registering for the flow to work from Connectors *and* Settings.
export const DRIVE_ALLOWED_PATHS = ['/connectors', '/settings'];
const DEFAULT_REDIRECT_PATH = '/connectors';
const TOKEN_KEY = 'gd_token';

function redirectUri(returnPath?: string): string {
  if (typeof window === 'undefined') return '';
  const path = returnPath && DRIVE_ALLOWED_PATHS.includes(returnPath) ? returnPath : DEFAULT_REDIRECT_PATH;
  return `${window.location.origin}${path}`;
}

/** Reuse the exact URI the authorize request used - Google rejects a mismatch. */
function redirectUriFromStored(): string {
  if (typeof window === 'undefined') return '';
  const stored = sessionStorage.getItem('gd_return');
  return stored || redirectUri();
}

export function isDriveConfigured(): boolean {
  return !!CLIENT_ID;
}

function randomString(length = 64): string {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < arr.length; i++) out += String.fromCharCode(97 + (arr[i] % 26));
  return out;
}

async function sha256(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(h);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Begin the PKCE flow. `returnPath` must be one of DRIVE_ALLOWED_PATHS and
 *  registered as an Authorized redirect URI. */
export async function driveAuthUrl(returnPath?: string): Promise<string> {
  if (!CLIENT_ID) return '';
  const uri = redirectUri(returnPath);
  if (!uri) return '';
  const verifier = randomString(64);
  const challenge = await sha256(verifier);
  sessionStorage.setItem('gd_verifier', verifier);
  sessionStorage.setItem('gd_return', uri);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: uri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file',
    code_challenge_method: 'S256',
    code_challenge: challenge,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function driveExchangeCode(code: string): Promise<{ token: GDriveToken | null; error?: string }> {
  const verifier = sessionStorage.getItem('gd_verifier');
  if (!verifier) return { token: null, error: "Missing PKCE verifier - start the connect flow again." };
  // Must be byte-identical to the redirect_uri sent on the authorize request.
  const uri = redirectUriFromStored();
  if (!uri) return { token: null, error: "Missing redirect URI - start the connect flow again." };
  try {
    // The client secret lives only on the server; see /api/drive/token.
    const res = await fetch('/api/drive/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, codeVerifier: verifier, redirectUri: uri }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean; accessToken?: string; expiresIn?: number; refreshToken?: string; scope?: string; error?: string;
    };
    if (!res.ok || !j.accessToken) {
      return { token: null, error: j.error || "Google rejected the authorization code." };
    }
    const token: GDriveToken = {
      accessToken: j.accessToken,
      expiresAt: Date.now() + (j.expiresIn || 3600) * 1000,
      refreshToken: j.refreshToken,
      scope: j.scope,
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
    sessionStorage.removeItem('gd_verifier');
    sessionStorage.removeItem('gd_return');
    return { token };
  } catch {
    return { token: null, error: "Could not reach the GodEye token endpoint." };
  }
}

export function getStoredDriveToken(): GDriveToken | null {
  try {
    const s = localStorage.getItem(TOKEN_KEY);
    if (!s) return null;
    const t: GDriveToken = JSON.parse(s);
    if (!t.accessToken || !t.expiresAt) return null;
    return t;
  } catch {
    return null;
  }
}

export function clearDriveToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/** Which Google account the stored token actually belongs to. Confirms you are
 *  saving into the Drive you think you are — handy when several are signed in. */
export async function driveAccount(token?: string): Promise<{ email: string; name: string } | null> {
  const t = token ? { accessToken: token } : await ensureDriveToken();
  if (!t) return null;
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)', {
      headers: { Authorization: `Bearer ${t.accessToken}` },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { user?: { displayName?: string; emailAddress?: string } };
    const email = j.user?.emailAddress;
    return email ? { email, name: j.user?.displayName || email } : null;
  } catch {
    return null;
  }
}

export async function ensureDriveToken(): Promise<GDriveToken | null> {
  const t = getStoredDriveToken();
  if (!t) return null;
  if (t.expiresAt > Date.now() + 60000) return t;
  if (!t.refreshToken) return t;
  try {
    // Refresh also needs the server-held secret; see /api/drive/token.
    const res = await fetch('/api/drive/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: t.refreshToken }),
    });
    if (!res.ok) return t;
    const j = (await res.json()) as { accessToken?: string; expiresIn?: number };
    if (!j.accessToken) return t;
    const nt: GDriveToken = { ...t, accessToken: j.accessToken, expiresAt: Date.now() + (j.expiresIn || 3600) * 1000 };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(nt));
    return nt;
  } catch {
    return t;
  }
}

async function findOrCreateFolder(token: string, name: string, parentId?: string): Promise<string | null> {
  const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = parentId
    ? `'${parentId}' in parents and name='${escaped}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    : `name='${escaped}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.ok) {
    const j = (await res.json()) as DriveList;
    if (j.files?.[0]?.id) return j.files[0].id;
  }
  const body = { name, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) };
  const res2 = await fetch('https://www.googleapis.com/drive/v3/files', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res2.ok) return null;
  const j2 = (await res2.json()) as DriveFile;
  return j2.id ?? null;
}

export async function ensureGodEyeFolders(token: string): Promise<{ rootId: string | null; projectsId: string | null }> {
  const root = await findOrCreateFolder(token, 'GodEye');
  const projects = root ? await findOrCreateFolder(token, 'Projects', root) : null;
  return { rootId: root, projectsId: projects };
}

export async function uploadZipToDrive(token: string, name: string, buffer: ArrayBuffer | Uint8Array, parentId?: string): Promise<{ id: string; webViewLink: string; webContentLink: string } | null> {
  const zipBytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  // Copy out of any pooled buffer - Blob rejects SharedArrayBuffer-backed views.
  const zipBuf = new ArrayBuffer(zipBytes.byteLength);
  new Uint8Array(zipBuf).set(zipBytes);
  const blob = new Blob([zipBuf], { type: 'application/zip' });
  const metadata = { name, mimeType: 'application/zip', ...(parentId ? { parents: [parentId] } : {}) };
  const boundary = '---godrive---';
  const formParts: string[] = [];
  formParts.push(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`);
  formParts.push(`--${boundary}\r\nContent-Type: application/zip\r\n\r\n`);
  const pre = new TextEncoder().encode(formParts.join(''));
  const blobBuf = await blob.arrayBuffer();
  const post = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(pre.length + blobBuf.byteLength + post.length);
  body.set(pre, 0);
  body.set(new Uint8Array(blobBuf), pre.length);
  body.set(post, pre.length + blobBuf.byteLength);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body: body.buffer });
  if (!res.ok) return null;
  const j = (await res.json()) as DriveFile;
  if (!j.id) return null;
  return { id: j.id, webViewLink: j.webViewLink || '', webContentLink: j.webContentLink || '' };
}
