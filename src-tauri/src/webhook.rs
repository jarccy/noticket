//! Embedded webhook receiver. Mirrors vite-webhook-plugin.ts so the installed
//! app accepts the same payloads as `pnpm dev`.
//!
//! Routes:
//! - `POST /webhook`: generic hook (default parsing).
//! - `POST /webhook/<endpoint id>`: a configured endpoint (local mode only) with its
//!   own secret, field mapping and popup/sound preferences.

use std::io::Read;
use std::net::{IpAddr, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{json, Map, Value};
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Method, Request, Response, Server};

use crate::db;

pub const PORT: u16 = 3690;

/// Secret that authorizes the generic `/webhook` in local mode (no backend session).
/// The frontend generates it, keeps it in localStorage and hands it over at startup.
static LOCAL_SECRET: Mutex<String> = Mutex::new(String::new());

pub fn set_local_secret(secret: String) {
  if let Ok(mut s) = LOCAL_SECRET.lock() {
    *s = secret.trim().to_string();
  }
}

/// Primary LAN IPv4 (the one the OS would use to reach the internet). Connecting a
/// UDP socket sends no packets: it only picks the outgoing interface.
pub fn lan_ip() -> Option<IpAddr> {
  let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
  socket.connect("8.8.8.8:80").ok()?;
  let ip = socket.local_addr().ok()?.ip();
  (!ip.is_loopback() && !ip.is_unspecified()).then_some(ip)
}

fn constant_time_eq(a: &str, b: &str) -> bool {
  a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn has_header(req: &Request, name: &str) -> bool {
  req.headers().iter().any(|h| h.field.to_string().eq_ignore_ascii_case(name))
}

/// Secret sent with the request: `x-webhook-secret`, `Authorization: Bearer` or
/// `?secret=` (for services that can't set headers).
fn request_secret(req: &Request) -> Option<String> {
  for h in req.headers() {
    if h.field.equiv("x-webhook-secret") {
      return Some(h.value.as_str().trim().to_string());
    }
    if h.field.equiv("authorization") {
      if let Some(token) = h.value.as_str().trim().strip_prefix("Bearer ") {
        return Some(token.trim().to_string());
      }
    }
  }
  req
    .url()
    .split_once('?')
    .and_then(|(_, q)| q.split('&').find_map(|kv| kv.strip_prefix("secret=")))
    .map(str::to_string)
}

fn secret_matches(req: &Request, expected: &str) -> bool {
  !expected.is_empty() && request_secret(req).is_some_and(|got| constant_time_eq(&got, expected))
}

/// Headers that mean the request did not come straight from a program on this machine:
/// tunnels (cloudflared, ngrok…) connect from localhost but add forwarding headers, and
/// browsers add `Origin` / `Sec-Fetch-*`, so a web page open in the user's browser can't
/// post to localhost:3690 without the secret.
const NOT_LOCAL_HEADERS: &[&str] = &[
  "x-forwarded-for",
  "forwarded",
  "cf-connecting-ip",
  "x-real-ip",
  "origin",
  "sec-fetch-site",
  "sec-fetch-mode",
];

/// A request made directly by a program on this machine (curl, a script…).
fn is_local_request(req: &Request) -> bool {
  req.remote_addr().is_some_and(|a| a.ip().is_loopback()) && !NOT_LOCAL_HEADERS.iter().any(|h| has_header(req, h))
}

/// Generic `/webhook` (with or without a session): a program on this machine is allowed;
/// anything else (other devices, tunnels, web pages) needs the local secret.
fn local_mode_authorized(req: &Request) -> bool {
  is_local_request(req) || secret_matches(req, &LOCAL_SECRET.lock().map(|s| s.clone()).unwrap_or_default())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookEvent {
  pub id: String,
  pub title: String,
  pub message: String,
  #[serde(rename = "type")]
  pub kind: String,
  pub source: String,
  pub timestamp: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub date: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub time: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub category: Option<String>,
  pub read: bool,
  pub raw_payload: Value,
  /// Endpoint it arrived through (None for the generic `/webhook`).
  #[serde(skip_serializing_if = "Option::is_none")]
  pub endpoint_id: Option<String>,
  /// Endpoint preferences: Some(false) turns the popup / sound off for this event.
  #[serde(skip_serializing_if = "Option::is_none")]
  pub popup: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub sound: Option<bool>,
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

pub(crate) fn now_millis() -> u128 {
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
pub(crate) fn iso_now(ms: u128) -> String {
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

// ---------- Field mapping ----------
//
// Each mapped field is either a path into the payload (`pull_request.title`,
// `commits.0.message`) or a template with `{{path}}` placeholders
// (`PR #{{number}}: {{pull_request.title}}`). Same rules as src/lib/webhook-parser.ts
// and notiback's internal/webhook/parser.go.

fn resolve_path<'a>(payload: &'a Value, path: &str) -> Option<&'a Value> {
  path
    .trim()
    .split('.')
    .filter(|s| !s.is_empty())
    .try_fold(payload, |cur, key| match cur {
      Value::Object(map) => map.get(key),
      Value::Array(list) => key.parse::<usize>().ok().and_then(|i| list.get(i)),
      _ => None,
    })
}

fn value_text(v: &Value) -> String {
  match v {
    Value::String(s) => s.clone(),
    Value::Null => String::new(),
    other => other.to_string(),
  }
}

fn render(spec: &str, payload: &Value) -> Option<String> {
  let spec = spec.trim();
  if spec.is_empty() {
    return None;
  }
  let out = if spec.contains("{{") {
    let mut out = String::new();
    let mut rest = spec;
    while let Some(start) = rest.find("{{") {
      out.push_str(&rest[..start]);
      let after = &rest[start + 2..];
      match after.find("}}") {
        Some(end) => {
          out.push_str(&resolve_path(payload, &after[..end]).map(value_text).unwrap_or_default());
          rest = &after[end + 2..];
        }
        None => {
          out.push_str(&rest[start..]);
          rest = "";
        }
      }
    }
    out.push_str(rest);
    out
  } else {
    resolve_path(payload, spec).map(value_text).unwrap_or_default()
  };
  let out = out.trim().to_string();
  (!out.is_empty()).then_some(out)
}

fn mapped(mapping: Option<&Map<String, Value>>, field: &str, payload: &Value) -> Option<String> {
  mapping?.get(field).and_then(Value::as_str).and_then(|spec| render(spec, payload))
}

fn detect_kind(raw_type: &str, has_date: bool) -> &'static str {
  let t = raw_type.to_lowercase();
  let has = |subs: &[&str]| subs.iter().any(|s| t.contains(s));
  if has(&["succ", "ok", "pass"]) {
    "success"
  } else if has(&["warn", "alert"]) {
    "warning"
  } else if has(&["err", "fail", "crit"]) {
    "error"
  } else if has(&["cal", "meet", "event"]) || has_date {
    "calendar"
  } else {
    "info"
  }
}

fn valid_date(s: &str) -> bool {
  let b = s.as_bytes();
  b.len() == 10
    && b[4] == b'-'
    && b[7] == b'-'
    && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

fn valid_time(s: &str) -> bool {
  let parts: Vec<&str> = s.split(':').collect();
  let num = |p: &str, max: u32| p.len() == 2 && p.parse::<u32>().is_ok_and(|n| n <= max);
  matches!(parts.len(), 2 | 3) && num(parts[0], 23) && num(parts[1], 59) && (parts.len() == 2 || num(parts[2], 59))
}

pub fn parse_payload(payload: Value, mapping: Option<&Map<String, Value>>) -> WebhookEvent {
  let empty = Map::new();
  let raw = payload.as_object().unwrap_or(&empty);
  let ms = now_millis();
  let n = COUNTER.fetch_add(1, Ordering::Relaxed);

  let title = mapped(mapping, "title", &payload)
    .or_else(|| first_str(raw, &["title", "subject", "event"]))
    .or_else(|| str_field(raw, "action").map(|a| format!("Evento: {a}")))
    .unwrap_or_else(|| "Notificación de Webhook".into());

  let message = mapped(mapping, "message", &payload)
    .or_else(|| first_str(raw, &["message", "description", "text", "content", "details", "summary"]))
    .unwrap_or_else(|| payload.to_string());

  let date = mapped(mapping, "date", &payload)
    .or_else(|| str_field(raw, "date").map(str::to_string))
    .filter(|d| valid_date(d));
  let time = mapped(mapping, "time", &payload)
    .or_else(|| str_field(raw, "time").map(str::to_string))
    .filter(|t| valid_time(t));

  let raw_type = mapped(mapping, "type", &payload).unwrap_or_else(|| {
    ["type", "level", "status", "severity"]
      .iter()
      .map(|k| loose_string(raw.get(*k)))
      .find(|s| !s.is_empty())
      .unwrap_or_default()
  });
  let has_date = date.is_some() || raw.get("date").is_some_and(|v| !v.is_null() && v != &Value::Bool(false));

  WebhookEvent {
    id: format!("wh_{}{}", to_base36(ms), to_base36(n as u128)),
    title,
    message,
    kind: detect_kind(&raw_type, has_date).into(),
    source: mapped(mapping, "source", &payload)
      .or_else(|| first_str(raw, &["source", "sender", "app"]))
      .unwrap_or_else(|| "Webhook API".into()),
    timestamp: iso_now(ms),
    date,
    time,
    category: mapped(mapping, "category", &payload).or_else(|| str_field(raw, "category").map(str::to_string)),
    read: false,
    raw_payload: payload,
    endpoint_id: None,
    popup: None,
    sound: None,
  }
}

// ---------- HTTP ----------

type JsonResponse = Response<std::io::Cursor<Vec<u8>>>;

fn header(name: &str, value: &str) -> Header {
  Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("valid header")
}

fn json_response(status: u16, body: Value) -> JsonResponse {
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

fn error(status: u16, message: &str) -> JsonResponse {
  json_response(status, json!({ "status": "error", "message": message }))
}

fn read_json_body(req: &mut Request) -> Result<Value, JsonResponse> {
  let mut body = String::new();
  let _ = req.as_reader().take(1_048_576).read_to_string(&mut body);
  if body.trim().is_empty() {
    return Ok(json!({}));
  }
  serde_json::from_str::<Value>(&body).map_err(|e| {
    json_response(400, json!({ "status": "error", "message": "JSON inválido", "error": e.to_string() }))
  })
}

fn accepted(event: &WebhookEvent) -> JsonResponse {
  json_response(200, json!({ "status": "success", "message": "Webhook recibido", "id": event.id }))
}

fn handle_generic(app: &AppHandle, req: &mut Request) -> JsonResponse {
  if !local_mode_authorized(req) {
    return error(401, "Secreto local inválido: envíalo en x-webhook-secret, Authorization: Bearer o ?secret=");
  }
  match read_json_body(req) {
    Ok(payload) => {
      let event = parse_payload(payload, None);
      crate::deliver_webhook(app, &event);
      accepted(&event)
    }
    Err(resp) => resp,
  }
}

/// `/webhook/<id>`: a configured endpoint. Its secret is always required (also from
/// this machine) so each integration can be revoked on its own.
fn handle_endpoint(app: &AppHandle, req: &mut Request, id: &str) -> JsonResponse {
  if crate::SESSION_ACTIVE.load(Ordering::Relaxed) {
    return error(
      409,
      "Con la sesión iniciada los endpoints se reciben en el servidor: usa la URL que muestra la app",
    );
  }
  let endpoint = match db::get_endpoint(id) {
    Ok(Some(ep)) => ep,
    Ok(None) => return error(404, "Endpoint no encontrado"),
    Err(e) => {
      log::error!("base local: {e}");
      return error(500, "Error en la base local");
    }
  };
  if !secret_matches(req, &endpoint.secret) {
    return error(401, "Secreto inválido para este endpoint");
  }
  if !endpoint.enabled {
    return error(423, "Este endpoint está pausado");
  }
  match read_json_body(req) {
    Ok(payload) => {
      let mut event = parse_payload(payload, Some(&endpoint.mapping));
      if event.source == "Webhook API" {
        event.source = endpoint.name.clone();
      }
      event.endpoint_id = Some(endpoint.id.clone());
      event.popup = Some(endpoint.popup);
      event.sound = Some(endpoint.sound);
      db::touch_endpoint(&endpoint.id);
      crate::deliver_webhook(app, &event);
      accepted(&event)
    }
    Err(resp) => resp,
  }
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
      let path = req.url().split('?').next().unwrap_or("").trim_end_matches('/').to_string();
      let endpoint_id = path
        .strip_prefix("/webhook/")
        .or_else(|| path.strip_prefix("/api/webhook/"))
        .filter(|id| !id.is_empty() && !id.contains('/'))
        .map(str::to_string);

      let response = match (req.method(), path.as_str(), endpoint_id) {
        (Method::Options, _, _) => json_response(204, Value::Null),
        (Method::Post, _, Some(id)) => handle_endpoint(&app, &mut req, &id),
        (Method::Post, "/webhook" | "/api/webhook", None) => handle_generic(&app, &mut req),
        (Method::Get, "/health" | "/api/health", _) => json_response(200, json!({ "status": "ok", "port": PORT })),
        _ => json_response(404, json!({ "error": "Endpoint no encontrado. Usa POST /webhook o /webhook/<id>" })),
      };
      let _ = req.respond(response);
    }
  });
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn mapping_paths_and_templates() {
    let payload = json!({
      "action": "opened",
      "number": 7,
      "pull_request": { "title": "Fix login", "state": "failure" },
      "commits": [{ "message": "first" }],
      "repository": { "full_name": "acme/app" }
    });
    let mut mapping = Map::new();
    mapping.insert("title".into(), json!("PR #{{number}}: {{pull_request.title}}"));
    mapping.insert("message".into(), json!("commits.0.message"));
    mapping.insert("type".into(), json!("pull_request.state"));
    mapping.insert("source".into(), json!("repository.full_name"));
    mapping.insert("category".into(), json!("missing.path"));

    let e = parse_payload(payload, Some(&mapping));
    assert_eq!(e.title, "PR #7: Fix login");
    assert_eq!(e.message, "first");
    assert_eq!(e.kind, "error");
    assert_eq!(e.source, "acme/app");
    assert_eq!(e.category, None);
  }

  #[test]
  fn defaults_without_mapping() {
    let e = parse_payload(json!({ "title": "Hola", "level": "warning", "date": "2026-11-18", "time": "25:00" }), None);
    assert_eq!(e.title, "Hola");
    assert_eq!(e.kind, "warning");
    assert_eq!(e.date.as_deref(), Some("2026-11-18"));
    assert_eq!(e.time, None);
  }
}
