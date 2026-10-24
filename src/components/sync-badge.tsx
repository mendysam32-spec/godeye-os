"use client";
import { useMEDUSA } from "@/lib/store";
import { Check, CloudOff, Loader2, RefreshCw, AlertTriangle } from "lucide-react";

/**
 * Cross-device sync state for the chat surfaces.
 *
 * Deliberately quiet: an icon and a short label, hidden on phones where the
 * header row is already tight. Errors are the only state that gets colour,
 * because "offline, 3 conversations waiting" is the one thing the user
 * actually needs to notice.
 */
export function SyncBadge({ className = "" }: { className?: string }) {
  const { chatSync } = useMEDUSA();
  const { status, pending, lastSyncedAt } = chatSync;

  if (status === "idle") return null;

  const since = lastSyncedAt ? relative(lastSyncedAt) : null;

  const tone =
    status === "error" || status === "offline"
      ? "text-destructive"
      : status === "syncing"
        ? "text-muted-foreground"
        : "text-muted-foreground";

  const label =
    status === "syncing"
      ? "Syncing"
      : status === "synced"
        ? since
          ? `Synced ${since}`
          : "Synced"
        : status === "offline"
          ? pending
            ? `Offline · ${pending} waiting`
            : "Offline"
          : status === "error"
            ? "Sync failed"
            : "";

  const Icon =
    status === "syncing" ? Loader2 : status === "offline" ? CloudOff : status === "error" ? AlertTriangle : Check;

  const title =
    status === "offline" || status === "error"
      ? `Chats are saved on this device and will sync when you reconnect.${chatSync.error ? ` (${chatSync.error})` : ""}`
      : "Chats follow you across devices";

  return (
    <span
      title={title}
      aria-live="polite"
      className={`hidden sm:inline-flex items-center gap-1.5 text-[11px] shrink-0 ${tone} ${className}`}
    >
      <Icon className={`h-3.5 w-3.5 ${status === "syncing" ? "animate-spin" : ""}`} />
      <span className="truncate max-w-[9rem]">{label}</span>
      {pending > 0 && status !== "syncing" && <RefreshCw className="h-3 w-3 opacity-60" />}
    </span>
  );
}

/** A mobile-only dot so the header still communicates sync state without text. */
export function SyncDot({ className = "" }: { className?: string }) {
  const { chatSync } = useMEDUSA();
  if (chatSync.status === "idle" || chatSync.status === "synced") return null;
  const color = chatSync.status === "error" ? "bg-destructive" : "bg-amber-500";
  return (
    <span
      aria-label={chatSync.status}
      title={chatSync.error || chatSync.status}
      className={`sm:hidden h-2 w-2 rounded-full shrink-0 ${color} ${chatSync.status === "syncing" ? "animate-pulse" : ""} ${className}`}
    />
  );
}

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "just now";
  const s = Math.round(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
