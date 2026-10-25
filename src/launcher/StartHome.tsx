import { useMemo, useState } from "react";
import {
	AppWindow,
	ChevronLeft,
	ChevronRight,
	Lock,
	LogOut,
	Moon,
	Power,
	RotateCcw
} from "lucide-react";
import { t, useLanguage } from "../i18n";
import { fold, type ActionId } from "./catalog";
import { useIcon } from "./useIcon";

export interface StartApp {
	name: string;
	path: string;
}

const POWER_ACTIONS: { id: ActionId; name: string; icon: typeof Lock }[] = [
	{ id: "lock", name: "Lock", icon: Lock },
	{ id: "sleep", name: "Sleep", icon: Moon },
	{ id: "sign_out", name: "Sign out", icon: LogOut },
	{ id: "restart", name: "Restart", icon: RotateCcw },
	{ id: "shutdown", name: "Shut down", icon: Power }
];

function AppIcon({ path, size }: { path: string; size: number }) {
	const icon = useIcon(path);
	// A fixed box, so names line up whether or not an app has an icon.
	return (
		<span className="start-icon" style={{ width: size, height: size }}>
			{icon ? (
				<img src={icon} alt="" draggable={false} style={{ width: size, height: size }} />
			) : (
				<AppWindow size={size * 0.8} strokeWidth={1.6} />
			)}
		</span>
	);
}

/** First letter for the all-apps index; digits and symbols group under "#". */
function indexLetter(name: string): string {
	const first = fold(name).charAt(0).toUpperCase();
	return /[A-Z]/.test(first) ? first : "#";
}

/**
 * What Bloom's Start menu shows before anything is typed: pinned apps (the
 * dock's pins), every installed app A to Z, and the user and power row.
 */
export function StartHome({
	pinned,
	apps,
	userName,
	onLaunch,
	onAction,
	onUser
}: {
	pinned: StartApp[];
	apps: StartApp[];
	userName: string;
	onLaunch: (app: StartApp) => void;
	onAction: (action: ActionId) => void;
	onUser: () => void;
}) {
	useLanguage();
	const [view, setView] = useState<"pinned" | "all">("pinned");
	const [powerOpen, setPowerOpen] = useState(false);

	const groups = useMemo(() => {
		const sorted = [...apps].sort((a, b) => fold(a.name).localeCompare(fold(b.name)));
		const byLetter: { letter: string; apps: StartApp[] }[] = [];
		for (const app of sorted) {
			const letter = indexLetter(app.name);
			const last = byLetter[byLetter.length - 1];
			if (last?.letter === letter) last.apps.push(app);
			else byLetter.push({ letter, apps: [app] });
		}
		// "#" goes first, as in Windows.
		return byLetter.sort((a, b) => (a.letter === "#" ? -1 : b.letter === "#" ? 1 : 0));
	}, [apps]);

	return (
		<div className="start-home">
			<div className="start-header">
				<span className="start-title">{view === "pinned" ? t("Pinned") : t("All apps")}</span>
				<button
					className="start-switch"
					onClick={() => setView(view === "pinned" ? "all" : "pinned")}
				>
					{view === "pinned" ? (
						<>
							{t("All apps")} <ChevronRight size={14} />
						</>
					) : (
						<>
							<ChevronLeft size={14} /> {t("Back")}
						</>
					)}
				</button>
			</div>

			{view === "pinned" ? (
				<div className="start-grid">
					{pinned.length === 0 && (
						<div className="start-empty">{t("Pin apps to the dock to see them here")}</div>
					)}
					{pinned.map((app) => (
						<button
							key={app.path}
							className="start-tile"
							title={t(app.name)}
							onClick={() => onLaunch(app)}
						>
							<AppIcon path={app.path} size={32} />
							<span className="start-tile-name">{t(app.name)}</span>
						</button>
					))}
				</div>
			) : (
				<div className="start-list">
					{groups.map((group) => (
						<div key={group.letter}>
							<div className="start-letter">{group.letter}</div>
							{group.apps.map((app) => (
								<button key={app.path} className="start-row" onClick={() => onLaunch(app)}>
									<AppIcon path={app.path} size={22} />
									<span className="start-row-name">{app.name}</span>
								</button>
							))}
						</div>
					))}
				</div>
			)}

			<div className="start-footer">
				<button className="start-user" onClick={onUser} title={t("Your info")}>
					<span className="start-avatar">{userName.charAt(0).toUpperCase()}</span>
					<span className="start-user-name">{userName}</span>
				</button>
				<div className="start-power">
					{powerOpen && (
						<div className="start-power-menu">
							{POWER_ACTIONS.map(({ id, name, icon: Icon }) => (
								<button
									key={id}
									className="start-power-item"
									onClick={() => {
										setPowerOpen(false);
										onAction(id);
									}}
								>
									<Icon size={16} strokeWidth={1.8} />
									{t(name)}
								</button>
							))}
						</div>
					)}
					<button
						className={`start-power-button ${powerOpen ? "open" : ""}`}
						onClick={() => setPowerOpen(!powerOpen)}
						title={t("Power")}
						aria-label={t("Power")}
					>
						<Power size={18} strokeWidth={1.8} />
					</button>
				</div>
			</div>
		</div>
	);
}
