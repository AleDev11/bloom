import {
	Power,
	Download,
	Clock,
	BatteryWarning,
	RefreshCw,
	RotateCcw,
	LogOut,
	Languages
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { LANGUAGES, t, useLanguage } from "../i18n";

interface GeneralTabProps {
	autostart: boolean;
	toggleAutostart: () => void;
	timeFormat: string;
	handleTimeFormatChange: (value: string) => void;
	language: string;
	handleLanguageChange: (value: string) => void;
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
