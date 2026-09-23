import Link from "next/link";
import { Eye, ArrowRight, Zap, Shield, Layers, Cpu, Sparkles, Check } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-foreground text-background grid place-items-center"><Eye className="h-5 w-5" /></div>
            <div>
              <div className="font-semibold leading-none">GodEye</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="text-sm px-5 py-2 rounded-full bg-foreground text-background">Open dashboard</Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-16 pb-8">
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"/> Workforce OS • Cloud + Windows App • Any LLM
        </div>
        <h1 className="mt-6 text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
          The workforce OS <br /><span className="text-muted-foreground">that sees everything.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Build multi-agent teams that code, write and operate with any provider — Nvidia, OpenRouter, OmeRoute, OpenAI, Anthropic and more. One control plane. Own it like it&apos;s yours.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-6 py-3 text-sm font-medium">Open dashboard <ArrowRight className="h-4 w-4" /></Link>
          <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-medium">Open dashboard</Link>
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-4">
          {[
            { icon: Cpu, title: "Any LLM. One vault.", desc: "Link Nvidia, OpenRouter, OmeRoute + 8 more. Agents load by provider, auto-fallback." },
            { icon: Layers, title: "Workforce canvas", desc: "Drag-drop agent graphs, handoffs, parallel runs, scheduled triggers." },
            { icon: Shield, title: "Own it fully", desc: "Themes, behaviors, density, sounds, profile — customize everything." },
          ].map(c => (
            <div key={c.title} className="rounded-2xl border bg-card p-5">
              <c.icon className="h-5 w-5" />
              <div className="mt-3 font-medium">{c.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{c.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="rounded-3xl border overflow-hidden bg-card">
          <div className="grid md:grid-cols-2">
            <div className="p-8">
              <div className="text-sm font-medium flex items-center gap-2"><Zap className="h-4 w-4" style={{color:'var(--accent)'}}/> Multi-model coding & content</div>
              <h3 className="mt-2 text-2xl font-semibold">One brief. Many models. One deliverable.</h3>
              <ul className="mt-4 space-y-2 text-sm">
                {["Devin-style engineer on OpenRouter Claude", "Deep Researcher on Gemini 2.0 Pro", "QA Reviewer on NVIDIA R1", "Operator browses & Writer publishes"].map(t=>(
                  <li key={t} className="flex gap-2"><Check className="h-4 w-4 mt-0.5 text-emerald-500"/>{t}</li>
                ))}
              </ul>
            </div>
            <div className="bg-muted p-6 grid place-items-center">
              <div className="w-full rounded-2xl border bg-card p-4 font-mono text-xs leading-relaxed">
                <div className="text-muted-foreground">// Agents loaded by provider</div>
                <div><span className="text-violet-600">Architect</span> → nvidia/llama-3.3-70b</div>
                <div><span className="text-blue-600">Devin</span> → openrouter/claude-sonnet-4</div>
                <div><span className="text-green-600">Reviewer</span> → nvidia/deepseek-r1</div>
                <div><span className="text-orange-600">Writer</span> → omeroute/auto</div>
                <div className="mt-3 rounded-xl bg-muted p-3">Output: reviewed PR + research brief + publish-ready copy</div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5"/> Premium Workforce OS • Relevance/Dust-style • Clean modern design
        </div>
      </section>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} S&P Group — GodEye OS. All rights reserved.</footer>
    </div>
  );
}
