//! Filee (github.com/KnifeLemon/Filee, MIT) is an offline converter for
//! hundreds of file formats. Bloom ships it: scripts/build-filee.mjs builds the
//! vendor/filee submodule into the bundle's `filee` resource folder.
//!
//! - The shelf and the launcher drive its command line (`filee-cli.exe`):
//!   `formats <ext>` says what a file converts to and
//!   `convert <file> --to <format> --json` does it.
//! - Its app (`Filee.exe`) runs in the tray while `bloom-filee-radial` is on,
//!   for its radial menu: hold Ctrl while dragging files anywhere.
//!
//! A build without the bundled copy (Filee not built) falls back to a Filee
//! installed by its own setup, for conversions only.

use serde::Serialize;
use std::collections::HashMap;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

const CLI_EXE: &str = "filee-cli.exe";
const APP_EXE: &str = "Filee.exe";
/// Filee setup's uninstall key, which holds its install folder ("InstallLocation").
const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{C8686E06-8327-40A2-B0F7-3DEDD61D9248}_is1";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// What `filee formats <ext>` answered, per lowercase extension.
static TARGETS_CACHE: Mutex<Option<HashMap<String, Vec<String>>>> = Mutex::new(None);
/// Whether Bloom started the bundled Filee app, so it closes it again.
static RADIAL_STARTED: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Serialize)]
pub struct FileeStatus {
    pub installed: bool,
    pub path: Option<String>,
    /// Shipped with Bloom (rather than installed by Filee's own setup).
    pub bundled: bool,
    pub version: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct ConvertResult {
    pub ok: bool,
    pub outputs: Vec<String>,
    pub error: Option<String>,
}

/// The `filee` folder of the bundle's resources.
fn bundled_dir(app: &AppHandle) -> Option<PathBuf> {
    // Dev builds run Filee where build-filee.mjs puts it. tauri-build copies
    // resources into target/ whenever its build script runs, and that copy
    // fails while a Filee.exe started from target/ is running.
    #[cfg(debug_assertions)]
    {
        let dev = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("filee");
        if dev.join(CLI_EXE).is_file() {
            return Some(dev);
        }
    }
    let dir = app.path().resource_dir().ok()?.join("filee");
    dir.join(CLI_EXE).is_file().then_some(dir)
}

fn registry_install_location() -> Option<PathBuf> {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::{
        RegGetValueW, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ,
    };
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let mut buffer = [0u16; 520];
        let mut size = std::mem::size_of_val(&buffer) as u32;
        let status = unsafe {
            RegGetValueW(
                root,
                &HSTRING::from(UNINSTALL_KEY),
                windows::core::w!("InstallLocation"),
                RRF_RT_REG_SZ,
                None,
                Some(buffer.as_mut_ptr().cast()),
                Some(&mut size),
            )
        };
        if status.is_ok() {
            let len = buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len());
            let path = PathBuf::from(String::from_utf16_lossy(&buffer[..len]));
            if !path.as_os_str().is_empty() {
                return Some(path);
            }
        }
    }
    None
}

/// Where `filee-cli.exe` is: the copy Bloom ships first, then a Filee setup
/// install (registry, then its default folders).
fn find_cli(app: &AppHandle) -> Option<(PathBuf, bool)> {
    if let Some(dir) = bundled_dir(app) {
        return Some((dir.join(CLI_EXE), true));
    }
    let mut folders: Vec<PathBuf> = registry_install_location().into_iter().collect();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        folders.push(Path::new(&local).join("Programs").join("Filee"));
    }
    if let Ok(program_files) = std::env::var("ProgramFiles") {
        folders.push(Path::new(&program_files).join("Filee"));
    }
    folders
        .into_iter()
        .map(|dir| dir.join(CLI_EXE))
        .find(|cli| cli.is_file())
        .map(|cli| (cli, false))
}

fn run_cli(cli: &Path, args: &[&str]) -> Result<std::process::Output, String> {
    std::process::Command::new(cli)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn filee_status(app: AppHandle) -> FileeStatus {
    let missing = FileeStatus {
        installed: false,
        path: None,
        bundled: false,
        version: None,
    };
    tauri::async_runtime::spawn_blocking(move || match find_cli(&app) {
        Some((cli, bundled)) => {
            // "filee 2.1.0"
            let version = run_cli(&cli, &["version"]).ok().and_then(|out| {
                String::from_utf8_lossy(&out.stdout)
                    .split_whitespace()
                    .nth(1)
                    .map(str::to_string)
            });
            FileeStatus {
                installed: true,
                path: Some(cli.to_string_lossy().into_owned()),
                bundled,
                version,
            }
        }
        None => FileeStatus {
            installed: false,
            path: None,
            bundled: false,
            version: None,
        },
    })
    .await
    .unwrap_or(missing)
}

/// Target formats from `filee formats <ext>`, whose second line lists what
/// that format converts to with the engines installed ("  png, webp, pdf").
pub(crate) fn parse_targets(stdout: &str) -> Vec<String> {
    let Some(line) = stdout.lines().nth(1) else {
        return Vec::new();
    };
    let line = line.trim();
    if line.is_empty() || line.starts_with('(') {
        return Vec::new();
    }
    line.split(',')
        .map(|format| format.trim().to_string())
        .filter(|format| is_format_id(format))
        .collect()
}

fn is_format_id(format: &str) -> bool {
    !format.is_empty()
        && format.len() <= 16
        && format
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn extension_of(path: &str) -> Option<String> {
    Path::new(path)
        .extension()
        .map(|ext| ext.to_string_lossy().to_lowercase())
        .filter(|ext| is_format_id(ext))
}

/// What a file can be converted to, empty when Filee isn't there or doesn't
/// read that format.
#[tauri::command]
pub async fn filee_targets(app: AppHandle, path: String) -> Vec<String> {
    let Some(ext) = extension_of(&path) else {
        return Vec::new();
    };
    if let Some(cached) = TARGETS_CACHE
        .lock()
        .ok()
        .and_then(|cache| cache.as_ref().and_then(|c| c.get(&ext).cloned()))
    {
        return cached;
    }
    let targets = tauri::async_runtime::spawn_blocking(move || {
        let (cli, _) = find_cli(&app)?;
        let out = run_cli(&cli, &["formats", &ext]).ok()?;
        // Exit code 2: a format Filee doesn't know.
        let targets = if out.status.success() {
            parse_targets(&String::from_utf8_lossy(&out.stdout))
        } else {
            Vec::new()
        };
        Some((ext, targets))
    })
    .await
    .ok()
    .flatten();
    let Some((ext, targets)) = targets else {
        return Vec::new();
    };
    if let Ok(mut cache) = TARGETS_CACHE.lock() {
        cache
            .get_or_insert_with(HashMap::new)
            .insert(ext, targets.clone());
    }
    targets
}

/// The one file's result in `filee convert --json`'s document.
pub(crate) fn parse_convert_json(stdout: &str) -> ConvertResult {
    let failed = |error: &str| ConvertResult {
        ok: false,
        outputs: Vec::new(),
        error: Some(error.to_string()),
    };
    let Ok(doc) = serde_json::from_str::<serde_json::Value>(stdout.trim()) else {
        return failed("Filee gave no result");
    };
    let Some(file) = doc["files"].as_array().and_then(|files| files.first()) else {
        return failed("Filee found nothing to convert");
    };
    let outputs: Vec<String> = file["outputs"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|o| o.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    match file["state"].as_str() {
        Some("done") => ConvertResult {
            ok: true,
            outputs,
            error: None,
        },
        Some("skipped") => failed("The converted file already exists"),
        _ => failed(file["error"].as_str().unwrap_or("Conversion failed")),
    }
}

/// Converts one file next to itself. The shelf and the launcher convert
/// several by calling this once per file, so they can show progress.
#[tauri::command]
pub async fn filee_convert(app: AppHandle, path: String, to: String) -> ConvertResult {
    let failed = |error: &str| ConvertResult {
        ok: false,
        outputs: Vec::new(),
        error: Some(error.to_string()),
    };
    if !is_format_id(&to) {
        return failed("Unknown format");
    }
    if !Path::new(&path).is_file() {
        return failed("The file no longer exists");
    }
    tauri::async_runtime::spawn_blocking(move || {
        let Some((cli, _)) = find_cli(&app) else {
            return failed("Filee is not installed");
        };
        match run_cli(&cli, &["convert", &path, "--to", &to, "--json"]) {
            Ok(out) => {
                let result = parse_convert_json(&String::from_utf8_lossy(&out.stdout));
                if result.ok {
                    // The launcher may open what it just converted.
                    crate::launcher::allow_results(&result.outputs);
                    result
                } else if out.stderr.is_empty() {
                    result
                } else {
                    // Argument errors go to stderr ("filee: …"), not to the JSON.
                    failed(
                        String::from_utf8_lossy(&out.stderr)
                            .lines()
                            .next()
                            .unwrap_or("Conversion failed")
                            .trim_start_matches("filee: "),
                    )
                }
            }
            Err(e) => failed(&e),
        }
    })
    .await
    .unwrap_or_else(|_| failed("Conversion failed"))
}

/// The bundled `Filee.exe`; an installed Filee runs on its own terms.
fn bundled_app(app: &AppHandle) -> Option<PathBuf> {
    bundled_dir(app)
        .map(|dir| dir.join(APP_EXE))
        .filter(|exe| exe.is_file())
}

fn spawn_app(exe: &Path, args: &[&str]) -> bool {
    std::process::Command::new(exe).args(args).spawn().is_ok()
}

/// `bloom-filee-radial`, on unless set to "false".
fn radial_enabled() -> bool {
    crate::state::SETTINGS_CACHE.get().is_none_or(|cache| {
        cache.lock().is_ok_and(|settings| {
            settings.get("bloom-filee-radial").and_then(|v| v.as_str()) != Some("false")
        })
    })
}

/// Starts or quits the bundled Filee app to match `bloom-filee-radial`.
/// `--background` starts it in the tray only; Filee is single-instance, so
/// starting it while it already runs does nothing. `--quit` asks a running
/// Filee to exit.
pub fn apply_radial(app: &AppHandle, enabled: bool) {
    let Some(exe) = bundled_app(app) else {
        return;
    };
    if enabled {
        if spawn_app(&exe, &["--background"]) {
            RADIAL_STARTED.store(true, Ordering::Relaxed);
        }
    } else if RADIAL_STARTED.swap(false, Ordering::Relaxed) {
        spawn_app(&exe, &["--quit"]);
    }
}

/// At startup: the radial is on by default.
pub fn start_radial(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || apply_radial(&app, radial_enabled()));
}

/// When Bloom exits, the Filee it started goes with it.
pub fn stop_radial(app: &AppHandle) {
    if RADIAL_STARTED.load(Ordering::Relaxed) {
        apply_radial(app, false);
    }
}

/// Opens Filee's own window (its settings, presets and optional engines).
#[tauri::command]
pub fn filee_open_app(app: AppHandle) -> Result<(), String> {
    let exe = bundled_app(&app).ok_or("Filee is not installed")?;
    if spawn_app(&exe, &["--settings"]) {
        RADIAL_STARTED.store(true, Ordering::Relaxed);
        Ok(())
    } else {
        Err("Filee didn't start".into())
    }
}

/// Opens Filee's radial menu for a file (`Filee.exe --convert <file>`), with
/// every format and preset the shelf's chips don't show.
#[tauri::command]
pub fn filee_open_radial(app: AppHandle, path: String) -> Result<(), String> {
    if !Path::new(&path).is_file() {
        return Err("The file no longer exists".into());
    }
    let exe = bundled_app(&app).ok_or("Filee is not installed")?;
    if spawn_app(&exe, &["--convert", &path]) {
        RADIAL_STARTED.store(true, Ordering::Relaxed);
        Ok(())
    } else {
        Err("Filee didn't start".into())
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_convert_json, parse_targets};

    #[test]
    fn reads_target_formats() {
        let out = "JPEG (.jpg, .jpeg) converts to:\n  png, webp, avif, pdf\nWith optional engines (install them in Filee, Settings → Engines):\n  jxl\n";
        assert_eq!(parse_targets(out), ["png", "webp", "avif", "pdf"]);
        let none = "HEIC (.heic) converts to:\n  (nothing with the engines installed now)\n";
        assert!(parse_targets(none).is_empty());
        assert!(parse_targets("").is_empty());
    }

    #[test]
    fn reads_a_conversion_result() {
        let done = r#"{"preset":"PNG","target":"png","converted":1,"skipped":0,"failed":0,
            "files":[{"source":"C:\\a.jpg","state":"done","outputs":["C:\\a.png"]}]}"#;
        let result = parse_convert_json(done);
        assert!(result.ok);
        assert_eq!(result.outputs, [r"C:\a.png"]);

        let failed = r#"{"files":[{"source":"C:\\a.jpg","state":"failed","outputs":[],"error":"engine missing"}]}"#;
        let result = parse_convert_json(failed);
        assert!(!result.ok);
        assert_eq!(result.error.as_deref(), Some("engine missing"));

        assert!(!parse_convert_json("not json").ok);
    }
}
