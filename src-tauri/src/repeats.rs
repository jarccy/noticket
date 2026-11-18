//! Repeating notifications: an unseen webhook from an endpoint with "repeat" on is
//! shown again every N minutes until it is marked as seen.
//!
//! Scheduled from Rust for the same reason as the calendar reminders: WebView2
//! throttles or freezes the hidden main window, so its timers can't be trusted. The
//! frontend hands over the unseen events that should repeat; "mark as seen" (from the
//! popup or the app) removes them from here at once.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;

const TICK: Duration = Duration::from_secs(5);

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Repeat {
  /// Webhook event id.
  pub id: String,
  /// Interval in milliseconds.
  pub every_ms: i64,
  /// When the event arrived (epoch ms): repetitions fall on since + k·every.
  pub since_ms: i64,
  /// Popup payload (the webhook event).
  pub event: Value,
}

struct Scheduled {
  repeat: Repeat,
  next_due: i64,
  count: u32,
}

#[derive(Default)]
pub struct RepeatState {
  items: Mutex<HashMap<String, Scheduled>>,
}

pub type SharedRepeats = Arc<RepeatState>;

fn now_ms() -> i64 {
  SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// First slot after `now` (an old unseen event repeats once soon, not in a burst).
fn next_slot(since: i64, every: i64, now: i64) -> (i64, u32) {
  if now <= since {
    return (since + every, 1);
  }
  let k = (now - since) / every + 1;
  (since + k * every, k as u32)
}

impl RepeatState {
  /// Replaces the list, keeping the schedule of events that were already there.
  pub fn replace(&self, repeats: Vec<Repeat>) {
    let now = now_ms();
    let mut items = self.items.lock().unwrap();
    let mut next = HashMap::with_capacity(repeats.len());
    for r in repeats.into_iter().filter(|r| r.every_ms >= 60_000) {
      let kept = items
        .remove(&r.id)
        .filter(|s| s.repeat.every_ms == r.every_ms && s.repeat.since_ms == r.since_ms);
      let (next_due, count) = match kept {
        Some(s) => (s.next_due, s.count),
        None => {
          let (due, k) = next_slot(r.since_ms, r.every_ms, now);
          (due, k.saturating_sub(1))
        }
      };
      next.insert(r.id.clone(), Scheduled { repeat: r, next_due, count });
    }
    *items = next;
  }

  pub fn remove(&self, id: &str) {
    self.items.lock().unwrap().remove(id);
  }

  fn take_due(&self, now: i64) -> Vec<Value> {
    let mut items = self.items.lock().unwrap();
    let mut due = Vec::new();
    for s in items.values_mut().filter(|s| s.next_due <= now) {
      s.count += 1;
      // If the app was asleep, skip the missed slots instead of firing them all
      let (next_due, _) = next_slot(s.repeat.since_ms, s.repeat.every_ms, now);
      s.next_due = next_due;
      let mut event = s.repeat.event.clone();
      if let Some(obj) = event.as_object_mut() {
        obj.insert("repeatCount".into(), Value::from(s.count));
      }
      due.push(event);
    }
    due
  }
}

pub fn start(app: AppHandle, state: SharedRepeats) {
  thread::spawn(move || loop {
    if crate::popups_enabled() {
      for event in state.take_due(now_ms()) {
        crate::push_notification(&app, event);
      }
    }
    thread::sleep(TICK);
  });
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn schedules_on_slots_and_stops_when_removed() {
    let state = RepeatState::default();
    let now = now_ms();
    let minute = 60_000;
    // Arrived 2.5 minutes ago, repeats every minute: next slot is at +3 min
    state.replace(vec![Repeat { id: "wh_1".into(), every_ms: minute, since_ms: now - 150_000, event: json!({ "id": "wh_1" }) }]);
    assert!(state.take_due(now).is_empty());
    let fired = state.take_due(now + 31_000);
    assert_eq!(fired.len(), 1);
    assert_eq!(fired[0]["repeatCount"], 3);
    // Same slot does not fire twice
    assert!(state.take_due(now + 32_000).is_empty());

    // Replacing with the same event keeps its schedule
    state.replace(vec![Repeat { id: "wh_1".into(), every_ms: minute, since_ms: now - 150_000, event: json!({ "id": "wh_1" }) }]);
    assert!(state.take_due(now + 33_000).is_empty());

    state.remove("wh_1");
    assert!(state.take_due(now + 10 * minute).is_empty());
  }
}
