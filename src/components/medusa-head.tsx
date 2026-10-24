"use client";
import { useEffect, useRef } from "react";

type Pt = { x: number; y: number };

const HEADS: { at: Pt; d: string; w: number; dir: number; delay: number }[] = [
  { at: { x: 150, y: 104 }, d: "M150,104 C142,78 120,72 112,52", w: 7, dir: -1, delay: 0 },
  { at: { x: 172, y: 92 }, d: "M172,92 C170,64 150,52 146,30", w: 7, dir: -1, delay: 0.4 },
  { at: { x: 200, y: 86 }, d: "M200,86 C202,56 216,48 220,24", w: 8, dir: 1, delay: 0.8 },
  { at: { x: 228, y: 92 }, d: "M228,92 C238,64 260,54 268,34", w: 7, dir: 1, delay: 1.2 },
  { at: { x: 250, y: 104 }, d: "M250,104 C262,80 284,76 296,58", w: 7, dir: 1, delay: 1.6 },
  { at: { x: 132, y: 128 }, d: "M132,128 C108,116 84,124 70,108", w: 6.5, dir: -1, delay: 0.6 },
  { at: { x: 268, y: 128 }, d: "M268,128 C292,116 316,124 330,108", w: 6.5, dir: 1, delay: 1.0 },
  { at: { x: 124, y: 150 }, d: "M124,150 C96,152 74,170 66,196", w: 6, dir: -1, delay: 1.4 },
  { at: { x: 276, y: 150 }, d: "M276,150 C304,152 326,170 334,196", w: 6, dir: 1, delay: 0.2 },
];

const BACK_SNAKES = [
  "M120,80 C60,120 50,200 90,260",
  "M280,80 C340,120 350,200 310,260",
  "M90,140 C40,190 60,300 120,330",
  "M310,140 C360,190 340,300 280,330",
];

function headEnd(d: string): Pt {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return { x: nums[nums.length - 2] ?? 0, y: nums[nums.length - 1] ?? 0 };
}

export function MedusaHead({ size = 380, className = "" }: { size?: number; className?: string }) {
  const scene = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scene.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const onMove = (e: MouseEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const tick = () => {
      cx += (tx - cx) * 0.07;
      cy += (ty - cy) * 0.07;
      const rig = el.querySelector<HTMLElement>(".medusa-rig");
      if (rig) rig.style.transform = `rotateY(${(cx * 14).toFixed(2)}deg) rotateX(${(-cy * 10).toFixed(2)}deg)`;
      el.querySelectorAll<SVGElement>(".medusa-pupil").forEach(p => {
        p.style.transform = `translate(${(cx * 6).toFixed(2)}px, ${(cy * 4).toFixed(2)}px)`;
      });
      const back = el.querySelector<HTMLElement>(".medusa-back");
      if (back) back.style.transform = `translate(${(-cx * 10).toFixed(2)}px, ${(-cy * 7).toFixed(2)}px)`;
      const front = el.querySelector<HTMLElement>(".medusa-front");
      if (front) front.style.transform = `translate(${(cx * 12).toFixed(2)}px, ${(cy * 8).toFixed(2)}px)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={scene} className={`medusa-scene ${className}`} style={{ width: size, height: size * 1.1 }}>
      <div className="medusa-float">
        <div className="medusa-rig">
          <svg viewBox="0 0 400 440" width={size} height={size * 1.1} fill="none" aria-label="MEDUSA">
            <defs>
              <radialGradient id="m-glow" cx="0.5" cy="0.45" r="0.5">
                <stop offset="0" stopColor="var(--home-brand-accent)" stopOpacity="0.30" />
                <stop offset="1" stopColor="var(--home-brand-accent)" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="m-face" cx="0.5" cy="0.35" r="0.85">
                <stop offset="0" stopColor="#f2f1ff" />
                <stop offset="0.55" stopColor="#cfcdf6" />
                <stop offset="1" stopColor="#9c9ade" />
              </radialGradient>
              <linearGradient id="m-cap" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#3a389b" />
                <stop offset="1" stopColor="#26246e" />
              </linearGradient>
              <linearGradient id="m-snake" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#918fff" />
                <stop offset="1" stopColor="#6563d4" />
              </linearGradient>
              <linearGradient id="m-neck" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#8b89e0" />
                <stop offset="1" stopColor="#6f6dd0" />
              </linearGradient>
              <radialGradient id="m-iris" cx="0.35" cy="0.35" r="0.9">
                <stop offset="0" stopColor="#8482ff" />
                <stop offset="1" stopColor="#4c4ad0" />
              </radialGradient>
              <radialGradient id="m-socket" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stopColor="#2e2c66" stopOpacity="0.35" />
                <stop offset="1" stopColor="#2e2c66" stopOpacity="0" />
              </radialGradient>
              <filter id="m-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#120f3a" floodOpacity="0.45" />
              </filter>
            </defs>

            <g className="medusa-back">
              <ellipse cx="200" cy="205" rx="170" ry="170" fill="url(#m-glow)" />
              {BACK_SNAKES.map((d, i) => {
                const e = headEnd(d);
                return (
                  <g key={i}>
                    <path d={d} stroke="#3d3b8f" strokeWidth="11" strokeLinecap="round" />
                    <circle cx={e.x} cy={e.y} r="7" fill="#4a48a8" />
                    <path d={`M${e.x + 6},${e.y + 2} l6,3 m-6,-3 l6,-3`} stroke="#7a78e6" strokeWidth="2" strokeLinecap="round" />
                  </g>
                );
              })}
              <path d="M116,196 C100,110 150,64 200,64 C250,64 300,110 284,196 Z" fill="url(#m-cap)" />
            </g>

            <g filter="url(#m-shadow)">
              <path d="M175,318 L171,392 Q200,406 229,392 L225,318 Z" fill="url(#m-neck)" />
              <path d="M160,318 Q200,346 240,318 L232,296 Q200,314 168,296 Z" fill="#5a58be" opacity="0.7" />
              <path
                d="M200,96 C258,96 284,140 284,196 C284,238 268,276 240,300 Q200,330 160,300 C132,276 116,238 116,196 C116,140 142,96 200,96 Z"
                fill="url(#m-face)"
              />
              <ellipse cx="152" cy="228" rx="20" ry="30" fill="#8b89cf" opacity="0.35" />
              <ellipse cx="248" cy="228" rx="20" ry="30" fill="#8b89cf" opacity="0.35" />
            </g>

            <ellipse cx="200" cy="132" rx="64" ry="30" fill="url(#m-cap)" opacity="0.9" />
            <path d="M150,128 Q200,104 250,128" stroke="#26246e" strokeWidth="3" opacity="0.5" fill="none" />

            <g className="medusa-front">
              {HEADS.map((s, i) => {
                const e = headEnd(s.d);
                return (
                  <g
                    key={i}
                    className="medusa-snake"
                    style={{ transformOrigin: `${s.at.x}px ${s.at.y}px`, animationDelay: `${s.delay}s` }}
                  >
                    <path d={s.d} stroke="url(#m-snake)" strokeWidth={s.w} strokeLinecap="round" />
                    <circle cx={e.x} cy={e.y} r={s.w * 0.85} fill="#4f4db4" />
                    <circle cx={e.x} cy={e.y} r={s.w * 0.35} fill="#211f5e" />
                    <path
                      d={`M${e.x + s.dir * 6},${e.y} l6,3 m-6,-3 l6,-3`}
                      stroke="#b7b6ff"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}
              <path d="M160,120 Q200,96 240,120" stroke="url(#m-snake)" strokeWidth="4" opacity="0.6" fill="none" strokeLinecap="round" />
              <path d="M150,136 Q200,112 250,136" stroke="url(#m-snake)" strokeWidth="3.5" opacity="0.45" fill="none" strokeLinecap="round" />
            </g>

            <ellipse cx="166" cy="192" rx="22" ry="14" fill="url(#m-socket)" />
            <ellipse cx="234" cy="192" rx="22" ry="14" fill="url(#m-socket)" />
            <path d="M150,190 Q166,181 184,188" stroke="#33316e" strokeWidth="4.5" strokeLinecap="round" fill="none" />
            <path d="M250,190 Q234,181 216,188" stroke="#33316e" strokeWidth="4.5" strokeLinecap="round" fill="none" />

            <g className="medusa-eye" style={{ transformOrigin: "166px 206px" }}>
              <path d="M148,206 Q166,193 184,206 Q166,217 148,206 Z" fill="#f4f3ff" stroke="#33316e" strokeWidth="2" />
              <g className="medusa-pupil">
                <circle cx="166" cy="206" r="9" fill="url(#m-iris)" />
                <circle cx="166" cy="206" r="4" fill="#1b1948" />
                <circle cx="163.5" cy="203.5" r="2.2" fill="#ffffff" opacity="0.9" />
              </g>
            </g>
            <g className="medusa-eye" style={{ transformOrigin: "234px 206px" }}>
              <path d="M216,206 Q234,193 252,206 Q234,217 216,206 Z" fill="#f4f3ff" stroke="#33316e" strokeWidth="2" />
              <g className="medusa-pupil">
                <circle cx="234" cy="206" r="9" fill="url(#m-iris)" />
                <circle cx="234" cy="206" r="4" fill="#1b1948" />
                <circle cx="231.5" cy="203.5" r="2.2" fill="#ffffff" opacity="0.9" />
              </g>
            </g>

            <path d="M198,214 Q192,234 195,240 Q200,246 207,240" stroke="#6d6bb8" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.7" />
            <circle cx="196" cy="243" r="1.6" fill="#4c4a9e" />
            <circle cx="205" cy="243" r="1.6" fill="#4c4a9e" />
            <path d="M174,270 Q200,262 226,270 Q214,281 200,280 Q186,281 174,270 Z" fill="#8a7cc2" opacity="0.85" />
            <path d="M181,272 Q200,267 219,272" stroke="#5d4f96" strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d="M199,281 L199,290 M199,290 L194,294 M199,290 L204,294" stroke="#b7b6ff" strokeWidth="2" strokeLinecap="round" fill="none" className="medusa-tongue" />
          </svg>
        </div>
      </div>
    </div>
  );
}
