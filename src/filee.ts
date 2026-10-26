import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Filee, the offline file converter Bloom ships (vendor/filee). The shelf and
 * the launcher convert with it; its app adds the radial menu (Ctrl + drag).
 * Mirrors the commands and types in src-tauri/src/filee.rs.
 */
export interface FileeStatus {
	installed: boolean;
	path: string | null;
	/** Shipped with Bloom, rather than installed by Filee's own setup. */
	bundled: boolean;
	version: string | null;
}

export interface ConvertResult {
	ok: boolean;
	outputs: string[];
	error: string | null;
}

export const FILEE_URL = "https://github.com/KnifeLemon/Filee";

export function fileeTargets(path: string): Promise<string[]> {
	return invoke<string[]>("filee_targets", { path }).catch(() => []);
}

export function fileeConvert(path: string, to: string): Promise<ConvertResult> {
	return invoke<ConvertResult>("filee_convert", { path, to }).catch((e) => ({
		ok: false,
		outputs: [],
		error: String(e)
	}));
}

/** Opens Filee's own radial menu for a file, with all its formats and presets. */
export function fileeOpenRadial(path: string): Promise<void> {
	return invoke<void>("filee_open_radial", { path });
}

/** Format ids read as their usual names: "jpg" → "JPG". */
export function formatLabel(id: string): string {
	return id.toUpperCase();
}

/** Filee's status; `refresh` reads it again. */
export function useFilee() {
	const [status, setStatus] = useState<FileeStatus | null>(null);
	const refresh = useCallback(() => {
		invoke<FileeStatus>("filee_status")
			.then(setStatus)
			.catch(() => {});
	}, []);
	useEffect(() => refresh(), [refresh]);
	return { status, refresh };
}
