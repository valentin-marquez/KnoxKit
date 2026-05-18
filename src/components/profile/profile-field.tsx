import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import * as anim from "@/lib/anim";
import { useSettings, useUpdateSettings } from "@/lib/queries";
import type { Patch } from "@/types/settings";

/**
 * Editable Project Zomboid multiplayer username. Reads/writes the single
 * `profile_username` settings field (no password — none is ever stored).
 *
 * Empty/whitespace persists as `null` (mirrors the `"" → null` mapping the
 * paths form uses). On a successful write it flashes a transient "saved"
 * affirmation, then returns to idle.
 */
export function ProfileField({ onSaved }: { onSaved?: () => void }) {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();

  const stored = settings.data?.profile_username ?? "";
  const [draft, setDraft] = useState(stored);
  const [justSaved, setJustSaved] = useState(false);

  // Reseed the field whenever the persisted value changes (e.g. another
  // surface edited it, or the query first resolves).
  useEffect(() => {
    setDraft(settings.data?.profile_username ?? "");
  }, [settings.data?.profile_username]);

  const trimmed = draft.trim();
  const dirty = trimmed !== stored.trim();

  function save() {
    if (!dirty) return;
    const patch: Patch = { profile_username: trimmed === "" ? null : trimmed };
    update.mutate(patch, {
      onSuccess: () => {
        setJustSaved(true);
        window.setTimeout(() => setJustSaved(false), 2000);
        onSaved?.();
      },
    });
  }

  return (
    <div className="space-y-2">
      <label htmlFor="profile-username" className="block text-xs font-medium text-muted-foreground">
        {t("profile.username")}
      </label>
      <Input
        id="profile-username"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
        placeholder={t("profile.usernamePlaceholder")}
        className="h-8 text-xs"
        autoComplete="off"
      />
      <p className="text-[11px] leading-snug text-muted-foreground">{t("profile.usernameHint")}</p>
      <div className="flex items-center justify-end gap-2 pt-0.5">
        <AnimatePresence>
          {justSaved && (
            <motion.span
              key="saved"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={anim.elastic}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary"
            >
              <CheckCircle size={13} />
              {t("profile.saved")}
            </motion.span>
          )}
        </AnimatePresence>
        <Button size="sm" onClick={save} disabled={!dirty || update.isPending}>
          {t("profile.save")}
        </Button>
      </div>
    </div>
  );
}
