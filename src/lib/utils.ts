/**
 * Minimal class-name joiner (clsx-like) with zero dependencies.
 *
 * Accepts strings, numbers, conditional objects, and nested arrays; falsy
 * values are skipped. This intentionally does NOT deduplicate or resolve
 * conflicting Tailwind utilities (no tailwind-merge) — keep call sites tidy.
 */
export type ClassValue =
  | string
  | number
  | false
  | null
  | undefined
  | ClassValue[]
  | { [key: string]: boolean | null | undefined };

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];

  const walk = (value: ClassValue): void => {
    if (!value && value !== 0) return;
    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value === "object") {
      for (const key in value) {
        if (value[key]) out.push(key);
      }
    }
  };

  for (const input of inputs) walk(input);
  return out.join(" ");
}
