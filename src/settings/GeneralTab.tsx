import {
	Power,
	Download,
	Clock,
	BatteryWarning,
	RefreshCw,
	RotateCcw,
	LogOut,
	Languages,
	Search,
	ArrowRightLeft,
	MousePointerClick
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingRow } from "./SettingRow";
import { LANGUAGES, t, useLanguage } from "../i18n";
import { invoke } from "@tauri-apps/api/core";
import { FILEE_URL, useFilee } from "../filee";

interface GeneralTabProps {
	autostart: boolean;
	toggleAutostart: () => void;
	timeFormat: string;
	handleTimeFormatChange: (value: string) => void;
	language: string;
	handleLanguageChange: (value: string) => void;
	launcherEnabled: boolean;
	toggleLauncher: () => void;
	fileeRadial: boolean;
	toggleFileeRadial: () => void;
	showUpdateIndicator: boolean;
	toggleUpdateIndicator: () => void;
	lowBatteryThreshold: number;
	handleThresholdChange: (val: number) => void;
	restartBloom: () => void;
	resetToDefaults: () => void;
	quitBloom: () => void;
}

export function GeneralTab({
	autostart,
	toggleAutostart,
	timeFormat,
	handleTimeFormatChange,
	language,
	handleLanguageChange,
	launcherEnabled,
	toggleLauncher,
	fileeRadial,
	toggleFileeRadial,
	showUpdateIndicator,
	toggleUpdateIndicator,
	lowBatteryThreshold,
	handleThresholdChange,
	restartBloom,
	resetToDefaults,
	quitBloom
}: GeneralTabProps) {
	useLanguage();
	return (
		<>
			<div className="setting-group-label">{t("System")}</div>
			<div className="setting-group">
				<SettingRow icon={Languages} label={t("Language")} desc={t("Interface language")}>
					<select
						className="settings-select"
						value={language}
						onChange={(e) => handleLanguageChange(e.target.value)}
					>
						{LANGUAGES.map((option) => (
							<option key={option.value} value={option.value}>
								{option.value === "system" ? t(option.label) : option.label}
							</option>
						))}
					</select>
				</SettingRow>

				<SettingRow
					icon={Search}
					label={t("Search (Alt+Space)")}
					desc={t("Find apps, files, settings and actions, and calculate")}
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={launcherEnabled} onChange={toggleLauncher} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow icon={Power} label={t("Launch at Login")} desc={t("Open Bloom automatically")}>
					<label className="toggle-switch">
						<input type="checkbox" checked={autostart} onChange={toggleAutostart} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={Download}
					label={t("Update Indicator")}
					desc={t("Show green dot when update available")}
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={showUpdateIndicator} onChange={toggleUpdateIndicator} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={Clock}
					label={t("Clock Format")}
					desc={t("System follows Windows' regional format")}
				>
					<select
						className="settings-select"
						value={timeFormat}
						onChange={(e) => handleTimeFormatChange(e.target.value)}
					>
						<option value="system">{t("System")}</option>
						<option value="false">{t("12-hour")}</option>
						<option value="true">{t("24-hour")}</option>
					</select>
				</SettingRow>

				<SettingRow
					icon={BatteryWarning}
					label={t("Low Battery Alert")}
					desc={t("Trigger at {percent}%", { percent: lowBatteryThreshold })}
					divider={false}
				>
					<input
						type="range"
						min="5"
						max="50"
						step="5"
						value={lowBatteryThreshold}
						onChange={(e) => handleThresholdChange(parseInt(e.target.value))}
						className="settings-slider"
					/>
				</SettingRow>
			</div>

			<div className="setting-group-label">{t("File conversion")}</div>
			<div className="setting-group">
				<FileeRows radial={fileeRadial} toggleRadial={toggleFileeRadial} />
			</div>

			<div className="setting-group-label">{t("App")}</div>
			<div className="setting-group">
				<SettingRow
					icon={RotateCcw}
					label={t("Reset to Defaults")}
					desc={t("Restore all settings and restart Bloom")}
					action
					danger
					onClick={resetToDefaults}
				/>
				<SettingRow
					icon={RefreshCw}
					label={t("Restart Bloom")}
					desc={t("Reinitialize all components")}
					action
					onClick={restartBloom}
				/>
				<SettingRow
					icon={LogOut}
					label={t("Quit Bloom")}
					desc={t("Exit application completely")}
					action
					danger
					onClick={quitBloom}
					divider={false}
				/>
			</div>
		</>
	);
}

/**
 * Filee, which Bloom ships for converting files: what it is, its own window
 * (presets, optional engines), and the radial menu its app adds in the tray.
 */
function FileeRows({ radial, toggleRadial }: { radial: boolean; toggleRadial: () => void }) {
	useLanguage();
	const filee = useFilee();
	const status = filee.status;
	if (status && !status.installed) {
		return (
			<SettingRow
				icon={ArrowRightLeft}
				label="Filee"
				desc={t("Filee isn't included in this build of Bloom")}
				action
				divider={false}
				onClick={() => openUrl(FILEE_URL)}
			/>
		);
	}
	const version = status?.version ? t("Version {version}", { version: status.version }) : "";
	return (
		<>
			<SettingRow
				icon={ArrowRightLeft}
				label={t("Open Filee")}
				desc={[t("Presets, quality and optional engines"), version].filter(Boolean).join(" · ")}
				action
				onClick={() => invoke("filee_open_app").catch(() => {})}
			/>
			<SettingRow
				icon={MousePointerClick}
				label={t("Radial Menu")}
				desc={t("Hold Ctrl while dragging files to convert them anywhere")}
				divider={false}
			>
				<label className="toggle-switch">
					<input type="checkbox" checked={radial} onChange={toggleRadial} />
					<span className="slider"></span>
				</label>
			</SettingRow>
		</>
	);
}
