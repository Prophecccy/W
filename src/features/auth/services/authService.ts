import {
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  User as FirebaseUser,
  signInWithPopup,
  signInWithCredential,
} from "firebase/auth";
import { auth } from "../../../shared/config/firebase";
import { isTauri } from "../../../shared/utils/tauri";
import { saveOAuthTokens, clearOAuthTokens } from "../../../shared/services/googleDriveService";

const googleProvider = new GoogleAuthProvider();

// Request Drive file scope for the browser popup authentication too
googleProvider.addScope("https://www.googleapis.com/auth/drive.file");

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

// ─── Main Sign-In ──────────────────────────────────────────────
export async function signInWithGoogle(): Promise<FirebaseUser> {
  if (isTauri()) {
    return signInWithGoogleDesktop();
  }
  // Browser — standard popup
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

// ─── Desktop (Tauri) — System Browser Flow ─────────────────────
// Uses tauri-plugin-oauth to:
// 1. Start a temp localhost server
// 2. Open system browser for Google sign-in
// 3. Capture the OAuth callback with code
// 4. Exchange code for tokens at accounts.google.com
// 5. Sign in to Firebase with the credential
async function signInWithGoogleDesktop(): Promise<FirebaseUser> {
  console.info("[W Auth] Starting desktop OAuth flow...");

  const oauthPlugin = await import("@fabianlars/tauri-plugin-oauth");
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  console.info("[W Auth] Plugins loaded.");

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("VITE_GOOGLE_CLIENT_ID is not set in environment");
  }

  // Generate PKCE verifier and challenge
  console.info("[W Auth] Generating PKCE verifier and challenge...");
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  console.info("[W Auth] PKCE verifier and challenge generated.");

  // 1. Start local OAuth server (random available port)
  const port = await oauthPlugin.start({
    response: AUTH_SUCCESS_HTML
  });
  console.info(`[W Auth] OAuth server started on port ${port}`);

  // 2. Build Google OAuth URL (Authorization Code Flow with PKCE)
  const state = crypto.randomUUID(); // CSRF protection
  const redirectUri = `http://localhost:${port}`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile https://www.googleapis.com/auth/drive.file");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent select_account");
  // Set PKCE parameters
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  // 3. Set up callback listener BEFORE opening browser
  let resolveToken: (url: string) => void;
  let rejectToken: (err: Error) => void;
  const tokenPromise = new Promise<string>((resolve, reject) => {
    resolveToken = resolve;
    rejectToken = reject;
  });

  const timeout = setTimeout(async () => {
    try { await oauthPlugin.cancel(port); } catch { /* ignore */ }
    rejectToken(new Error("Sign-in timed out. Please try again."));
  }, 120_000); // 2 minutes

  // onUrl is async — returns an unlisten function
  const unlisten = await oauthPlugin.onUrl((url: string) => {
    console.info("[W Auth] Received callback URL");
    clearTimeout(timeout);
    resolveToken(url);
  });

  // 4. Open system browser
  console.info("[W Auth] Opening system browser...");
  await openUrl(authUrl.toString());

  // 5. Wait for Google to redirect back
  let callbackUrl: string;
  try {
    callbackUrl = await tokenPromise;
  } finally {
    unlisten(); // Stop listening for URLs
    clearTimeout(timeout);
    try { await oauthPlugin.cancel(port); } catch { /* ignore cleanup errors */ }
  }

  // 6. Parse the authorization code from the callback URL
  const code = extractCode(callbackUrl, state);
  if (!code) {
    throw new Error("No authorization code received from Google. Please try again.");
  }
  console.info("[W Auth] Authorization code received. Exchanging for tokens using PKCE verifier...");

  // 6.5 Exchange authorization code for tokens
  const tokenParams: Record<string, string> = {
    client_id: clientId,
    redirect_uri: redirectUri,
    code: code,
    code_verifier: codeVerifier, // Provide the PKCE code verifier
    grant_type: "authorization_code",
  };

  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
  if (clientSecret) {
    console.info("[W Auth] Including client_secret in token exchange payload.");
    tokenParams.client_secret = clientSecret;
  } else {
    console.info("[W Auth] VITE_GOOGLE_CLIENT_SECRET is not set. Proceeding with pure public client PKCE flow.");
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
    console.error("[W Auth] Token exchange failed:", errorText);
    throw new Error(`Token exchange failed (HTTP ${tokenRes.status}): ${errorText || "Unknown error"}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const idToken = tokenData.id_token;
  const expiresIn = tokenData.expires_in || 3600;

  if (!accessToken || !idToken) {
    throw new Error("Missing access_token or id_token in token exchange response.");
  }

  console.info("[W Auth] Tokens received. Saving credentials...");
  
  // Cache credentials securely
  saveOAuthTokens(accessToken, refreshToken || "", expiresIn);

  // 7. Sign in to Firebase with the Google credential (ID Token and Access Token)
  const credential = GoogleAuthProvider.credential(idToken, accessToken);
  const result = await signInWithCredential(auth, credential);
  console.info("[W Auth] Firebase sign-in successful.");
  return result.user;
}

// ─── PKCE Cryptographic Helpers ─────────────────────────────────

/**
 * Generates a high-entropy cryptographically secure random string (code verifier)
 * compliant with RFC 7636 (length 43-128 characters, containing [A-Za-z0-9-._~]).
 */
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

/**
 * Computes the SHA-256 hash of a code verifier and encodes it as Base64url without padding.
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  
  // Convert ArrayBuffer hash to binary string
  const bytes = new Uint8Array(hash);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  
  // Base64 encode and format to Base64url (no padding, url-safe chars)
  const base64 = btoa(binary);
  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}


// ─── Code Parser ───────────────────────────────────────────────
function extractCode(url: string, expectedState: string): string | null {
  console.info(`[W Auth] Extracting code from URL: "${url}"`);
  console.info(`[W Auth] Expected CSRF state: "${expectedState}"`);
  
  let params: URLSearchParams;

  try {
    if (url.includes("#")) {
      const hash = url.split("#")[1];
      params = new URLSearchParams(hash);
    } else {
      // Safely support relative paths by passing a base URL
      const parsed = url.startsWith("http") ? new URL(url) : new URL(url, "http://localhost");
      params = parsed.searchParams;
    }
  } catch (err) {
    console.warn("[W Auth] Standard URL construction failed. Falling back to manual search param extraction.", err);
    try {
      const queryPart = url.includes("?") ? url.split("?")[1] : url;
      params = new URLSearchParams(queryPart);
    } catch (fallbackErr) {
      console.error("[W Auth] Manual extraction failed entirely:", fallbackErr);
      return null;
    }
  }

  // Validate CSRF state
  const returnedState = params.get("state");
  console.info(`[W Auth] Returned state token: "${returnedState}"`);
  
  if (returnedState && returnedState !== expectedState) {
    console.error(`[W Auth] OAuth state mismatch! Expected "${expectedState}" but got "${returnedState}". Possible CSRF attack.`);
    return null;
  }

  const code = params.get("code");
  console.info(`[W Auth] Extracted authorization code: ${code ? "[FOUND]" : "[NOT FOUND]"}`);
  return code;
}

// ─── Sign Out ──────────────────────────────────────────────────
export async function signOut(): Promise<void> {
  await clearOAuthTokens();
  try {
    const { clear: idbClear } = await import("idb-keyval");
    await idbClear();
    console.info("[W Auth] Local IndexedDB cache purged successfully on logout.");
  } catch (err) {
    console.error("Failed to clear local cache on signout", err);
  }
  return firebaseSignOut(auth).catch((error) => {
    console.error("Error signing out", error);
    throw error;
  });
}

// ─── Auth State Listener ───────────────────────────────────────
export function onAuthStateChanged(
  callback: (user: FirebaseUser | null) => void
): () => void {
  return firebaseOnAuthStateChanged(auth, callback);
}
