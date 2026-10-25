import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import { es } from "./es";
import { getSystemLocale, subscribeSystemLocale } from "../systemLocale";

/**
 * UI translations. English text is the key: `t("Wi-Fi networks")` returns the
 * entry from the active language's dictionary, or the English text itself
 * when there is none, so an untranslated string never shows up blank.
 * Placeholders such as `{count}` are filled from `vars`.
 *
 * `bloom-language` is "system" (the Windows display language), "en" or "es".
 * Each webview keeps its own copy and follows the setting live.
 */
export type Language = "en" | "es";

export const LANGUAGES: { value: string; label: string }[] = [
	{ value: "system", label: "System" },
	{ value: "en", label: "English" },
	{ value: "es", label: "Español" }
];

const dictionaries: Record<Language, Record<string, string>> = { en: {}, es };

const LOCALES: Record<Language, string> = { en: "en-US", es: "es-ES" };

function resolve(setting: string | null): Language {
	if (setting === "en" || setting === "es") return setting;
	return getSystemLocale().language;
}

let setting: string | null = localStorage.getItem("bloom-language");
let current: Language = resolve(setting);
document.documentElement.lang = current;
const subscribers = new Set<() => void>();

function refresh() {
	const next = resolve(setting);
	if (next === current) return;
	current = next;
	document.documentElement.lang = next;
	subscribers.forEach((notify) => notify());
}

const onSettingEvent = (event: { payload: { key: string; value: unknown } }) => {
	if (event.payload.key !== "bloom-language") return;
	setting = event.payload.value == null ? null : String(event.payload.value);
	refresh();
};
listen("settings-changed", onSettingEvent);
listen("settings-external-changed", onSettingEvent);
// "system" follows the Windows display language as the backend reports it.
subscribeSystemLocale(refresh);

function fill(text: string, vars?: Record<string, string | number>): string {
	if (!vars) return text;
	return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

export function t(text: string, vars?: Record<string, string | number>): string {
	return fill(dictionaries[current][text] ?? text, vars);
}

/**
 * Like `t`, for an English word that translates differently by where it
 * appears: the timer's "Start" is "Iniciar", the Start button is "Inicio".
 * Looks up "context|text" first, then plain `text`.
 */
export function tc(context: string, text: string, vars?: Record<string, string | number>): string {
	const dictionary = dictionaries[current];
	return fill(dictionary[`${context}|${text}`] ?? dictionary[text] ?? text, vars);
}

/** BCP 47 locale for dates and numbers in the active language. */
export function locale(): string {
	return LOCALES[current];
}

function subscribe(notify: () => void) {
	subscribers.add(notify);
	return () => {
		subscribers.delete(notify);
	};
}

/** Re-renders the calling component when the language changes. */
export function useLanguage(): Language {
	return useSyncExternalStore(subscribe, () => current);
}
