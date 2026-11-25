use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

const VAULT_DIR: &str = ".vault";
const AUDIT_LOG_FILE: &str = "security_audit.jsonl";
const AUDIT_PREV_FILE: &str = "security_audit.prev.jsonl";
const MAX_AUDIT_BYTES: u64 = 256 * 1024;
const ALERT_SPIKE_THRESHOLD: u64 = 5;

static CONSECUTIVE_SECURITY_DENIALS: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, serde::Serialize)]
pub struct SecurityAlertPayload {
    pub ts: u64,
    pub severity: String,
    pub event: String,
    pub window: String,
    pub count: u64,
}

/// Sanitizes arbitrary strings before writing to native audit logs to prevent log injection
/// and redact any accidental credentials or tokens.
pub fn sanitize_log_text(input: &str) -> String {
    let cleaned: String = input
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .take(200)
        .collect();

    if cleaned.contains("GOCSPX-") || cleaned.contains("gsk_") || cleaned.contains("eyJ") {
        return "[REDACTED_SENSITIVE_VALUE]".to_string();
    }
    cleaned
}

fn json_escape(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_string())
}

fn epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn resolve_audit_path(app: &tauri::AppHandle) -> Option<(PathBuf, PathBuf)> {
    let app_data = app.path().app_data_dir().ok()?;
    let vault_dir = app_data.join(VAULT_DIR);
    if !vault_dir.exists() {
        fs::create_dir_all(&vault_dir).ok()?;
    }
    Some((vault_dir.join(AUDIT_LOG_FILE), vault_dir.join(AUDIT_PREV_FILE)))
}

fn rotate_if_oversized(log_path: &PathBuf, prev_path: &PathBuf) {
    if let Ok(meta) = fs::metadata(log_path) {
        if meta.len() >= MAX_AUDIT_BYTES {
            let _ = fs::remove_file(prev_path);
            let _ = fs::rename(log_path, prev_path);
        }
    }
}

/// Records a bounded, redacted OWASP A09 security event to disk and alerts the `main` window
/// when severity is HIGH/CRITICAL or when repeated denial spikes occur.
pub fn record(
    app: Option<&tauri::AppHandle>,
    severity: &str,
    event: &str,
    window_label: &str,
    detail: &str,
) {
    let ts = epoch_secs();
    let safe_sev = sanitize_log_text(severity);
    let safe_event = sanitize_log_text(event);
    let safe_win = sanitize_log_text(window_label);
    let safe_detail = sanitize_log_text(detail);

    let denial_count = if safe_sev == "WARN" || safe_sev == "HIGH" || safe_sev == "CRITICAL" {
        CONSECUTIVE_SECURITY_DENIALS.fetch_add(1, Ordering::Relaxed) + 1
    } else {
        0
    };

    let line = format!(
        "{{\"ts\":{},\"severity\":{},\"event\":{},\"window\":{},\"detail\":{},\"denials\":{}}}\n",
        ts,
        json_escape(&safe_sev),
        json_escape(&safe_event),
        json_escape(&safe_win),
        json_escape(&safe_detail),
        denial_count
    );

    if safe_sev == "HIGH" || safe_sev == "CRITICAL" || denial_count >= ALERT_SPIKE_THRESHOLD {
        eprintln!("[SECURITY_ALERT] {}", line.trim_end());
    } else {
        eprintln!("[SECURITY_AUDIT] {}", line.trim_end());
    }

    if let Some(handle) = app {
        if let Some((log_path, prev_path)) = resolve_audit_path(handle) {
            rotate_if_oversized(&log_path, &prev_path);
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_path) {
                let _ = file.write_all(line.as_bytes());
            }
        }

        if safe_sev == "HIGH" || safe_sev == "CRITICAL" || denial_count >= ALERT_SPIKE_THRESHOLD {
            let _ = handle.emit_to(
                "main",
                "w:security-alert",
                SecurityAlertPayload {
                    ts,
                    severity: safe_sev,
                    event: safe_event,
                    window: safe_win,
                    count: denial_count,
                },
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_tokens_and_control_characters() {
        assert_eq!(sanitize_log_text("bad\r\ninput\0test"), "bad  input test");
        assert_eq!(sanitize_log_text("leaked GOCSPX-secret_value"), "[REDACTED_SENSITIVE_VALUE]");
        assert_eq!(sanitize_log_text("eyJhbGciOiJSUzI1NiJ9.payload.sig"), "[REDACTED_SENSITIVE_VALUE]");
    }
}
