import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * What Windows says about language and clock, for settings left on "system".
 * Mirrors `SystemLocale` in src-tauri/src/types.rs. Until the backend answers,
 * the webview's own language stands in.
 */
export interface SystemLocale {
	language: "en" | "es";
	time_24h: boolean;
}

let current: SystemLocale = {
	language: navigator.language.toLowerCase().startsWith("es") ? "es" : "en",
	time_24h: false
};
const subscribers = new Set<() => void>();

function update(next: SystemLocale) {
	if (next.language === current.language && next.time_24h === current.time_24h) return;
	current = next;
	subscribers.forEach((notify) => notify());
}

invoke<SystemLocale>("get_system_locale")
	.then(update)
	.catch((err) => console.error("Failed to read the Windows locale:", err));
listen<SystemLocale>("system-locale-changed", (event) => update(event.payload));

/**
 * `bloom-time-format-24h`: "true" or "false" pick a clock; anything else
 * (unset, "system") follows Windows, returned as null.
 */
export function parseTimeFormat(value: unknown): boolean | null {
	if (value === true || value === "true") return true;
	if (value === false || value === "false") return false;
	return null;
}

export function getSystemLocale(): SystemLocale {
	return current;
}

export function subscribeSystemLocale(notify: () => void): () => void {
	subscribers.add(notify);
	return () => {
		subscribers.delete(notify);
	};
}

export function useSystemLocale(): SystemLocale {
	return useSyncExternalStore(subscribeSystemLocale, getSystemLocale);
}
