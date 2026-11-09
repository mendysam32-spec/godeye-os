"use client";

import { Sidebar } from "@/components/sidebar";
import { Markdown } from "@/components/markdown";
import { toast } from "@/components/toast";
import { useMEDUSA } from "@/lib/store";
import {
  BUILTIN_SKILLS,
  downloadSkillZip,
  formatBytes,
  installBuiltinSkill,
  installSkillMarkdown,
  installSkillZip,
  loadSkillFiles,
  removeSkillPackage,
  saveSkillFilesToDisk,
  type SkillFile,
  type SkillPackage,
} from "@/lib/skills";
import type { InstalledSkill } from "@/lib/skill-prompt";
import { isDesktop } from "@/lib/desktop";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle, Blocks, BookOpen, Check, ChevronRight, Download, FileText, FolderOpen,
  HardDrive, Loader2, Package, RefreshCw, Save, Sparkles, Trash2, Upload,
} from "lucide-react";

const SEED_KEY = "medusa:skills:stickman-seeded";

export default function SkillsPage() {
  const { skills, addSkill, updateSkill, toggleSkill, removeSkill } = useMEDUSA();
  const fileRef = useRef<HTMLInputElement>(null);
  const seededRef = useRef(false);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fileCache, setFileCache] = useState<Record<string, SkillFile[]>>({});
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDesktop(isDesktop()), 0);
    return () => clearTimeout(timer);
  }, []);

  // First run: make the bundled Stickman skill available without a click. The
  // flag keeps a deliberate delete from resurrecting it on every visit.
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    try {
      if (localStorage.getItem(SEED_KEY)) return;
      localStorage.setItem(SEED_KEY, "1");
    } catch {
      /* storage disabled — still offer the install card */
    }
    if (useMEDUSA.getState().skills.some((s) => s.id === "stickman")) return;
    void installBuiltin("stickman", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enabledCount = skills.filter((s) => s.enabled).length;
  const totalBytes = skills.reduce((n, s) => n + (s.bytes || 0), 0);

  async function installBuiltin(id: string, silent = false) {
    setBusy(id);
    setError(null);
    try {
      const pkg = await installBuiltinSkill(id, useMEDUSA.getState().skills);
      addSkill(pkg.skill);
      toast(silent ? `${pkg.skill.name} skill is ready` : `${pkg.skill.name} installed — ${pkg.skill.fileCount} files`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(null);
    }
  }

  async function installFiles(input: FileList | File[]) {
    const list = Array.from(input);
    if (!list.length) return;
    setError(null);
    for (const file of list) {
      setBusy(file.name);
      try {
        let pkg: SkillPackage;
        if (/\.md$/i.test(file.name)) {
          pkg = await installSkillMarkdown(await file.text(), file.name, useMEDUSA.getState().skills);
        } else if (/\.zip$/i.test(file.name)) {
          pkg = await installSkillZip(await file.arrayBuffer(), useMEDUSA.getState().skills, "upload");
        } else {
          throw new Error("Drop a .zip skill package or a single SKILL.md file.");
        }
        addSkill(pkg.skill);
        toast(`${pkg.skill.name} installed — ${pkg.skill.fileCount} file${pkg.skill.fileCount === 1 ? "" : "s"}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        toast(msg, "error");
      }
    }
    setBusy(null);
  }

  async function saveToDisk(skill: InstalledSkill) {
    setBusy(skill.id);
    try {
      const path = await saveSkillFilesToDisk(skill);
      if (!path) {
        toast("Saving skill files to disk needs the desktop app.", "info");
        return;
      }
      updateSkill(skill.id, { diskPath: path });
      toast(`Saved to ${path}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function exportSkill(skill: InstalledSkill) {
    setBusy(skill.id);
    try {
      const files = await loadSkillFiles(skill.id);
      if (!files?.length) throw new Error("No stored files for this skill.");
      downloadSkillZip(skill, files);
      toast("Exported skill ZIP");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove(skill: InstalledSkill) {
    if (!window.confirm(`Remove the "${skill.name}" skill and its files?`)) return;
    setBusy(skill.id);
    try {
      await removeSkillPackage(skill.id);
      removeSkill(skill.id);
      setFileCache((c) => {
        const next = { ...c };
        delete next[skill.id];
        return next;
      });
      toast(`Removed ${skill.name}`, "info");
    } finally {
      setBusy(null);
    }
  }

  async function toggleDetails(skill: InstalledSkill) {
    if (expanded === skill.id) {
      setExpanded(null);
      return;
    }
    setExpanded(skill.id);
    if (!fileCache[skill.id]) {
      const files = await loadSkillFiles(skill.id);
      if (files) setFileCache((c) => ({ ...c, [skill.id]: files }));
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur px-4 md:px-6 h-16 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-sm md:text-base flex items-center gap-2"><Blocks className="h-4 w-4" /> Skills</div>
            <div className="text-xs text-muted-foreground truncate">
              {skills.length} installed • {enabledCount} enabled • {formatBytes(totalBytes)} stored
            </div>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-3.5 py-2 text-xs font-medium disabled:opacity-60 whitespace-nowrap"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Install skill
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,.md,application/zip,text/markdown"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void installFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) void installFiles(e.dataTransfer.files);
            }}
            onClick={() => fileRef.current?.click()}
            className={`rounded-2xl border-2 border-dashed p-6 md:p-8 text-center cursor-pointer transition ${dragOver ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted/40"}`}
          >
            <div className="mx-auto h-11 w-11 rounded-2xl grid place-items-center bg-muted"><Upload className="h-5 w-5" /></div>
            <div className="mt-3 text-sm font-medium">Drop a skill package here</div>
            <div className="mt-1 text-xs text-muted-foreground">
              A <code className="rounded bg-muted px-1">.zip</code> containing a <code className="rounded bg-muted px-1">SKILL.md</code> manifest (optionally with scripts and assets), or a single <code className="rounded bg-muted px-1">SKILL.md</code>.
            </div>
            {!desktop && <div className="mt-2 text-[11px] text-muted-foreground">Browser mode — files are stored in the app and can be exported. The desktop app also writes them to Documents/MEDUSA/skills.</div>}
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="flex-1">{error}</span>
            </div>
          )}

          {/* Built-in catalogue */}
          <section className="rounded-2xl border bg-card p-4 md:p-6">
            <div className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4" style={{ color: "var(--accent)" }} /> Built-in skills</div>
            <p className="text-xs text-muted-foreground mt-1">Bundled with MEDUSA. Install once per device — updates replace the files, not the skill.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {BUILTIN_SKILLS.map((b) => {
                const installed = skills.find((s) => s.id === b.id);
                const working = busy === b.id;
                return (
                  <div key={b.id} className="rounded-2xl border p-4 flex flex-col">
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-xl bg-muted grid place-items-center shrink-0"><Blocks className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{b.name}</span>
                          <span className="text-[10px] uppercase tracking-wide rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">v{b.version}</span>
                          {installed && <span className="text-[10px] rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 inline-flex items-center gap-0.5"><Check className="h-2.5 w-2.5" /> installed</span>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{b.description}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => void installBuiltin(b.id)}
                        disabled={working || !!busy}
                        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
                      >
                        {working ? <Loader2 className="h-3 w-3 animate-spin" /> : installed ? <RefreshCw className="h-3 w-3" /> : <Download className="h-3 w-3" />}
                        {installed ? "Reinstall" : "Install"}
                      </button>
                      {installed && (
                        <span className="text-[11px] text-muted-foreground">{installed.fileCount} files • {formatBytes(installed.bytes)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Installed */}
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="font-medium flex items-center gap-2"><Package className="h-4 w-4" /> Installed skills</div>
                <div className="text-xs text-muted-foreground">Enabled skills are added to the system prompt for every chat — mention them by name, or invoke with <code className="rounded bg-muted px-1">/name</code>.</div>
              </div>
            </div>

            {skills.length === 0 && (
              <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
                No skills installed yet. Install the Stickman skill above, or drop your own package.
              </div>
            )}

            <div className="grid gap-3">
              {skills.map((skill) => {
                const working = busy === skill.id;
                const open = expanded === skill.id;
                const files = fileCache[skill.id];
                return (
                  <div key={skill.id} className={`rounded-2xl border bg-card ${skill.enabled ? "" : "opacity-80"}`}>
                    <div className="p-4 flex flex-col sm:flex-row sm:items-start gap-3">
                      <div className="h-10 w-10 rounded-xl bg-muted grid place-items-center shrink-0">
                        {skill.source === "builtin" ? <Blocks className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{skill.name}</span>
                          <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">{skill.source}</span>
                          {skill.version && <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">v{skill.version}</span>}
                          {skill.diskPath && <span className="text-[10px] rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 inline-flex items-center gap-0.5"><HardDrive className="h-2.5 w-2.5" /> on disk</span>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{skill.description || "No description in SKILL.md."}</p>
                        <div className="mt-1.5 text-[11px] text-muted-foreground">
                          {skill.fileCount} file{skill.fileCount === 1 ? "" : "s"} • {formatBytes(skill.bytes)} • installed {new Date(skill.installedAt).toLocaleDateString()}
                        </div>
                        {skill.diskPath && <div className="mt-1 text-[11px] text-muted-foreground truncate" title={skill.diskPath}><FolderOpen className="h-3 w-3 inline mr-1" />{skill.diskPath}</div>}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 sm:flex-col sm:items-end">
                        <button
                          onClick={() => toggleSkill(skill.id, !skill.enabled)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] border ${skill.enabled ? "bg-emerald-500 text-white border-emerald-500" : "bg-card"}`}
                          title={skill.enabled ? "Enabled — used in chat" : "Disabled"}
                        >
                          {skill.enabled ? <Check className="h-3 w-3" /> : null}
                          {skill.enabled ? "Enabled" : "Enable"}
                        </button>
                        <div className="flex items-center gap-1">
                          <button onClick={() => void toggleDetails(skill)} className="p-2 rounded-lg hover:bg-muted" title="Details">
                            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
                          </button>
                          <button onClick={() => void saveToDisk(skill)} disabled={working} className="p-2 rounded-lg hover:bg-muted disabled:opacity-50" title={desktop ? "Save files to disk" : "Needs desktop app"}>
                            <Save className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => void exportSkill(skill)} disabled={working} className="p-2 rounded-lg hover:bg-muted disabled:opacity-50" title="Export ZIP">
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => void remove(skill)} disabled={working} className="p-2 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 disabled:opacity-50" title="Remove">
                            {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {open && (
                      <div className="border-t p-4 grid lg:grid-cols-[1.4fr_1fr] gap-4">
                        <div className="min-w-0">
                          <div className="text-xs font-medium flex items-center gap-1.5 mb-2"><BookOpen className="h-3.5 w-3.5" /> SKILL.md</div>
                          <div className="rounded-xl border bg-background p-3 max-h-[420px] overflow-auto text-xs">
                            <Markdown content={skill.instructions} />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium flex items-center gap-1.5 mb-2"><FolderOpen className="h-3.5 w-3.5" /> Files ({skill.fileCount})</div>
                          <div className="rounded-xl border bg-background p-2 max-h-[420px] overflow-auto">
                            {!files && <div className="p-2 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading package…</div>}
                            {files?.map((f) => (
                              <div key={f.path} className="flex items-center gap-2 px-2 py-1 text-[11px] rounded hover:bg-muted">
                                <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <span className="truncate flex-1 font-mono">{f.path}</span>
                                <span className="text-muted-foreground shrink-0">{formatBytes(f.bytes)}</span>
                              </div>
                            ))}
                            {files && !files.length && <div className="p-2 text-xs text-muted-foreground">No files stored.</div>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Authoring help */}
          <section className="rounded-2xl border bg-card p-4 md:p-6">
            <div className="flex items-center gap-2 font-medium"><BookOpen className="h-4 w-4" /> Make your own skill</div>
            <p className="text-xs text-muted-foreground mt-1">Zip a folder with a <code className="rounded bg-muted px-1">SKILL.md</code> at its root. MEDUSA reads the frontmatter, keeps every file, and briefs the model with the manifest whenever the skill is enabled.</p>
            <pre className="mt-3 rounded-xl border bg-muted p-3 text-[11px] overflow-auto">{`my-skill/
  SKILL.md          # required
  scripts/run.py    # optional
  references/notes.md

--- SKILL.md ---
---
name: my-skill
description: What this skill does and when to use it.
version: 1.0.0
---

# My skill
Step-by-step instructions for the model…`}</pre>
            <div className="mt-2 text-[11px] text-muted-foreground">On the desktop app, “Save to disk” mirrors the package to <code className="rounded bg-muted px-1">Documents/MEDUSA/skills/&lt;id&gt;</code> so agent tools can read and run it. In the browser, export the ZIP and run it locally.</div>
          </section>
        </div>
      </main>
    </div>
  );
}
