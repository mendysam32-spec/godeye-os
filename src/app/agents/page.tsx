"use client";
import { Sidebar } from "@/components/sidebar";
import { useGodEye } from "@/lib/store";
import { PROVIDERS, modelsFor, type ProviderId } from "@/lib/providers";
import { useState } from "react";
import { Plus, Trash2, Bot } from "lucide-react";

export default function AgentsPage() {
  const { agents, addAgent, updateAgent, removeAgent, vault } = useGodEye();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name:"", role:"", provider:"openrouter" as ProviderId, model:"", prompt:"" });

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar/>
      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur px-6 h-16 flex items-center justify-between">
          <div><div className="font-semibold">Agents</div><div className="text-xs text-muted-foreground">Loaded by provider • multi-model coding & content</div></div>
          <button onClick={()=>setShow(true)} className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-4 py-2 text-sm"><Plus className="h-4 w-4"/> New agent</button>
        </div>

        <div className="p-6 max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map(a=>{
              const p = PROVIDERS.find(x=>x.id===a.provider);
              const connected = vault[a.provider]?.connected;
              return (
                <div key={a.id} className="rounded-2xl border bg-card p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-3">
                      <div className="h-10 w-10 rounded-xl grid place-items-center text-white" style={{background: p?.color}}><Bot className="h-5 w-5"/></div>
                      <div><div className="font-medium text-sm">{a.name}</div><div className="text-xs text-muted-foreground">{a.role}</div></div>
                    </div>
                    <button onClick={()=>removeAgent(a.id)} className="p-1 hover:bg-muted rounded-lg"><Trash2 className="h-4 w-4"/></button>
                  </div>
                  <div className="mt-3 space-y-2">
                    <label className="block"><span className="text-xs">Provider</span>
                      <select value={a.provider} onChange={e=>{
                        const pid = e.target.value as ProviderId;
                        const prov = PROVIDERS.find(x=>x.id===pid);
                        const list = modelsFor(prov, vault[pid]?.models);
                        updateAgent(a.id, {provider: pid, model: list[0]?.id || ""});
                      }} className="mt-1 w-full rounded-xl border bg-muted px-3 py-2 text-sm">
                        {PROVIDERS.map(pr=><option key={pr.id} value={pr.id}>{pr.name} {!vault[pr.id]?.connected && " • needs key"}</option>)}
                      </select>
                    </label>
                    <label className="block"><span className="text-xs">Model</span>
                      <select value={a.model} onChange={e=>updateAgent(a.id, {model: e.target.value})} className="mt-1 w-full rounded-xl border bg-muted px-3 py-2 text-sm">
                        {modelsFor(PROVIDERS.find(x=>x.id===a.provider), vault[a.provider]?.models).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </label>
                    {!connected && <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">Connect {p?.name} key in Providers to run this agent</div>}
                    <div className="flex items-center gap-2 text-xs"><span>Creativity</span><input type="range" min={0} max={1} step={0.1} value={a.temperature} onChange={e=>updateAgent(a.id, {temperature: parseFloat(e.target.value)})} className="flex-1"/> {a.temperature.toFixed(1)}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {show && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm grid place-items-center p-6 z-50" onClick={()=>setShow(false)}>
              <div className="w-full max-w-md rounded-2xl bg-card border p-6" onClick={e=>e.stopPropagation()}>
                <div className="font-semibold">New agent</div>
                <div className="mt-3 space-y-3">
                  <input placeholder="Name — e.g. Coder" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} className="w-full rounded-xl border bg-muted px-3 py-2.5 text-sm"/>
                  <input placeholder="Role — e.g. Full-Stack Engineer" value={form.role} onChange={e=>setForm({...form, role:e.target.value})} className="w-full rounded-xl border bg-muted px-3 py-2.5 text-sm"/>
                  <select value={form.provider} onChange={e=>{const pid=e.target.value as ProviderId; const prov=PROVIDERS.find(x=>x.id===pid); setForm({...form, provider: pid, model: modelsFor(prov, vault[pid]?.models)[0]?.id || ""});}} className="w-full rounded-xl border bg-muted px-3 py-2.5 text-sm">
                    {PROVIDERS.map(pr=><option key={pr.id} value={pr.id}>{pr.name}</option>)}
                  </select>
                  <select value={form.model} onChange={e=>setForm({...form, model:e.target.value})} className="w-full rounded-xl border bg-muted px-3 py-2.5 text-sm">
                    {modelsFor(PROVIDERS.find(x=>x.id===form.provider), vault[form.provider]?.models).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <textarea placeholder="System prompt" value={form.prompt} onChange={e=>setForm({...form, prompt:e.target.value})} rows={3} className="w-full rounded-xl border bg-muted px-3 py-2.5 text-sm"/>
                  <button onClick={()=>{ if(!form.name) return; addAgent({id: Date.now().toString(), name: form.name, role: form.role || "Agent", provider: form.provider, model: form.model || modelsFor(PROVIDERS.find(x=>x.id===form.provider), vault[form.provider]?.models)[0]?.id, systemPrompt: form.prompt, temperature: 0.5, color: PROVIDERS.find(x=>x.id===form.provider)!.color}); setShow(false);}} className="w-full rounded-full bg-foreground text-background py-2.5 text-sm">Create agent</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
