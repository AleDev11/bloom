//! The launcher: a search box opened with Alt+Space that finds apps, files
//! and Windows settings, runs system actions and evaluates math. Apps come
//! from the Start Menu scan the dock already uses; files from the Windows
//! Search index. The frontend lives in src/Launcher.tsx.

use serde::Serialize;
use std::sync::atomic::{AtomicI64, AtomicU8, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

const HOTKEY_ID: i32 = 0xB100;
/// How many file results one search returns.
const MAX_FILE_RESULTS: u32 = 12;

/// Paths from the latest file search. Opening a file from the launcher is
/// limited to these, so the command cannot be pointed at arbitrary paths.
static LAST_FILE_RESULTS: Mutex<Vec<String>> = Mutex::new(Vec::new());

#[derive(Clone, Serialize)]
pub struct FileHit {
    pub name: String,
    pub path: String,
    pub folder: bool,
}

/// `bloom-launcher-enabled`, on unless set to "false".
fn launcher_enabled() -> bool {
    crate::state::SETTINGS_CACHE.get().is_none_or(|cache| {
        cache.lock().is_ok_and(|settings| {
            settings
                .get("bloom-launcher-enabled")
                .and_then(|v| v.as_str())
                != Some("false")
        })
    })
}

/// Registers Alt+Space on a thread of its own while the launcher is enabled.
/// RegisterHotKey delivers WM_HOTKEY to the registering thread, so Bloom
/// still doesn't see any other key. The setting is re-checked every second.
pub fn setup_launcher_hotkey(app: AppHandle) {
    std::thread::spawn(move || unsafe {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            RegisterHotKey, UnregisterHotKey, MOD_ALT, MOD_NOREPEAT, VK_SPACE,
        };
        use windows::Win32::UI::WindowsAndMessaging::{
            MsgWaitForMultipleObjects, PeekMessageW, MSG, PM_REMOVE, QS_ALLINPUT, WM_HOTKEY,
        };
        let mut registered = false;
        while !crate::state::SHUTTING_DOWN.load(Ordering::Relaxed) {
            let wanted = launcher_enabled();
            if wanted && !registered {
                registered =
                    RegisterHotKey(None, HOTKEY_ID, MOD_ALT | MOD_NOREPEAT, VK_SPACE.0 as u32)
                        .is_ok();
                if !registered {
                    crate::diagnostics::record("launcher", "Alt+Space is taken by another app");
                }
            } else if !wanted && registered {
                let _ = UnregisterHotKey(None, HOTKEY_ID);
                registered = false;
            }
            let _ = MsgWaitForMultipleObjects(None, false, 1000, QS_ALLINPUT);
            let mut msg = MSG::default();
            while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                if msg.message == WM_HOTKEY && msg.wParam.0 as i32 == HOTKEY_ID {
                    let app = app.clone();
                    let _ = app
                        .clone()
                        .run_on_main_thread(move || toggle_launcher(&app, LauncherMode::Search));
                }
            }
            // A taken hotkey is retried on the next pass, in case it frees up.
            if wanted && !registered {
                std::thread::sleep(std::time::Duration::from_secs(4));
            }
        }
        if registered {
            let _ = UnregisterHotKey(None, HOTKEY_ID);
        }
    });
}

/// The same window serves as the Alt+Space search and as Bloom's Start menu.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum LauncherMode {
    Search = 1,
    Start = 2,
}

impl LauncherMode {
    fn name(self) -> &'static str {
        match self {
            LauncherMode::Search => "search",
            LauncherMode::Start => "start",
        }
    }
}

const LAUNCHER_WIDTH: f64 = 680.0;
/// Start mode has a fixed height (pinned apps, all apps, power row).
const START_HEIGHT: f64 = 640.0;
/// Space kept free below the Start menu for the dock.
const START_DOCK_GAP: f64 = 96.0;

static CURRENT_MODE: AtomicU8 = AtomicU8::new(0);
/// When the launcher last closed because it lost focus.
static LAST_BLUR_HIDE_MS: AtomicI64 = AtomicI64::new(0);

/// `bloom-start-menu`: "bloom" opens Bloom's Start menu from the dock's Start
/// button and the Win key; anything else (default "windows") keeps Windows'.
pub fn bloom_start_menu_enabled() -> bool {
    crate::state::SETTINGS_CACHE.get().is_some_and(|cache| {
        cache.lock().is_ok_and(|settings| {
            settings.get("bloom-start-menu").and_then(|v| v.as_str()) == Some("bloom")
        })
    })
}

/// Clicking outside closes the launcher. A click on whatever opened it would
/// otherwise reopen it straight away: that press is what took the focus.
pub fn hide_on_blur(win: &tauri::WebviewWindow) {
    if win.is_visible().unwrap_or(false) {
        LAST_BLUR_HIDE_MS.store(crate::utils::get_now_ms(), Ordering::Relaxed);
        let _ = win.hide();
    }
}

/// Shows the launcher in `mode`, or hides it when it is already open in that
/// mode (the hotkey, the Start button and the Win key all toggle). Search
/// opens near the top of the primary monitor; Start sits above the dock.
pub fn toggle_launcher(app: &AppHandle, mode: LauncherMode) {
    let Some(win) = app.get_webview_window("launcher") else {
        return;
    };
    let visible = win.is_visible().unwrap_or(false);
    let same_mode = CURRENT_MODE.load(Ordering::Relaxed) == mode as u8;
    if visible && same_mode {
        let _ = win.hide();
        return;
    }
    if !visible
        && same_mode
        && crate::utils::get_now_ms() - LAST_BLUR_HIDE_MS.load(Ordering::Relaxed) < 300
    {
        return;
    }
    CURRENT_MODE.store(mode as u8, Ordering::Relaxed);
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let m_pos = monitor.position();
        let m_size = monitor.size();
        let width = (LAUNCHER_WIDTH * scale) as i32;
        let x = m_pos.x + (m_size.width as i32 - width) / 2;
        let y = match mode {
            LauncherMode::Search => m_pos.y + (m_size.height as f64 * 0.22) as i32,
            LauncherMode::Start => {
                // The frontend sizes the window to its card; Start's card has
                // a fixed height, so place it for that height now.
                let _ = win.set_size(tauri::LogicalSize::new(LAUNCHER_WIDTH, START_HEIGHT));
                m_pos.y + m_size.height as i32 - ((START_HEIGHT + START_DOCK_GAP) * scale) as i32
            }
        };
        let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
    }
    let _ = win.show();
    let _ = win.set_focus();
    if let Ok(hwnd) = win.hwnd() {
        unsafe { take_foreground(hwnd) };
    }
    let _ = app.emit_to("launcher", "launcher-opened", mode.name());
}

/// Windows refuses SetForegroundWindow from a background process, and typing
/// would then go to the app that was in front. Attaching to the foreground
/// window's input thread for the call lets the launcher take the keyboard.
unsafe fn take_foreground(hwnd: windows::Win32::Foundation::HWND) {
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow,
    };
    let foreground_thread = GetWindowThreadProcessId(GetForegroundWindow(), None);
    let own_thread = GetCurrentThreadId();
    let attached = foreground_thread != 0
        && foreground_thread != own_thread
        && AttachThreadInput(own_thread, foreground_thread, true).as_bool();
    let _ = BringWindowToTop(hwnd);
    let _ = SetForegroundWindow(hwnd);
    if attached {
        let _ = AttachThreadInput(own_thread, foreground_thread, false);
    }
}

/// The card grows with its results; the window follows so nothing around it
/// stays covered (a click outside must reach the desktop and close it).
#[tauri::command]
pub fn resize_launcher(app: AppHandle, height: f64) {
    if let Some(win) = app.get_webview_window("launcher") {
        let _ = win.set_size(tauri::LogicalSize::new(
            LAUNCHER_WIDTH,
            height.clamp(56.0, START_HEIGHT + 40.0),
        ));
    }
}

/// The signed-in user's display name ("Alejandro Font"), for the Start menu's
/// footer; the account name when Windows has no display name for it.
#[tauri::command]
pub fn launcher_user_name() -> String {
    use windows::Win32::Security::Authentication::Identity::{GetUserNameExW, NameDisplay};
    let mut buffer = [0u16; 256];
    let mut size = buffer.len() as u32;
    let ok = unsafe {
        GetUserNameExW(
            NameDisplay,
            Some(windows::core::PWSTR(buffer.as_mut_ptr())),
            &mut size,
        )
    };
    if ok && size > 0 {
        return String::from_utf16_lossy(&buffer[..size as usize]);
    }
    std::env::var("USERNAME").unwrap_or_default()
}

#[tauri::command]
pub fn hide_launcher(app: AppHandle) {
    if let Some(win) = app.get_webview_window("launcher") {
        let _ = win.hide();
    }
}

/// AQS for a filename search: each word must match the start of a word in
/// the name. Quotes and AQS syntax characters are dropped so the query can't
/// change the search's meaning.
pub(crate) fn file_query_filter(query: &str) -> Option<String> {
    let words: Vec<String> = query
        .split_whitespace()
        .map(|word| {
            word.chars()
                .filter(|c| !matches!(c, '"' | '(' | ')' | ':' | '*' | '<' | '>' | '=' | '~'))
                .collect::<String>()
        })
        .filter(|word| !word.is_empty())
        .map(|word| format!("System.FileName:~<\"{word}\" OR System.FileName:\"{word}\""))
        .collect();
    if words.is_empty() {
        return None;
    }
    Some(
        words
            .iter()
            .map(|w| format!("({w})"))
            .collect::<Vec<_>>()
            .join(" AND "),
    )
}

/// Files and folders under the user profile whose names match, from the
/// Windows Search index only (no slow crawl when indexing is off).
#[tauri::command]
pub async fn launcher_search_files(query: String) -> Vec<FileHit> {
    let Some(filter) = file_query_filter(&query) else {
        return Vec::new();
    };
    let hits = tauri::async_runtime::spawn_blocking(move || search_index(&filter))
        .await
        .unwrap_or_default();
    if let Ok(mut last) = LAST_FILE_RESULTS.lock() {
        *last = hits.iter().map(|hit| hit.path.clone()).collect();
    }
    hits
}

fn search_index(filter: &str) -> Vec<FileHit> {
    use windows::core::HSTRING;
    use windows::Storage::Search::{FolderDepth, IndexerOption, QueryOptions};
    use windows::Storage::{StorageFolder, StorageItemTypes};
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

    let Ok(profile) = std::env::var("USERPROFILE") else {
        return Vec::new();
    };
    let com_initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).is_ok() };
    let result = (|| -> windows::core::Result<Vec<FileHit>> {
        let folder = StorageFolder::GetFolderFromPathAsync(&HSTRING::from(profile))?.get()?;
        let options = QueryOptions::new()?;
        options.SetFolderDepth(FolderDepth::Deep)?;
        options.SetIndexerOption(IndexerOption::OnlyUseIndexer)?;
        options.SetUserSearchFilter(&HSTRING::from(filter))?;
        let items = folder
            .CreateItemQueryWithOptions(&options)?
            // Ask for more than are shown, since noise folders get dropped.
            .GetItemsAsync(0, MAX_FILE_RESULTS * 4)?
            .get()?;
        let mut hits = Vec::new();
        for i in 0..items.Size()? {
            let item = items.GetAt(i)?;
            let path = item.Path()?.to_string();
            if is_noise_path(&path) {
                continue;
            }
            hits.push(FileHit {
                name: item.Name()?.to_string(),
                path,
                folder: item.IsOfType(StorageItemTypes::Folder)?,
            });
        }
        // Shallower paths first: a file on the Desktop beats a copy buried in
        // a project. Stable, so the index's order breaks ties.
        hits.sort_by_key(|hit| hit.path.matches('\\').count());
        // Backups and projects hold many copies of one file; two of a name
        // are enough to tell them apart.
        let mut per_name: std::collections::HashMap<String, u8> = std::collections::HashMap::new();
        hits.retain(|hit| {
            let seen = per_name.entry(hit.name.to_lowercase()).or_insert(0);
            *seen += 1;
            *seen <= 2
        });
        hits.truncate(MAX_FILE_RESULTS as usize);
        Ok(hits)
    })();
    if com_initialized {
        unsafe { CoUninitialize() };
    }
    result.unwrap_or_default()
}

/// Folders whose contents nobody means to open from a search: app caches and
/// the dependencies and history of code projects.
pub(crate) fn is_noise_path(path: &str) -> bool {
    const NOISE: [&str; 8] = [
        "\\appdata\\",
        "\\node_modules\\",
        "\\.git\\",
        "\\vendor\\",
        "\\site-packages\\",
        "\\__pycache__\\",
        "\\bower_components\\",
        "\\.cache\\",
    ];
    let lower = path.to_ascii_lowercase();
    NOISE.iter().any(|folder| lower.contains(folder))
}

fn was_found(path: &str) -> bool {
    LAST_FILE_RESULTS
        .lock()
        .is_ok_and(|last| last.iter().any(|p| p == path))
}

#[tauri::command]
pub async fn launcher_open_file(path: String) -> Result<(), String> {
    if !was_found(&path) {
        return Err("Not a search result".into());
    }
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| e.to_string())
}

/// Opens Explorer with the file selected.
#[tauri::command]
pub async fn launcher_reveal_file(path: String) -> Result<(), String> {
    if !was_found(&path) {
        return Err("Not a search result".into());
    }
    tauri_plugin_opener::reveal_item_in_dir(&path).map_err(|e| e.to_string())
}

/// Whether a Settings page URI is one the launcher may open.
pub(crate) fn is_settings_uri(uri: &str) -> bool {
    uri.strip_prefix("ms-settings:").is_some_and(|page| {
        page.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    })
}

#[tauri::command]
pub fn launcher_open_settings_page(uri: String) -> Result<(), String> {
    if !is_settings_uri(&uri) {
        return Err("Not a Settings page".into());
    }
    shell_open(&uri);
    Ok(())
}

fn shell_open(target: &str) {
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let wide: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        let _ = ShellExecuteW(
            None,
            windows::core::w!("open"),
            windows::core::PCWSTR(wide.as_ptr()),
            None,
            None,
            SW_SHOWNORMAL,
        );
    }
}

/// Runs `shutdown.exe`, which takes care of the shutdown privilege itself.
fn run_shutdown(args: &[&str]) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    std::process::Command::new("shutdown.exe")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// System actions offered by the launcher. Restart, shut down and sign out
/// end the session, so Bloom first gives the taskbar back and exits the way
/// the tray's Quit does; otherwise the auto-hide state it set would outlive it.
#[tauri::command]
pub async fn launcher_run_action(app: AppHandle, action: String) -> Result<(), String> {
    hide_launcher(app.clone());
    match action.as_str() {
        "lock" => unsafe {
            windows::Win32::System::Shutdown::LockWorkStation().map_err(|e| e.to_string())
        },
        "sleep" => {
            // Let the launcher hide before the session suspends.
            std::thread::sleep(std::time::Duration::from_millis(300));
            let ok = unsafe { windows::Win32::System::Power::SetSuspendState(false, false, false) };
            if ok {
                Ok(())
            } else {
                Err("Sleep is not available".into())
            }
        }
        "restart" | "shutdown" | "sign_out" => {
            let args: &[&str] = match action.as_str() {
                "restart" => &["/r", "/t", "0"],
                "shutdown" => &["/s", "/t", "0"],
                _ => &["/l"],
            };
            run_shutdown(args)?;
            crate::commands::restore_taskbar_and_exit(&app);
            Ok(())
        }
        "task_manager" => {
            shell_open("taskmgr.exe");
            Ok(())
        }
        "file_explorer" => {
            shell_open("explorer.exe");
            Ok(())
        }
        "recycle_bin" => {
            shell_open("shell:RecycleBinFolder");
            Ok(())
        }
        "empty_recycle_bin" => unsafe {
            // Windows asks for confirmation itself.
            windows::Win32::UI::Shell::SHEmptyRecycleBinW(None, None, 0).map_err(|e| e.to_string())
        },
        "bloom_settings" => {
            crate::commands::open_settings_window(app);
            Ok(())
        }
        "quit_bloom" => {
            crate::commands::restore_taskbar_and_exit(&app);
            Ok(())
        }
        _ => Err(format!("Unknown action {action}")),
    }
}

#[cfg(test)]
mod tests {
    use super::{file_query_filter, is_noise_path, is_settings_uri};

    #[test]
    fn skips_dependency_and_cache_folders() {
        assert!(is_noise_path(
            r"C:\Users\me\code\app\node_modules\x\bluetooth.svg"
        ));
        assert!(is_noise_path(r"C:\Users\me\AppData\Local\Temp\a.txt"));
        assert!(is_noise_path(r"C:\Users\me\repo\.git\HEAD"));
        assert!(!is_noise_path(r"C:\Users\me\Desktop\informe.docx"));
        assert!(!is_noise_path(r"C:\Users\me\Documents\vendors.xlsx"));
    }

    #[test]
    fn builds_a_filename_filter_per_word() {
        assert_eq!(
            file_query_filter("  informe  2026 ").as_deref(),
            Some(
                "(System.FileName:~<\"informe\" OR System.FileName:\"informe\") AND \
                 (System.FileName:~<\"2026\" OR System.FileName:\"2026\")"
            )
        );
        assert_eq!(file_query_filter("   "), None);
    }

    #[test]
    fn strips_query_syntax_from_file_searches() {
        assert_eq!(
            file_query_filter("a\" OR kind:folder").as_deref(),
            Some(
                "(System.FileName:~<\"a\" OR System.FileName:\"a\") AND \
                 (System.FileName:~<\"OR\" OR System.FileName:\"OR\") AND \
                 (System.FileName:~<\"kindfolder\" OR System.FileName:\"kindfolder\")"
            )
        );
        assert_eq!(file_query_filter("\"\" ::"), None);
    }

    #[test]
    fn accepts_only_settings_pages() {
        assert!(is_settings_uri("ms-settings:bluetooth"));
        assert!(is_settings_uri("ms-settings:network-wifi"));
        assert!(!is_settings_uri("ms-settings:../../x"));
        assert!(!is_settings_uri("https://example.com"));
        assert!(!is_settings_uri("ms-settings:bluetooth & calc"));
    }
}
