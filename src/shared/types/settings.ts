export type ThemeType = "light" | "dark" | "system"
export type LanguageType = "en" | "es" | "it"

export interface AppSettings {
	theme: ThemeType
	gameDirectory: string
	notifications: boolean
	autoUpdate: boolean
	minimizeToTray: boolean
	language: LanguageType
	steamcmdPath: string
	lastSyncDate: string | null
	setupComplete: boolean
	instancesDirectory: string | null
}
