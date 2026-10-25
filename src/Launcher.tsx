import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
	AppWindow,
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
	| { kind: "action"; key: string; title: string; action: ActionId; confirm: boolean };

const SECTION_TITLES: Record<Item["kind"], string> = {
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

// Icons survive between openings; get_app_icon also caches them on disk.
const iconCache = new Map<string, string | null>();

function useIcon(path: string | null): string | null {
	const [icon, setIcon] = useState(() => (path ? (iconCache.get(path) ?? null) : null));
	useEffect(() => {
		if (!path || iconCache.has(path)) {
			setIcon(path ? (iconCache.get(path) ?? null) : null);
			return;
		}
		let alive = true;
		invoke<string | null>("get_app_icon", { path, name: null, hwnd: null })
			.then((data) => {
				iconCache.set(path, data);
				if (alive) setIcon(data);
			})
			.catch(() => iconCache.set(path, null));
		return () => {
			alive = false;
		};
	}, [path]);
	return icon;
}

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

	// Each opening starts from the last query, selected, like Spotlight.
	useEffect(() => {
		loadApps();
		const unlisten = listen("launcher-opened", () => {
			loadApps();
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
	}, [query, apps, files]);

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
		} else if (e.key === "Escape") {
			e.preventDefault();
			if (query) setQuery("");
			else hide();
		}
	};

	let lastKind: Item["kind"] | null = null;
	return (
		<div className="launcher-card" ref={cardRef}>
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
					}}
					onKeyDown={onKeyDown}
				/>
			</div>
			{query.trim() && (
				<div className="launcher-results" ref={listRef}>
					{items.length === 0 && <div className="launcher-empty">{t("No results")}</div>}
					{items.map((item, index) => {
						const header = item.kind !== lastKind ? t(SECTION_TITLES[item.kind]) : null;
						lastKind = item.kind;
						const isSelected = index === selected;
						const subtitle =
							item.kind === "file"
								? item.file.path
								: item.kind === "calc"
									? t("Enter to copy the result")
									: item.kind === "action" && confirming === item.key
										? t("Press Enter again to confirm")
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
										<span className="launcher-item-hint">{t("Ctrl+Enter: show in folder")}</span>
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
