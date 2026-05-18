import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle, Info, WarningCircle } from "@/components/ui/icons";
import * as anim from "@/lib/anim";
import { cn } from "@/lib/utils";

type ToastVariant = "default" | "success" | "destructive";

interface Toast {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const variantClasses: Record<ToastVariant, string> = {
  default: "border-border bg-card text-card-foreground",
  success: "border-primary/50 bg-card text-card-foreground",
  destructive: "border-destructive/60 bg-destructive text-destructive-foreground",
};

const variantIcon: Record<ToastVariant, React.ReactNode> = {
  default: <Info size={18} className="text-muted-foreground" />,
  success: <CheckCircle size={18} className="text-primary" />,
  destructive: <WarningCircle size={18} className="text-destructive-foreground" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, variant = "default" }: ToastInput) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, title, description, variant }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-80 flex-col gap-2"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 48, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 48, scale: 0.85 }}
              transition={anim.snappy}
              role={t.variant === "destructive" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-lg border p-3.5 shadow-lg",
                variantClasses[t.variant],
              )}
            >
              <span className="mt-0.5 shrink-0">{variantIcon[t.variant]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.description ? <p className="mt-1 text-xs opacity-80">{t.description}</p> : null}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                className="-mr-1 -mt-1 shrink-0 rounded p-1 text-xs opacity-60 transition-opacity hover:opacity-100"
                onClick={() => dismiss(t.id)}
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
