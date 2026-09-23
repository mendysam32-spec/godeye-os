"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

export type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

let nextId = 1;

export function toast(message: string, kind: ToastKind = "success") {
  window.dispatchEvent(new CustomEvent("godeye:toast", { detail: { message, kind } }));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const { message, kind } = (e as CustomEvent).detail as { message: string; kind: ToastKind };
      const id = nextId++;
      setItems((prev) => [...prev.slice(-3), { id, message, kind }]);
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3200);
    }
    window.addEventListener("godeye:toast", onToast);
    return () => window.removeEventListener("godeye:toast", onToast);
  }, []);

  if (!items.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[110] space-y-2 w-[min(92vw,340px)]">
      {items.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-2.5 rounded-2xl border bg-card px-3.5 py-2.5 text-sm shadow-xl ${
            t.kind === "error" ? "border-red-200" : t.kind === "info" ? "border-border" : "border-emerald-200"
          }`}
        >
          {t.kind === "error" ? (
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
          ) : t.kind === "info" ? (
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
          )}
          <span className="flex-1 min-w-0 break-words">{t.message}</span>
          <button onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))} className="p-0.5 rounded hover:bg-muted shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
