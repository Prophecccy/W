use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const ALLOWED_KEYS: &[&str] = &["gdrive_session", "note_key", "groq_key"];
const VAULT_DIR: &str = ".vault";
const DPAPI_ENTROPY: &[u8] = b"W-CommandCenter-Vault-v1";

fn validate_key(key: &str) -> Result<&'static str, String> {
    ALLOWED_KEYS
        .iter()
        .copied()
        .find(|allowed| *allowed == key)
        .ok_or_else(|| "Invalid secure store key".to_string())
}

fn require_main_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        crate::security_audit::record(
            Some(window.app_handle()),
            "HIGH",
            "VAULT_UNAUTHORIZED_WINDOW",
            window.label(),
            "main_window_required",
        );
        return Err("Unauthorized window caller for secure store".to_string());
    }
    Ok(())
}

fn vault_file_path(app: &tauri::AppHandle, key: &str) -> Result<PathBuf, String> {
    let safe_key = validate_key(key)?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve AppData directory: {e}"))?;
    let vault_dir = app_data.join(VAULT_DIR);
    if !vault_dir.exists() {
        fs::create_dir_all(&vault_dir).map_err(|e| format!("Failed to create vault dir: {e}"))?;
    }
    Ok(vault_dir.join(format!("{safe_key}.dpapi")))
}

#[cfg(target_os = "windows")]
pub fn dpapi_protect(plain: &[u8]) -> Result<Vec<u8>, String> {
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let mut in_blob = CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(plain.len()).map_err(|_| "Payload too large".to_string())?,
        pbData: plain.as_ptr() as *mut u8,
    };
    let entropy_blob = CRYPT_INTEGER_BLOB {
        cbData: DPAPI_ENTROPY.len() as u32,
        pbData: DPAPI_ENTROPY.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB::default();

    unsafe {
        CryptProtectData(
            &mut in_blob,
            windows::core::w!("W_Vault"),
            Some(&entropy_blob as *const _),
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
        .map_err(|e| format!("DPAPI CryptProtectData failed: {e}"))?;

        let protected = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize).to_vec();
        let _ = LocalFree(HLOCAL(out_blob.pbData as *mut _));
        Ok(protected)
    }
}

#[cfg(target_os = "windows")]
pub fn dpapi_unprotect(cipher: &[u8]) -> Result<Vec<u8>, String> {
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let mut in_blob = CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(cipher.len()).map_err(|_| "Ciphertext too large".to_string())?,
        pbData: cipher.as_ptr() as *mut u8,
    };
    let entropy_blob = CRYPT_INTEGER_BLOB {
        cbData: DPAPI_ENTROPY.len() as u32,
        pbData: DPAPI_ENTROPY.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB::default();

    unsafe {
        CryptUnprotectData(
            &mut in_blob,
            None,
            Some(&entropy_blob as *const _),
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
        .map_err(|e| format!("DPAPI CryptUnprotectData failed: {e}"))?;

        let plain = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize).to_vec();
        let _ = LocalFree(HLOCAL(out_blob.pbData as *mut _));
        Ok(plain)
    }
}

#[cfg(not(target_os = "windows"))]
pub fn dpapi_protect(plain: &[u8]) -> Result<Vec<u8>, String> {
    Ok(plain.to_vec())
}

#[cfg(not(target_os = "windows"))]
pub fn dpapi_unprotect(cipher: &[u8]) -> Result<Vec<u8>, String> {
    Ok(cipher.to_vec())
}

#[tauri::command]
pub fn secure_store_set(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    key: String,
    value: String,
) -> Result<(), String> {
    require_main_window(&window)?;
    if value.len() > 262_144 {
        return Err("Vault value exceeds maximum allowed size".to_string());
    }
    let path = vault_file_path(&app, &key)?;
    let mut plaintext_bytes = value.into_bytes();
    let encrypted = dpapi_protect(&plaintext_bytes);
    plaintext_bytes.fill(0);
    let encrypted = encrypted?;

    // Atomic temp-file write + rename inside AppData/.vault to avoid partial vault corruption
    let temp_path = path.with_extension("dpapi.tmp");
    fs::write(&temp_path, encrypted).map_err(|e| format!("Failed to persist vault item: {e}"))?;
    fs::rename(&temp_path, &path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        format!("Failed to finalize vault item: {e}")
    })
}

#[tauri::command]
pub fn secure_store_get(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    key: String,
) -> Result<Option<String>, String> {
    require_main_window(&window)?;
    let path = vault_file_path(&app, &key)?;
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|e| format!("Failed to read vault item: {e}"))?;
    let mut plain = dpapi_unprotect(&bytes).map_err(|err| {
        crate::security_audit::record(
            Some(&app),
            "HIGH",
            "VAULT_DPAPI_UNPROTECT_FAILED",
            window.label(),
            &format!("key={}", key),
        );
        err
    })?;
    let result = String::from_utf8(plain.clone())
        .map(Some)
        .map_err(|_| "Corrupted UTF-8 data in vault".to_string());
    plain.fill(0);
    result
}

#[tauri::command]
pub fn secure_store_delete(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    key: String,
) -> Result<(), String> {
    require_main_window(&window)?;
    let path = vault_file_path(&app, &key)?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("Failed to remove vault item: {e}"))?;
    }
    Ok(())
}

fn validate_loopback_redirect_uri(uri: &str) -> Result<(), String> {
    let parsed = url::Url::parse(uri).map_err(|_| "Invalid redirect_uri".to_string())?;
    if parsed.scheme() != "http" {
        return Err("Desktop redirect_uri must use http loopback".to_string());
    }
    let host = parsed.host_str().unwrap_or("");
    if host != "localhost" && host != "127.0.0.1" {
        crate::security_audit::record(
            None,
            "WARN",
            "VAULT_INVALID_REDIRECT_URI",
            "desktop",
            "non_loopback_redirect_rejected",
        );
        return Err("Desktop redirect_uri must target localhost".to_string());
    }
    Ok(())
}

fn parse_oauth_error_code(body: &str) -> String {
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(code) = val.get("error").and_then(|v| v.as_str()) {
            let safe: String = code
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
                .take(64)
                .collect();
            if !safe.is_empty() {
                return safe;
            }
        }
    }
    "unknown_error".to_string()
}

fn build_http_client() -> Result<reqwest::Client, String> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::builder()
        .https_only(true)
        .min_tls_version(reqwest::tls::Version::TLS_1_2)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("HTTP client build failed: {e}"))
}

#[tauri::command]
pub async fn oauth_exchange_desktop_code(
    window: tauri::WebviewWindow,
    client_id: String,
    code: String,
    code_verifier: String,
    redirect_uri: String,
) -> Result<serde_json::Value, String> {
    require_main_window(&window)?;
    validate_loopback_redirect_uri(&redirect_uri)?;

    if client_id.trim().is_empty() || code.trim().is_empty() || code_verifier.trim().is_empty() {
        return Err("Missing required OAuth exchange fields".to_string());
    }

    let encoded_body = {
        let mut form = url::form_urlencoded::Serializer::new(String::new());
        form.append_pair("client_id", client_id.trim());
        form.append_pair("code", code.trim());
        form.append_pair("code_verifier", code_verifier.trim());
        form.append_pair("redirect_uri", redirect_uri.trim());
        form.append_pair("grant_type", "authorization_code");

        if let Some(secret) = option_env!("TAURI_GOOGLE_CLIENT_SECRET") {
            let trimmed = secret.trim();
            if !trimmed.is_empty() {
                form.append_pair("client_secret", trimmed);
            }
        }

        form.finish()
    };

    let client = build_http_client()?;
    let res = client
        .post("https://oauth2.googleapis.com/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(encoded_body)
        .send()
        .await
        .map_err(|e| format!("OAuth token request failed: {e}"))?;

    let status = res.status();
    let body_text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        let error_code = parse_oauth_error_code(&body_text);
        return Err(format!("OAuth token endpoint returned HTTP {}: {}", status.as_u16(), error_code));
    }

    serde_json::from_str::<serde_json::Value>(&body_text)
        .map_err(|e| format!("Invalid OAuth token JSON: {e}"))
}

#[tauri::command]
pub async fn oauth_refresh_desktop_token(
    window: tauri::WebviewWindow,
    client_id: String,
    refresh_token: String,
) -> Result<serde_json::Value, String> {
    require_main_window(&window)?;
    if client_id.trim().is_empty() || refresh_token.trim().is_empty() {
        return Err("Missing required OAuth refresh fields".to_string());
    }

    let encoded_body = {
        let mut form = url::form_urlencoded::Serializer::new(String::new());
        form.append_pair("client_id", client_id.trim());
        form.append_pair("refresh_token", refresh_token.trim());
        form.append_pair("grant_type", "refresh_token");

        if let Some(secret) = option_env!("TAURI_GOOGLE_CLIENT_SECRET") {
            let trimmed = secret.trim();
            if !trimmed.is_empty() {
                form.append_pair("client_secret", trimmed);
            }
        }

        form.finish()
    };

    let client = build_http_client()?;
    let res = client
        .post("https://oauth2.googleapis.com/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(encoded_body)
        .send()
        .await
        .map_err(|e| format!("OAuth refresh request failed: {e}"))?;

    let status = res.status();
    let body_text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        let error_code = parse_oauth_error_code(&body_text);
        return Err(format!("OAuth refresh endpoint returned HTTP {}: {}", status.as_u16(), error_code));
    }

    serde_json::from_str::<serde_json::Value>(&body_text)
        .map_err(|e| format!("Invalid OAuth refresh JSON: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_vault_key_allowlist() {
        assert_eq!(validate_key("note_key").unwrap(), "note_key");
        assert_eq!(validate_key("gdrive_session").unwrap(), "gdrive_session");
        assert_eq!(validate_key("groq_key").unwrap(), "groq_key");
        assert!(validate_key("../secret").is_err());
        assert!(validate_key("arbitrary").is_err());
    }

    #[test]
    fn rejects_non_loopback_redirect_uris() {
        assert!(validate_loopback_redirect_uri("http://localhost:12345").is_ok());
        assert!(validate_loopback_redirect_uri("http://127.0.0.1:4567").is_ok());
        assert!(validate_loopback_redirect_uri("https://evil.com/cb").is_err());
        assert!(validate_loopback_redirect_uri("http://evil.com:1234").is_err());
    }

    #[test]
    fn dpapi_round_trip_protects_and_unprotects_secret() {
        let secret = b"{\"refreshToken\":\"1//test-secret\"}";
        let protected = dpapi_protect(secret).expect("dpapi_protect failed");
        #[cfg(target_os = "windows")]
        assert_ne!(protected.as_slice(), secret);
        let recovered = dpapi_unprotect(&protected).expect("dpapi_unprotect failed");
        assert_eq!(recovered.as_slice(), secret);
    }
}
