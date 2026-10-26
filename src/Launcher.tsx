import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
	AppWindow,
	ArrowRightLeft,
	Info,
	Calculator,
	File,
	Flower2,
	Folder,
	FolderOpen,
	Gauge,
	Lock,
	LogOut,
	Moon,
	Power,
	RotateCcw,
	Search,
	Settings as SettingsIcon,
	Trash2,
	X
} from "lucide-react";
import { initTheme } from "./theme";
import { locale, t, useLanguage } from "./i18n";
import { evaluate, looksLikeMath } from "./launcher/calc";
import { ACTIONS, SETTINGS_PAGES, score, type ActionId } from "./launcher/catalog";
import { StartHome } from "./launcher/StartHome";
import { useIcon } from "./launcher/useIcon";
import { fileeConvert, fileeTargets, formatLabel, useFilee } from "./filee";
import "./Launcher.css";

interface AppInfo {
	name: string;
	path: string;
}

/** Mirrors `FileHit` in src-tauri/src/launcher.rs. */
interface FileHit {
	name: string;
	path: string;
	folder: boolean;
}

type Item =
	| { kind: "calc"; key: string; title: string; value: number }
	| { kind: "app"; key: string; title: string; app: AppInfo }
	| { kind: "file"; key: string; title: string; file: FileHit }
	| { kind: "setting"; key: string; title: string; uri: string }
	| { kind: "action"; key: string; title: string; action: ActionId; confirm: boolean }
	| { kind: "convert"; key: string; title: string; format: string }
	| { kind: "install"; key: string; title: string };

const SECTION_TITLES: Record<Item["kind"], string> = {
	convert: "Convert to",
	install: "Filee",
	calc: "Calculator",
	app: "Apps",
	setting: "Settings",
	action: "Actions",
	file: "Files"
};

const ACTION_ICONS: Record<ActionId, typeof Lock> = {
	lock: Lock,
	sleep: Moon,
	restart: RotateCcw,
	shutdown: Power,
	sign_out: LogOut,
	task_manager: Gauge,
	file_explorer: FolderOpen,
	recycle_bin: Trash2,
	empty_recycle_bin: Trash2,
	bloom_settings: Flower2,
	quit_bloom: X
};

function ItemIcon({ item }: { item: Item }) {
	const iconPath =
		item.kind === "app" ? item.app.path : item.kind === "file" ? item.file.path : null;
	const icon = useIcon(iconPath);
	if (icon) return <img className="launcher-item-img" src={icon} alt="" draggable={false} />;
	const Icon =
		item.kind === "calc"
			? Calculator
			: item.kind === "app"
				? AppWindow
				: item.kind === "file"
					? item.file.folder
						? Folder
						: File
					: item.kind === "setting"
						? SettingsIcon
						: item.kind === "convert"
							? ArrowRightLeft
							: item.kind === "install"
								? Info
								: ACTION_ICONS[item.action];
	return <Icon className="launcher-item-glyph" size={18} strokeWidth={1.8} />;
}

function formatNumber(value: number): string {
	return new Intl.NumberFormat(locale(), { maximumFractionDigits: 10 }).format(value);
}

function LauncherApp() {
	useLanguage();
	const [query, setQuery] = useState("");
	const [apps, setApps] = useState<AppInfo[]>([]);
	const [files, setFiles] = useState<FileHit[]>([]);
	const [selected, setSelected] = useState(0);
	const [confirming, setConfirming] = useState<string | null>(null);
	// "search" (Alt+Space) or "start" (the dock's Start button, or Win when
	// Bloom's Start menu replaces Windows').
	const [mode, setMode] = useState<"search" | "start">("search");
	const [pinned, setPinned] = useState<AppInfo[]>([]);
	const [userName, setUserName] = useState("");
	// Remounts the Start home on each opening, so it starts on Pinned.
	const [openCount, setOpenCount] = useState(0);
	// Tab on a file result lists what Filee converts it to; Esc goes back.
	const filee = useFilee();
	const [convertFile, setConvertFile] = useState<FileHit | null>(null);
	const [convertTargets, setConvertTargets] = useState<string[] | null>(null);
	const [convertBusy, setConvertBusy] = useState<string | null>(null);
	const [convertError, setConvertError] = useState<string | null>(null);
	const [convertedFiles, setConvertedFiles] = useState<FileHit[]>([]);
	const inputRef = useRef<HTMLInputElement>(null);
	const cardRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const searchId = useRef(0);

	useEffect(() => initTheme(), []);

	const loadApps = useCallback(() => {
		invoke<AppInfo[]>("get_installed_apps")
			.then(setApps)
			.catch(() => {});
	}, []);

	// Search reopens on the last query, selected, like Spotlight; Start opens
	// empty, like Windows'.
	useEffect(() => {
		loadApps();
		invoke<string>("launcher_user_name")
			.then(setUserName)
			.catch(() => {});
		const unlisten = listen<string>("launcher-opened", (event) => {
			const next = event.payload === "start" ? "start" : "search";
			setMode(next);
			loadApps();
			if (next === "start") {
				setQuery("");
				setOpenCount((n) => n + 1);
				invoke<AppInfo[]>("load_pinned_apps")
					.then((apps) => setPinned(apps.filter((app) => app.path !== "start")))
					.catch(() => {});
			}
			setConfirming(null);
			setSelected(0);
			requestAnimationFrame(() => {
				inputRef.current?.focus();
				inputRef.current?.select();
			});
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, [loadApps]);

	// The window is exactly as tall as the card, so the desktop around it
	// stays clickable (and a click there closes the launcher).
	useEffect(() => {
		const card = cardRef.current;
		if (!card) return;
		const observer = new ResizeObserver(() => {
			invoke("resize_launcher", { height: Math.ceil(card.getBoundingClientRect().height) }).catch(
				() => {}
			);
		});
		observer.observe(card);
		return () => observer.disconnect();
	}, []);

	// File search goes through the Windows index; only the latest answer counts.
	useEffect(() => {
		const q = query.trim();
		if (q.length < 2 || looksLikeMath(q)) {
			setFiles([]);
			return;
		}
		const id = ++searchId.current;
		const timer = setTimeout(() => {
			invoke<FileHit[]>("launcher_search_files", { query: q })
				.then((hits) => {
					if (id === searchId.current) setFiles(hits);
				})
				.catch(() => {});
		}, 140);
		return () => clearTimeout(timer);
	}, [query]);

	const items = useMemo<Item[]>(() => {
		if (convertFile) {
			if (convertedFiles.length > 0)
				return convertedFiles.map((file): Item => ({
					kind: "file",
					key: `file:${file.path}`,
					title: file.name,
					file
				}));
			if (filee.status && !filee.status.installed)
				return [
					{
						kind: "install",
						key: "install",
						title: t("Filee isn't included in this build of Bloom")
					}
				];
			return (convertTargets ?? []).map((format): Item => ({
				kind: "convert",
				key: `convert:${format}`,
				title: formatLabel(format),
				format
			}));
		}
		const q = query.trim();
		if (!q) return [];
		const calc: Item[] = [];
		if (looksLikeMath(q)) {
			const value = evaluate(q);
			if (value !== null)
				calc.push({ kind: "calc", key: "calc", title: formatNumber(value), value });
		}
		const rank = <T,>(list: T[], name: (x: T) => string, keywords: (x: T) => string, max: number) =>
			list
				.map((x) => ({ x, s: score(q, name(x), keywords(x)) }))
				.filter((r) => r.s > 0)
				.sort((a, b) => b.s - a.s)
				.slice(0, max);

		const appMatches = rank(
			apps,
			(a) => a.name,
			() => "",
			6
		);
		const pages = rank(
			SETTINGS_PAGES,
			(p) => `${t(p.name)} ${p.name}`,
			(p) => p.keywords,
			4
		);
		const actions = rank(
			ACTIONS,
			(a) => `${t(a.name)} ${a.name}`,
			(a) => a.keywords,
			3
		);
		// Sections follow their best match, so "apag" puts Shut down above the
		// Power page it merely mentions. Files come last: the index has no score.
		const sections = [
			{
				best: appMatches[0]?.s ?? 0,
				items: appMatches.map(({ x }): Item => ({
					kind: "app",
					key: `app:${x.path}`,
					title: x.name,
					app: x
				}))
			},
			{
				best: pages[0]?.s ?? 0,
				items: pages.map(({ x }): Item => ({
					kind: "setting",
					key: `set:${x.uri}`,
					title: t(x.name),
					uri: x.uri
				}))
			},
			{
				best: actions[0]?.s ?? 0,
				items: actions.map(({ x }): Item => ({
					kind: "action",
					key: `act:${x.id}`,
					title: t(x.name),
					action: x.id,
					confirm: !!x.confirm
				}))
			}
		]
			.filter((section) => section.items.length > 0)
			.sort((a, b) => b.best - a.best);
		const fileItems = files
			.slice(0, 8)
			.map((file): Item => ({ kind: "file", key: `file:${file.path}`, title: file.name, file }));
		return [...calc, ...sections.flatMap((section) => section.items), ...fileItems];
	}, [query, apps, files, convertFile, convertedFiles, convertTargets, filee]);

	const enterConvert = (file: FileHit) => {
		setConvertFile(file);
		setConvertTargets(null);
		setConvertError(null);
		setConvertedFiles([]);
		setSelected(0);
		filee.refresh();
		fileeTargets(file.path).then(setConvertTargets);
	};

	const leaveConvert = () => {
		setConvertFile(null);
		setConvertedFiles([]);
		setConvertError(null);
		setSelected(0);
	};

	// Installing Filee from convert mode goes straight on to its formats.
	useEffect(() => {
		if (convertFile && filee.status?.installed && convertTargets === null)
			fileeTargets(convertFile.path).then(setConvertTargets);
	}, [convertFile, filee.status?.installed, convertTargets]);

	useEffect(() => {
		setSelected((s) => Math.min(s, Math.max(items.length - 1, 0)));
	}, [items.length]);

	useEffect(() => {
		listRef.current
			?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [selected]);

	const hide = () => invoke("hide_launcher").catch(() => {});

	const run = async (item: Item, reveal = false) => {
		if (item.kind === "action" && item.confirm && confirming !== item.key) {
			setConfirming(item.key);
			return;
		}
		setConfirming(null);
		switch (item.kind) {
			case "calc":
				await writeText(String(item.value)).catch(() => {});
				hide();
				break;
			case "app":
				hide();
				invoke("open_app", { appName: item.app.path }).catch(() => {});
				break;
			case "file":
				hide();
				invoke(reveal ? "launcher_reveal_file" : "launcher_open_file", {
					path: item.file.path
				}).catch(() => {});
				break;
			case "setting":
				hide();
				invoke("launcher_open_settings_page", { uri: item.uri }).catch(() => {});
				break;
			case "action":
				invoke("launcher_run_action", { action: item.action }).catch(() => {});
				break;
			case "install":
				// Only a notice: this build has no Filee to convert with.
				break;
			case "convert": {
				if (!convertFile || convertBusy) return;
				setConvertBusy(item.format);
				setConvertError(null);
				const result = await fileeConvert(convertFile.path, item.format);
				setConvertBusy(null);
				if (result.ok && result.outputs.length > 0) {
					setSelected(0);
					setConvertedFiles(
						result.outputs.map((path) => ({
							name: path.split("\\").pop() || path,
							path,
							folder: false
						}))
					);
				} else {
					setConvertError(t(result.error ?? "Conversion failed"));
				}
				break;
			}
		}
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setConfirming(null);
			setSelected((s) => (items.length ? (s + 1) % items.length : 0));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setConfirming(null);
			setSelected((s) => (items.length ? (s - 1 + items.length) % items.length : 0));
		} else if (e.key === "Enter") {
			e.preventDefault();
			const item = items[selected];
			if (item) run(item, e.ctrlKey || e.shiftKey);
		} else if (e.key === "Tab" && !convertFile && items[selected]?.kind === "file") {
			e.preventDefault();
			const item = items[selected];
			if (item.kind === "file" && !item.file.folder) enterConvert(item.file);
		} else if (e.key === "Escape") {
			e.preventDefault();
			if (convertFile) leaveConvert();
			else if (query) setQuery("");
			else hide();
		}
	};

	let lastKind: Item["kind"] | null = null;
	return (
		// Keys bubble here from the input and from Start's buttons alike, so
		// Esc works wherever the focus is.
		<div className={`launcher-card ${mode}`} ref={cardRef} onKeyDown={onKeyDown}>
			<div className="launcher-search">
				<Search className="launcher-search-icon" size={20} strokeWidth={2} />
				<input
					ref={inputRef}
					className="launcher-input"
					value={query}
					autoFocus
					spellCheck={false}
					placeholder={t("Search apps, files and settings")}
					onChange={(e) => {
						setQuery(e.target.value);
						setSelected(0);
						setConfirming(null);
						if (convertFile) leaveConvert();
					}}
				/>
			</div>
			{mode === "start" && !query.trim() && (
				<StartHome
					key={openCount}
					pinned={pinned}
					apps={apps}
					userName={userName}
					onLaunch={(app) => {
						hide();
						invoke("open_app", { appName: app.path }).catch(() => {});
					}}
					onAction={(action) => {
						invoke("launcher_run_action", { action }).catch(() => {});
					}}
					onUser={() => {
						hide();
						invoke("launcher_open_settings_page", { uri: "ms-settings:yourinfo" }).catch(() => {});
					}}
				/>
			)}
			{query.trim() && (
				<div className="launcher-results" ref={listRef}>
					{items.length === 0 && (
						<div className="launcher-empty">
							{!convertFile
								? t("No results")
								: convertTargets === null
									? t("Loading...")
									: t("Filee can't convert this kind of file")}
						</div>
					)}
					{convertError && <div className="launcher-empty error">{convertError}</div>}
					{items.map((item, index) => {
						const header =
							item.kind === lastKind
								? null
								: convertFile && item.kind === "convert"
									? t("Convert {name} to", { name: convertFile.name })
									: convertFile && item.kind === "file"
										? t("Converted")
										: t(SECTION_TITLES[item.kind]);
						lastKind = item.kind;
						const isSelected = index === selected;
						const subtitle =
							item.kind === "file"
								? item.file.path
								: item.kind === "calc"
									? t("Enter to copy the result")
									: item.kind === "action" && confirming === item.key
										? t("Press Enter again to confirm")
										: item.kind === "convert" && convertBusy === item.format
											? t("Converting…")
											: item.kind === "install"
												? t("Build it with: bun run build:filee")
												: null;
						return (
							<div key={item.key}>
								{header && <div className="launcher-section">{header}</div>}
								<div
									data-index={index}
									className={`launcher-item ${isSelected ? "selected" : ""} ${
										item.kind === "calc" ? "calc" : ""
									} ${confirming === item.key ? "confirming" : ""}`}
									onMouseMove={() => setSelected(index)}
									onClick={(e) => run(item, e.ctrlKey || e.shiftKey)}
								>
									<div className="launcher-item-icon">
										<ItemIcon item={item} />
									</div>
									<div className="launcher-item-text">
										<span className="launcher-item-title">{item.title}</span>
										{subtitle && <span className="launcher-item-subtitle">{subtitle}</span>}
									</div>
									{isSelected && item.kind === "file" && (
										<span className="launcher-item-hint">
											{convertFile || item.file.folder
												? t("Ctrl+Enter: show in folder")
												: t("Tab: convert · Ctrl+Enter: folder")}
										</span>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<LauncherApp />
	</StrictMode>
);
