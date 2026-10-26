import { useEffect, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { t, useLanguage } from "../i18n";
import { fileeConvert, fileeOpenRadial, fileeTargets, formatLabel, useFilee } from "../filee";

/**
 * The shelf's "Convert to…" card for one file: Filee's target formats as
 * chips, and Filee's own radial menu for everything else (presets, quality).
 * A converted file joins the shelf.
 */
export function ShelfConvert({
	name,
	path,
	onClose,
	onConverted
}: {
	name: string;
	path: string;
	onClose: () => void;
	onConverted: (outputs: string[], format: string) => void;
}) {
	useLanguage();
	const filee = useFilee();
	const [targets, setTargets] = useState<string[] | null>(null);
	const [converting, setConverting] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const installed = filee.status?.installed ?? false;

	useEffect(() => {
		if (!installed) return;
		let alive = true;
		setTargets(null);
		fileeTargets(path).then((list) => {
			if (alive) setTargets(list);
		});
		return () => {
			alive = false;
		};
	}, [installed, path]);

	const convert = async (format: string) => {
		setConverting(format);
		setError(null);
		const result = await fileeConvert(path, format);
		setConverting(null);
		if (result.ok && result.outputs.length > 0) onConverted(result.outputs, format);
		else setError(t(result.error ?? "Conversion failed"));
	};

	return (
		<div className="shelf-convert" onClick={(e) => e.stopPropagation()}>
			<div className="shelf-convert-header">
				<span className="shelf-convert-title">{t("Convert {name} to", { name })}</span>
				<button className="shelf-convert-close" onClick={onClose} aria-label={t("Close")}>
					<X size={12} strokeWidth={2.5} />
				</button>
			</div>

			{filee.status === null || (installed && targets === null) ? (
				<div className="shelf-convert-status">
					<Loader2 size={14} className="spin" />
				</div>
			) : !installed ? (
				<div className="shelf-convert-status">
					{t("Filee isn't included in this build of Bloom")}
				</div>
			) : (
				<>
					<div className="shelf-convert-formats">
						{targets?.length === 0 && (
							<span className="shelf-convert-status">
								{t("Filee can't convert this kind of file")}
							</span>
						)}
						{targets?.map((format) => (
							<button
								key={format}
								className={`shelf-convert-chip ${converting === format ? "busy" : ""}`}
								disabled={converting !== null}
								onClick={() => convert(format)}
							>
								{converting === format && <Loader2 size={11} className="spin" />}
								{formatLabel(format)}
							</button>
						))}
						{filee.status?.bundled && (
							<button
								className="shelf-convert-chip more"
								disabled={converting !== null}
								title={t("Presets, quality and more in Filee's radial menu")}
								onClick={() => {
									onClose();
									fileeOpenRadial(path).catch((e) => setError(t(String(e))));
								}}
							>
								<Sparkles size={11} />
								{t("More…")}
							</button>
						)}
					</div>
					{error && <span className="shelf-convert-error">{error}</span>}
				</>
			)}
		</div>
	);
}
