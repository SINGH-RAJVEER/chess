import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

export type GameSettings = {
	boardTheme: string;
	pieceTheme: string;
	soundEnabled: boolean;
	showCoordinates: boolean;
	moveAnimation: boolean;
	autoQueen: boolean;
	showLegalMoves: boolean;
	showLastMove: boolean;
	boardFlipped: boolean;
};

const DEFAULT_SETTINGS: GameSettings = {
	boardTheme: "green",
	pieceTheme: "cburnett",
	soundEnabled: true,
	showCoordinates: true,
	moveAnimation: true,
	autoQueen: false,
	showLegalMoves: true,
	showLastMove: true,
	boardFlipped: false,
};

const STORAGE_KEY = "chess_settings";

type SettingsContextType = {
	settings: GameSettings;
	updateSettings: (partial: Partial<GameSettings>) => void;
	resetSettings: () => void;
};

const SettingsContext = createContext<SettingsContextType>({
	settings: DEFAULT_SETTINGS,
	updateSettings: () => {},
	resetSettings: () => {},
});

function loadSettings(): GameSettings {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
		}
	} catch {
		// ignore parse errors
	}
	return DEFAULT_SETTINGS;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
	const [settings, setSettings] = useState<GameSettings>(loadSettings);

	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	}, [settings]);

	const updateSettings = useCallback((partial: Partial<GameSettings>) => {
		setSettings((prev) => ({ ...prev, ...partial }));
	}, []);

	const resetSettings = useCallback(() => {
		setSettings(DEFAULT_SETTINGS);
	}, []);

	return (
		<SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
			{children}
		</SettingsContext.Provider>
	);
}

export function useSettings() {
	return useContext(SettingsContext);
}
