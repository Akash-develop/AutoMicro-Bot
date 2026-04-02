#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  use tauri::Manager;

  #[derive(Default)]
  struct BackendSidecar(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

  tauri::Builder::default()
    .manage(BackendSidecar::default())
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Start backend sidecar automatically in production builds.
      // Uses a fixed port to keep the frontend BASE_URL stable.
      #[cfg(not(debug_assertions))]
      {
        use tauri_plugin_shell::ShellExt;

        // Fixed, uncommon port to reduce collision risk.
        // If you change this, also update the frontend BASE_URL logic.
        const BACKEND_HOST: &str = "127.0.0.1";
        const BACKEND_PORT: &str = "8765";

        let sidecar = app
          .shell()
          .sidecar("automicro-backend")?
          .env("HOST", BACKEND_HOST)
          .env("PORT", BACKEND_PORT);

        // Spawn and keep running in the background; backend logs go to stdout/stderr.
        let (_rx, child) = sidecar.spawn()?;
        let state = app.state::<BackendSidecar>();
        *state.0.lock().expect("backend sidecar mutex poisoned") = Some(child);
      }

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      #[cfg(not(debug_assertions))]
      if let tauri::RunEvent::ExitRequested { .. } = event {
        let state = app_handle.state::<BackendSidecar>();
        let child = {
          let mut guard = state.0.lock().expect("backend sidecar mutex poisoned");
          guard.take()
        };
        if let Some(child) = child {
          let _ = child.kill();
        };
      }
    });
}
