import en from "@shared/locales/en/translation.json"
import es from "@shared/locales/es/translation.json"
import it from "@shared/locales/it/translation.json"
import { atom } from "nanostores"
import { settingsStore } from "./settings-store"

const translations = {
	en,
	es,
	it
}

export const availableLanguages = ["en", "es", "it"]

export type Translations = typeof en

export const currentLanguage = atom<string>(
	settingsStore.get().language ||
		(typeof localStorage !== "undefined" ? localStorage.getItem("language") || "en" : "en")
)

currentLanguage.listen((lang) => {
	if (typeof localStorage !== "undefined") {
		localStorage.setItem("language", lang)
	}
})

export function getTranslation(obj: Record<string, unknown>, path: string): string {
	const keys = path.split(".")
	let current = obj

	for (const key of keys) {
		if (current && Object.prototype.hasOwnProperty.call(current, key)) {
			const value = current[key]
			if (typeof value === "object" && value !== null) {
				current = value as Record<string, unknown>
			} else {
				return typeof value === "string" ? value : path
			}
		} else {
			return path
		}
	}

	return typeof current === "string" ? current : path
}

export function interpolate(text: string, variables?: Record<string, string | number>): string {
	if (!variables) return text

	return text.replace(/{{(\w+)}}/g, (match, key) => {
		return variables[key] !== undefined ? String(variables[key]) : match
	})
}

export function translate(
	key: string,
	variables?: Record<string, string | number> | string,
	lang?: string
): string {
	let localVariables = variables
	let localLang = lang

	if (typeof variables === "string") {
		localLang = variables
		localVariables = undefined
	}

	const langToUse = localLang || currentLanguage.get()
	const translation = translations[langToUse as keyof typeof translations]
	const translatedText = getTranslation(translation, key)

	return localVariables
		? interpolate(translatedText, localVariables as Record<string, string | number>)
		: translatedText
}
