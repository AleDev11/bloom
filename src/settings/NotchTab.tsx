import {
	PanelTop,
	Calendar,
	BellRing,
	Music,
	Minimize2,
	LayoutList,
	Sparkles,
	Circle,
	CloudSun,
	Timer,
	Archive,
	X
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { StatusWidgetConfig } from "../components/StatusWidgetConfig";
import type { WidgetConfig } from "./types";
import { t, useLanguage } from "../i18n";

interface NotchTabProps {
	notchMode: string;
	setNotchModeValue: (mode: string) => void;
	notchEdgeDelay: number;
	handleNotchEdgeDelayChange: (val: number) => void;
	calendarEnabled: boolean;
	toggleCalendar: () => void;
	notchRememberPanel: boolean;
	toggleNotchRememberPanel: () => void;
	notchDefaultPanel: "calendar" | "command-center";
	changeNotchDefaultPanel: (panel: "calendar" | "command-center") => void;
	timerSoundEnabled: boolean;
	toggleTimerSound: () => void;
	musicModeEnabled: boolean;
	toggleMusicMode: () => void;
	musicCompactNotch: boolean;
	toggleMusicCompactNotch: () => void;
	shelfPersist: boolean;
	toggleShelfPersist: () => void;
	mediaLayout: "classic" | "compact";
	toggleMediaLayout: (layout: "classic" | "compact") => void;
	mediaAmbienceEnabled: boolean;
	toggleAmbience: () => void;
	mediaCompactGlowEnabled: boolean;
	toggleCompactGlow: () => void;
	weatherEnabled: boolean;
	toggleWeather: () => void;
	tempUnitFahrenheit: boolean;
	toggleTempUnit: () => void;
	cityName: string;
	setCityName: (name: string) => void;
	citySearchResults: Array<{ name: string; country: string; latitude: number; longitude: number }>;
	showCityDropdown: boolean;
	setShowCityDropdown: (show: boolean) => void;
	selectCity: (city: {
		name: string;
		country: string;
		latitude: number;
		longitude: number;
	}) => void;
	handleCityClear: () => void;
	statusWidgets: WidgetConfig;
	handleWidgetsChange: (config: WidgetConfig) => void;
}

export function NotchTab({
	notchMode,
	setNotchModeValue,
	notchEdgeDelay,
	handleNotchEdgeDelayChange,
	calendarEnabled,
	toggleCalendar,
	notchRememberPanel,
	toggleNotchRememberPanel,
	notchDefaultPanel,
	changeNotchDefaultPanel,
	timerSoundEnabled,
	toggleTimerSound,
	musicModeEnabled,
	toggleMusicMode,
	musicCompactNotch,
	toggleMusicCompactNotch,
	shelfPersist,
	toggleShelfPersist,
	mediaLayout,
	toggleMediaLayout,
	mediaAmbienceEnabled,
	toggleAmbience,
	mediaCompactGlowEnabled,
	toggleCompactGlow,
	weatherEnabled,
	toggleWeather,
	tempUnitFahrenheit,
	toggleTempUnit,
	cityName,
	setCityName,
	citySearchResults,
	showCityDropdown,
	setShowCityDropdown,
	selectCity,
	handleCityClear,
	statusWidgets,
	handleWidgetsChange
}: NotchTabProps) {
	useLanguage();
	return (
		<>
			<div className="setting-group-label">{t("Notch")}</div>
			<div className="setting-group">
				<SettingRow
					icon={PanelTop}
					label={t("Notch Behavior")}
					desc={t("Choose how the notch appears")}
				>
					<select
						className="settings-select"
						value={notchMode}
						onChange={(e) => setNotchModeValue(e.target.value)}
					>
						<option value="fixed">{t("Fixed")}</option>
						<option value="smart">{t("Smart")}</option>
						<option value="peek">{t("Peek")}</option>
					</select>
				</SettingRow>

				{notchMode !== "fixed" && (
					<SettingRow
						icon={Timer}
						label={t("Peek Delay")}
						desc={
							notchEdgeDelay === 0
								? t("Reveal instantly on top-edge contact")
								: t("Rest on the top edge for {delay}ms to reveal", { delay: notchEdgeDelay })
						}
					>
						<input
							type="range"
							min="0"
							max="800"
							step="50"
							value={notchEdgeDelay}
							onChange={(e) => handleNotchEdgeDelayChange(parseInt(e.target.value))}
							className="settings-slider"
						/>
					</SettingRow>
				)}

				<SettingRow
					icon={PanelTop}
					label={t("Remember Last Panel")}
					desc={t("Reopen the panel you last used; turn off to choose a fixed default")}
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={notchRememberPanel} onChange={toggleNotchRememberPanel} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{!notchRememberPanel && (
					<SettingRow
						icon={PanelTop}
						label={t("Default Panel")}
						desc={t("Open this panel when you click the notch")}
					>
						<select
							className="settings-select"
							value={calendarEnabled ? notchDefaultPanel : "command-center"}
							onChange={(e) =>
								changeNotchDefaultPanel(e.target.value as "calendar" | "command-center")
							}
						>
							<option value="calendar" disabled={!calendarEnabled}>
								{t("Calendar")}
							</option>
							<option value="command-center">{t("Command Center")}</option>
						</select>
					</SettingRow>
				)}

				<SettingRow
					icon={Calendar}
					label={t("Calendar & Timer")}
					desc={t("Enable productivity split-view")}
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={calendarEnabled} onChange={toggleCalendar} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{calendarEnabled && (
					<SettingRow
						icon={BellRing}
						label={t("Timer Sound")}
						desc={t("Play a chime when the timer finishes")}
					>
						<label className="toggle-switch">
							<input type="checkbox" checked={timerSoundEnabled} onChange={toggleTimerSound} />
							<span className="slider"></span>
						</label>
					</SettingRow>
				)}

				<SettingRow icon={Music} label={t("Music Mode")} desc={t("Interactive live music widget")}>
					<label className="toggle-switch">
						<input type="checkbox" checked={musicModeEnabled} onChange={toggleMusicMode} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{musicModeEnabled && (
					<>
						<SettingRow
							icon={Minimize2}
							label={t("Compact Mode")}
							desc={t("Show visualizer & artwork when collapsed")}
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={musicCompactNotch}
									onChange={toggleMusicCompactNotch}
								/>
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow
							icon={LayoutList}
							label={t("Media Layout")}
							desc={t("Choose expanded player style")}
						>
							<div className="unit-toggle-minimal wide">
								<span
									className={mediaLayout === "classic" ? "active" : ""}
									onClick={() => toggleMediaLayout("classic")}
								>
									{t("Classic")}
								</span>
								<span
									className={mediaLayout === "compact" ? "active" : ""}
									onClick={() => toggleMediaLayout("compact")}
								>
									{t("Compact")}
								</span>
							</div>
						</SettingRow>

						<SettingRow
							icon={Sparkles}
							label={t("Ambient Glow")}
							desc={t("Colored glow behind expanded album art")}
						>
							<label className="toggle-switch">
								<input type="checkbox" checked={mediaAmbienceEnabled} onChange={toggleAmbience} />
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow
							icon={Circle}
							label={t("Compact Glow")}
							desc={t("Glow around collapsed thumbnail")}
							divider={false}
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={mediaCompactGlowEnabled}
									onChange={toggleCompactGlow}
								/>
								<span className="slider"></span>
							</label>
						</SettingRow>
					</>
				)}
			</div>

			<div className="setting-group-label">{t("Shelf")}</div>
			<div className="setting-group">
				<SettingRow
					icon={Archive}
					label={t("Keep Items")}
					desc={t("Keep shelf items after Bloom closes")}
					divider={false}
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={shelfPersist} onChange={toggleShelfPersist} />
						<span className="slider"></span>
					</label>
				</SettingRow>
			</div>

			<div className="setting-group-label">{t("Weather")}</div>
			<div className="setting-group">
				<SettingRow
					icon={CloudSun}
					label={t("Weather Status")}
					desc={cityName || t("Auto-detect location")}
				>
					<div className="weather-controls">
						<div className="unit-toggle-minimal" onClick={toggleTempUnit}>
							<span className={!tempUnitFahrenheit ? "active" : ""}>C</span>
							<span className={tempUnitFahrenheit ? "active" : ""}>F</span>
						</div>
						<label className="toggle-switch">
							<input type="checkbox" checked={weatherEnabled} onChange={toggleWeather} />
							<span className="slider"></span>
						</label>
					</div>
				</SettingRow>

				{weatherEnabled && (
					<div className="manual-city-input">
						<div className="city-input-row">
							<input
								type="text"
								placeholder={t("Search city...")}
								value={cityName}
								onChange={(e) => setCityName(e.target.value)}
								onFocus={() => citySearchResults.length > 0 && setShowCityDropdown(true)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && citySearchResults.length > 0) {
										e.preventDefault();
										selectCity(citySearchResults[0]);
									}
									if (e.key === "Escape") {
										setShowCityDropdown(false);
									}
								}}
								onBlur={() => setTimeout(() => setShowCityDropdown(false), 150)}
							/>
							{cityName && (
								<button
									className="city-clear-btn"
									onMouseDown={(e) => {
										e.preventDefault();
										handleCityClear();
									}}
									title={t("Clear city")}
								>
									<X size={10} strokeWidth={2.5} />
								</button>
							)}
						</div>
						{showCityDropdown && citySearchResults.length > 0 && (
							<div className="city-dropdown">
								{citySearchResults.map((city) => (
									<button
										key={`${city.name}-${city.latitude}`}
										className="city-dropdown-item"
										onMouseDown={(e) => {
											e.preventDefault();
											selectCity(city);
										}}
									>
										<span className="city-dropdown-name">{city.name}</span>
										<span className="city-dropdown-country">{city.country}</span>
									</button>
								))}
							</div>
						)}
					</div>
				)}
			</div>

			<div className="setting-group-label">Widgets</div>
			<div className="setting-group">
				<StatusWidgetConfig value={statusWidgets} onChange={handleWidgetsChange} />
			</div>
		</>
	);
}
