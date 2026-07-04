// ChatSend desktop shell: a thin Tauri window around the built web app.
// All product logic lives in the web frontend; the shell only provides a
// native window, so web and desktop can never drift apart.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running ChatSend");
}
