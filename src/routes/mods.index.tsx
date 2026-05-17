import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { InstanceTile } from "@/components/instances/instance-tile";
import { Badge } from "@/components/ui/badge";
import { Download, Search } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/mods/")({
  component: ModsRoute,
});

interface Featured {
  id: string;
  name: string;
  blurb: string;
  downloads: string;
  tags: string[];
}

const FEATURED: Featured[] = [
  {
    id: "2392709985",
    name: "Brita's Weapon Pack",
    blurb: "Cientos de armas balanceadas con animaciones propias.",
    downloads: "1.4M",
    tags: ["Armas", "Balance"],
  },
  {
    id: "2169435993",
    name: "Authentic Z",
    blurb: "Ropa, mochilas y estética de supervivencia realista.",
    downloads: "980K",
    tags: ["Ropa"],
  },
  {
    id: "2282429356",
    name: "Superb Survivors!",
    blurb: "NPCs con los que reclutar, comerciar o pelear.",
    downloads: "2.1M",
    tags: ["NPC"],
  },
  {
    id: "2459070642",
    name: "Eris Minimap",
    blurb: "Minimapa configurable que respeta el cartografiado.",
    downloads: "1.1M",
    tags: ["UI", "Mapa"],
  },
  {
    id: "1374479835",
    name: "Filibuster's Vehicles",
    blurb: "Flota de vehículos nuevos con tuning y partes.",
    downloads: "760K",
    tags: ["Vehículos"],
  },
  {
    id: "2120111017",
    name: "Common Sense",
    blurb: "Interacciones lógicas que el vanilla olvidó.",
    downloads: "1.6M",
    tags: ["QoL"],
  },
];

function ModsRoute() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-3">
        <h1 className="font-display text-lg font-bold">{t("mods.title")}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("mods.subtitle")}</p>
      </div>

      <div className="border-b border-border px-5 py-2.5">
        <div className="relative max-w-md">
          <Search
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input placeholder={t("common.search")} className="h-8 rounded pl-8" disabled />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("mods.discover")}
        </h2>
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
          {FEATURED.map((m) => (
            <article
              key={m.id}
              className="flex gap-3 rounded-md border border-border bg-card p-3 hover:border-primary/50"
            >
              <InstanceTile name={m.name} className="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <h3 className="text-[13px] font-semibold">{m.name}</h3>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{m.blurb}</p>
                <div className="mt-2 flex items-center gap-1.5">
                  {m.tags.map((tag) => (
                    <Badge key={tag} tone="muted">
                      {tag}
                    </Badge>
                  ))}
                  <span className="ml-auto flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                    <Download size={12} />
                    {m.downloads}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">{t("mods.soon")}</p>
      </div>
    </div>
  );
}
