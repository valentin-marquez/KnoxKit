import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Custom dropdown styled to match the toolbar controls. Controlled purely
 * via `value`/`onChange` — there is no internal source of truth for the
 * selection. Renders as a compact `h-8` inline trigger with an optional
 * muted `label` prefix, plus a floating, keyboard-navigable listbox.
 */
export function Select({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Index visually highlighted while navigating; reset to the active option
  // each time the listbox opens. The DOM focus follows this index.
  const [activeIndex, setActiveIndex] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const close = useCallback((focusTrigger: boolean) => {
    setOpen(false);
    setActiveIndex(-1);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  const openList = useCallback(() => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [selectedIndex]);

  const commit = useCallback(
    (index: number) => {
      const opt = options[index];
      if (opt) onChange(opt.value);
      close(true);
    },
    [options, onChange, close],
  );

  // Close on outside click / Escape while the listbox is open. `document`
  // access is guarded by the early return so SSR never reaches it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  // Move DOM focus to the highlighted option (roving tabindex). This also
  // scrolls it into view and lets each option own its own key handling.
  useLayoutEffect(() => {
    if (!open || activeIndex < 0) return;
    const node = optionRefs.current[activeIndex];
    node?.focus();
    node?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp":
      case "Enter":
      case " ":
        e.preventDefault();
        openList();
        break;
    }
  }

  function onOptionKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % options.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + options.length) % options.length);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(index);
        break;
      case "Escape":
        e.preventDefault();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => (open ? close(true) : openList())}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card pl-3 pr-2 text-xs transition-colors hover:border-ring/50 focus-visible:border-ring focus-visible:outline-none",
          open && "border-ring",
          className,
        )}
      >
        {label && <span className="text-muted-foreground">{label}</span>}
        <span className="font-medium text-foreground">{selected?.label ?? ""}</span>
        <ChevronDown
          size={14}
          className={cn(
            "text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-60 min-w-full overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl"
        >
          {options.map((opt, index) => {
            const isSelected = opt.value === value;
            const isActive = index === activeIndex;
            return (
              <button
                key={opt.value}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                id={`${baseId}-opt-${index}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={isActive ? 0 : -1}
                onClick={() => commit(index)}
                onKeyDown={(e) => onOptionKeyDown(e, index)}
                onMouseMove={() => setActiveIndex(index)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:outline-none",
                  isActive ? "bg-accent text-foreground" : "text-muted-foreground",
                  isSelected && "font-medium text-foreground",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    isSelected ? "bg-primary" : "bg-transparent",
                  )}
                />
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
