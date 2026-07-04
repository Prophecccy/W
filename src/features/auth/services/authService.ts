import { isTauri } from "../../../shared/utils/tauri";
import { saveOAuthTokens } from "../../../shared/services/googleDriveService";
import { LocalUser, auth, onAuthStateChanged as localOnAuthStateChanged, signOut as localSignOut } from "../../../shared/services/localDb";
import { set as idbSet } from "idb-keyval";

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

async function signInWithGoogleWeb(): Promise<LocalUser> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("VITE_GOOGLE_CLIENT_ID is not set in environment");
  }
  const redirectUri = window.location.origin;
  const state = crypto.randomUUID();
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "token");
  authUrl.searchParams.set("scope", "openid email profile https://www.googleapis.com/auth/drive.file");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "consent select_account");

  const popup = window.open(authUrl.toString(), "google-login", "width=500,height=600");
  if (!popup) throw new Error("Popup blocked by browser.");

  return new Promise<LocalUser>((resolve, reject) => {
    const checkInterval = setInterval(async () => {
      try {
        if (popup.closed) {
          clearInterval(checkInterval);
          reject(new Error("Login popup closed by user."));
          return;
        }

        const href = popup.location.href;
        if (href && href.startsWith(redirectUri)) {
          clearInterval(checkInterval);
          const hash = popup.location.hash;
          const params = new URLSearchParams(hash.substring(1));
          const accessToken = params.get("access_token");
          const expiresInStr = params.get("expires_in") || "3600";
          popup.close();

          if (!accessToken) {
            reject(new Error("No access token received from Google."));
            return;
          }

          await saveOAuthTokens(accessToken, "", parseInt(expiresInStr, 10));

          const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const userInfo = await userInfoRes.json();

          await migrateFirestoreToLocal(userInfo.sub, accessToken);

          const mockUser: LocalUser = {
            uid: userInfo.sub,
            email: userInfo.email || null,
            displayName: userInfo.name || null,
            photoURL: userInfo.picture || null,
            metadata: { lastSignInTime: new Date().toISOString() },
            getIdToken: async () => "mock-token",
          };

          localStorage.setItem("w_auth_user", JSON.stringify(mockUser));
          window.dispatchEvent(new CustomEvent("w:gdrive-linked"));
          triggerAuthChange();
          resolve(mockUser);
        }
      } catch (e) {
        // Cross-origin checks fail until redirect, safe to ignore
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

  await saveOAuthTokens(accessToken, refreshToken || "", expiresIn);

  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userInfo = await userInfoRes.json();

  await migrateFirestoreToLocal(userInfo.sub, accessToken, idToken);

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

function parseFirestoreValue(val: any): any {
  if (val === null || val === undefined) return null;
  if (typeof val !== "object") return val;

  if ("stringValue" in val) return val.stringValue;
  if ("integerValue" in val) return parseInt(val.integerValue, 10);
  if ("doubleValue" in val) return parseFloat(val.doubleValue);
  if ("booleanValue" in val) return val.booleanValue;
  if ("nullValue" in val) return null;
  if ("timestampValue" in val) return new Date(val.timestampValue).getTime();
  
  if ("arrayValue" in val) {
    const list = val.arrayValue.values || [];
    return list.map((item: any) => parseFirestoreValue(item));
  }
  if ("mapValue" in val) {
    const fields = val.mapValue.fields || {};
    const obj: any = {};
    for (const [k, v] of Object.entries(fields)) {
      obj[k] = parseFirestoreValue(v);
    }
    return obj;
  }
  if ("fields" in val) {
    const fields = val.fields || {};
    const obj: any = {};
    for (const [k, v] of Object.entries(fields)) {
      obj[k] = parseFirestoreValue(v);
    }
    return obj;
  }

  const obj: any = {};
  for (const [k, v] of Object.entries(val)) {
    obj[k] = parseFirestoreValue(v);
  }
  return obj;
}

interface FirebaseTokenResponse {
  idToken: string;
  firebaseUid: string;
}

async function getFirebaseIdToken(googleAccessToken: string, googleIdToken?: string): Promise<FirebaseTokenResponse | null> {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) return null;

  try {
    const postBody = googleIdToken 
      ? `id_token=${googleIdToken}&providerId=google.com` 
      : `access_token=${googleAccessToken}&providerId=google.com`;

    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestUri: window.location.origin,
        postBody: postBody,
        returnSecureToken: true
      })
    });

    if (!res.ok) {
      console.warn("[Migration] Firebase Auth token exchange failed:", await res.text());
      return null;
    }

    const data = await res.json();
    if (!data.idToken || !data.localId) return null;

    return {
      idToken: data.idToken,
      firebaseUid: data.localId
    };
  } catch (err) {
    console.error("[Migration] Failed to get Firebase ID Token:", err);
    return null;
  }
}

async function fetchFirestoreCollection(
  projectId: string,
  uid: string,
  collectionName: string,
  idToken: string
): Promise<Record<string, any>> {
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/${collectionName}?pageSize=100`,
      {
        headers: { Authorization: `Bearer ${idToken}` }
      }
    );
    if (!res.ok) {
      return {};
    }
    const data = await res.json();
    const documents = data.documents || [];
    const record: Record<string, any> = {};
    for (const doc of documents) {
      const docId = doc.name.split("/").pop();
      if (docId) {
        record[docId] = parseFirestoreValue(doc);
      }
    }
    return record;
  } catch (err) {
    console.error(`[Migration] Failed to fetch subcollection ${collectionName}:`, err);
    return {};
  }
}

export async function migrateFirestoreToLocal(
  uid: string,
  googleAccessToken: string,
  googleIdToken?: string
): Promise<void> {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) return;

  const migratedKey = `w_migrated_v2_${uid}`;
  if (localStorage.getItem(migratedKey) === "true") {
    return;
  }

  console.info("[Migration] Starting one-time Firestore to Local IndexedDB migration for user:", uid);

  const tokenResp = await getFirebaseIdToken(googleAccessToken, googleIdToken);
  if (!tokenResp) {
    console.warn("[Migration] Could not obtain Firebase ID Token. Migration aborted.");
    return;
  }

  const { idToken, firebaseUid } = tokenResp;
  console.info("[Migration] Resolved Firebase Auth UID:", firebaseUid);

  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${firebaseUid}`,
      {
        headers: { Authorization: `Bearer ${idToken}` }
      }
    );

    if (!res.ok) {
      console.info("[Migration] No existing user doc found in Firestore. Skipping subcollections.");
      localStorage.setItem(migratedKey, "true");
      return;
    }

    const rawUserDoc = await res.json();
    const parsedUserDoc = parseFirestoreValue(rawUserDoc);
    if (!parsedUserDoc) return;

    // Remap downloaded user doc uid to match Google ID for local session consistency
    parsedUserDoc.uid = uid;

    const subcols = ["groups", "habits", "logs", "todos", "sticky-notes", "undoHistory"];
    const [groups, habits, logs, todos, stickyNotes, undoHistory] = await Promise.all(
      subcols.map(col => fetchFirestoreCollection(projectId, firebaseUid, col, idToken))
    );

    await idbSet(`w_doc_users/${uid}`, parsedUserDoc);
    await idbSet(`w_col_users/${uid}/groups`, groups);
    await idbSet(`w_col_users/${uid}/habits`, habits);
    await idbSet(`w_col_users/${uid}/logs`, logs);
    await idbSet(`w_col_users/${uid}/todos`, todos);
    await idbSet(`w_col_users/${uid}/sticky-notes`, stickyNotes);
    await idbSet(`w_col_users/${uid}/undoHistory`, undoHistory);

    console.info("[Migration] One-time Firestore migration completed successfully!");
    localStorage.setItem(migratedKey, "true");

    const { triggerSync, notifyDataChanged } = await import("../../../shared/services/localDb");
    notifyDataChanged(uid);
    triggerSync();
  } catch (err) {
    console.error("[Migration] Firestore migration failed:", err);
  }
}
