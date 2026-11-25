import { isMobileWeb, isTauri } from "../../../shared/utils/tauri";
import { saveOAuthTokens, setWebMemoryToken } from "../../../shared/services/googleDriveService";
import { LocalUser, auth, onAuthStateChanged as localOnAuthStateChanged, signOut as localSignOut } from "../../../shared/services/localDb";

const AUTH_SUCCESS_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[ W ] Authenticated</title>
    <style>
        :root {
            --bg: #08090a;
            --text: #e8e8e8;
            --text-secondary: #888888;
        }
        body {
            background-color: var(--bg);
            background: radial-gradient(circle at center, #111214 0%, #08090a 100%);
            color: var(--text);
            font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Monaco, Consolas, 'Courier New', monospace;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            overflow: hidden;
            -webkit-font-smoothing: antialiased;
        }
        .container { text-align: center; }
        .logo { font-size: 48px; letter-spacing: -3px; font-weight: 500; margin-bottom: 32px; opacity: 0.9; }
        .status { font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 12px; }
        .instruction { font-size: 13px; letter-spacing: -0.2px; color: var(--text-secondary); opacity: 0.5; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">[ W ]</div>
        <div class="status">Authentication Successful</div>
        <div class="instruction">You can safely close this window now.</div>
    </div>
</body>
</html>
`;

interface VerifiedUserIdentity {
  sub: string;
  email: string | null;
  name?: string | null;
  picture?: string | null;
}

function triggerAuthChange() {
  const customEvent = new CustomEvent("w:auth-changed");
  window.dispatchEvent(customEvent);
}

async function purgePreviousAccountIfChanged(nextUid: string, nextEmail: string | null): Promise<void> {
  const existingUserStr = localStorage.getItem("w_auth_user");
  if (!existingUserStr) return;

  try {
    const existingUser = JSON.parse(existingUserStr);
    const prevUid = typeof existingUser?.uid === "string" ? existingUser.uid : null;
    const prevEmail = typeof existingUser?.email === "string" ? existingUser.email.toLowerCase() : null;
    const normalizedNextEmail = nextEmail ? nextEmail.toLowerCase() : null;

    const uidChanged = Boolean(prevUid && prevUid !== nextUid);
    const emailChanged = Boolean(prevEmail !== normalizedNextEmail);

    if (uidChanged || emailChanged) {
      console.warn(`[Auth] Account switch detected (${prevUid || "none"} -> ${nextUid}). Purging local cache.`);
      try {
        const { resetEncryptionKeyCache } = await import("../../../shared/utils/noteCrypto");
        resetEncryptionKeyCache();
        const { clear: idbClear } = await import("idb-keyval");
        await idbClear();
      } catch (clearErr) {
        console.error("[Auth] Failed to purge IDB cache on account switch:", clearErr);
      }
      localStorage.removeItem("w-auth-mock");
      localStorage.removeItem("w_gdrive_state_modified_time");
      localStorage.removeItem("w_gdrive_state_last_sync");
      localStorage.removeItem("w_gdrive_last_poll");
    }
  } catch {
    /* ignore malformed cached user */
  }
}

async function commitUserSession(identity: VerifiedUserIdentity, pullDrive: boolean): Promise<LocalUser> {
  await purgePreviousAccountIfChanged(identity.sub, identity.email);

  const sessionUser: LocalUser = {
    uid: identity.sub,
    email: identity.email,
    displayName: identity.name || null,
    photoURL: identity.picture || null,
    metadata: {
      lastSignInTime: new Date().toISOString(),
      creationTime: new Date().toISOString(),
    },
    getIdToken: async () => "",
  };

  localStorage.setItem("w_auth_user", JSON.stringify(sessionUser));
  localStorage.setItem("driveLinked", "true");
  if (identity.email) {
    localStorage.setItem("w_gdrive_user_email", identity.email);
  }
  window.dispatchEvent(new CustomEvent("w:gdrive-linked"));

  if (pullDrive) {
    try {
      const { pullAndMergeFromGoogleDrive } = await import("../../../shared/services/localDb");
      await pullAndMergeFromGoogleDrive(true);
    } catch (syncErr) {
      console.warn("[Auth] Initial pull from Google Drive failed:", syncErr);
    }
  }

  triggerAuthChange();
  return sessionUser;
}

export async function signInWithGoogle(): Promise<LocalUser> {
  if (isTauri()) {
    return signInWithGoogleDesktop();
  }
  return signInWithGoogleWeb();
}

export async function processGoogleOAuthToken(
  accessToken: string,
  expiresIn?: number,
  refreshToken?: string,
  idToken?: string,
  expectedNonce?: string
): Promise<LocalUser> {
  const expiresInSeconds = expiresIn && !isNaN(expiresIn) ? expiresIn : 3600;

  // 1. Fetch user identity from Google
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userInfoRes.ok) {
    throw new Error(`Failed to fetch user info from Google (HTTP ${userInfoRes.status})`);
  }
  const userInfo = await userInfoRes.json();
  if (!userInfo?.sub || typeof userInfo.sub !== "string") {
    throw new Error("Google userinfo missing valid subject identifier.");
  }
  if (userInfo.email && userInfo.email_verified === false) {
    throw new Error("Google account email is not verified.");
  }

  // 2. Validate id_token claims (subject, audience, issuer, expiry, and nonce)
  if (idToken) {
    const clientId = import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      throw new Error("Malformed OAuth id_token received.");
    }
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload?.sub !== userInfo.sub) {
      throw new Error("OAuth identity mismatch between id_token and userinfo.");
    }
    if (clientId && payload?.aud !== clientId) {
      throw new Error("OAuth audience mismatch in id_token.");
    }
    if (payload?.iss !== "https://accounts.google.com" && payload?.iss !== "accounts.google.com") {
      throw new Error("OAuth issuer mismatch in id_token.");
    }
    if (typeof payload?.exp !== "number" || payload.exp * 1000 <= Date.now()) {
      throw new Error("OAuth id_token has expired.");
    }
    if (expectedNonce && payload?.nonce !== expectedNonce) {
      throw new Error("OAuth nonce mismatch in id_token.");
    }
  } else if (expectedNonce) {
    throw new Error("Missing OAuth id_token for nonce verification.");
  }

  const email = userInfo.email || null;
  await purgePreviousAccountIfChanged(userInfo.sub, email);

  await saveOAuthTokens(accessToken, refreshToken || "", expiresInSeconds, email || undefined);

  return commitUserSession(
    {
      sub: userInfo.sub,
      email,
      name: userInfo.name || null,
      picture: userInfo.picture || null,
    },
    true
  );
}

/**
 * Hydrates a Web/Mobile user session strictly from the server-sealed HttpOnly BFF cookie.
 */
export async function hydrateWebBffSession(pullDrive = true): Promise<LocalUser> {
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "same-origin",
  });

  if (!res.ok) {
    const errPayload = await res.json().catch(() => ({}));
    throw new Error(errPayload?.error || `Session refresh failed (HTTP ${res.status})`);
  }

  const data = await res.json();
  if (!data?.user?.uid || !data?.accessToken) {
    throw new Error("Incomplete BFF session response.");
  }

  setWebMemoryToken(data.accessToken, data.expiresIn || 3600);

  return commitUserSession(
    {
      sub: data.user.uid,
      email: data.user.email || null,
      name: data.user.displayName || null,
      picture: data.user.photoURL || null,
    },
    pullDrive
  );
}

/**
 * Checks whether the Web/Mobile browser already holds a valid HttpOnly BFF session cookie
 * (for example after a page refresh or a mobile same-window OAuth redirect).
 */
export async function restoreWebBffSession(): Promise<LocalUser | null> {
  if (isTauri()) return auth.currentUser;

  try {
    const res = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "same-origin",
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.authenticated || !data?.user?.uid) {
      return null;
    }

    return await hydrateWebBffSession(true);
  } catch (err) {
    console.warn("[Auth] Failed to restore Web BFF session:", err);
    return null;
  }
}

function generateCodeVerifier(): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const array = new Uint8Array(96);
  crypto.getRandomValues(array);
  let verifier = "";
  for (let i = 0; i < array.length; i++) {
    verifier += charset[array[i] % charset.length];
  }
  return verifier;
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function signInWithGoogleWeb(): Promise<LocalUser> {
  // Mobile browsers routinely block popups; use same-window BFF redirect cleanly
  if (isMobileWeb()) {
    window.location.assign("/api/auth/login?mode=redirect&returnTo=/");
    return new Promise<LocalUser>(() => {});
  }

  try {
    localStorage.removeItem("w_oauth_response");
  } catch {
    /* ignore storage errors */
  }

  const popup = window.open("/api/auth/login?mode=popup", "google-login", "width=500,height=600");
  if (!popup) {
    // Popup blocked on desktop browser — seamlessly fall back to same-window BFF redirect
    window.location.assign("/api/auth/login?mode=redirect&returnTo=/");
    return new Promise<LocalUser>(() => {});
  }

  return new Promise<LocalUser>((resolve, reject) => {
    let resolved = false;
    let checkInterval: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      resolved = true;
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
      if (checkInterval) clearInterval(checkInterval);
      try {
        localStorage.removeItem("w_oauth_response");
      } catch {
        /* ignore */
      }
    };

    const handlePayload = async (data: { type?: string; status?: string }) => {
      if (resolved) return;
      cleanup();

      if (popup && !popup.closed) {
        try {
          popup.close();
        } catch {
          /* ignore */
        }
      }

      if (data.status !== "ok") {
        reject(new Error(`Google authentication failed (${data.status || "cancelled"}).`));
        return;
      }

      try {
        const user = await hydrateWebBffSession(true);
        resolve(user);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    // Channel 1: postMessage from same-origin /oauth-complete popup
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source && event.source !== popup) return;
      if (event.data?.type === "w:bff-auth-complete") {
        handlePayload(event.data);
      }
    };
    window.addEventListener("message", onMessage);

    // Channel 2: Storage event fallback across tabs sharing same origin
    const onStorage = (event: StorageEvent) => {
      if (event.key === "w_oauth_response" && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          if (parsed?.type === "w:bff-auth-complete") {
            handlePayload(parsed);
          }
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("storage", onStorage);

    // Channel 3: Polling fallback and manual popup close detector
    checkInterval = setInterval(() => {
      if (resolved) return;

      try {
        const stored = localStorage.getItem("w_oauth_response");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.type === "w:bff-auth-complete") {
            handlePayload(parsed);
            return;
          }
        }
      } catch {
        /* ignore */
      }

      if (popup.closed) {
        cleanup();
        reject(new Error("Login popup closed by user."));
      }
    }, 500);
  });
}

async function signInWithGoogleDesktop(): Promise<LocalUser> {
  console.info("[W Auth] Starting desktop OAuth flow...");

  const oauthPlugin = await import("@fabianlars/tauri-plugin-oauth");
  const { openUrl } = await import("@tauri-apps/plugin-opener");

  const clientId = import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("VITE_GOOGLE_CLIENT_ID is not set in environment");
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const port = await oauthPlugin.start({
    response: AUTH_SUCCESS_HTML,
  });
  const redirectUri = `http://localhost:${port}`;
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile https://www.googleapis.com/auth/drive.file");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent select_account");
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  let resolveToken: (url: string) => void;
  let rejectToken: (err: Error) => void;
  const tokenPromise = new Promise<string>((resolve, reject) => {
    resolveToken = resolve;
    rejectToken = reject;
  });

  const timeout = setTimeout(async () => {
    try { await oauthPlugin.cancel(port); } catch { /* ignore */ }
    rejectToken(new Error("Sign-in timed out. Please try again."));
  }, 120_000);

  const unlisten = await oauthPlugin.onUrl((url: string) => {
    // Ignore spurious browser resource requests on loopback (e.g. /favicon.ico)
    if (!url.includes("code=") && !url.includes("error=")) {
      return;
    }
    clearTimeout(timeout);
    resolveToken(url);
  });

  await openUrl(authUrl.toString());

  let callbackUrl: string;
  try {
    callbackUrl = await tokenPromise;
  } finally {
    unlisten();
    clearTimeout(timeout);
    try { await oauthPlugin.cancel(port); } catch { /* ignore cleanup errors */ }
  }

  const code = extractCode(callbackUrl, state);
  if (!code) {
    throw new Error("Invalid OAuth state or missing authorization code. Please try again.");
  }

  let tokenData: any = null;
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    tokenData = await invoke("oauth_exchange_desktop_code", {
      clientId,
      code,
      codeVerifier,
      redirectUri,
    });
  } else {
    // Public PKCE exchange path for non-Tauri unit test environments only
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed (HTTP ${tokenRes.status}).`);
    }

    tokenData = await tokenRes.json();
  }

  const accessToken = tokenData?.access_token;
  const refreshToken = tokenData?.refresh_token;
  const idToken = tokenData?.id_token;
  const expiresIn = tokenData?.expires_in || 3600;

  if (!accessToken) {
    throw new Error("Missing access_token in token exchange response.");
  }

  return processGoogleOAuthToken(accessToken, expiresIn, refreshToken || "", idToken, nonce);
}

/**
 * Extracts authorization code ONLY when the OAuth `state` parameter is present
 * and strictly matches `expectedState` (OWASP API2:2023 CSRF defense).
 */
export function extractCode(url: string, expectedState: string): string | null {
  let params: URLSearchParams;
  try {
    if (url.includes("#")) {
      const hash = url.split("#")[1];
      params = new URLSearchParams(hash);
    } else {
      const parsed = url.startsWith("http") ? new URL(url) : new URL(url, "http://localhost");
      params = parsed.searchParams;
    }
  } catch {
    try {
      const queryPart = url.includes("?") ? url.split("?")[1] : url;
      params = new URLSearchParams(queryPart);
    } catch {
      return null;
    }
  }

  const returnedState = params.get("state");
  if (!returnedState || returnedState !== expectedState) {
    return null;
  }

  return params.get("code");
}

export async function signOut(): Promise<void> {
  await localSignOut();
  triggerAuthChange();
}

export function onAuthStateChanged(
  authInstanceOrCallback: any,
  callback?: (user: LocalUser | null) => void
): () => void {
  const cb = typeof authInstanceOrCallback === "function" ? authInstanceOrCallback : callback;
  if (!cb) return () => {};
  const handleAuthChange = () => {
    cb(auth.currentUser);
  };
  window.addEventListener("w:auth-changed", handleAuthChange);

  const unsub = localOnAuthStateChanged(authInstanceOrCallback, callback);
  return () => {
    unsub();
    window.removeEventListener("w:auth-changed", handleAuthChange);
  };
}

export async function migrateFirestoreToLocal(
  uid: string,
  _googleAccessToken?: string,
  _googleIdToken?: string
): Promise<void> {
  const migratedKey = `w_migrated_v2_${uid}`;
  localStorage.setItem(migratedKey, "true");
}
