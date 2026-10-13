use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use url::Url;

// Oatcake for Mac: a window onto the live site, so every update to oatcake.xyz shows up here
// without reinstalling. The app adds a Dock icon, Mac notifications for new requests
// (desktop.js), files dragged in from Finder, and downloads saved to the Downloads folder.

// Pages on these hosts open inside the app; every other link opens in the default browser.
fn is_oatcake(url: &Url) -> bool {
    match url.host_str() {
        Some(host) => host == "oatcake.xyz" || host.ends_with(".oatcake.xyz"),
        None => false,
    }
}

fn open_outside(app: &tauri::AppHandle, url: &Url) {
    if matches!(url.scheme(), "http" | "https" | "mailto" | "tel") {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let nav_app = app.handle().clone();
            let popup_app = app.handle().clone();
            let download_app = app.handle().clone();
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Oatcake")
                .inner_size(1280.0, 840.0)
                .min_inner_size(420.0, 560.0)
                .initialization_script(include_str!("../desktop.js"))
                // Let files dropped from Finder reach the page's own drop areas (new request, deliveries).
                .disable_drag_drop_handler()
                .on_navigation(move |url| {
                    // The app's own start page, Oatcake itself, and in-page blobs/data stay here.
                    if matches!(url.scheme(), "tauri" | "about" | "blob" | "data")
                        || url.host_str() == Some("tauri.localhost")
                        || is_oatcake(url)
                    {
                        return true;
                    }
                    // A file dropped outside a drop area would replace the page; ignore it instead.
                    if url.scheme() != "file" {
                        open_outside(&nav_app, url);
                    }
                    false
                })
                .on_new_window(move |url, _features| {
                    // Links that would open a new tab: Oatcake pages open in this window,
                    // anything else (files, Pinterest, client links) in the default browser.
                    if is_oatcake(&url) {
                        if let Some(main) = popup_app.get_webview_window("main") {
                            let _ = main.navigate(url);
                        }
                    } else {
                        open_outside(&popup_app, &url);
                    }
                    NewWindowResponse::Deny
                })
                .on_download(move |_webview, event| {
                    if let DownloadEvent::Finished { success: true, .. } = event {
                        let _ = download_app
                            .notification()
                            .builder()
                            .title("Downloaded")
                            .body("Saved to your Downloads folder.")
                            .show();
                    }
                    true
                });
            // No grey Mac title bar: the page runs to the top of the window and draws its own
            // bar behind the window buttons (html.in-app in globals.css, .app-drag to move it).
            #[cfg(target_os = "macos")]
            let window = window
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true)
                // Centred in the site's 40px top bar (--app-bar in globals.css).
                .traffic_light_position(tauri::LogicalPosition::new(16.0, 20.0));
            window.build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Oatcake");

    app.run(|app, event| match event {
        // Closing the window hides it, like Mail or Messages, so notifications keep coming
        // until you quit with Cmd+Q.
        RunEvent::WindowEvent { label, event: WindowEvent::CloseRequested { api, .. }, .. } => {
            if let Some(window) = app.get_webview_window(&label) {
                api.prevent_close();
                let _ = window.hide();
            }
        }
        // Clicking the Dock icon (or a notification) brings the window back.
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        _ => {}
    });
}
