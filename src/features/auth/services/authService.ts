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

const googleProvider = new GoogleAuthProvider();

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
// 3. Capture the OAuth callback with tokens
// 4. Sign in to Firebase with the credential
async function signInWithGoogleDesktop(): Promise<FirebaseUser> {
  console.info("[W Auth] Starting desktop OAuth flow...");

  const oauthPlugin = await import("@fabianlars/tauri-plugin-oauth");
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  console.info("[W Auth] Plugins loaded.");

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("VITE_GOOGLE_CLIENT_ID is not set in environment");
  }

  // 1. Start local OAuth server (random available port)
  const port = await oauthPlugin.start();
  console.info(`[W Auth] OAuth server started on port ${port}`);

  // 2. Build Google OAuth URL (implicit flow → returns access_token directly)
  const state = crypto.randomUUID(); // CSRF protection
  const redirectUri = `http://localhost:${port}`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "token");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

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

  // 6. Parse the access_token from the callback URL
  const accessToken = extractToken(callbackUrl, state);
  if (!accessToken) {
    throw new Error("No access token received from Google. Please try again.");
  }
  console.info("[W Auth] Access token received, signing in to Firebase...");

  // 7. Sign in to Firebase with the Google credential
  const credential = GoogleAuthProvider.credential(null, accessToken);
  const result = await signInWithCredential(auth, credential);
  console.info("[W Auth] Firebase sign-in successful.");
  return result.user;
}

// ─── Token Parser ──────────────────────────────────────────────
function extractToken(url: string, expectedState: string): string | null {
  // The URL might contain tokens in the fragment (#) or query (?)
  // tauri-plugin-oauth may convert fragments to query params
  let params: URLSearchParams;

  if (url.includes("#")) {
    // Fragment-based: http://localhost:PORT/#access_token=...
    const hash = url.split("#")[1];
    params = new URLSearchParams(hash);
  } else {
    // Query-based: http://localhost:PORT/?access_token=...
    const parsed = new URL(url);
    params = parsed.searchParams;
  }

  // Validate CSRF state
  const returnedState = params.get("state");
  if (returnedState && returnedState !== expectedState) {
    console.error("OAuth state mismatch — possible CSRF attack");
    return null;
  }

  return params.get("access_token");
}

// ─── Sign Out ──────────────────────────────────────────────────
export function signOut(): Promise<void> {
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
