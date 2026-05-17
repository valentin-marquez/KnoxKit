import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import esCL from "@/locales/es-CL.json";

export const resources = {
  en: { translation: en },
  "es-CL": { translation: esCL },
} as const;

export type Locale = keyof typeof resources;

i18next.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  defaultNS: "translation",
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

export default i18next;
