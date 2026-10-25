/** Notch (island) window: App.tsx and its panels. */
export const notch: Record<string, string> = {
	// Collapsed pill
	"Update Available": "Nueva versión",
	"Low Battery": "Batería baja",
	Charging: "Cargando",
	"On Battery": "Con batería",
	"Previous panel": "Panel anterior",
	"Next panel": "Panel siguiente",
	"Open music": "Abrir música",
	"Open music: {title}": "Abrir música: {title}",
	"Open shelf: 1 item": "Abrir estante: 1 elemento",
	"Open shelf: {count} items": "Abrir estante: {count} elementos",

	// Status widget tooltips
	"CPU Usage": "Uso de CPU",
	"RAM Usage": "Uso de RAM",
	"Free Disk Space": "Espacio libre en disco",
	"Network Speed": "Velocidad de red",

	// Weather conditions (WMO codes, see hooks/useWeather.ts)
	Clear: "Despejado",
	"Mostly Clear": "Casi despejado",
	"Partly Cloudy": "Parcialmente nublado",
	Overcast: "Cubierto",
	Foggy: "Niebla",
	Drizzle: "Llovizna",
	"Freezing Drizzle": "Llovizna helada",
	Rainy: "Lluvia",
	"Freezing Rain": "Lluvia helada",
	Snowy: "Nieve",
	"Rain Showers": "Chubascos",
	"Snow Showers": "Chubascos de nieve",
	Stormy: "Tormenta",
	Unknown: "Desconocido",

	// Battery tooltip
	"{hours} hr": "{hours} h",
	"{hours} hr {minutes} min": "{hours} h {minutes} min",
	"Fully charged ({percent}%)": "Carga completa ({percent}%)",
	"{percent}% available (plugged in, charging)": "{percent}% disponible (enchufado, cargando)",
	"{percent}% available (plugged in, not charging)":
		"{percent}% disponible (enchufado, sin cargar)",
	"{duration} ({percent}%) remaining": "Quedan {duration} ({percent}%)",
	"{percent}% remaining": "Queda un {percent}%",
	"About {duration} until full": "Unos {duration} hasta la carga completa",
	"Power mode: {mode}": "Modo de energía: {mode}",
	"Best power efficiency": "Mejor eficiencia energética",
	Balanced: "Equilibrado",
	"Better performance": "Mejor rendimiento",
	"Best performance": "Máximo rendimiento",
	"Energy saver is on": "Ahorro de energía activado",
	"Battery health: {percent}% of original capacity":
		"Estado de la batería: {percent}% de la capacidad original",

	// Music
	Art: "Carátula",
	"Audio Output": "Salida de audio",
	Volume: "Volumen",
	"App volume": "Volumen de la aplicación",
	"This app's volume can't be controlled": "No se puede controlar el volumen de esta aplicación",

	// Command Center
	On: "Activado",
	Connected: "Conectado",
	"Not connected": "No conectado",
	"{count} connected": "{count} conectados",
	"Left-click to toggle, Right-click for networks":
		"Clic para activar o desactivar, clic derecho para ver redes",
	"Left-click to toggle, Right-click for devices":
		"Clic para activar o desactivar, clic derecho para ver dispositivos",
	"Wi-Fi networks": "Redes Wi-Fi",
	"Bluetooth devices": "Dispositivos Bluetooth",
	"Dock Mode": "Modo del dock",
	"Notch Mode": "Modo de la isla",
	"Cycle dock mode: Fixed / Smart / Peek": "Cambiar modo del dock: Fijo / Inteligente / Vistazo",
	"Cycle notch mode: Fixed / Smart / Peek":
		"Cambiar modo de la isla: Fijo / Inteligente / Vistazo",
	"Focus / DND: {state}": "Concentración / No molestar: {state}",
	"Energy Saver: {state} — Click to open Settings":
		"Ahorro de energía: {state} — Haz clic para abrir Configuración",
	"System Tray": "Bandeja del sistema",
	"Notification Center": "Centro de notificaciones",
	"Bloom Settings": "Configuración de Bloom",
	Brightness: "Brillo",

	// Calendar & timer
	"Set duration": "Fijar duración",
	"Time's up": "Tiempo agotado",
	"Paused · ends {time}": "En pausa · fin: {time}",
	"ends {time}": "fin: {time}",
	"Click to edit": "Haz clic para editar",
	"Click to set a duration": "Haz clic para fijar una duración",
	"Set timer duration": "Fijar la duración del temporizador",
	"timer|Start": "Iniciar",
	Pause: "Pausar",
	Resume: "Reanudar",
	Restart: "Reiniciar",
	Reset: "Restablecer",

	// Shelf
	"Drop files or selected text here": "Suelta aquí archivos o texto seleccionado",
	"Text · {count} chars": "Texto · {count} car.",
	"Remove from shelf": "Quitar del estante",
	"Shelf is full ({max}) — remove an item first":
		"El estante está lleno ({max}): quita un elemento primero",
	"Shelf is full — added {added} of {total} items":
		"El estante está lleno: se añadieron {added} de {total} elementos",
	"Copied to clipboard": "Copiado al portapapeles",
	"File no longer exists — removed from shelf": "El archivo ya no existe: se quitó del estante",
	"Couldn't open the file": "No se pudo abrir el archivo",

	// Wi-Fi panel
	"Back to controls": "Volver a los controles",
	"Scan for networks": "Buscar redes",
	"More Wi-Fi settings": "Más opciones de Wi-Fi",
	"Wi-Fi is off": "El Wi-Fi está desactivado",
	"Windows only lists Wi-Fi networks for apps with location access.":
		"Windows solo muestra las redes Wi-Fi a las aplicaciones con acceso a la ubicación.",
	"Location settings": "Configuración de ubicación",
	"Looking for networks…": "Buscando redes…",
	"No networks found": "No se encontraron redes",
	"Connecting…": "Conectando…",
	"wifi|Open": "Abierta",
	Saved: "Guardada",
	Secured: "Protegida",
	"This network needs a sign-in Windows handles.":
		"Esta red requiere un inicio de sesión que gestiona Windows.",
	Password: "Contraseña",
	Connect: "Conectar",
	Disconnect: "Desconectar",
	Forget: "Olvidar",
	"Wrong password": "Contraseña incorrecta",
	"Enter the password": "Escribe la contraseña",
	"Wi-Fi passwords are 8 to 63 characters": "Las contraseñas Wi-Fi tienen de 8 a 63 caracteres",
	"Connect to this network in Windows Settings":
		"Conéctate a esta red desde Configuración de Windows",
	"This network is out of range": "Esta red está fuera de alcance",
	"Couldn't connect in time": "No se pudo conectar a tiempo",
	"No Wi-Fi adapter found": "No se encontró ningún adaptador Wi-Fi",
	"Location access is off": "El acceso a la ubicación está desactivado",

	// Bluetooth panel
	"Back to devices": "Volver a los dispositivos",
	"Add a device": "Añadir un dispositivo",
	"Add device": "Añadir dispositivo",
	"Bluetooth is off": "El Bluetooth está desactivado",
	"More Bluetooth settings": "Más opciones de Bluetooth",
	"Disconnecting…": "Desconectando…",
	"Connected · {battery}%": "Conectado · {battery}%",
	"Type {pin} on the device, then press Enter on it.":
		"Escribe {pin} en el dispositivo y pulsa Intro en él.",
	"Does the device show {pin}?": "¿El dispositivo muestra {pin}?",
	"Yes, pair": "Sí, emparejar",
	"PIN shown on the device": "PIN que muestra el dispositivo",
	Pair: "Emparejar",
	"Looking for devices. Make sure yours is in pairing mode.":
		"Buscando dispositivos. Asegúrate de que el tuyo está en modo de emparejamiento.",
	"Pairing…": "Emparejando…",
	"Click to pair": "Haz clic para emparejar",
	"No paired devices": "No hay dispositivos emparejados",
	"Connects on its own when it's turned on and in range.":
		"Se conecta solo cuando está encendido y al alcance.",
	"Refresh and try again": "Actualiza e inténtalo de nuevo",
	"Bloom can connect headphones and speakers only": "Bloom solo puede conectar auriculares y altavoces",
	"The device didn't answer in time": "El dispositivo no respondió a tiempo",
	"Pairing was cancelled": "Se canceló el emparejamiento",
	"Couldn't pair with this device": "No se pudo emparejar con este dispositivo",
	"Put the device in pairing mode first": "Primero pon el dispositivo en modo de emparejamiento"
};
