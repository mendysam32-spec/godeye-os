"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { toast } from "@/components/toast";
import { useMEDUSA } from "@/lib/store";
import {
  CANVAS_NODE_KINDS, CANVAS_RELATIONS, DEFAULT_CANVAS_BOARD, newId,
  type CanvasEdge, type CanvasNode, type CanvasNodeKind, type CanvasRelation,
  type CanvasSource, type CanvasState, type MemoryRecord,
} from "@/lib/foundation";
import {
  canvasClock, mergeEdges, mergeNodes, nextRevision,
} from "@/lib/canvas-crdt";
import {
  ArrowDownToLine, Bot, Box, Brain, CircleDot, GitBranch, Link2, Loader2,
  Maximize2, MessageSquare, RefreshCw, Sparkles, StickyNote,
  Trash2, Waypoints, ZoomIn, ZoomOut,
} from "lucide-react";

const BOARD = DEFAULT_CANVAS_BOARD;
const NODE_W = 236;
const NODE_H = 128;
const COLORS: Record<CanvasNodeKind, string> = {
  note: "#eab308", chat: "#38bdf8", message: "#a78bfa", memory: "#34d399",
  skill: "#fb923c", agent: "#f472b6", genome: "#c084fc", artifact: "#22d3ee",
};
const KIND_ICON: Record<CanvasNodeKind, typeof StickyNote> = {
  note: StickyNote, chat: MessageSquare, message: MessageSquare, memory: Brain,
  skill: Box, agent: Bot, genome: Sparkles, artifact: CircleDot,
};
const KIND_LABEL: Record<CanvasNodeKind, string> = {
  note: "Note", chat: "Chat", message: "Message", memory: "Memory",
  skill: "Skill", agent: "Agent", genome: "Genome", artifact: "Artifact",
};

interface View { x: number; y: number; zoom: number }
interface PaletteItem { key: string; kind: CanvasNodeKind; title: string; body: string; source: CanvasSource | null; icon: typeof StickyNote }
interface Pending { nodes: Map<string, CanvasNode>; edges: Map<string, CanvasEdge> }

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Request failed");
  return json as T;
}

function edgePath(a: CanvasNode, b: CanvasNode): string {
  const x1 = a.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const x2 = b.x;
  const y2 = b.y + NODE_H / 2;
  const bend = Math.max(40, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

export default function CanvasPage() {
  const { chats, skills, agents } = useMEDUSA();
  const [state, setState] = useState<CanvasState>({ boardId: BOARD, nodes: [], edges: [] });
  const [view, setView] = useState<View>({ x: 80, y: 60, zoom: 1 });
  const [selectedId, setSelectedId] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [sync, setSync] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [connectHint, setConnectHint] = useState("");
  const [panning, setPanning] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  const viewRef = useRef(view);
  const deviceRef = useRef("pending");
  const clockRef = useRef(0);
  const pendingRef = useRef<Pending>({ nodes: new Map(), edges: new Map() });
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const panRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const connectRef = useRef<{ fromId: string; x: number; y: number } | null>(null);
  const [connectPreview, setConnectPreview] = useState<{ fromId: string; x: number; y: number } | null>(null);

  // Keep the refs in lockstep with state from handlers/effects only. React's
  // compiler rules forbid touching refs while rendering, but interaction code
  // needs the latest value synchronously (e.g. consecutive pointer moves).
  const commitCanvas = useCallback((next: CanvasState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const commitView = useCallback((next: View) => {
    viewRef.current = next;
    setView(next);
  }, []);

  /* ------------------------------- sync ---------------------------------- */

  const flush = useCallback(async () => {
    const pending = pendingRef.current;
    const nodes = [...pending.nodes.values()];
    const edges = [...pending.edges.values()];
    if (!nodes.length && !edges.length || !deviceRef.current || deviceRef.current === "pending") return;
    pending.nodes.clear();
    pending.edges.clear();
    setSync("saving");
    try {
      const remote = await api<CanvasState>("/api/canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId: BOARD, nodes, edges }),
      });
      commitCanvas({
        boardId: BOARD,
        nodes: mergeNodes(stateRef.current.nodes, remote.nodes),
        edges: mergeEdges(stateRef.current.edges, remote.edges),
      });
      clockRef.current = Math.max(clockRef.current, canvasClock(remote));
      setSync("saved");
    } catch {
      // Requeue so a transient offline failure never loses a local edit.
      for (const n of nodes) pending.nodes.set(n.id, n);
      for (const e of edges) pending.edges.set(e.id, e);
      setSync("error");
    }
  }, [commitCanvas]);

  const scheduleFlush = useCallback(() => {
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => void flush(), 400);
  }, [flush]);

  const pull = useCallback(async () => {
    try {
      const remote = await api<CanvasState>(`/api/canvas?boardId=${encodeURIComponent(BOARD)}`, { cache: "no-store" });
      commitCanvas({
        boardId: BOARD,
        nodes: mergeNodes(stateRef.current.nodes, remote.nodes),
        edges: mergeEdges(stateRef.current.edges, remote.edges),
      });
      clockRef.current = Math.max(clockRef.current, canvasClock(remote));
      if (!pendingRef.current.nodes.size && !pendingRef.current.edges.size) setSync("saved");
    } catch {
      setSync("error");
    }
  }, [commitCanvas]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        let id = sessionStorage.getItem("medusa:canvas-device");
        if (!id) {
          id = newId("dev");
          sessionStorage.setItem("medusa:canvas-device", id);
        }
        deviceRef.current = id;
      } catch {
        deviceRef.current = newId("dev");
      }
      void pull();
    }, 0);
    const poll = setInterval(() => void pull(), 3_000);
    return () => { clearTimeout(t); clearInterval(poll); };
  }, [pull]);

  useEffect(() => {
    const t = setTimeout(() => {
      void api<{ memories: MemoryRecord[] }>("/api/memory?limit=40", { cache: "no-store" })
        .then((j) => setMemories(j.memories || []))
        .catch(() => undefined);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  /* ------------------------------ mutations ------------------------------- */

  const queueNode = useCallback((node: CanvasNode) => {
    pendingRef.current.nodes.set(node.id, node);
    scheduleFlush();
  }, [scheduleFlush]);

  const queueEdge = useCallback((edge: CanvasEdge) => {
    pendingRef.current.edges.set(edge.id, edge);
    scheduleFlush();
  }, [scheduleFlush]);

  const mutateNode = useCallback((id: string, patch: Partial<CanvasNode>) => {
    const base = stateRef.current;
    const current = base.nodes.find((n) => n.id === id);
    if (!current) return;
    clockRef.current += 1;
    const updated: CanvasNode = {
      ...current, ...patch, ...nextRevision(current, deviceRef.current), lamport: clockRef.current,
    };
    let edges = base.edges;
    if (patch.deleted) {
      edges = base.edges.map((e) => {
        if (e.fromId !== id && e.toId !== id) return e;
        clockRef.current += 1;
        const dead: CanvasEdge = { ...e, deleted: true, ...nextRevision(e, deviceRef.current), lamport: clockRef.current };
        queueEdge(dead);
        return dead;
      });
    }
    commitCanvas({
      ...base,
      nodes: base.nodes.map((n) => (n.id === id ? updated : n)),
      edges,
    });
    queueNode(updated);
  }, [commitCanvas, queueEdge, queueNode]);

  function mutateEdge(id: string, patch: Partial<CanvasEdge>) {
    const base = stateRef.current;
    const current = base.edges.find((e) => e.id === id);
    if (!current) return;
    clockRef.current += 1;
    const updated: CanvasEdge = {
      ...current, ...patch, ...nextRevision(current, deviceRef.current), lamport: clockRef.current,
    };
    commitCanvas({ ...base, edges: base.edges.map((e) => (e.id === id ? updated : e)) });
    queueEdge(updated);
  }

  function screenToWorld(clientX: number, clientY: number) {
    const rect = viewportRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - v.x) / v.zoom, y: (clientY - rect.top - v.y) / v.zoom };
  }

  function addNode(kind: CanvasNodeKind, title: string, body: string, source: CanvasSource | null, at?: { x: number; y: number }): CanvasNode | null {
    if (deviceRef.current === "pending") { toast("Canvas is still connecting — try again", "error"); return null; }
    const rect = viewportRef.current?.getBoundingClientRect();
    const center = rect
      ? { x: (rect.width / 2 - viewRef.current.x) / viewRef.current.zoom, y: (rect.height / 2 - viewRef.current.y) / viewRef.current.zoom }
      : { x: 0, y: 0 };
    // Deterministic stagger instead of Math.random() so renders stay pure and
    // repeated placements do not stack on the exact same spot.
    const count = stateRef.current.nodes.filter((n) => !n.deleted).length;
    const jitter = { x: (count % 5) * 24, y: ((count * 7) % 5) * 24 };
    const pos = at ?? { x: center.x - NODE_W / 2 + jitter.x, y: center.y - NODE_H / 2 + jitter.y };
    clockRef.current += 1;
    const now = new Date().toISOString();
    const node: CanvasNode = {
      id: newId("node"), uid: "", boardId: BOARD, kind, title: title.slice(0, 160), body: body.slice(0, 8_000),
      x: Math.round(pos.x), y: Math.round(pos.y), color: COLORS[kind], branch: DEFAULT_CANVAS_BOARD,
      parentId: null, source, deviceId: deviceRef.current, lamport: clockRef.current,
      createdAt: now, updatedAt: now, deleted: false,
    };
    commitCanvas({ ...stateRef.current, nodes: [...stateRef.current.nodes, node] });
    queueNode(node);
    setSelectedId(node.id);
    setSelectedEdgeId("");
    return node;
  }

  function addEdge(fromId: string, toId: string) {
    if (fromId === toId) return;
    const exists = stateRef.current.edges.some((e) => !e.deleted && e.fromId === fromId && e.toId === toId);
    if (exists) { toast("Those nodes are already connected"); return; }
    clockRef.current += 1;
    const now = new Date().toISOString();
    const edge: CanvasEdge = {
      id: newId("edge"), uid: "", boardId: BOARD, fromId, toId, label: "", relation: "related",
      deviceId: deviceRef.current, lamport: clockRef.current, createdAt: now, updatedAt: now, deleted: false,
    };
    commitCanvas({ ...stateRef.current, edges: [...stateRef.current.edges, edge] });
    queueEdge(edge);
    setSelectedEdgeId(edge.id);
    setSelectedId("");
  }

  function branchFromSelected() {
    const parent = stateRef.current.nodes.find((n) => n.id === selectedId);
    if (!parent || parent.deleted) { toast("Select a node to branch from", "error"); return; }
    const branch = `branch-${newId("b").slice(-6)}`;
    const pos = { x: parent.x + NODE_W + 90, y: parent.y + 150 };
    const child = addNode("artifact", `${parent.title} · branch`, parent.body.slice(0, 2_000), null, pos);
    if (!child) return;
    clockRef.current += 1;
    const now = new Date().toISOString();
    const childBranch: CanvasNode = {
      ...child, branch, parentId: parent.id, lamport: clockRef.current,
      deviceId: deviceRef.current, updatedAt: now,
    };
    commitCanvas({ ...stateRef.current, nodes: stateRef.current.nodes.map((n) => (n.id === child.id ? childBranch : n)) });
    queueNode(childBranch);
    const edge: CanvasEdge = {
      id: newId("edge"), uid: "", boardId: BOARD, fromId: parent.id, toId: child.id,
      label: "branch", relation: "branch", deviceId: deviceRef.current, lamport: ++clockRef.current,
      createdAt: now, updatedAt: now, deleted: false,
    };
    commitCanvas({ ...stateRef.current, edges: [...stateRef.current.edges, edge] });
    queueEdge(edge);
    setBranchFilter("all");
    toast(`Created ${branch}`);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (e.key === "Escape") { setSelectedId(""); setSelectedEdgeId(""); setConnectHint(""); }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        mutateNode(selectedId, { deleted: true });
        setSelectedId("");
      }
    };
    const el = viewportRef.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const rect = el?.getBoundingClientRect();
      if (!rect) return;
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const wx = (px - v.x) / v.zoom;
      const wy = (py - v.y) / v.zoom;
      const zoom = Math.min(2.5, Math.max(0.25, v.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
      commitView({ x: px - wx * zoom, y: py - wy * zoom, zoom });
    };
    window.addEventListener("keydown", onKey);
    el?.addEventListener("wheel", onWheel, { passive: false });
    return () => { window.removeEventListener("keydown", onKey); el?.removeEventListener("wheel", onWheel); };
  }, [commitView, mutateNode, selectedId]);

  /* --------------------------- pointer handlers --------------------------- */

  function onBackgroundDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    panRef.current = { sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y };
    setPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId("");
    setSelectedEdgeId("");
  }

  function onNodeDown(e: React.PointerEvent<HTMLDivElement>, node: CanvasNode) {
    if (e.button !== 0) return;
    e.stopPropagation();
    dragRef.current = { id: node.id, sx: e.clientX, sy: e.clientY, ox: node.x, oy: node.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(node.id);
    setSelectedEdgeId("");
  }

  function onHandleDown(e: React.PointerEvent<HTMLDivElement>, node: CanvasNode) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const world = screenToWorld(e.clientX, e.clientY);
    connectRef.current = { fromId: node.id, x: world.x, y: world.y };
    setConnectPreview(connectRef.current);
    setConnectHint(`Connecting from ${node.title} — drop on another node`);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (panRef.current) {
      const p = panRef.current;
      commitView({ ...viewRef.current, x: p.ox + (e.clientX - p.sx), y: p.oy + (e.clientY - p.sy) });
      return;
    }
    if (dragRef.current) {
      const d = dragRef.current;
      const z = viewRef.current.zoom;
      const x = Math.round(d.ox + (e.clientX - d.sx) / z);
      const y = Math.round(d.oy + (e.clientY - d.sy) / z);
      commitCanvas({ ...stateRef.current, nodes: stateRef.current.nodes.map((n) => (n.id === d.id ? { ...n, x, y } : n)) });
      return;
    }
    if (connectRef.current) {
      const world = screenToWorld(e.clientX, e.clientY);
      connectRef.current = { ...connectRef.current, x: world.x, y: world.y };
      setConnectPreview(connectRef.current);
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current) {
      const d = dragRef.current;
      const node = stateRef.current.nodes.find((n) => n.id === d.id);
      if (node) mutateNode(d.id, { x: node.x, y: node.y });
      dragRef.current = null;
      return;
    }
    if (connectRef.current) {
      const fromId = connectRef.current.fromId;
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-node-id]") as HTMLElement | null;
      const toId = hit?.dataset.nodeId;
      if (toId && toId !== fromId) addEdge(fromId, toId);
      else toast("Drop the connection on another node");
      connectRef.current = null;
      setConnectPreview(null);
      setConnectHint("");
      return;
    }
    panRef.current = null;
    setPanning(false);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/medusa-canvas");
    if (!raw) return;
    try {
      const item = JSON.parse(raw) as PaletteItem;
      if (!CANVAS_NODE_KINDS.includes(item.kind)) return;
      addNode(item.kind, item.title, item.body, item.source, screenToWorld(e.clientX, e.clientY));
    } catch {
      toast("Could not drop that item", "error");
    }
  }

  /* -------------------------------- derive -------------------------------- */

  const visibleNodes = useMemo(
    () => state.nodes.filter((n) => !n.deleted).filter((n) => branchFilter === "all" || n.branch === branchFilter),
    [state.nodes, branchFilter],
  );
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => state.edges.filter((e) => !e.deleted && visibleIds.has(e.fromId) && visibleIds.has(e.toId)),
    [state.edges, visibleIds],
  );
  const branches = useMemo(
    () => [...new Set(state.nodes.filter((n) => !n.deleted).map((n) => n.branch))].sort(),
    [state.nodes],
  );
  const nodeById = useMemo(() => new Map(visibleNodes.map((n) => [n.id, n])), [visibleNodes]);
  const selected = state.nodes.find((n) => n.id === selectedId && !n.deleted) || null;
  const selectedEdge = state.edges.find((e) => e.id === selectedEdgeId && !e.deleted) || null;
  const previewFrom = connectPreview ? nodeById.get(connectPreview.fromId) : null;

  const palette = useMemo<PaletteItem[]>(() => [
    ...chats.slice(0, 12).map((c): PaletteItem => ({
      key: `chat-${c.id}`, kind: "chat", title: c.title || "Chat", body:
        (c.messages || []).slice(-1)[0]?.content?.slice(0, 400) || "No messages yet",
      source: { type: "chat", id: c.id }, icon: MessageSquare,
    })),
    ...memories.slice(0, 12).map((m): PaletteItem => ({
      key: `mem-${m.id}`, kind: "memory", title: m.kind, body: m.content.slice(0, 400),
      source: { type: "memory", id: m.id }, icon: Brain,
    })),
    ...skills.filter((s) => s.enabled).slice(0, 12).map((s): PaletteItem => ({
      key: `skill-${s.id}`, kind: "skill", title: s.name, body: s.description || s.instructions.slice(0, 300),
      source: { type: "skill", id: s.id }, icon: Box,
    })),
    ...agents.slice(0, 12).map((a): PaletteItem => ({
      key: `agent-${a.id}`, kind: "agent", title: a.name, body: a.systemPrompt.slice(0, 400),
      source: { type: "agent", id: a.id }, icon: Bot,
    })),
  ], [chats, memories, skills, agents]);

  function fitView() {
    if (!visibleNodes.length) { commitView({ x: 80, y: 60, zoom: 1 }); return; }
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const minX = Math.min(...visibleNodes.map((n) => n.x));
    const minY = Math.min(...visibleNodes.map((n) => n.y));
    const maxX = Math.max(...visibleNodes.map((n) => n.x + NODE_W));
    const maxY = Math.max(...visibleNodes.map((n) => n.y + NODE_H));
    const zoom = Math.min(1.4, Math.max(0.25, Math.min(rect.width / (maxX - minX + 160), rect.height / (maxY - minY + 160))));
    commitView({ x: (rect.width - (maxX - minX) * zoom) / 2 - minX * zoom, y: (rect.height - (maxY - minY) * zoom) / 2 - minY * zoom, zoom });
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur px-4 md:px-6 h-16 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-sm md:text-base flex items-center gap-2"><Waypoints className="h-4 w-4" /> Canvas</div>
            <div className="text-xs text-muted-foreground truncate">
              {visibleNodes.length} nodes · {visibleEdges.length} connections · {branches.length} branch(es)
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] rounded-full px-2 py-1 ${sync === "error" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}>
              {sync === "saving" ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : <CircleDot className="mr-1 inline h-3 w-3" />}
              {sync === "saving" ? "Syncing" : sync === "error" ? "Offline — changes queued" : "Live"}
            </span>
            <button onClick={() => void pull()} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs hover:bg-muted"><RefreshCw className="h-3.5 w-3.5" /> Sync</button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* palette */}
          <aside className="w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r bg-card/50 p-3 overflow-y-auto max-h-72 lg:max-h-none">
            <div className="text-xs font-medium flex items-center gap-1.5"><Box className="h-3.5 w-3.5" /> Drop artifacts</div>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Drag onto the canvas, or click to place at center. Nodes link back to real MEDUSA state.</p>
            <div className="mt-3 space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Create</div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {(["note", "artifact"] as CanvasNodeKind[]).map((kind) => {
                    const Icon = KIND_ICON[kind];
                    return (
                      <button key={kind} draggable
                        onDragStart={(e) => e.dataTransfer.setData("application/medusa-canvas", JSON.stringify({ kind, title: kind === "note" ? "New note" : "Artifact", body: "", source: null }))}
                        onClick={() => addNode(kind, kind === "note" ? "New note" : "Artifact", "", null)}
                        className="flex items-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] hover:bg-muted">
                        <Icon className="h-3.5 w-3.5" /> {KIND_LABEL[kind]}
                      </button>
                    );
                  })}
                </div>
              </div>
              {([
                { label: "Chats", items: palette.filter((p) => p.source?.type === "chat") },
                { label: "Memories", items: palette.filter((p) => p.source?.type === "memory") },
                { label: "Skills", items: palette.filter((p) => p.source?.type === "skill") },
                { label: "Agents", items: palette.filter((p) => p.source?.type === "agent") },
              ]).map((group) => group.items.length ? (
                <div key={group.label}>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{group.label}</div>
                  <div className="mt-1.5 space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button key={item.key} draggable
                          onDragStart={(e) => e.dataTransfer.setData("application/medusa-canvas", JSON.stringify(item))}
                          onClick={() => addNode(item.kind, item.title, item.body, item.source)}
                          className="flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] hover:bg-muted">
                          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0"><span className="block truncate font-medium">{item.title}</span><span className="block truncate text-[10px] text-muted-foreground">{item.body}</span></span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null)}
            </div>
          </aside>

          {/* canvas */}
          <div className="relative flex-1 min-h-[60vh] lg:min-h-0 overflow-hidden"
            ref={viewportRef}
            onPointerDown={onBackgroundDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            style={{ cursor: panning ? "grabbing" : "grab", backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.25) 1px, transparent 1px)", backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`, backgroundPosition: `${view.x}px ${view.y}px` }}>
            <div className="absolute inset-0 origin-top-left"
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
              <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" style={{ width: 1, height: 1 }}>
                <defs>
                  <marker id="canvas-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 z" fill="currentColor" className="text-muted-foreground" />
                  </marker>
                </defs>
                {visibleEdges.map((edge) => {
                  const a = nodeById.get(edge.fromId);
                  const b = nodeById.get(edge.toId);
                  if (!a || !b) return null;
                  const midX = (a.x + NODE_W + b.x) / 2;
                  const midY = (a.y + b.y) / 2 + NODE_H / 2;
                  return (
                    <g key={edge.id}>
                      <path d={edgePath(a, b)} fill="none" stroke={edge.id === selectedEdgeId ? "#f59e0b" : "#94a3b8"} strokeWidth={edge.id === selectedEdgeId ? 3 : 2} markerEnd="url(#canvas-arrow)" />
                      <circle cx={midX} cy={midY} r={11} fill="var(--background, #fff)" stroke="#94a3b8" />
                    </g>
                  );
                })}
                {previewFrom && connectPreview && (
                  <path d={`M ${previewFrom.x + NODE_W} ${previewFrom.y + NODE_H / 2} L ${connectPreview.x} ${connectPreview.y}`}
                    fill="none" stroke="#22d3ee" strokeWidth={2} strokeDasharray="6 4" />
                )}
              </svg>

              {visibleNodes.map((node) => {
                const Icon = KIND_ICON[node.kind];
                return (
                  <div key={node.id} data-node-id={node.id}
                    onPointerDown={(e) => onNodeDown(e, node)}
                    className={`absolute rounded-xl border bg-card shadow-sm select-none ${node.id === selectedId ? "border-amber-400 ring-2 ring-amber-200" : "border-border"}`}
                    style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H, borderTopColor: node.color, borderTopWidth: 4 }}>
                    <div className="flex items-start gap-2 p-2.5">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: node.color }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold">{node.title}</div>
                        <div className="mt-0.5 text-[9px] text-muted-foreground">{KIND_LABEL[node.kind]} · {node.branch}</div>
                      </div>
                    </div>
                    <div className="px-2.5 text-[10px] leading-snug text-muted-foreground overflow-hidden" style={{ maxHeight: 56 }}>
                      {node.body || "Double-click or use the inspector to annotate this node."}
                    </div>
                    <div className="absolute bottom-1.5 left-2.5 flex items-center gap-2 text-[9px] text-muted-foreground">
                      {node.source && <span>linked · {node.source.type}</span>}
                      {node.parentId && <GitBranch className="h-3 w-3" />}
                    </div>
                    <div data-handle="out" title="Drag to connect"
                      onPointerDown={(e) => onHandleDown(e, node)}
                      className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-background bg-cyan-400 shadow" />
                  </div>
                );
              })}
            </div>

            {/* controls */}
            <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-xl border bg-background/90 p-1 shadow-sm">
              <button onClick={() => commitView({ ...viewRef.current, zoom: Math.min(2.5, viewRef.current.zoom * 1.2) })} title="Zoom in" className="rounded-lg p-1.5 hover:bg-muted"><ZoomIn className="h-4 w-4" /></button>
              <button onClick={() => commitView({ ...viewRef.current, zoom: Math.max(0.25, viewRef.current.zoom / 1.2) })} title="Zoom out" className="rounded-lg p-1.5 hover:bg-muted"><ZoomOut className="h-4 w-4" /></button>
              <span className="w-10 text-center text-[10px] text-muted-foreground">{Math.round(view.zoom * 100)}%</span>
              <button onClick={fitView} title="Fit view" className="rounded-lg p-1.5 hover:bg-muted"><Maximize2 className="h-4 w-4" /></button>
              <button onClick={() => commitView({ x: 80, y: 60, zoom: 1 })} title="Reset view" className="rounded-lg p-1.5 hover:bg-muted"><ArrowDownToLine className="h-4 w-4" /></button>
            </div>
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-xl border bg-background/90 p-1.5 text-[10px] shadow-sm">
              <GitBranch className="h-3.5 w-3.5" />
              <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="max-w-40 bg-transparent text-[10px] outline-none">
                <option value="all">All branches</option>
                {branches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            {connectHint && <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-1.5 text-[10px] text-background shadow">{connectHint}</div>}
            {!visibleNodes.length && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-sm text-muted-foreground">
                Drop a chat, memory, skill or agent here — or create a note — to start mapping the work.
              </div>
            )}
          </div>

          {/* inspector */}
          <aside className="w-full lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l bg-card/50 p-3 overflow-y-auto max-h-72 lg:max-h-none">
            {selected ? (
              <>
                <div className="text-xs font-medium flex items-center gap-1.5"><CircleDot className="h-3.5 w-3.5" /> Node inspector</div>
                <div className="mt-3 space-y-2">
                  <label className="block"><span className="text-[10px] text-muted-foreground">Title</span>
                    <input value={selected.title} onChange={(e) => mutateNode(selected.id, { title: e.target.value })} className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-xs" />
                  </label>
                  <label className="block"><span className="text-[10px] text-muted-foreground">Annotation</span>
                    <textarea value={selected.body} onChange={(e) => mutateNode(selected.id, { body: e.target.value })} rows={7} className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-[11px]" />
                  </label>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Accent</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {Object.entries(COLORS).map(([kind, color]) => (
                        <button key={kind} onClick={() => mutateNode(selected.id, { color })} title={kind}
                          className={`h-5 w-5 rounded-full border-2 ${selected.color === color ? "border-foreground" : "border-transparent"}`}
                          style={{ background: color }} />
                      ))}
                    </div>
                  </div>
                  <label className="block"><span className="text-[10px] text-muted-foreground">Branch</span>
                    <input value={selected.branch} onChange={(e) => mutateNode(selected.id, { branch: e.target.value.slice(0, 80) })} className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-xs" />
                  </label>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button onClick={branchFromSelected} className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-2.5 py-1.5 text-[11px] text-background"><GitBranch className="h-3.5 w-3.5" /> Branch here</button>
                    <button onClick={() => { mutateNode(selected.id, { deleted: true }); setSelectedId(""); }} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                  </div>
                  {selected.source && <div className="rounded-lg bg-muted p-2 text-[10px] text-muted-foreground">Linked to {selected.source.type} <span className="font-mono">{selected.source.id.slice(0, 14)}</span></div>}
                </div>
              </>
            ) : selectedEdge ? (
              <>
                <div className="text-xs font-medium flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Connection inspector</div>
                <div className="mt-3 space-y-2">
                  <label className="block"><span className="text-[10px] text-muted-foreground">Label</span>
                    <input value={selectedEdge.label} onChange={(e) => mutateEdge(selectedEdge.id, { label: e.target.value })} className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-xs" />
                  </label>
                  <label className="block"><span className="text-[10px] text-muted-foreground">Relation</span>
                    <select value={selectedEdge.relation} onChange={(e) => mutateEdge(selectedEdge.id, { relation: e.target.value as CanvasRelation })} className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-xs">
                      {CANVAS_RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                  <div className="text-[10px] text-muted-foreground">
                    {nodeById.get(selectedEdge.fromId)?.title || selectedEdge.fromId.slice(0, 10)} → {nodeById.get(selectedEdge.toId)?.title || selectedEdge.toId.slice(0, 10)}
                  </div>
                  <button onClick={() => { mutateEdge(selectedEdge.id, { deleted: true }); setSelectedEdgeId(""); }} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Delete connection</button>
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Spatial canvas</p>
                <p className="mt-2 leading-relaxed">Drag the background to pan, scroll to zoom. Drag a node&apos;s cyan handle onto another node to connect them. Select a node to annotate, branch or delete it.</p>
                <p className="mt-2 leading-relaxed">Edits use a last-writer-wins CRDT register with tombstones, so concurrent changes from two tabs or devices converge — even offline.</p>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
