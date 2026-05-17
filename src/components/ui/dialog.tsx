import { useEffect } from "react";
import { cn } from "@/lib/utils";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Lightweight modal dialog. Closes on Escape and backdrop click; renders an
 * inert backdrop over the page. No external UI library.
 */
export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-black/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative w-full max-w-lg rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xl",
          className,
        )}
      >
        {title ? (
          <h2 className="text-lg font-semibold leading-none tracking-tight">{title}</h2>
        ) : null}
        {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
        <div className={cn(title || description ? "mt-4" : undefined)}>{children}</div>
      </div>
    </div>
  );
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-6 flex items-center justify-end gap-2", className)} {...props} />;
}
