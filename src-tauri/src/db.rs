//! Local SQLite store used while there is no backend session ("local mode").
//!
//! Holds the configured webhook endpoints, the webhook history and the calendar.
//! Webhooks are written here from Rust as they arrive, so nothing is lost while the
//! main window sits hidden in the tray. Events and calendar entries are kept as the
//! frontend's JSON (the frontend owns that shape) plus a few indexed columns.

use std::sync::{Mutex, MutexGuard, OnceLock};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::webhook::{iso_now, now_millis};

static DB: OnceLock<Mutex<Connection>> = OnceLock::new();

const SCHEMA_VERSION: i32 = 3;

/// v2: repeat a notification every N minutes until it is marked as seen.
const MIGRATION_V2: &str = "
ALTER TABLE endpoints ADD COLUMN repeat INTEGER NOT NULL DEFAULT 0;
ALTER TABLE endpoints ADD COLUMN repeat_minutes INTEGER NOT NULL DEFAULT 15;
";

/// v3: notification design per endpoint (style, color, icon, duration…), as JSON.
const MIGRATION_V3: &str = "ALTER TABLE endpoints ADD COLUMN appearance TEXT NOT NULL DEFAULT '{}';";

/// Bounds for the repeat interval, in minutes (same as notiback).
pub const REPEAT_MIN: i64 = 1;
pub const REPEAT_MAX: i64 = 1440;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS endpoints (
  id               TEXT PRIMARY KEY,
  name             TEXT    NOT NULL,
  description      TEXT    NOT NULL DEFAULT '',
  secret           TEXT    NOT NULL,
  enabled          INTEGER NOT NULL DEFAULT 1,
  popup            INTEGER NOT NULL DEFAULT 1,
  sound            INTEGER NOT NULL DEFAULT 1,
  mapping          TEXT    NOT NULL DEFAULT '{}',
  received_count   INTEGER NOT NULL DEFAULT 0,
  last_received_at TEXT,
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_events (
  id          TEXT PRIMARY KEY,
  ts          TEXT    NOT NULL,
  read        INTEGER NOT NULL DEFAULT 0,
  endpoint_id TEXT,
  data        TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_ts ON webhook_events (ts DESC);
CREATE TABLE IF NOT EXISTS calendar_events (
  id    TEXT PRIMARY KEY,
  date  TEXT NOT NULL,
  data  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
";

/// Opens (or creates) the database at `path` and applies the schema.
pub fn init(path: &std::path::Path) -> Result<(), String> {
  if let Some(dir) = path.parent() {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
  }
  let conn = Connection::open(path).map_err(|e| e.to_string())?;
  conn
    .execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
    .map_err(|e| e.to_string())?;
  let version: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(|e| e.to_string())?;
  if version < SCHEMA_VERSION {
    if version < 1 {
      conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
    }
    if version < 2 {
      conn.execute_batch(MIGRATION_V2).map_err(|e| e.to_string())?;
    }
    if version < 3 {
      conn.execute_batch(MIGRATION_V3).map_err(|e| e.to_string())?;
    }
    conn
      .execute_batch(&format!("PRAGMA user_version = {SCHEMA_VERSION}"))
      .map_err(|e| e.to_string())?;
  }
  DB.set(Mutex::new(conn)).map_err(|_| "la base local ya estaba abierta".to_string())
}

fn conn() -> Result<MutexGuard<'static, Connection>, String> {
  DB.get()
    .ok_or("la base local no está disponible")?
    .lock()
    .map_err(|_| "la base local está bloqueada".to_string())
}

fn now() -> String {
  iso_now(now_millis())
}

// ---------- Endpoints ----------

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Endpoint {
  pub id: String,
  pub name: String,
  #[serde(default)]
  pub description: String,
  pub secret: String,
  pub enabled: bool,
  pub popup: bool,
  pub sound: bool,
  #[serde(default)]
  pub mapping: Map<String, Value>,
  /// Show the notification again every `repeat_minutes` until it is marked as seen.
  #[serde(default)]
  pub repeat: bool,
  #[serde(default = "default_repeat_minutes")]
  pub repeat_minutes: i64,
  /// Notification design (the frontend owns its shape and validates it).
  #[serde(default)]
  pub appearance: Map<String, Value>,
  #[serde(default)]
  pub received_count: i64,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub last_received_at: Option<String>,
  #[serde(default)]
  pub created_at: String,
  #[serde(default)]
  pub updated_at: String,
}

fn default_repeat_minutes() -> i64 {
  15
}

const ENDPOINT_COLS: &str = "id, name, description, secret, enabled, popup, sound, mapping, received_count,    last_received_at, created_at, updated_at, repeat, repeat_minutes, appearance";

fn row_endpoint(r: &rusqlite::Row) -> rusqlite::Result<Endpoint> {
  let mapping: String = r.get(7)?;
  Ok(Endpoint {
    id: r.get(0)?,
    name: r.get(1)?,
    description: r.get(2)?,
    secret: r.get(3)?,
    enabled: r.get(4)?,
    popup: r.get(5)?,
    sound: r.get(6)?,
    mapping: serde_json::from_str(&mapping).unwrap_or_default(),
    received_count: r.get(8)?,
    last_received_at: r.get(9)?,
    created_at: r.get(10)?,
    updated_at: r.get(11)?,
    repeat: r.get(12)?,
    repeat_minutes: r.get(13)?,
    appearance: serde_json::from_str(&r.get::<_, String>(14)?).unwrap_or_default(),
  })
}

pub fn get_endpoint(id: &str) -> Result<Option<Endpoint>, String> {
  conn()?
    .query_row(&format!("SELECT {ENDPOINT_COLS} FROM endpoints WHERE id = ?1"), [id], row_endpoint)
    .optional()
    .map_err(|e| e.to_string())
}

/// Counts a webhook received through an endpoint.
pub fn touch_endpoint(id: &str) {
  if let Ok(c) = conn() {
    let _ = c.execute(
      "UPDATE endpoints SET received_count = received_count + 1, last_received_at = ?2 WHERE id = ?1",
      params![id, now()],
    );
  }
}

#[tauri::command]
pub fn db_list_endpoints() -> Result<Vec<Endpoint>, String> {
  let c = conn()?;
  let mut stmt = c
    .prepare(&format!("SELECT {ENDPOINT_COLS} FROM endpoints ORDER BY created_at"))
    .map_err(|e| e.to_string())?;
  let rows = stmt.query_map([], row_endpoint).map_err(|e| e.to_string())?;
  rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
}

/// Creates or updates an endpoint. Counters and creation date are kept by the database.
#[tauri::command]
pub fn db_save_endpoint(endpoint: Endpoint) -> Result<Endpoint, String> {
  let name = endpoint.name.trim();
  if endpoint.id.trim().is_empty() || name.is_empty() {
    return Err("id y nombre son obligatorios".into());
  }
  if endpoint.secret.len() < 16 {
    return Err("el secreto debe tener al menos 16 caracteres".into());
  }
  if !(REPEAT_MIN..=REPEAT_MAX).contains(&endpoint.repeat_minutes) {
    return Err(format!("el intervalo debe estar entre {REPEAT_MIN} y {REPEAT_MAX} minutos"));
  }
  let ts = now();
  let mapping = Value::Object(endpoint.mapping.clone()).to_string();
  let appearance = Value::Object(endpoint.appearance.clone()).to_string();
  if appearance.len() > 2_000 {
    return Err("el diseño del aviso es demasiado grande".into());
  }
  conn()?
    .execute(
      "INSERT INTO endpoints (id, name, description, secret, enabled, popup, sound, mapping, created_at, updated_at,
         repeat, repeat_minutes, appearance)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?10, ?11, ?12)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name, description = excluded.description, secret = excluded.secret,
         enabled = excluded.enabled, popup = excluded.popup, sound = excluded.sound,
         mapping = excluded.mapping, updated_at = excluded.updated_at,
         repeat = excluded.repeat, repeat_minutes = excluded.repeat_minutes,
         appearance = excluded.appearance",
      params![
        endpoint.id,
        name,
        endpoint.description.trim(),
        endpoint.secret,
        endpoint.enabled,
        endpoint.popup,
        endpoint.sound,
        mapping,
        ts,
        endpoint.repeat,
        endpoint.repeat_minutes,
        appearance
      ],
    )
    .map_err(|e| e.to_string())?;
  get_endpoint(&endpoint.id)?.ok_or_else(|| "no se pudo guardar el endpoint".into())
}

#[tauri::command]
pub fn db_delete_endpoints(ids: Vec<String>) -> Result<usize, String> {
  let mut c = conn()?;
  let tx = c.transaction().map_err(|e| e.to_string())?;
  let mut n = 0;
  for id in &ids {
    n += tx.execute("DELETE FROM endpoints WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
  }
  tx.commit().map_err(|e| e.to_string())?;
  Ok(n)
}

// ---------- Webhook events ----------

fn str_of(v: &Value, key: &str) -> String {
  v.get(key).and_then(Value::as_str).unwrap_or_default().to_string()
}

pub fn insert_event(event: &Value) -> Result<(), String> {
  let id = str_of(event, "id");
  if id.is_empty() {
    return Err("el evento no tiene id".into());
  }
  let read = event.get("read").and_then(Value::as_bool).unwrap_or(false);
  let endpoint = event.get("endpointId").and_then(Value::as_str);
  conn()?
    .execute(
      "INSERT OR REPLACE INTO webhook_events (id, ts, read, endpoint_id, data) VALUES (?1, ?2, ?3, ?4, ?5)",
      params![id, str_of(event, "timestamp"), read, endpoint, event.to_string()],
    )
    .map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
pub fn db_list_events(limit: Option<u32>) -> Result<Vec<Value>, String> {
  let c = conn()?;
  let mut stmt = c
    .prepare("SELECT data, read FROM webhook_events ORDER BY ts DESC LIMIT ?1")
    .map_err(|e| e.to_string())?;
  let rows = stmt
    .query_map([limit.unwrap_or(1000)], |r| Ok((r.get::<_, String>(0)?, r.get::<_, bool>(1)?)))
    .map_err(|e| e.to_string())?;
  let mut out = Vec::new();
  for row in rows {
    let (data, read) = row.map_err(|e| e.to_string())?;
    if let Ok(mut v) = serde_json::from_str::<Value>(&data) {
      // `read` lives in its own column: it changes without rewriting the JSON
      if let Some(obj) = v.as_object_mut() {
        obj.insert("read".into(), Value::Bool(read));
      }
      out.push(v);
    }
  }
  Ok(out)
}

#[tauri::command]
pub fn db_save_event(event: Value) -> Result<(), String> {
  insert_event(&event)
}

#[tauri::command]
pub fn db_mark_read(ids: Vec<String>) -> Result<(), String> {
  let mut c = conn()?;
  let tx = c.transaction().map_err(|e| e.to_string())?;
  for id in &ids {
    tx.execute("UPDATE webhook_events SET read = 1 WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
  }
  tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_mark_all_read() -> Result<(), String> {
  conn()?.execute("UPDATE webhook_events SET read = 1", []).map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
pub fn db_delete_events(ids: Vec<String>) -> Result<usize, String> {
  let mut c = conn()?;
  let tx = c.transaction().map_err(|e| e.to_string())?;
  let mut n = 0;
  for id in &ids {
    n += tx.execute("DELETE FROM webhook_events WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
  }
  tx.commit().map_err(|e| e.to_string())?;
  Ok(n)
}

#[tauri::command]
pub fn db_clear_events() -> Result<(), String> {
  conn()?.execute("DELETE FROM webhook_events", []).map_err(|e| e.to_string())?;
  Ok(())
}

// ---------- Calendar ----------

#[tauri::command]
pub fn db_list_calendar() -> Result<Vec<Value>, String> {
  let c = conn()?;
  let mut stmt = c
    .prepare("SELECT data FROM calendar_events ORDER BY date")
    .map_err(|e| e.to_string())?;
  let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
  let mut out = Vec::new();
  for row in rows {
    if let Ok(v) = serde_json::from_str::<Value>(&row.map_err(|e| e.to_string())?) {
      out.push(v);
    }
  }
  Ok(out)
}

fn upsert_calendar(c: &Connection, event: &Value) -> Result<(), String> {
  let id = str_of(event, "id");
  if id.is_empty() {
    return Err("el evento de calendario no tiene id".into());
  }
  c.execute(
    "INSERT OR REPLACE INTO calendar_events (id, date, data) VALUES (?1, ?2, ?3)",
    params![id, str_of(event, "date"), event.to_string()],
  )
  .map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
pub fn db_save_calendar(event: Value) -> Result<(), String> {
  let c = conn()?;
  upsert_calendar(&c, &event)
}

#[tauri::command]
pub fn db_delete_calendar(ids: Vec<String>) -> Result<usize, String> {
  let mut c = conn()?;
  let tx = c.transaction().map_err(|e| e.to_string())?;
  let mut n = 0;
  for id in &ids {
    n += tx.execute("DELETE FROM calendar_events WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
  }
  tx.commit().map_err(|e| e.to_string())?;
  Ok(n)
}

// ---------- Migration from localStorage / sync ----------

/// Imports the data that earlier versions kept in localStorage. Runs once: returns
/// false (and imports nothing) if it already ran.
#[tauri::command]
pub fn db_import_legacy(events: Vec<Value>, calendar: Vec<Value>) -> Result<bool, String> {
  let mut c = conn()?;
  let tx = c.transaction().map_err(|e| e.to_string())?;
  let done: Option<String> = tx
    .query_row("SELECT value FROM meta WHERE key = 'legacy_imported'", [], |r| r.get(0))
    .optional()
    .map_err(|e| e.to_string())?;
  if done.is_some() {
    return Ok(false);
  }
  for e in &events {
    let id = str_of(e, "id");
    if id.is_empty() {
      continue;
    }
    let read = e.get("read").and_then(Value::as_bool).unwrap_or(false);
    tx.execute(
      "INSERT OR IGNORE INTO webhook_events (id, ts, read, endpoint_id, data) VALUES (?1, ?2, ?3, ?4, ?5)",
      params![id, str_of(e, "timestamp"), read, e.get("endpointId").and_then(Value::as_str), e.to_string()],
    )
    .map_err(|e| e.to_string())?;
  }
  for cal in &calendar {
    if !str_of(cal, "id").is_empty() {
      upsert_calendar(&tx, cal)?;
    }
  }
  tx.execute("INSERT INTO meta (key, value) VALUES ('legacy_imported', ?1)", [now()])
    .map_err(|e| e.to_string())?;
  tx.commit().map_err(|e| e.to_string())?;
  Ok(true)
}

/// Items in the local store that "Sincronizar" can upload to the backend.
#[tauri::command]
pub fn db_pending_count() -> Result<i64, String> {
  conn()?
    .query_row(
      "SELECT (SELECT COUNT(*) FROM webhook_events) + (SELECT COUNT(*) FROM calendar_events) + (SELECT COUNT(*) FROM endpoints)",
      [],
      |r| r.get(0),
    )
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn endpoints_events_calendar_and_legacy_import() {
    let path = std::env::temp_dir().join(format!("noticket-test-{}.db", now_millis()));
    init(&path).unwrap();

    // Endpoint: create, then update keeps counters and creation date
    let mut ep = Endpoint {
      id: "ep_test123".into(),
      name: "GitHub".into(),
      description: String::new(),
      secret: "whs_0123456789abcdef".into(),
      enabled: true,
      popup: false,
      sound: true,
      mapping: json!({ "title": "pull_request.title" }).as_object().unwrap().clone(),
      repeat: true,
      repeat_minutes: 30,
      appearance: json!({ "style": "banner", "duration": 0 }).as_object().unwrap().clone(),
      received_count: 0,
      last_received_at: None,
      created_at: String::new(),
      updated_at: String::new(),
    };
    let saved = db_save_endpoint(ep.clone()).unwrap();
    touch_endpoint(&ep.id);
    ep.name = "GitHub org".into();
    let updated = db_save_endpoint(ep.clone()).unwrap();
    assert_eq!(updated.name, "GitHub org");
    assert_eq!(updated.received_count, 1);
    assert_eq!(updated.created_at, saved.created_at);
    assert!(!updated.popup);
    assert!(updated.repeat);
    assert_eq!(updated.repeat_minutes, 30);
    assert_eq!(updated.appearance.get("style").and_then(Value::as_str), Some("banner"));
    assert_eq!(updated.mapping.get("title").and_then(Value::as_str), Some("pull_request.title"));

    // Short secrets are rejected
    ep.secret = "short".into();
    assert!(db_save_endpoint(ep).is_err());

    // Events: newest first, `read` from its own column
    insert_event(&json!({ "id": "wh_1", "timestamp": "2026-11-18T10:00:00.000Z", "read": false, "title": "a" })).unwrap();
    insert_event(&json!({ "id": "wh_2", "timestamp": "2026-11-18T11:00:00.000Z", "read": false, "endpointId": "ep_test123" })).unwrap();
    db_mark_read(vec!["wh_1".into()]).unwrap();
    let events = db_list_events(None).unwrap();
    assert_eq!(events.len(), 2);
    assert_eq!(events[0]["id"], "wh_2");
    assert_eq!(events[1]["read"], true);

    // Legacy import runs once and skips existing ids
    let legacy = vec![json!({ "id": "wh_1", "timestamp": "x", "title": "dup" }), json!({ "id": "wh_old", "timestamp": "2026-01-01T00:00:00.000Z" })];
    let cal = vec![json!({ "id": "cal_1", "date": "2026-11-20", "title": "Reunión" })];
    assert!(db_import_legacy(legacy.clone(), cal.clone()).unwrap());
    assert!(!db_import_legacy(legacy, cal).unwrap());
    assert_eq!(db_list_events(None).unwrap().len(), 3);
    assert_eq!(db_list_calendar().unwrap().len(), 1);
    assert_eq!(db_pending_count().unwrap(), 3 + 1 + 1);

    db_delete_events(vec!["wh_old".into()]).unwrap();
    db_delete_calendar(vec!["cal_1".into()]).unwrap();
    db_delete_endpoints(vec!["ep_test123".into()]).unwrap();
    assert_eq!(db_pending_count().unwrap(), 2);
    assert!(get_endpoint("ep_test123").unwrap().is_none());
  }
}
