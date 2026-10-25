/** Mirrors `BatteryDetails` in src-tauri/src/battery.rs. */
export interface BatteryDetails {
	present: boolean;
	percent: number | null;
	plugged_in: boolean;
	charging: boolean;
	seconds_left: number | null;
	seconds_to_full: number | null;
	health_percent: number | null;
	power_mode: string | null;
}

/**
 * Translates an English string, like `t` from ./i18n. Passed in rather than
 * imported so this file stays free of the webview-only i18n module (and
 * testable under Bun); the default leaves the English text as is.
 */
export type Translate = (text: string, vars?: Record<string, string | number>) => string;

const english: Translate = (text, vars) =>
	vars
		? text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match))
		: text;

/** Durations as the taskbar writes them: "3 hr 12 min", "45 min", "1 hr". */
export function formatDuration(seconds: number, t: Translate = english): string {
	const minutes = Math.max(1, Math.round(seconds / 60));
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours === 0) return t("{minutes} min", { minutes: rest });
	return rest === 0
		? t("{hours} hr", { hours })
		: t("{hours} hr {minutes} min", { hours, minutes: rest });
}

/**
 * The battery widget's tooltip: the taskbar battery icon's status line, then
 * what Windows' battery settings add. Until the details arrive (or on a
 * device that reports none), the status line comes from the webview's own
 * level and charging state.
 */
export function batteryTooltip(
	details: BatteryDetails | null,
	fallback: { level: number; charging: boolean },
	energySaver: boolean,
	t: Translate = english
): string {
	const percent = details?.percent ?? fallback.level;
	const charging = details ? details.charging : fallback.charging;
	const pluggedIn = details ? details.plugged_in : fallback.charging;
	const lines: string[] = [];

	if (pluggedIn && percent >= 100 && !charging) {
		lines.push(t("Fully charged ({percent}%)", { percent }));
	} else if (pluggedIn) {
		lines.push(
			charging
				? t("{percent}% available (plugged in, charging)", { percent })
				: t("{percent}% available (plugged in, not charging)", { percent })
		);
	} else if (details?.seconds_left) {
		lines.push(
			t("{duration} ({percent}%) remaining", {
				duration: formatDuration(details.seconds_left, t),
				percent
			})
		);
	} else {
		lines.push(t("{percent}% remaining", { percent }));
	}

	if (charging && details?.seconds_to_full) {
		lines.push(
			t("About {duration} until full", { duration: formatDuration(details.seconds_to_full, t) })
		);
	}
	// The backend names the power mode in English, as Windows' settings do.
	if (details?.power_mode) lines.push(t("Power mode: {mode}", { mode: t(details.power_mode) }));
	if (energySaver) lines.push(t("Energy saver is on"));
	if (details?.health_percent != null) {
		lines.push(
			t("Battery health: {percent}% of original capacity", { percent: details.health_percent })
		);
	}
	return lines.join("\n");
}
