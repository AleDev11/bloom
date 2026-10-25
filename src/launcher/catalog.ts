/**
 * What the launcher finds besides apps and files: Windows Settings pages and
 * system actions. Names are English i18n keys (translated where shown);
 * keywords cover both languages so either finds a page.
 */

export interface SettingsPage {
	uri: string;
	name: string;
	keywords: string;
}

export const SETTINGS_PAGES: SettingsPage[] = [
	{ uri: "ms-settings:", name: "Settings", keywords: "configuracion ajustes settings" },
	{
		uri: "ms-settings:display",
		name: "Display",
		keywords: "pantalla resolucion escala brillo monitor display resolution scale"
	},
	{ uri: "ms-settings:nightlight", name: "Night light", keywords: "luz nocturna night light blue" },
	{
		uri: "ms-settings:sound",
		name: "Sound",
		keywords: "sonido audio altavoces microfono speakers microphone volume volumen"
	},
	{
		uri: "ms-settings:apps-volume",
		name: "Volume mixer",
		keywords: "mezclador volumen aplicaciones mixer app volume"
	},
	{
		uri: "ms-settings:notifications",
		name: "Notifications",
		keywords: "notificaciones notifications avisos"
	},
	{
		uri: "ms-settings:quiethours",
		name: "Do not disturb",
		keywords: "no molestar concentracion focus dnd quiet"
	},
	{
		uri: "ms-settings:powersleep",
		name: "Power & battery",
		keywords: "energia bateria suspension apagar pantalla power battery sleep"
	},
	{
		uri: "ms-settings:batterysaver",
		name: "Energy saver",
		keywords: "ahorro energia bateria battery saver energy"
	},
	{
		uri: "ms-settings:storagesense",
		name: "Storage",
		keywords: "almacenamiento disco espacio storage disk space"
	},
	{
		uri: "ms-settings:multitasking",
		name: "Multitasking",
		keywords: "multitarea ventanas snap multitasking windows"
	},
	{
		uri: "ms-settings:clipboard",
		name: "Clipboard",
		keywords: "portapapeles historial clipboard history"
	},
	{
		uri: "ms-settings:about",
		name: "About",
		keywords: "acerca informacion sistema nombre equipo about system pc name specs"
	},
	{
		uri: "ms-settings:bluetooth",
		name: "Bluetooth & devices",
		keywords: "bluetooth dispositivos auriculares devices headphones"
	},
	{
		uri: "ms-settings:printers",
		name: "Printers & scanners",
		keywords: "impresoras escaner printers scanners"
	},
	{ uri: "ms-settings:mousetouchpad", name: "Mouse", keywords: "raton mouse puntero cursor" },
	{
		uri: "ms-settings:devices-touchpad",
		name: "Touchpad",
		keywords: "panel tactil touchpad gestos gestures"
	},
	{
		uri: "ms-settings:typing",
		name: "Typing",
		keywords: "escritura teclado autocorreccion typing keyboard"
	},
	{
		uri: "ms-settings:network-status",
		name: "Network & internet",
		keywords: "red internet conexion network connection ethernet"
	},
	{ uri: "ms-settings:network-wifi", name: "Wi-Fi", keywords: "wifi wireless inalambrica redes" },
	{ uri: "ms-settings:network-vpn", name: "VPN", keywords: "vpn" },
	{
		uri: "ms-settings:network-airplanemode",
		name: "Airplane mode",
		keywords: "modo avion airplane flight"
	},
	{ uri: "ms-settings:network-proxy", name: "Proxy", keywords: "proxy" },
	{
		uri: "ms-settings:personalization",
		name: "Personalization",
		keywords: "personalizacion personalization"
	},
	{
		uri: "ms-settings:personalization-background",
		name: "Background",
		keywords: "fondo pantalla wallpaper background"
	},
	{
		uri: "ms-settings:colors",
		name: "Colors",
		keywords: "colores tema oscuro claro modo colors dark light mode accent"
	},
	{ uri: "ms-settings:themes", name: "Themes", keywords: "temas themes" },
	{ uri: "ms-settings:lockscreen", name: "Lock screen", keywords: "pantalla bloqueo lock screen" },
	{ uri: "ms-settings:fonts", name: "Fonts", keywords: "fuentes tipografias fonts" },
	{ uri: "ms-settings:personalization-start", name: "Start", keywords: "inicio menu start" },
	{ uri: "ms-settings:taskbar", name: "Taskbar", keywords: "barra tareas taskbar" },
	{
		uri: "ms-settings:appsfeatures",
		name: "Installed apps",
		keywords: "aplicaciones instaladas desinstalar programas apps installed uninstall"
	},
	{
		uri: "ms-settings:defaultapps",
		name: "Default apps",
		keywords: "aplicaciones predeterminadas navegador default apps browser"
	},
	{
		uri: "ms-settings:startupapps",
		name: "Startup apps",
		keywords: "inicio arranque aplicaciones startup apps"
	},
	{ uri: "ms-settings:yourinfo", name: "Your info", keywords: "cuenta informacion account info" },
	{
		uri: "ms-settings:signinoptions",
		name: "Sign-in options",
		keywords: "inicio sesion contraseña pin hello sign in password"
	},
	{
		uri: "ms-settings:dateandtime",
		name: "Date & time",
		keywords: "fecha hora zona horaria date time zone clock"
	},
	{
		uri: "ms-settings:regionformatting",
		name: "Language & region",
		keywords: "idioma region formato language region format"
	},
	{ uri: "ms-settings:gaming-gamebar", name: "Game Bar", keywords: "juegos game bar xbox gaming" },
	{
		uri: "ms-settings:gaming-gamemode",
		name: "Game Mode",
		keywords: "modo juego game mode gaming"
	},
	{
		uri: "ms-settings:easeofaccess",
		name: "Accessibility",
		keywords: "accesibilidad accessibility"
	},
	{
		uri: "ms-settings:privacy",
		name: "Privacy & security",
		keywords: "privacidad seguridad permisos privacy security permissions"
	},
	{
		uri: "ms-settings:privacy-location",
		name: "Location",
		keywords: "ubicacion localizacion location gps"
	},
	{ uri: "ms-settings:privacy-webcam", name: "Camera", keywords: "camara webcam camera" },
	{ uri: "ms-settings:privacy-microphone", name: "Microphone", keywords: "microfono microphone" },
	{
		uri: "ms-settings:windowsdefender",
		name: "Windows Security",
		keywords: "seguridad antivirus defender security"
	},
	{
		uri: "ms-settings:windowsupdate",
		name: "Windows Update",
		keywords: "actualizaciones actualizar update updates"
	},
	{
		uri: "ms-settings:recovery",
		name: "Recovery",
		keywords: "recuperacion restablecer recovery reset"
	},
	{
		uri: "ms-settings:developers",
		name: "For developers",
		keywords: "desarrolladores developers developer mode"
	}
];

export type ActionId =
	| "lock"
	| "sleep"
	| "restart"
	| "shutdown"
	| "sign_out"
	| "task_manager"
	| "file_explorer"
	| "recycle_bin"
	| "empty_recycle_bin"
	| "bloom_settings"
	| "quit_bloom";

export interface SystemAction {
	id: ActionId;
	name: string;
	keywords: string;
	/** Ends the session or deletes something: Enter must be pressed twice. */
	confirm?: boolean;
}

export const ACTIONS: SystemAction[] = [
	{ id: "lock", name: "Lock", keywords: "bloquear bloqueo lock" },
	{ id: "sleep", name: "Sleep", keywords: "suspender dormir sleep suspend" },
	{ id: "restart", name: "Restart", keywords: "reiniciar reinicio restart reboot", confirm: true },
	{
		id: "shutdown",
		name: "Shut down",
		keywords: "apagar apagado shut down shutdown power off",
		confirm: true
	},
	{
		id: "sign_out",
		name: "Sign out",
		keywords: "cerrar sesion salir sign out log off logout",
		confirm: true
	},
	{
		id: "task_manager",
		name: "Task Manager",
		keywords: "administrador tareas procesos task manager processes"
	},
	{
		id: "file_explorer",
		name: "File Explorer",
		keywords: "explorador archivos carpetas file explorer folders"
	},
	{ id: "recycle_bin", name: "Recycle Bin", keywords: "papelera reciclaje recycle bin trash" },
	{
		id: "empty_recycle_bin",
		name: "Empty Recycle Bin",
		keywords: "vaciar papelera empty recycle bin trash",
		confirm: true
	},
	{
		id: "bloom_settings",
		name: "Bloom Settings",
		keywords: "bloom configuracion ajustes settings"
	},
	{ id: "quit_bloom", name: "Quit Bloom", keywords: "salir bloom cerrar quit exit" }
];

/** Lowercase without accents, so "configuracion" finds "Configuración". */
export function fold(text: string): string {
	return text
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase();
}

/**
 * How well a query matches a name (0 = no match). Prefix beats a word start,
 * which beats a substring; initials ("vsc" for Visual Studio Code) score last.
 * Keywords match by word prefix at a lower score.
 */
export function score(query: string, name: string, keywords = ""): number {
	const q = fold(query.trim());
	if (!q) return 0;
	const n = fold(name);
	if (n === q) return 100;
	if (n.startsWith(q)) return 90 - Math.min(n.length - q.length, 20) / 4;
	const words = n.split(/[\s\-_.()]+/).filter(Boolean);
	if (words.some((w) => w.startsWith(q))) return 70;
	if (n.includes(q)) return 55;
	const initials = words.map((w) => w[0]).join("");
	if (q.length >= 2 && initials.startsWith(q)) return 50;
	const queryWords = q.split(/\s+/);
	const haystack = `${n} ${fold(keywords)}`.split(/\s+/);
	if (queryWords.every((qw) => haystack.some((w) => w.startsWith(qw)))) return 40;
	return 0;
}
