import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// Icons survive between openings; get_app_icon also caches them on disk.
const iconCache = new Map<string, string | null>();

/** The shell icon of an app or file path, as a data URI once loaded. */
export function useIcon(path: string | null): string | null {
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
