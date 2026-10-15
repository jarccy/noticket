//! Calendar reminders scheduled on the Rust side.
//!
//! The main window's JavaScript gets throttled or suspended by WebView2 while the
//! window sits hidden in the tray, so it can't be trusted to fire on time. The
//! frontend hands us the pending reminders (already built as popup payloads) and
//! this thread pushes them to the popup window when they come due.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

/// Reminders that came due while the app was closed are dropped after this.
const GRACE_MS: i64 = 15 * 60 * 1000;
const TICK: Duration = Duration::from_secs(5);

#[derive(Deserialize, Clone)]
pub struct Reminder {
  /// `id|date|time`: changes when the event is rescheduled, re-arming it.
  pub key: String,
  /// Due time in epoch milliseconds (computed in local time by the frontend).
  pub due: i64,
  /// Popup payload (same shape as a webhook event).
  pub event: Value,
}

#[derive(Default)]
pub struct ReminderState {
  pending: Mutex<Vec<Reminder>>,
  fired: Mutex<HashSet<String>>,
}

pub type SharedReminders = Arc<ReminderState>;

impl ReminderState {
  pub fn replace(&self, reminders: Vec<Reminder>) {
    *self.pending.lock().unwrap() = reminders;
  }

  fn take_due(&self, now: i64) -> Vec<Reminder> {
    let pending = self.pending.lock().unwrap();
    let mut fired = self.fired.lock().unwrap();
    pending
      .iter()
      .filter(|r| r.due <= now && now - r.due < GRACE_MS && fired.insert(r.key.clone()))
      .cloned()
      .collect()
  }
}

fn now_ms() -> i64 {
  SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

pub fn start(app: AppHandle, state: SharedReminders) {
  thread::spawn(move || loop {
    for r in state.take_due(now_ms()) {
      crate::push_notification(&app, r.event);
      // Lets the frontend remember it so a restart doesn't repeat the reminder
      let _ = app.emit_to("main", "reminder-fired", r.key);
    }
    thread::sleep(TICK);
  });
}
