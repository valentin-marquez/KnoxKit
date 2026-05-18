import { useState } from "react";
import { assetUrl } from "@/lib/tauri/asset";
import { cn } from "@/lib/utils";
import type { Instance } from "@/types/instance";
import { InstanceTile } from "./instance-tile";

/**
 * Renders an instance's icon (`<instance>/icon.png`, served via the Tauri
 * asset protocol) and falls back to the {@link InstanceTile} monogram when
 * there is no icon or the image fails to load (e.g. the asset-protocol scope
 * is not yet widened — see NOTES.md). Same shape/rounding as the tile so it
 * drops into the existing card/detail layout unchanged.
 */
export function InstanceIcon({
  instance,
  className,
}: {
  instance: Pick<Instance, "name" | "path" | "icon_path">;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (!instance.icon_path || broken) {
    return <InstanceTile name={instance.name} className={className} />;
  }

  // `path` is the absolute instance folder; `icon_path` is relative ("icon.png").
  const src = assetUrl(`${instance.path}/${instance.icon_path}`);

  return (
    <img
      src={src}
      alt={instance.name}
      onError={() => setBroken(true)}
      className={cn("shrink-0 rounded-[0.6rem] border border-border object-cover", className)}
    />
  );
}
