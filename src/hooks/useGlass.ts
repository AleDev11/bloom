import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useSettingsSync } from "./useSettingsSync";

/** A concave flare's fillet: the material is the rect minus the quarter-disc
 *  centered at (cx, cy), one corner of the rect. */
interface Fillet {
	cx: number;
	cy: number;
	r: number;
}

interface Piece {
	x: number;
	y: number;
	w: number;
	h: number;
	/** Corner radii, TL TR BR BL (pills). */
	radii: [number, number, number, number];
	fillet?: Fillet;
}

export type GlassEdge = "top" | "bottom" | "left" | "right";

/** One surface: the element whose border-radius is the pill, the screen edge
 *  it hangs from, and whether the concave flares are showing. */
export interface GlassSurface {
	pill: HTMLElement | null;
	edge: GlassEdge;
	flares: boolean;
}

/** Flare geometry, mirroring components/EdgeSurface.css: a 13px fillet plus
 *  a 1px overlap into the pill. The disc's center sits in the flare box
 *  corner named by the edge case, at radius 13. */
const FLARE = 13;
const OVERLAP = 1;

/**
 * The "Glass" setting (Appearance, `bloom-glass`, on by default). Mirrors it
 * on <html class="glass"> so the CSS switches material with it.
 */
export function useGlassEnabled(): boolean {
	const [on, setOn] = useState(() => localStorage.getItem("bloom-glass") !== "false");
	useSettingsSync({ "bloom-glass": (v) => setOn(v !== false && v !== "false") });
	useEffect(() => {
		document.documentElement.classList.toggle("glass", on);
	}, [on]);
	return on;
}

function measure(el: HTMLElement): DOMRect | null {
	const b = el.getBoundingClientRect();
	if (b.width < 2 || b.height < 2) return null;
	const cs = getComputedStyle(el);
	if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) < 0.05)
		return null;
	return b;
}

/** The pill piece: the rect plus its four corner radii. */
function pillPiece(el: HTMLElement): Piece | null {
	const b = measure(el);
	if (!b) return null;
	const cs = getComputedStyle(el);
	// Radii are in the element's own pixels; a transform scales them too.
	const k = el.offsetWidth > 0 ? b.width / el.offsetWidth : 1;
	const radius = (v: string) => (parseFloat(v) || 0) * k;
	return {
		x: b.left,
		y: b.top,
		w: b.width,
		h: b.height,
		radii: [
			radius(cs.borderTopLeftRadius),
			radius(cs.borderTopRightRadius),
			radius(cs.borderBottomRightRadius),
			radius(cs.borderBottomLeftRadius)
		]
	};
}

/** A flare piece: the 13x14 (or 14x13) box beside a pill corner, minus the
 *  fillet disc that bridges it to the screen edge. */
function flarePiece(p: Piece, edge: GlassEdge, start: boolean): Piece {
	const { x: l, y: t, w, h } = p;
	const r = l + w;
	const b = t + h;
	const radii: [number, number, number, number] = [0, 0, 0, 0];
	switch (edge) {
		case "top":
			return start
				? { x: l - FLARE, y: t, w: FLARE + OVERLAP, h: FLARE, radii, fillet: { cx: l - FLARE, cy: t + FLARE, r: FLARE } }
				: { x: r - OVERLAP, y: t, w: FLARE + OVERLAP, h: FLARE, radii, fillet: { cx: r + FLARE, cy: t + FLARE, r: FLARE } };
		case "bottom":
			return start
				? { x: l - FLARE, y: b - FLARE, w: FLARE + OVERLAP, h: FLARE, radii, fillet: { cx: l - FLARE, cy: b - FLARE, r: FLARE } }
				: { x: r - OVERLAP, y: b - FLARE, w: FLARE + OVERLAP, h: FLARE, radii, fillet: { cx: r + FLARE, cy: b - FLARE, r: FLARE } };
		case "left":
			return start
				? { x: l, y: t - FLARE, w: FLARE, h: FLARE + OVERLAP, radii, fillet: { cx: l + FLARE, cy: t - FLARE, r: FLARE } }
				: { x: l, y: b - OVERLAP, w: FLARE, h: FLARE + OVERLAP, radii, fillet: { cx: l + FLARE, cy: b + FLARE, r: FLARE } };
		case "right":
			return start
				? { x: r - FLARE, y: t - FLARE, w: FLARE, h: FLARE + OVERLAP, radii, fillet: { cx: r - FLARE, cy: t - FLARE, r: FLARE } }
				: { x: r - FLARE, y: b - OVERLAP, w: FLARE, h: FLARE + OVERLAP, radii, fillet: { cx: r - FLARE, cy: b + FLARE, r: FLARE } };
	}
}

/**
 * Real frosted glass under this window's surfaces (see glass.rs). Every frame
 * the shapes of the surfaces `getSurfaces` returns go to the native backdrop
 * window, only when they changed, so the glass follows every animation that
 * grows, moves or reshapes a surface. Each surface is three pieces — the pill
 * and its two flare bridges — and a piece that is hidden (faded out, zero
 * size) is parked, keeping its slot so the native side never has to rebind.
 */
export function useGlass(getSurfaces: () => GlassSurface[], enabled: boolean) {
	const getRef = useRef(getSurfaces);
	getRef.current = getSurfaces;

	useEffect(() => {
		// Rust answers whether Windows really blurs (transparency effects on,
		// energy saver off). If not, the page keeps its plain look: <html
		// class="no-blur"> turns the glass styling off.
		const send = (pieces: (Piece | null)[]) =>
			invoke<boolean>("set_glass", { pieces })
				.then((live) => document.documentElement.classList.toggle("no-blur", !live))
				.catch(() => {});
		if (!enabled) {
			send([]);
			return;
		}
		let shown = "";
		let moved = "";
		let sinceSend = 0;
		let raf = 0;
		const tick = () => {
			const pieces: (Piece | null)[] = [];
			for (const surface of getRef.current()) {
				const pill = surface.pill ? pillPiece(surface.pill) : null;
				pieces.push(pill);
				if (pill && surface.flares) {
					pieces.push(flarePiece(pill, surface.edge, true), flarePiece(pill, surface.edge, false));
				} else {
					pieces.push(null, null);
				}
			}
			const key = JSON.stringify(pieces);
			// Re-sent now and then so a window move or a transparency change
			// (plugging in, leaving energy saver) brings the glass back.
			const at = `${window.screenX},${window.screenY}`;
			if (key !== shown || at !== moved || ++sinceSend > 90) {
				shown = key;
				moved = at;
				sinceSend = 0;
				send(pieces);
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(raf);
			send([]);
			document.documentElement.classList.remove("no-blur");
		};
	}, [enabled]);
}
