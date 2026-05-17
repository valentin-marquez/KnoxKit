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
  hue: number;
}

const FEATURED: Featured[] = [
  {
    id: "2392709985",
    name: "Brita's Weapon Pack",
    blurb: "Cientos de armas balanceadas con animaciones propias.",
    downloads: "1.4M",
    tags: ["Armas", "Balance"],
    hue: 16,
  },
  {
    id: "2169435993",
    name: "Authentic Z",
    blurb: "Ropa, mochilas y estética de supervivencia realista.",
    downloads: "980K",
    tags: ["Ropa", "Inmersión"],
    hue: 30,
  },
  {
    id: "2282429356",
    name: "Superb Survivors!",
    blurb: "NPCs con los que reclutar, comerciar o pelear.",
    downloads: "2.1M",
    tags: ["NPC", "Gameplay"],
    hue: 8,
  },
  {
    id: "2459070642",
    name: "Eris Minimap",
    blurb: "Minimapa configurable que respeta el cartografiado.",
    downloads: "1.1M",
    tags: ["UI", "Mapa"],
    hue: 42,
  },
  {
    id: "1374479835",
    name: "Filibuster's Vehicles",
    blurb: "Flota de vehículos nuevos con tuning y partes.",
    downloads: "760K",
    tags: ["Vehículos"],
    hue: 22,
  },
  {
    id: "2120111017",
    name: "Common Sense",
    blurb: "Interacciones lógicas que el vanilla olvidó.",
    downloads: "1.6M",
    tags: ["QoL"],
    hue: 36,
  },
];

function ModsRoute() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-[1100px] px-7 py-7">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">{t("mods.title")}</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("mods.subtitle")}</p>
      </header>

      <div className="relative mt-5 max-w-xl">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input placeholder={t("common.search")} className="h-10 rounded-lg pl-9" disabled />
      </div>

      <h2 className="mb-3 mt-8 font-typewriter text-xs uppercase tracking-widest text-muted-foreground">
        {t("mods.discover")}
      </h2>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
        {FEATURED.map((m, i) => (
          <article
            key={m.id}
            className="rise flex gap-3.5 rounded-xl border border-border bg-card p-4"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <InstanceTile name={m.name} hue={m.hue} className="h-14 w-14 text-2xl" />
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-sm font-semibold">{m.name}</h3>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{m.blurb}</p>
              <div className="mt-2.5 flex items-center gap-1.5">
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

      <p className="mt-8 text-center font-typewriter text-xs text-muted-foreground">
        {"// "}
        {t("mods.soon")}
      </p>
    </div>
  );
}
