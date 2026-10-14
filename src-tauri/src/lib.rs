mod webhook;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WindowEvent};

const NOTIFY_LABEL: &str = "notify";
const NOTIFY_WIDTH: f64 = 396.0;
const NOTIFY_MARGIN: f64 = 12.0;

struct GatewayState {
  online: Arc<AtomicBool>,
}

/// Webhooks fired from inside the app (simulator, presets, replay) go through
/// the same parser and event path as real HTTP webhooks.
#[tauri::command]
fn ingest_webhook(app: AppHandle, payload: Value) -> webhook::WebhookEvent {
  let event = webhook::parse_payload(payload);
  let _ = app.emit("webhook", &event);
  event
}

#[tauri::command]
fn gateway_online(state: State<GatewayState>) -> bool {
  state.online.load(Ordering::Relaxed)
}

/// Hand an event to the popup window. The popup sizes itself and calls
/// `layout_notifications`, which shows and positions it.
#[tauri::command]
fn show_notification(app: AppHandle, event: Value) -> Result<(), String> {
  app.emit_to(NOTIFY_LABEL, "notify:push", event).map_err(|e| e.to_string())
}

/// Resize the popup to its content (logical px) and pin it to the bottom-right
/// of the work area. Height 0 hides it.
#[tauri::command]
fn layout_notifications(app: AppHandle, height: f64) -> Result<(), String> {
  let win = app.get_webview_window(NOTIFY_LABEL).ok_or("notify window missing")?;
  if height <= 0.0 {
    return win.hide().map_err(|e| e.to_string());
  }

  let monitor = app
    .get_webview_window("main")
    .and_then(|m| m.current_monitor().ok().flatten())
    .or_else(|| win.primary_monitor().ok().flatten())
    .ok_or("no monitor")?;

  let scale = monitor.scale_factor();
  let area = monitor.work_area();
  let w = (NOTIFY_WIDTH * scale).round() as u32;
  let h = (height * scale).round() as u32;
  let margin = (NOTIFY_MARGIN * scale).round() as i32;
  let x = area.position.x + area.size.width as i32 - w as i32 - margin;
  let y = area.position.y + area.size.height as i32 - h as i32 - margin;

  win.set_size(PhysicalSize::new(w, h)).map_err(|e| e.to_string())?;
  win.set_position(PhysicalPosition::new(x, y)).map_err(|e| e.to_string())?;
  if !win.is_visible().unwrap_or(false) {
    win.show().map_err(|e| e.to_string())?;
  }
  let _ = win.set_always_on_top(true);
  Ok(())
}

/// Clicking a popup brings the main window forward on the relevant tab.
#[tauri::command]
fn open_main(app: AppHandle, tab: String) -> Result<(), String> {
  let main = app.get_webview_window("main").ok_or("main window missing")?;
  let _ = main.unminimize();
  let _ = main.show();
  let _ = main.set_focus();
  app.emit_to("main", "navigate", tab).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let online = Arc::new(AtomicBool::new(false));

  tauri::Builder::default()
    .manage(GatewayState { online: online.clone() })
    .invoke_handler(tauri::generate_handler![
      ingest_webhook,
      gateway_online,
      show_notification,
      layout_notifications,
      open_main
    ])
    .setup(move |app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      app.handle().plugin(tauri_plugin_notification::init())?;

      // The hidden popup window would otherwise keep the process alive.
      if let Some(main) = app.get_webview_window("main") {
        let handle = app.handle().clone();
        main.on_window_event(move |e| {
          if let WindowEvent::CloseRequested { .. } = e {
            handle.exit(0);
          }
        });
      }

      webhook::start_server(app.handle().clone(), online.clone());
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
