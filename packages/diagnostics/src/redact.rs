//! Redacts URLs, authorization values and credentials before any disk write.

use regex::Regex;
use serde_json::Value;
use std::sync::LazyLock;

static RULES: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r#"(?i)\b(?:https?|file|tauri|ipc)://[^\s<>"']+|\bmagnet:\?[^\s<>"']+"#,
        r"(?i)\bbearer\s+[a-z0-9._~+/=-]+",
        r#"(?i)\b(?:read[_-]?access[_-]?token|access[_-]?token|refresh[_-]?token|tmdb[_-]?token|token|secret|password|authorization|api[_-]?key|credential)["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)"#,
        r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b",
        r"\b[0-9a-fA-F]{32,}\b",
    ]
    .into_iter()
    .map(|rule| {
        Regex::new(rule).unwrap_or_else(|error| panic!("invalid built-in redaction rule: {error}"))
    })
    .collect()
});

/// Removes private addresses and secret-looking values from process/browser errors.
#[must_use]
pub fn sanitize(text: &str) -> String {
    let mut safe = text.to_owned();
    for rule in &*RULES {
        safe = rule.replace_all(&safe, "[redacted]").into_owned();
    }
    safe.chars()
        .filter(|c| !c.is_control() || matches!(c, '\n' | '\t'))
        .take(16_384)
        .collect()
}

/// Recursively redacts sensitive JSON keys and all nested strings.
pub fn sanitize_value(value: &mut Value) {
    match value {
        Value::String(text) => *text = sanitize(text),
        Value::Array(items) => {
            for item in items {
                self::sanitize_value(item);
            }
        }
        Value::Object(fields) => {
            for (key, item) in fields {
                if sensitive_key(key) {
                    *item = Value::String("[redacted]".into());
                } else {
                    self::sanitize_value(item);
                }
            }
        }
        _ => {}
    }
}

fn sensitive_key(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    matches!(
        key.as_str(),
        "token"
            | "secret"
            | "password"
            | "authorization"
            | "credential"
            | "read_access_token"
            | "api_key"
            | "media_url"
            | "magnet"
            | "torrent_file"
            | "headers"
            | "readaccesstoken"
            | "accesstoken"
            | "refreshtoken"
            | "apikey"
    ) || key.ends_with("_token")
        || key.ends_with("_secret")
}
