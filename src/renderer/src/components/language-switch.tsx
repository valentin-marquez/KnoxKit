import { CheckIcon, GlobeAltIcon } from "@heroicons/react/24/outline"
import { Button } from "@renderer/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger
} from "@renderer/components/ui/dropdown-menu"
import { useTranslation } from "@renderer/hooks/useTranslation"

export default function LanguageSwitcher() {
	const { language, changeLanguage, availableLanguages } = useTranslation()

	const languageNames: Record<string, string> = {
		en: "English",
		es: "Español",
		it: "Italiano"
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="flex items-center gap-2">
					<GlobeAltIcon className="h-4 w-4" />
					<span>{languageNames[language] || language}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-[120px]">
				{availableLanguages.map((lang) => (
					<DropdownMenuItem
						key={lang}
						onClick={() => changeLanguage(lang)}
						className="flex items-center justify-between"
					>
						{languageNames[lang] || lang}
						{language === lang && <CheckIcon className="h-4 w-4 ml-2" />}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
