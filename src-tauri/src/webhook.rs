//! Embedded webhook receiver. Mirrors vite-webhook-plugin.ts so the installed
//! app accepts the same payloads as `pnpm dev`.

use std::io::Read;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{json, Map, Value};
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Method, Response, Server};

pub const PORT: u16 = 3690;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookEvent {
  id: String,
  title: String,
  message: String,
  #[serde(rename = "type")]
  kind: String,
  source: String,
  timestamp: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  date: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  time: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  category: Option<String>,
  read: bool,
  raw_payload: Value,
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn now_millis() -> u128 {
  SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

fn to_base36(mut n: u128) -> String {
  const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
  if n == 0 {
    return "0".into();
  }
  let mut out = Vec::new();
  while n > 0 {
    out.push(DIGITS[(n % 36) as usize]);
    n /= 36;
  }
  out.reverse();
  String::from_utf8(out).unwrap_or_default()
}

/// UTC ISO-8601 with milliseconds, same shape as JS `toISOString()`.
fn iso_now(ms: u128) -> String {
  let secs = (ms / 1000) as i64;
  let millis = (ms % 1000) as u32;
  let days = secs.div_euclid(86_400);
  let rem = secs.rem_euclid(86_400);
  // Civil-from-days (Howard Hinnant)
  let z = days + 719_468;
  let era = z.div_euclid(146_097);
  let doe = z - era * 146_097;
  let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let d = doy - (153 * mp + 2) / 5 + 1;
  let m = if mp < 10 { mp + 3 } else { mp - 9 };
  let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
  format!(
    "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
    y,
    m,
    d,
    rem / 3600,
    (rem % 3600) / 60,
    rem % 60,
    millis
  )
}

fn str_field<'a>(raw: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
  raw.get(key).and_then(Value::as_str).filter(|s| !s.is_empty())
}

fn first_str(raw: &Map<String, Value>, keys: &[&str]) -> Option<String> {
  keys.iter().find_map(|k| str_field(raw, k)).map(str::to_string)
}

fn loose_string(v: Option<&Value>) -> String {
  match v {
    Some(Value::String(s)) => s.clone(),
    Some(Value::Null) | None => String::new(),
    Some(Value::Bool(false)) => String::new(),
    Some(other) => other.to_string(),
  }
}

pub fn parse_payload(payload: Value) -> WebhookEvent {
  let empty = Map::new();
  let raw = payload.as_object().unwrap_or(&empty);
  let ms = now_millis();
  let n = COUNTER.fetch_add(1, Ordering::Relaxed);

  let title = first_str(raw, &["title", "subject", "event"])
    .or_else(|| str_field(raw, "action").map(|a| format!("Evento: {a}")))
    .unwrap_or_else(|| "Notificación de Webhook".into());

  let message = first_str(raw, &["message", "description", "text", "content", "details", "summary"])
    .unwrap_or_else(|| payload.to_string());

  let raw_type = ["type", "level", "status", "severity"]
    .iter()
    .map(|k| loose_string(raw.get(*k)))
    .find(|s| !s.is_empty())
    .unwrap_or_default()
    .to_lowercase();

  let has_date = raw.get("date").is_some_and(|v| !v.is_null() && v != &Value::Bool(false));
  let kind = if ["succ", "ok", "pass"].iter().any(|p| raw_type.contains(p)) {
    "success"
  } else if ["warn", "alert"].iter().any(|p| raw_type.contains(p)) {
    "warning"
  } else if ["err", "fail", "crit"].iter().any(|p| raw_type.contains(p)) {
    "error"
  } else if ["cal", "meet", "event"].iter().any(|p| raw_type.contains(p)) || has_date {
    "calendar"
  } else {
    "info"
  };

  WebhookEvent {
    id: format!("wh_{}{}", to_base36(ms), to_base36(n as u128)),
    title,
    message,
    kind: kind.into(),
    source: first_str(raw, &["source", "sender", "app"]).unwrap_or_else(|| "Webhook API".into()),
    timestamp: iso_now(ms),
    date: str_field(raw, "date").map(str::to_string),
    time: str_field(raw, "time").map(str::to_string),
    category: str_field(raw, "category").map(str::to_string),
    read: false,
    raw_payload: payload,
  }
}

fn header(name: &str, value: &str) -> Header {
  Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("valid header")
}

fn json_response(status: u16, body: Value) -> Response<std::io::Cursor<Vec<u8>>> {
  let text = if status == 204 { String::new() } else { body.to_string() };
  Response::from_string(text)
    .with_status_code(status)
    .with_header(header("Content-Type", "application/json; charset=utf-8"))
    .with_header(header("Access-Control-Allow-Origin", "*"))
    .with_header(header("Access-Control-Allow-Methods", "GET, POST, OPTIONS"))
    .with_header(header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-webhook-secret",
    ))
}

pub fn start_server(app: AppHandle, online: Arc<AtomicBool>) {
  std::thread::spawn(move || {
    // The port may be held by `pnpm dev` or another instance: keep retrying so
    // the app takes over as soon as it is free.
    let server = loop {
      match Server::http(("0.0.0.0", PORT)) {
        Ok(s) => break s,
        Err(e) => {
          log::warn!("No se pudo abrir el puerto {PORT}: {e}; reintentando");
          let _ = app.emit("gateway-status", false);
          std::thread::sleep(std::time::Duration::from_secs(3));
        }
      }
    };
    online.store(true, Ordering::Relaxed);
    let _ = app.emit("gateway-status", true);

    for mut req in server.incoming_requests() {
      let path = req.url().split('?').next().unwrap_or("").to_string();
      let response = match (req.method(), path.as_str()) {
        (Method::Options, _) => json_response(204, Value::Null),
        (Method::Post, "/webhook" | "/api/webhook") => {
          let mut body = String::new();
          let _ = req.as_reader().take(1_048_576).read_to_string(&mut body);
          let parsed = if body.trim().is_empty() {
            Ok(json!({}))
          } else {
            serde_json::from_str::<Value>(&body)
          };
          match parsed {
            Ok(payload) => {
              let event = parse_payload(payload);
              let _ = app.emit("webhook", &event);
              json_response(
                200,
                json!({ "status": "success", "message": "Webhook recibido", "id": event.id }),
              )
            }
            Err(e) => json_response(
              400,
              json!({ "status": "error", "message": "JSON inválido", "error": e.to_string() }),
            ),
          }
        }
        (Method::Get, "/health" | "/api/health") => {
          json_response(200, json!({ "status": "ok", "port": PORT }))
        }
        _ => json_response(404, json!({ "error": "Endpoint no encontrado. Usa POST /webhook" })),
      };
      let _ = req.respond(response);
    }
  });
}
