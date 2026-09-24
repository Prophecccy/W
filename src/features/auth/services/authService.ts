import { isTauri } from "../../../shared/utils/tauri";
import { saveOAuthTokens } from "../../../shared/services/googleDriveService";
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
            --accent: #ffffff;
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
        .container {
            text-align: center;
            animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .logo {
            font-size: 48px;
            letter-spacing: -3px;
            font-weight: 500;
            margin-bottom: 32px;
            opacity: 0.9;
        }
        .success-circle {
            width: 56px;
            height: 56px;
            border: 1.5px solid rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 40px;
            position: relative;
        }
        .success-circle::after {
            content: '';
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: 1.5px solid #fff;
            animation: ripple 2s infinite;
        }
        .status {
            font-size: 10px;
            letter-spacing: 3px;
            text-transform: uppercase;
            color: var(--text-secondary);
            margin-bottom: 12px;
        }
        .instruction {
            font-size: 13px;
            letter-spacing: -0.2px;
            color: var(--text-secondary);
            opacity: 0.5;
        }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes ripple {
            0% { transform: scale(1); opacity: 0.5; }
            100% { transform: scale(1.6); opacity: 0; }
        }
        .checkmark {
            stroke: #fff;
            stroke-dasharray: 48;
            stroke-dashoffset: 48;
            animation: draw 0.6s cubic-bezier(0.65, 0, 0.45, 1) 0.3s forwards;
        }
        @keyframes draw {
            to { stroke-dashoffset: 0; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-circle">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 13L9 17L19 7" class="checkmark" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <div class="logo">[ W ]</div>
        <div class="status">Authentication Successful</div>
        <div class="instruction">You can safely close this window now.</div>
    </div>
    <script>
        setTimeout(() => {
            window.close();
        }, 5000);
    </script>
</body>
</html>
`;

function triggerAuthChange() {
  const customEvent = new CustomEvent("w:auth-changed");
  window.dispatchEvent(customEvent);
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
  _idToken?: string
): Promise<LocalUser> {
  const expiresInSeconds = expiresIn && !isNaN(expiresIn) ? expiresIn : 3600;
  await saveOAuthTokens(accessToken, refreshToken || "", expiresInSeconds);

  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userInfoRes.ok) {
    throw new Error(`Failed to fetch user info from Google (HTTP ${userInfoRes.status})`);
  }
  const userInfo = await userInfoRes.json();

  try {
    const { pullAndMergeFromGoogleDrive } = await import("../../../shared/services/localDb");
    await pullAndMergeFromGoogleDrive(true);
  } catch (syncErr) {
    console.warn("[Auth] Initial pull from Google Drive failed:", syncErr);
  }

  const mockUser: LocalUser = {
    uid: userInfo.sub,
    email: userInfo.email || null,
    displayName: userInfo.name || null,
    photoURL: userInfo.picture || null,
    metadata: {
      lastSignInTime: new Date().toISOString(),
      creationTime: new Date().toISOString(),
    },
    getIdToken: async () => "mock-token",
  };

  localStorage.setItem("w_auth_user", JSON.stringify(mockUser));
  window.dispatchEvent(new CustomEvent("w:gdrive-linked"));
  triggerAuthChange();
  return mockUser;
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
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("VITE_GOOGLE_CLIENT_ID is not set in environment");
  }
  const redirectUri = window.location.origin;
  const state = crypto.randomUUID();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile https://www.googleapis.com/auth/drive.file");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent select_account");
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  // Clean any stale oauth responses before opening popup
  try {
    localStorage.removeItem("w_oauth_response");
  } catch {
    /* ignore storage errors */
  }

  const popup = window.open(authUrl.toString(), "google-login", "width=500,height=600");
  if (!popup) throw new Error("Popup blocked by browser.");

  return new Promise<LocalUser>((resolve, reject) => {
    let resolved = false;
    let checkInterval: NodeJS.Timeout | null = null;

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

    const handlePayload = async (data: any) => {
      if (resolved) return;
      cleanup();

      if (popup && !popup.closed) {
        try {
          popup.close();
        } catch {
          /* ignore close errors */
        }
      }

      if (data.error) {
        reject(new Error(`Google OAuth Error: ${data.errorDescription || data.error}`));
        return;
      }

      // If we received an authorization code, exchange it for tokens (including refresh_token)
      if (data.code) {
        try {
          let tokenData: any = null;

          // Attempt 1: Call Vercel Serverless Token Proxy (/api/token) to keep client_secret secure
          try {
            const proxyRes = await fetch("/api/token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code: data.code,
                code_verifier: codeVerifier,
                redirect_uri: redirectUri,
                grant_type: "authorization_code",
              }),
            });

            if (proxyRes.ok) {
              tokenData = await proxyRes.json();
            } else {
              const errPayload = await proxyRes.json().catch(() => ({}));
              console.warn("[Auth] /api/token responded with status:", proxyRes.status, errPayload);
            }
          } catch (proxyErr) {
            console.warn("[Auth] /api/token proxy call unreachable, attempting local fallback:", proxyErr);
          }

          // Attempt 2: Direct call fallback (used in local development or when clientSecret is inlined)
          if (!tokenData) {
            const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
            const tokenParams: Record<string, string> = {
              client_id: clientId,
              redirect_uri: redirectUri,
              code: data.code,
              code_verifier: codeVerifier,
              grant_type: "authorization_code",
            };

            if (clientSecret) {
              tokenParams.client_secret = clientSecret;
            }

            const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams(tokenParams),
            });

            if (!tokenRes.ok) {
              const errorText = await tokenRes.text();
              let parsedErr: any = null;
              try { parsedErr = JSON.parse(errorText); } catch {}
              if (parsedErr?.error_description?.includes("client_secret is missing")) {
                throw new Error("Missing GOOGLE_CLIENT_SECRET in Vercel. Please add GOOGLE_CLIENT_SECRET in Vercel Project Settings > Environment Variables.");
              }
              throw new Error(`Token exchange failed (HTTP ${tokenRes.status}): ${errorText || "Unknown error"}`);
            }

            tokenData = await tokenRes.json();
          }

          const accessToken = tokenData.access_token;
          const refreshToken = tokenData.refresh_token;
          const idToken = tokenData.id_token;
          const expiresIn = tokenData.expires_in || 3600;

          if (!accessToken) {
            throw new Error("Missing access_token in token exchange response.");
          }

          const user = await processGoogleOAuthToken(accessToken, expiresIn, refreshToken || "", idToken);
          resolve(user);
          return;
        } catch (exchangeErr) {
          reject(exchangeErr instanceof Error ? exchangeErr : new Error(String(exchangeErr)));
          return;
        }
      }

      if (data.accessToken) {
        try {
          const user = await processGoogleOAuthToken(data.accessToken, data.expiresIn);
          resolve(user);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
        return;
      }

      reject(new Error("No authorization code or access token received from Google."));
    };

    // Channel 1: postMessage listener (instant in same-origin popup)
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "w:google-oauth-callback") {
        handlePayload(event.data);
      }
    };
    window.addEventListener("message", onMessage);

    // Channel 2: Storage event listener (fires across tabs/popups sharing localStorage)
    const onStorage = (event: StorageEvent) => {
      if (event.key === "w_oauth_response" && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          if (parsed?.type === "w:google-oauth-callback") {
            handlePayload(parsed);
          }
        } catch {
          /* ignore JSON parse errors */
        }
      }
    };
    window.addEventListener("storage", onStorage);

    // Channel 3: Polling interval (fallback and popup.closed detector)
    checkInterval = setInterval(async () => {
      if (resolved) return;

      // 3a. Check if response was stored in localStorage
      try {
        const stored = localStorage.getItem("w_oauth_response");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.type === "w:google-oauth-callback") {
            handlePayload(parsed);
            return;
          }
        }
      } catch {
        /* ignore storage read error */
      }

      // 3b. Direct location check on popup if accessible
      try {
        if (!popup.closed && popup.location?.href?.startsWith(redirectUri)) {
          const hash = popup.location.hash || "";
          const search = popup.location.search || "";
          const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.substring(1) : hash);
          const searchParams = new URLSearchParams(search);

          const code = searchParams.get("code") || hashParams.get("code");
          const accessToken = hashParams.get("access_token") || searchParams.get("access_token");
          const error = hashParams.get("error") || searchParams.get("error");
          const errorDesc = hashParams.get("error_description") || searchParams.get("error_description");
          const expiresIn = hashParams.get("expires_in") || searchParams.get("expires_in");

          if (code || accessToken || error) {
            handlePayload({
              code,
              accessToken,
              expiresIn: expiresIn ? parseInt(expiresIn, 10) : 3600,
              error,
              errorDescription: errorDesc,
            });
            return;
          }
        }
      } catch {
        // Cross-origin checks fail while popup is on Google's domains; safe to ignore
      }

      // 3c. Detect user closing the popup manually without completing auth
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

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("VITE_GOOGLE_CLIENT_ID is not set in environment");
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const port = await oauthPlugin.start({
    response: AUTH_SUCCESS_HTML
  });
  const redirectUri = `http://localhost:${port}`;
  const state = crypto.randomUUID();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile https://www.googleapis.com/auth/drive.file");
  authUrl.searchParams.set("state", state);
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
    throw new Error("No authorization code received from Google. Please try again.");
  }

  const tokenParams: Record<string, string> = {
    client_id: clientId,
    redirect_uri: redirectUri,
    code: code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
  };

  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
  if (clientSecret) {
    tokenParams.client_secret = clientSecret;
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(tokenParams),
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    throw new Error(`Token exchange failed (HTTP ${tokenRes.status}): ${errorText || "Unknown error"}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const idToken = tokenData.id_token;
  const expiresIn = tokenData.expires_in || 3600;

  if (!accessToken) {
    throw new Error("Missing access_token in token exchange response.");
  }

  return processGoogleOAuthToken(accessToken, expiresIn, refreshToken || "", idToken);
}

function extractCode(url: string, expectedState: string): string | null {
  let params: URLSearchParams;
  try {
    if (url.includes("#")) {
      const hash = url.split("#")[1];
      params = new URLSearchParams(hash);
    } else {
      const parsed = url.startsWith("http") ? new URL(url) : new URL(url, "http://localhost");
      params = parsed.searchParams;
    }
  } catch (err) {
    try {
      const queryPart = url.includes("?") ? url.split("?")[1] : url;
      params = new URLSearchParams(queryPart);
    } catch {
      return null;
    }
  }

  const returnedState = params.get("state");
  if (returnedState && returnedState !== expectedState) {
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
  // Legacy Firestore migration is permanently disabled.
  // Google Drive (W_state.json) is the sovereign state repository.
  const migratedKey = `w_migrated_v2_${uid}`;
  localStorage.setItem(migratedKey, "true");
}
