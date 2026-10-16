//! Real frosted glass behind Bloom's surfaces.
//!
//! A transparent WebView2 window cannot blur what is behind it: CSS
//! `backdrop-filter` only sees the page, and DWM's blur-behind
//! (`SetWindowCompositionAttribute`) blurs the whole window rectangle and
//! ignores window regions, so it cannot follow a shape with concave corners.
//! The composition visual layer can: each Bloom window gets a native
//! "backdrop" window of its own, laid directly beneath it in z-order and
//! click-through, whose visual tree samples `HostBackdropBrush` (the desktop
//! behind the window, blurred by the compositor) through the surface's exact
//! outline. The page above is untouched, so tooltips and menus stay as they
//! are; the CSS adds the tint and the rim on top.
//!
//! Shaping: the outline is a Direct2D path — a rectangle with per-corner
//! arcs for a pill, or a rect minus one fillet disc for a concave flare —
//! used as the visual's `CompositionGeometricClip`. Brushes cannot do this
//! (a mask brush's source cannot be a backdrop brush, and masks do not
//! nest), but a clip carries any antialiased geometry, so the glass hugs the
//! same curves the page draws, concave corners included. The path is rebuilt
//! whenever the page reports a new shape, so the glass tracks every spring
//! animation.
//!
//! The composition APIs take geometry through `CompositionPath`, which is
//! constructed from a `Windows.Graphics.IGeometrySource2D` — a marker whose
//! D2D geometry is read back through the private but SDK-published
//! `IGeometrySource2DInterop` (windows.graphics.interop.h; Win2D's
//! CanvasGeometry implements the same pair). `GeometrySource` below is that
//! object for a plain `ID2D1PathGeometry`.
//!
//! What the compositor allows, found by testing on Windows 11:
//! - `HostBackdropBrush` must be opted in per window:
//!   `DWMWA_USE_HOSTBACKDROPBRUSH` on Windows 11, `ACCENT_ENABLE_HOSTBACKDROP`
//!   on Windows 10 1809+;
//! - the backdrop window must have no redirection surface
//!   (`WS_EX_NOREDIRECTIONBITMAP`), or DWM composites the blur as black;
//! - with "Transparency effects" off — and energy saver on, which switches
//!   them off below 20% battery — Windows draws host backdrop black, so no
//!   glass is put down then and the page keeps its plain look;
//! - the window has no per-pixel hit testing, so it is made click-through
//!   (`WS_EX_TRANSPARENT`) and never takes activation (`WS_EX_NOACTIVATE`).

use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use serde::Deserialize;
use tauri::WebviewWindow;
use windows::core::{
    w, IInspectable, IInspectable_Vtbl, IUnknown, IUnknown_Vtbl, Interface, BOOL, GUID, HRESULT,
    HSTRING,
};
use windows::Graphics::{IGeometrySource2D, IGeometrySource2D_Vtbl};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Direct2D::Common::{
    ID2D1SimplifiedGeometrySink, D2D1_FIGURE_BEGIN_FILLED, D2D1_FIGURE_END_CLOSED, D2D_SIZE_F,
};
use windows::Win32::Graphics::Direct2D::{
    D2D1CreateFactory, ID2D1Factory, ID2D1Geometry, ID2D1GeometrySink, ID2D1PathGeometry,
    D2D1_ARC_SEGMENT, D2D1_ARC_SIZE_SMALL, D2D1_FACTORY_TYPE_MULTI_THREADED,
    D2D1_SWEEP_DIRECTION_CLOCKWISE, D2D1_SWEEP_DIRECTION_COUNTER_CLOCKWISE,
};
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_USE_HOSTBACKDROPBRUSH,
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND,
};
use windows::Win32::Graphics::Gdi::ClientToScreen;
use windows::Win32::System::Com::CoTaskMemAlloc;
use windows::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress, LoadLibraryW};
use windows::Win32::System::WinRT::Composition::ICompositorDesktopInterop;
use windows::Win32::System::WinRT::{
    CreateDispatcherQueueController, DispatcherQueueOptions, DQTAT_COM_NONE, DQTYPE_THREAD_CURRENT,
};
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, GetClientRect, IsWindow, RegisterClassW, SetWindowPos,
    SWP_HIDEWINDOW, SWP_NOACTIVATE, SWP_NOZORDER, SWP_SHOWWINDOW, WNDCLASSW, WS_EX_NOACTIVATE,
    WS_EX_NOREDIRECTIONBITMAP, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
};
use windows::UI::Composition::{
    CompositionBrush, CompositionPath, CompositionPathGeometry, Compositor, ContainerVisual,
    SpriteVisual,
};
use windows_numerics::{Vector2, Vector3};

/// The fillet of a concave flare: the material is its rectangle minus the
/// quarter-disc centered at one corner of that rectangle. In CSS pixels.
#[derive(Deserialize, Clone)]
pub struct GlassFillet {
    cx: f64,
    cy: f64,
    r: f64,
}

/// One piece of glass, in the page's CSS pixels: a rectangle with four corner
/// radii (a pill), or a rectangle minus a fillet disc (a flare). `None` in
/// the command's list parks that slot (it keeps its index, so live pieces
/// never shift when a neighbour hides).
#[derive(Deserialize, Clone)]
pub struct GlassPiece {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    #[serde(default)]
    radii: [f64; 4],
    #[serde(default)]
    fillet: Option<GlassFillet>,
}

struct PieceVisual {
    visual: SpriteVisual,
    path_geometry: CompositionPathGeometry,
}

struct Backdrop {
    hwnd: isize,
    /// The target owns the window's visual tree: dropping it closes the
    /// root, so it must live as long as the compositor does.
    _target: windows::UI::Composition::Desktop::DesktopWindowTarget,
    root: ContainerVisual,
    pieces: Vec<PieceVisual>,
    backdrop_brush: CompositionBrush,
    compositor: Compositor,
    factory: ID2D1Factory,
    /// Keeps the thread's DispatcherQueue alive for as long as the
    /// compositor is in use.
    _dispatcher: Option<windows::System::DispatcherQueueController>,
}

// The compositor's objects are agile; the HWND is kept as isize (`HWND` is
// not `Send`).
static BACKDROPS: Mutex<Option<HashMap<String, Backdrop>>> = Mutex::new(None);

/// One line per unique message, so a 60fps shape stream does not flood the
/// terminal while the interesting states still show up once each.
fn diag(message: String) {
    use std::collections::HashSet;
    use std::sync::OnceLock;
    static SEEN: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    if SEEN
        .get_or_init(Default::default)
        .lock()
        .unwrap()
        .insert(message.clone())
    {
        eprintln!("[glass] {message}");
    }
}

unsafe extern "system" fn backdrop_proc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    unsafe { DefWindowProcW(hwnd, msg, wp, lp) }
}

#[repr(C)]
struct AccentPolicy {
    state: u32,
    flags: u32,
    gradient: u32,
    animation: u32,
}

#[repr(C)]
struct CompositionData {
    attrib: u32,
    data: *mut c_void,
    size: usize,
}

/// Windows 10's host-backdrop opt-in, through the undocumented but long-stable
/// `SetWindowCompositionAttribute`. Windows 11 uses
/// `DWMWA_USE_HOSTBACKDROPBRUSH` instead; calling both is harmless.
fn enable_host_backdrop(hwnd: HWND) {
    unsafe {
        let attr = BOOL(1);
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_HOSTBACKDROPBRUSH,
            &attr as *const _ as *const _,
            std::mem::size_of_val(&attr) as u32,
        );
        let Ok(user32) = LoadLibraryW(w!("user32.dll")) else {
            return;
        };
        let Some(f) = GetProcAddress(user32, windows::core::s!("SetWindowCompositionAttribute"))
        else {
            return;
        };
        type Swca = unsafe extern "system" fn(HWND, *mut CompositionData) -> i32;
        let f: Swca = std::mem::transmute(f);
        let mut policy = AccentPolicy {
            state: 5,
            flags: 0,
            gradient: 0,
            animation: 0,
        };
        let mut data = CompositionData {
            attrib: 19, // WCA_ACCENT_POLICY
            data: &mut policy as *mut _ as *mut _,
            size: std::mem::size_of::<AccentPolicy>(),
        };
        f(hwnd, &mut data);
    }
}

fn create_backdrop() -> Option<Backdrop> {
    unsafe {
        let instance = GetModuleHandleW(None).ok()?;
        let class = w!("BloomGlassBackdrop");
        let wc = WNDCLASSW {
            lpfnWndProc: Some(backdrop_proc),
            hInstance: instance.into(),
            lpszClassName: class,
            ..Default::default()
        };
        RegisterClassW(&wc); // fails harmlessly once registered
        let hwnd = CreateWindowExW(
            WS_EX_NOREDIRECTIONBITMAP
                | WS_EX_TOOLWINDOW
                | WS_EX_NOACTIVATE
                | WS_EX_TRANSPARENT
                | WS_EX_TOPMOST,
            class,
            w!(""),
            WS_POPUP,
            0,
            0,
            0,
            0,
            None,
            None,
            Some(instance.into()),
            None,
        )
        .ok()?;
        diag("backdrop window created".into());

        let no_round = DWMWCP_DONOTROUND; // the shape comes from the visual tree
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &no_round as *const _ as *const _,
            std::mem::size_of_val(&no_round) as u32,
        );
        let no_border: u32 = 0xFFFF_FFFE; // DWMWA_COLOR_NONE
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            &no_border as *const _ as *const _,
            std::mem::size_of_val(&no_border) as u32,
        );
        enable_host_backdrop(hwnd);

        let _ = RoInitialize(RO_INIT_MULTITHREADED);
        // The compositor needs a DispatcherQueue on the thread that creates
        // it (the Win32 requirement for the visual layer). If the thread
        // already has one the call reports that, which is just as good.
        let options = DispatcherQueueOptions {
            dwSize: std::mem::size_of::<DispatcherQueueOptions>() as u32,
            threadType: DQTYPE_THREAD_CURRENT,
            apartmentType: DQTAT_COM_NONE,
        };
        let dispatcher = match CreateDispatcherQueueController(options) {
            Ok(controller) => {
                diag("dispatcher queue created".into());
                Some(controller)
            }
            Err(e) => {
                diag(format!(
                    "CreateDispatcherQueueController: {e:?} (thread may already have one)"
                ));
                None
            }
        };
        let compositor = match Compositor::new() {
            Ok(c) => c,
            Err(e) => {
                diag(format!("Compositor::new failed: {e:?}"));
                return None;
            }
        };
        let interop = match compositor.cast::<ICompositorDesktopInterop>() {
            Ok(i) => i,
            Err(e) => {
                diag(format!("ICompositorDesktopInterop cast failed: {e:?}"));
                return None;
            }
        };
        let target = match interop.CreateDesktopWindowTarget(hwnd, true) {
            Ok(t) => t,
            Err(e) => {
                diag(format!("CreateDesktopWindowTarget failed: {e:?}"));
                return None;
            }
        };
        diag("desktop window target ok".into());
        let root = compositor.CreateContainerVisual().ok()?;
        target.SetRoot(&root).ok()?;
        let backdrop_brush: CompositionBrush =
            match compositor.CreateHostBackdropBrush().and_then(|b| b.cast()) {
                Ok(b) => b,
                Err(e) => {
                    diag(format!("CreateHostBackdropBrush failed: {e:?}"));
                    return None;
                }
            };
        diag("host backdrop brush ok".into());
        let factory: ID2D1Factory =
            D2D1CreateFactory(D2D1_FACTORY_TYPE_MULTI_THREADED, None).ok()?;
        diag("d2d factory ok".into());

        Some(Backdrop {
            hwnd: hwnd.0 as isize,
            _target: target,
            root,
            pieces: Vec::new(),
            backdrop_brush,
            compositor,
            factory,
            _dispatcher: dispatcher,
        })
    }
}

fn create_piece(backdrop: &Backdrop) -> Option<PieceVisual> {
    let sprite = backdrop.compositor.CreateSpriteVisual().ok()?;
    sprite.SetBrush(&backdrop.backdrop_brush).ok()?;
    let path_geometry = backdrop.compositor.CreatePathGeometry().ok()?;
    let clip = backdrop
        .compositor
        .CreateGeometricClipWithGeometry(&path_geometry)
        .ok()?;
    sprite.SetClip(&clip).ok()?;
    sprite.SetIsVisible(false).ok();
    backdrop.root.Children().ok()?.InsertAtTop(&sprite).ok()?;
    Some(PieceVisual {
        visual: sprite,
        path_geometry,
    })
}

/// Builds the piece's outline as a Direct2D path: four corner arcs for a
/// pill, or the flare outline for a fillet.
fn build_path(factory: &ID2D1Factory, piece: &GlassPiece) -> Option<ID2D1Geometry> {
    let geometry: ID2D1PathGeometry = unsafe { factory.CreatePathGeometry() }.ok()?;
    let sink: ID2D1GeometrySink = unsafe { geometry.Open() }.ok()?;
    let simplified: ID2D1SimplifiedGeometrySink = sink.cast().ok()?;
    let l = piece.x as f32;
    let t = piece.y as f32;
    let r = (piece.x + piece.w) as f32;
    let b = (piece.y + piece.h) as f32;

    unsafe {
        match &piece.fillet {
            Some(fillet) => {
                // The flare: rect minus the quarter-disc at (cx, cy). The
                // outline starts above the disc's center, arcs to its right,
                // and closes around the far sides of the box. Mirrored
                // corners reverse the arc's direction.
                let rad = fillet.r as f32;
                let cx = fillet.cx as f32;
                let cy = fillet.cy as f32;
                let near = |x: f32, y: f32| (cx - x).abs() < 0.75 && (cy - y).abs() < 0.75;
                let flip_x = near(r, t) || near(r, b);
                let flip_y = near(l, t) || near(r, t);
                let map = |p: Vector2| -> Vector2 {
                    Vector2 {
                        X: if flip_x { l + r - p.X } else { p.X },
                        Y: if flip_y { t + b - p.Y } else { p.Y },
                    }
                };
                let sweep = if flip_x == flip_y {
                    D2D1_SWEEP_DIRECTION_CLOCKWISE
                } else {
                    D2D1_SWEEP_DIRECTION_COUNTER_CLOCKWISE
                };
                // Canonical outline for a disc centered at the box's
                // bottom-left corner; the mirrors move it to the real one.
                simplified.BeginFigure(map(Vector2 { X: l, Y: b - rad }), D2D1_FIGURE_BEGIN_FILLED);
                sink.AddArc(&D2D1_ARC_SEGMENT {
                    point: map(Vector2 { X: l + rad, Y: b }),
                    size: D2D_SIZE_F {
                        width: rad,
                        height: rad,
                    },
                    rotationAngle: 0.0,
                    sweepDirection: sweep,
                    arcSize: D2D1_ARC_SIZE_SMALL,
                });
                sink.AddLine(map(Vector2 { X: r, Y: b }));
                sink.AddLine(map(Vector2 { X: r, Y: t }));
                sink.AddLine(map(Vector2 { X: l, Y: t }));
                simplified.EndFigure(D2D1_FIGURE_END_CLOSED);
            }
            None => {
                let half = ((r - l) / 2.0).min((b - t) / 2.0);
                let c = |i: usize| (piece.radii[i].max(0.0) as f32).min(half);
                let (tl, tr, br, bl) = (c(0), c(1), c(2), c(3));
                let pt = |x: f32, y: f32| Vector2 { X: x, Y: y };
                let arc = |to: Vector2, radius: f32| D2D1_ARC_SEGMENT {
                    point: to,
                    size: D2D_SIZE_F {
                        width: radius,
                        height: radius,
                    },
                    rotationAngle: 0.0,
                    sweepDirection: D2D1_SWEEP_DIRECTION_CLOCKWISE,
                    arcSize: D2D1_ARC_SIZE_SMALL,
                };
                simplified.BeginFigure(pt(l + tl, t), D2D1_FIGURE_BEGIN_FILLED);
                sink.AddLine(pt(r - tr, t));
                if tr > 0.0 {
                    sink.AddArc(&arc(pt(r, t + tr), tr));
                }
                sink.AddLine(pt(r, b - br));
                if br > 0.0 {
                    sink.AddArc(&arc(pt(r - br, b), br));
                }
                sink.AddLine(pt(l + bl, b));
                if bl > 0.0 {
                    sink.AddArc(&arc(pt(l, b - bl), bl));
                }
                sink.AddLine(pt(l, t + tl));
                if tl > 0.0 {
                    sink.AddArc(&arc(pt(l + tl, t), tl));
                }
                simplified.EndFigure(D2D1_FIGURE_END_CLOSED);
            }
        }
        simplified.Close().ok()?;
    }
    geometry.cast().ok()
}

/// Puts glass under `pieces` for the calling window. Returns whether the
/// glass is real (see `blur_available`); when it isn't, nothing is put down
/// and the page keeps its plain look.
#[tauri::command]
pub fn set_glass(window: WebviewWindow, pieces: Vec<Option<GlassPiece>>) -> bool {
    let live = blur_available();
    diag(format!(
        "set_glass {} live={} shown={}/{}",
        window.label(),
        live,
        pieces.iter().filter(|p| p.is_some()).count(),
        pieces.len()
    ));
    if !live {
        park_all(window.label());
        return false;
    }
    if pieces.iter().all(|p| p.is_none()) {
        park_all(window.label());
        return true;
    }
    let Ok(owner) = window.hwnd() else {
        return false;
    };

    let mut guard = BACKDROPS.lock().unwrap();
    let backdrops = guard.get_or_insert_with(HashMap::new);
    let stale = backdrops
        .get(window.label())
        .is_some_and(|b| !is_window(HWND(b.hwnd as *mut _)));
    if stale {
        backdrops.remove(window.label());
    }
    if !backdrops.contains_key(window.label()) {
        match create_backdrop() {
            Some(backdrop) => {
                backdrops.insert(window.label().to_string(), backdrop);
            }
            None => return false,
        }
    }
    let backdrop = backdrops.get_mut(window.label()).unwrap();

    // The backdrop spans the whole client area; the visuals carry the shapes.
    // Keeping the window still and moving the visuals means resizes never
    // make DWM flash a black frame, so the glass follows every spring exactly.
    let mut origin = POINT::default();
    let mut rect = RECT::default();
    unsafe {
        let _ = ClientToScreen(owner, &mut origin);
        let _ = GetClientRect(owner, &mut rect);
    }
    unsafe {
        let _ = SetWindowPos(
            HWND(backdrop.hwnd as *mut _),
            Some(owner),
            origin.x,
            origin.y,
            (rect.right - rect.left).max(1),
            (rect.bottom - rect.top).max(1),
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );
    }

    while backdrop.pieces.len() < pieces.len() {
        let Some(piece) = create_piece(backdrop) else {
            diag("create_piece failed".into());
            return false;
        };
        backdrop.pieces.push(piece);
    }
    for index in 0..backdrop.pieces.len() {
        let piece_visual = &backdrop.pieces[index];
        let Some(piece) = pieces.get(index).and_then(|p| p.as_ref()) else {
            piece_visual.visual.SetIsVisible(false).ok();
            continue;
        };
        let Some(path_geometry) = build_path(&backdrop.factory, piece) else {
            diag("build_path failed".into());
            piece_visual.visual.SetIsVisible(false).ok();
            continue;
        };
        let source = GeometrySource::create(path_geometry);
        let Ok(path) = CompositionPath::Create(&source) else {
            diag("CompositionPath::Create rejected the geometry source".into());
            piece_visual.visual.SetIsVisible(false).ok();
            continue;
        };
        if let Err(e) = piece_visual.path_geometry.SetPath(&path) {
            diag(format!("SetPath failed: {e:?}"));
        }
        let _ = piece_visual.visual.SetOffset(Vector3 {
            X: piece.x as f32,
            Y: piece.y as f32,
            Z: 0.0,
        });
        let _ = piece_visual.visual.SetSize(Vector2 {
            X: piece.w as f32,
            Y: piece.h as f32,
        });
        piece_visual.visual.SetIsVisible(true).ok();
    }
    true
}

/// Hides a window's glass (the window is hidden, or the glass setting went
/// off).
fn park_all(label: &str) {
    let mut guard = BACKDROPS.lock().unwrap();
    let Some(backdrops) = guard.as_mut() else {
        return;
    };
    let Some(backdrop) = backdrops.get_mut(label) else {
        return;
    };
    for piece in &backdrop.pieces {
        piece.visual.SetIsVisible(false).ok();
    }
    unsafe {
        let _ = SetWindowPos(
            HWND(backdrop.hwnd as *mut _),
            None,
            0,
            0,
            0,
            0,
            SWP_HIDEWINDOW | SWP_NOACTIVATE | SWP_NOZORDER,
        );
    }
}

fn is_window(hwnd: HWND) -> bool {
    unsafe { IsWindow(Some(hwnd)).as_bool() }
}

/// Whether Windows will actually blur: transparency effects on and energy
/// saver off.
fn blur_available() -> bool {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
    let mut transparency: u32 = 1;
    let mut size = std::mem::size_of::<u32>() as u32;
    unsafe {
        let _ = RegGetValueW(
            HKEY_CURRENT_USER,
            w!(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"),
            w!("EnableTransparency"),
            RRF_RT_REG_DWORD,
            None,
            Some(&mut transparency as *mut u32 as *mut _),
            Some(&mut size),
        );
        let mut power = SYSTEM_POWER_STATUS::default();
        let saver = GetSystemPowerStatus(&mut power).is_ok() && power.SystemStatusFlag == 1;
        diag(format!(
            "blur_available: transparency={transparency} saver={saver}"
        ));
        transparency != 0 && !saver
    }
}

// ─── GeometrySource: a CompositionPath from a Direct2D path geometry ────────
//
// `CompositionPath::Create` accepts a `Windows.Graphics.IGeometrySource2D`
// (a marker interface), then reads the geometry back through
// `IGeometrySource2DInterop`, both published in windows.graphics.interop.h:
//
//     DECLARE_INTERFACE_IID_(IGeometrySource2DInterop, IUnknown,
//                            "0657AF73-53FD-47CF-84FF-C8492D2A80A3")
//
// The object below answers both interface identities with two tear-off views
// of one allocation, sharing a refcount, and holds the path geometry for as
// long as the compositor does.

const IID_GEOMETRY_SOURCE_2D_INTEROP: GUID =
    GUID::from_u128(0x0657af73_53fd_47cf_84ff_c8492d2a80a3);
const E_NOINTERFACE: HRESULT = HRESULT(0x8000_4002u32 as i32);
const E_POINTER: HRESULT = HRESULT(0x8000_4003u32 as i32);
const E_OUTOFMEMORY: HRESULT = HRESULT(0x8007_000Eu32 as i32);
const S_OK: HRESULT = HRESULT(0);
const SOURCE_CLASS_NAME: &str = "Windows.Graphics.IGeometrySource2D";

windows_core::imp::define_interface!(
    IGeometrySource2DInterop,
    IGeometrySource2DInterop_Vtbl,
    0x0657af73_53fd_47cf_84ff_c8492d2a80a3
);

#[repr(C)]
#[allow(non_snake_case)]
pub struct IGeometrySource2DInterop_Vtbl {
    pub base__: IUnknown_Vtbl,
    pub GetGeometry: unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> HRESULT,
    pub TryGetGeometryUsingFactory:
        unsafe extern "system" fn(*mut c_void, *mut c_void, *mut *mut c_void) -> HRESULT,
}

/// Raw vtables are `!Sync`; the pointers only ever point at the static
/// tables below, so sharing them is fine.
#[repr(transparent)]
struct StaticVtbl<T>(T);
unsafe impl<T> Sync for StaticVtbl<T> {}

/// One allocation, two COM identities: `source_vtbl` (the WinRT marker,
/// returned for the object itself) and `interop_vtbl` (the D2D interop view,
/// which `#[repr(C)]` puts 8 bytes in).
#[repr(C)]
struct GeometrySource {
    source_vtbl: *const IGeometrySource2D_Vtbl,
    interop_vtbl: *const IGeometrySource2DInterop_Vtbl,
    refcount: AtomicU32,
    geometry: ID2D1Geometry,
}

impl GeometrySource {
    fn create(geometry: ID2D1Geometry) -> IGeometrySource2D {
        let source = Box::new(GeometrySource {
            source_vtbl: &SOURCE_2D_VTBL.0,
            interop_vtbl: &INTEROP_VTBL.0,
            refcount: AtomicU32::new(1),
            geometry,
        });
        unsafe { IGeometrySource2D::from_raw(Box::into_raw(source) as *mut c_void) }
    }
}

unsafe fn base_from_source(this: *mut c_void) -> *mut GeometrySource {
    this as *mut GeometrySource
}

unsafe fn base_from_interop(this: *mut c_void) -> *mut GeometrySource {
    unsafe { (this as *mut u8).sub(std::mem::size_of::<*const c_void>()) as *mut GeometrySource }
}

unsafe fn add_ref(obj: *mut GeometrySource) -> u32 {
    unsafe { (*obj).refcount.fetch_add(1, Ordering::Relaxed) + 1 }
}

unsafe fn release(obj: *mut GeometrySource) -> u32 {
    unsafe {
        if (*obj).refcount.fetch_sub(1, Ordering::Release) == 1 {
            std::sync::atomic::fence(Ordering::Acquire);
            drop(Box::from_raw(obj));
            0
        } else {
            (*obj).refcount.load(Ordering::Relaxed)
        }
    }
}

unsafe extern "system" fn query_interface(
    this: *mut c_void,
    iid: *const GUID,
    out: *mut *mut c_void,
) -> HRESULT {
    unsafe {
        if iid.is_null() || out.is_null() {
            return E_POINTER;
        }
        let iid = *iid;
        let is_interop_view = {
            let vtbl = *(this as *const *const c_void);
            vtbl == &INTEROP_VTBL.0 as *const _ as *const c_void
        };
        let obj = if is_interop_view {
            base_from_interop(this)
        } else {
            base_from_source(this)
        };
        if iid == IUnknown::IID || iid == IInspectable::IID || iid == IGeometrySource2D::IID {
            add_ref(obj);
            *out = obj as *mut c_void;
            S_OK
        } else if iid == IID_GEOMETRY_SOURCE_2D_INTEROP {
            add_ref(obj);
            *out = (obj as *mut u8).add(std::mem::size_of::<*const c_void>()) as *mut c_void;
            S_OK
        } else {
            *out = std::ptr::null_mut();
            E_NOINTERFACE
        }
    }
}

unsafe extern "system" fn source_add_ref(this: *mut c_void) -> u32 {
    unsafe { add_ref(base_from_source(this)) }
}

unsafe extern "system" fn source_release(this: *mut c_void) -> u32 {
    unsafe { release(base_from_source(this)) }
}

unsafe extern "system" fn interop_add_ref(this: *mut c_void) -> u32 {
    unsafe { add_ref(base_from_interop(this)) }
}

unsafe extern "system" fn interop_release(this: *mut c_void) -> u32 {
    unsafe { release(base_from_interop(this)) }
}

unsafe extern "system" fn get_iids(
    _this: *mut c_void,
    count: *mut u32,
    values: *mut *mut GUID,
) -> HRESULT {
    unsafe {
        if count.is_null() || values.is_null() {
            return E_POINTER;
        }
        let memory = CoTaskMemAlloc(std::mem::size_of::<GUID>()) as *mut GUID;
        if memory.is_null() {
            return E_OUTOFMEMORY;
        }
        *memory = IGeometrySource2D::IID;
        *count = 1;
        *values = memory;
        S_OK
    }
}

unsafe extern "system" fn get_runtime_class_name(
    _this: *mut c_void,
    value: *mut *mut c_void,
) -> HRESULT {
    unsafe {
        if value.is_null() {
            return E_POINTER;
        }
        let name = HSTRING::from(SOURCE_CLASS_NAME);
        // Ownership transfers to the caller, which frees it as an HSTRING.
        *value = std::mem::transmute::<HSTRING, *mut c_void>(name);
        S_OK
    }
}

unsafe extern "system" fn get_trust_level(_this: *mut c_void, value: *mut i32) -> HRESULT {
    unsafe {
        if value.is_null() {
            return E_POINTER;
        }
        *value = 0; // BaseTrust
        S_OK
    }
}

unsafe extern "system" fn interop_get_geometry(
    this: *mut c_void,
    value: *mut *mut c_void,
) -> HRESULT {
    unsafe {
        if value.is_null() {
            return E_POINTER;
        }
        let geometry = (*base_from_interop(this)).geometry.clone();
        *value = Interface::into_raw(geometry);
        S_OK
    }
}

unsafe extern "system" fn interop_try_get_geometry(
    this: *mut c_void,
    _factory: *mut c_void,
    value: *mut *mut c_void,
) -> HRESULT {
    // The stored geometry was made from a shared factory; handing it back is
    // the answer, whatever factory the caller had in mind.
    unsafe { interop_get_geometry(this, value) }
}

static SOURCE_2D_VTBL: StaticVtbl<IGeometrySource2D_Vtbl> = StaticVtbl(IGeometrySource2D_Vtbl {
    base__: IInspectable_Vtbl {
        base: IUnknown_Vtbl {
            QueryInterface: query_interface,
            AddRef: source_add_ref,
            Release: source_release,
        },
        GetIids: get_iids,
        GetRuntimeClassName: get_runtime_class_name,
        GetTrustLevel: get_trust_level,
    },
});

static INTEROP_VTBL: StaticVtbl<IGeometrySource2DInterop_Vtbl> =
    StaticVtbl(IGeometrySource2DInterop_Vtbl {
        base__: IUnknown_Vtbl {
            QueryInterface: query_interface,
            AddRef: interop_add_ref,
            Release: interop_release,
        },
        GetGeometry: interop_get_geometry,
        TryGetGeometryUsingFactory: interop_try_get_geometry,
    });
