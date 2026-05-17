import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Manifest } from "@/types/modpack";

/** Pure presentational preview of a parsed .knoxpack manifest. */
export function ImportPreview({ manifest }: { manifest: Manifest }) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {manifest.name}{" "}
          <span className="text-sm font-normal text-muted-foreground">v{manifest.version}</span>
        </CardTitle>
        <CardDescription>
          {manifest.author} · {manifest.game_version}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {manifest.description ? (
          <p className="text-sm text-foreground">{manifest.description}</p>
        ) : null}

        <section>
          <h4 className="mb-2 text-sm font-semibold">
            {t("modpack.import.workshopItems")} ({manifest.workshop_items.length})
          </h4>
          <ul className="flex flex-col gap-1">
            {manifest.workshop_items.map((item) => (
              <li
                key={item.workshop_id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="truncate">
                  {item.display_name}{" "}
                  <span className="text-xs text-muted-foreground">#{item.workshop_id}</span>
                </span>
                {item.required ? (
                  <span className="ml-2 shrink-0 rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    {t("modpack.import.required")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h4 className="mb-2 text-sm font-semibold">{t("modpack.import.loadOrder")}</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <LoadOrderList label="Mods" entries={manifest.mod_load_order} />
            <LoadOrderList label="Maps" entries={manifest.map_load_order} />
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function LoadOrderList({ label, entries }: { label: string; entries: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ol className="list-decimal pl-5 text-sm">
          {entries.map((entry) => (
            <li key={entry} className="font-mono">
              {entry}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
