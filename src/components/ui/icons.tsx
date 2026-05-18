/**
 * Icon set — thin wrappers over Phosphor Icons so call sites keep a small
 * `{ size, className, filled }` API and names stay path-relative
 * (`import { Grid } from "@/components/ui/icons"`).
 */
import {
  ArrowClockwise,
  CaretDown,
  CaretLeft,
  CaretRight,
  CheckCircle as CheckCirclePh,
  DotsThreeVertical,
  DownloadSimple,
  FolderOpen,
  GearSix,
  GridFour,
  Info as InfoPh,
  MagnifyingGlass,
  Monitor as MonitorPh,
  Moon as MoonPh,
  Package,
  type Icon as PhosphorIcon,
  Play as PlayPh,
  Plus as PlusPh,
  Star as StarPh,
  Sun as SunPh,
  WarningCircle as WarningCirclePh,
} from "@phosphor-icons/react";

interface IconProps {
  size?: number;
  className?: string;
}

type Weight = "regular" | "bold" | "fill";

function wrap(C: PhosphorIcon, weight: Weight = "fill") {
  return ({ size = 18, className }: IconProps) => (
    <C size={size} className={className} weight={weight} />
  );
}

export const Grid = wrap(GridFour);
export const Box = wrap(Package);
export const Download = wrap(DownloadSimple);
export const Gear = wrap(GearSix);
export const Play = wrap(PlayPh);
export const Folder = wrap(FolderOpen);
export const Search = wrap(MagnifyingGlass, "bold");
export const ChevronLeft = wrap(CaretLeft, "bold");
export const ChevronRight = wrap(CaretRight, "bold");
export const ChevronDown = wrap(CaretDown, "bold");
export const Sun = wrap(SunPh);
export const Moon = wrap(MoonPh);
export const Monitor = wrap(MonitorPh);
export const Plus = wrap(PlusPh, "bold");
export const Dots = wrap(DotsThreeVertical, "bold");
export const Refresh = wrap(ArrowClockwise, "bold");
export const CheckCircle = wrap(CheckCirclePh);
export const WarningCircle = wrap(WarningCirclePh);
export const Info = wrap(InfoPh);

export const Star = ({ size = 18, className, filled }: IconProps & { filled?: boolean }) => (
  <StarPh size={size} className={className} weight={filled ? "fill" : "bold"} />
);
