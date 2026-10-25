import { Download, RefreshCw, FileDown, Upload } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { GithubIcon } from "../icons";
import { SettingRow } from "./SettingRow";
import { t, useLanguage } from "../i18n";

interface AboutTabProps {
	appVersion: string;
	autoUpdate: boolean;
	toggleAutoUpdate: () => void;
	updateStatus: string;
	updateVersion: string;
	checkForUpdates: () => void;
	installUpdate: () => void;
	exportStatus: string;
	importStatus: string;
	handleExportSettings: () => void;
	handleImportSettings: () => void;
}

export function AboutTab({
	appVersion,
	autoUpdate,
	toggleAutoUpdate,
	updateStatus,
	updateVersion,
	checkForUpdates,
	installUpdate,
	exportStatus,
	importStatus,
	handleExportSettings,
	handleImportSettings
}: AboutTabProps) {
	useLanguage();
	const getUpdateLabel = () => {
		switch (updateStatus) {
			case "checking":
				return t("Checking...");
			case "available":
				return t("Update Available (v{version})", { version: updateVersion });
			case "uptodate":
				return t("Bloom is up to date");
			case "downloading":
				return t("Downloading Update...");
			case "installing":
				return t("Installing...");
			case "error":
				return t("No updates found");
			default:
				return t("Check for Updates");
		}
	};

	const getUpdateDesc = () =>
		updateStatus === "available"
			? t("Click to install and restart")
			: t("Currently running v{version}", { version: appVersion });

	const getExportLabel = () => {
		if (exportStatus === "exporting") return t("Exporting...");
		if (exportStatus === "success") return t("Exported!");
		if (exportStatus === "error") return t("Export failed. Try again.");
		return t("Export Settings");
	};

	const getImportLabel = () => {
		if (importStatus === "importing") return t("Importing...");
		if (importStatus === "success") return t("Imported!");
		if (importStatus === "error") return t("Import failed. Check the file and try again.");
		return t("Import Settings");
	};

	return (
		<div className="about-tab-container">
			<div className="about-header">
				<img src="/bloom.png" className="about-logo" alt={t("Bloom Logo")} draggable={false} />
				<h1 className="about-title">Bloom</h1>
				<p className="about-version">{t("Version {version}", { version: appVersion })}</p>
				<p className="about-credit">
					{t("Made with")} <span className="about-heart">❤️</span> {t("by")}{" "}
					<button
						className="about-author"
						onClick={() => openUrl("https://github.com/SehajveerSingh2005")}
						title={t("sehaz on GitHub")}
					>
						<GithubIcon size={12} />
						<span>sehaz</span>
					</button>
				</p>
			</div>

			<div className="setting-group-label">{t("Software Updates")}</div>
			<div className="setting-group">
				<SettingRow
					icon={Download}
					label={t("Auto Update")}
					desc={t("Update automatically on startup")}
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={autoUpdate} onChange={toggleAutoUpdate} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={RefreshCw}
					label={getUpdateLabel()}
					desc={getUpdateDesc()}
					action
					divider={false}
					onClick={() => (updateStatus === "available" ? installUpdate() : checkForUpdates())}
				/>
			</div>

			<div className="setting-group-label setting-group-label--spaced">{t("Data")}</div>
			<div className="setting-group">
				<SettingRow
					icon={FileDown}
					label={getExportLabel()}
					desc={t("Save settings to a file")}
					action
					onClick={handleExportSettings}
				/>
				<SettingRow
					icon={Upload}
					label={getImportLabel()}
					desc={t("Load settings from a file")}
					action
					divider={false}
					onClick={handleImportSettings}
				/>
			</div>
		</div>
	);
}
