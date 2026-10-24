import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const HEADS = [
  { at: [150, 104], d: "M150,104 C142,78 120,72 112,52", w: 7, dir: -1, delay: 0 },
  { at: [172, 92], d: "M172,92 C170,64 150,52 146,30", w: 7, dir: -1, delay: 0.4 },
  { at: [200, 86], d: "M200,86 C202,56 216,48 220,24", w: 8, dir: 1, delay: 0.8 },
  { at: [228, 92], d: "M228,92 C238,64 260,54 268,34", w: 7, dir: 1, delay: 1.2 },
  { at: [250, 104], d: "M250,104 C262,80 284,76 296,58", w: 7, dir: 1, delay: 1.6 },
  { at: [132, 128], d: "M132,128 C108,116 84,124 70,108", w: 6.5, dir: -1, delay: 0.6 },
  { at: [268, 128], d: "M268,128 C292,116 316,124 330,108", w: 6.5, dir: 1, delay: 1.0 },
  { at: [124, 150], d: "M124,150 C96,152 74,170 66,196", w: 6, dir: -1, delay: 1.4 },
  { at: [276, 150], d: "M276,150 C304,152 326,170 334,196", w: 6, dir: 1, delay: 0.2 },
];

const BACK_SNAKES = [
  "M120,80 C60,120 50,200 90,260",
  "M280,80 C340,120 350,200 310,260",
  "M90,140 C40,190 60,300 120,330",
  "M310,140 C360,190 340,300 280,330",
];

const END = "round";
const num = (d) => d.match(/-?\d+(?:\.\d+)?/g).map(Number);
function headEnd(d) {
  const n = num(d);
  return [n[n.length - 2], n[n.length - 1]];
}

const backSnakes = BACK_SNAKES.map((d) => {
  const [ex, ey] = headEnd(d);
  const t = `M${ex + 6},${ey + 2} l6,3 m-6,-3 l6,-3`;
  return `<path d="${d}" stroke="#3d3b8f" stroke-width="11" stroke-linecap="${END}"/><circle cx="${ex}" cy="${ey}" r="8" fill="#4a48a8"/><path d="${t}" stroke="#7a78e6" stroke-width="2" stroke-linecap="${END}"/>`;
}).join("");

const crowns = HEADS.map((s) => {
  const [ex, ey] = headEnd(s.d);
  return `<path d="${s.d}" stroke="url(#m-snake)" stroke-width="${s.w}" stroke-linecap="${END}"/><circle cx="${ex}" cy="${ey}" r="${s.w * 0.85}" fill="#4f4db4"/><circle cx="${ex}" cy="${ey}" r="${s.w * 0.35}" fill="#211f5e"/><path d="M${ex + s.dir * 6},${ey} l6,3 m-6,-3 l6,-3" stroke="#b7b6ff" stroke-width="2" stroke-linecap="${END}"/>`;
}).join("");

const defs = `<defs>
<radialGradient id="m-glow" cx="0.5" cy="0.45" r="0.5"><stop offset="0" stop-color="#9a99ff" stop-opacity="0.30"/><stop offset="1" stop-color="#9a99ff" stop-opacity="0"/></radialGradient>
<radialGradient id="m-face" cx="0.5" cy="0.35" r="0.85"><stop offset="0" stop-color="#f2f1ff"/><stop offset="0.55" stop-color="#cfcdf6"/><stop offset="1" stop-color="#9c9ade"/></radialGradient>
<linearGradient id="m-cap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a389b"/><stop offset="1" stop-color="#26246e"/></linearGradient>
<linearGradient id="m-snake" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#918fff"/><stop offset="1" stop-color="#6563d4"/></linearGradient>
<linearGradient id="m-neck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b89e0"/><stop offset="1" stop-color="#6f6dd0"/></linearGradient>
<radialGradient id="m-iris" cx="0.35" cy="0.35" r="0.9"><stop offset="0" stop-color="#8482ff"/><stop offset="1" stop-color="#4c4ad0"/></radialGradient>
<radialGradient id="m-socket" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#2e2c66" stop-opacity="0.35"/><stop offset="1" stop-color="#2e2c66" stop-opacity="0"/></radialGradient>
<filter id="m-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#120f3a" flood-opacity="0.45"/></filter>
</defs>`;

const svg = `<svg viewBox="0 0 400 440" width="432" height="475" fill="none" xmlns="http://www.w3.org/2000/svg">${defs}
<g class="medusa-back"><ellipse cx="200" cy="205" rx="170" ry="170" fill="url(#m-glow)"/>${backSnakes}<path d="M116,196 C100,110 150,64 200,64 C250,64 300,110 284,196 Z" fill="url(#m-cap)"/></g>
<g filter="url(#m-shadow)">
<path d="M175,318 L171,392 Q200,406 229,392 L225,318 Z" fill="url(#m-neck)"/>
<path d="M160,318 Q200,346 240,318 L232,296 Q200,314 168,296 Z" fill="#5a58be" opacity="0.7"/>
<path d="M200,96 C258,96 284,140 284,196 C284,238 268,276 240,300 Q200,330 160,300 C132,276 116,238 116,196 C116,140 142,96 200,96 Z" fill="url(#m-face)"/>
<ellipse cx="152" cy="228" rx="20" ry="30" fill="#8b89cf" opacity="0.35"/><ellipse cx="248" cy="228" rx="20" ry="30" fill="#8b89cf" opacity="0.35"/>
</g>
<ellipse cx="200" cy="132" rx="64" ry="30" fill="url(#m-cap)" opacity="0.9"/>
<path d="M150,128 Q200,104 250,128" stroke="#26246e" stroke-width="3" opacity="0.5" fill="none"/>
<g>${crowns}<path d="M160,120 Q200,96 240,120" stroke="url(#m-snake)" stroke-width="4" opacity="0.6" fill="none" stroke-linecap="${END}"/><path d="M150,136 Q200,112 250,136" stroke="url(#m-snake)" stroke-width="3.5" opacity="0.45" fill="none" stroke-linecap="${END}"/></g>
<ellipse cx="166" cy="192" rx="22" ry="14" fill="url(#m-socket)"/><ellipse cx="234" cy="192" rx="22" ry="14" fill="url(#m-socket)"/>
<path d="M150,190 Q166,181 184,188" stroke="#33316e" stroke-width="4.5" stroke-linecap="${END}" fill="none"/>
<path d="M250,190 Q234,181 216,188" stroke="#33316e" stroke-width="4.5" stroke-linecap="${END}" fill="none"/>
<g><path d="M148,206 Q166,193 184,206 Q166,217 148,206 Z" fill="#f4f3ff" stroke="#33316e" stroke-width="2"/><circle cx="166" cy="206" r="9" fill="url(#m-iris)"/><circle cx="166" cy="206" r="4" fill="#1b1948"/><circle cx="163.5" cy="203.5" r="2.2" fill="#ffffff" opacity="0.9"/></g>
<g><path d="M216,206 Q234,193 252,206 Q234,217 216,206 Z" fill="#f4f3ff" stroke="#33316e" stroke-width="2"/><circle cx="234" cy="206" r="9" fill="url(#m-iris)"/><circle cx="234" cy="206" r="4" fill="#1b1948"/><circle cx="231.5" cy="203.5" r="2.2" fill="#ffffff" opacity="0.9"/></g>
<path d="M198,214 Q192,234 195,240 Q200,246 207,240" stroke="#6d6bb8" stroke-width="3.5" stroke-linecap="${END}" fill="none" opacity="0.7"/>
<circle cx="196" cy="243" r="1.6" fill="#4c4a9e"/><circle cx="205" cy="243" r="1.6" fill="#4c4a9e"/>
<path d="M174,270 Q200,262 226,270 Q214,281 200,280 Q186,281 174,270 Z" fill="#8a7cc2" opacity="0.85"/>
<path d="M181,272 Q200,267 219,272" stroke="#5d4f96" stroke-width="2" stroke-linecap="${END}" fill="none"/>
<path d="M199,281 L199,290 M199,290 L194,294 M199,290 L204,294" stroke="#b7b6ff" stroke-width="2" stroke-linecap="${END}" fill="none"/>
</svg>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;width:512px;height:512px;background:transparent;}
.tile{width:512px;height:512px;background:#181818;border-radius:112px;overflow:hidden;display:grid;place-items:center;}
</style></head><body><div class="tile">${svg}</div></body></html>`;

const tmp = path.join(os.tmpdir(), "medusa-icon");
mkdirSync(tmp, { recursive: true });
const htmlPath = path.join(tmp, "icon-src.html");
const pngPath = path.join(tmp, "icon-out.png");
writeFileSync(htmlPath, html);

const candidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];
const browser = candidates.find((p) => existsSync(p));
if (!browser) throw new Error("No Edge/Chrome found for icon rasterization");

execFileSync(browser, [
  `--headless=old`,
  `--disable-gpu`,
  `--screenshot=${pngPath}`,
  `--window-size=512,512`,
  `--hide-scrollbars`,
  `--virtual-time-budget=3000`,
  `file:///${htmlPath.replace(/\\/g, "/")}`,
], { stdio: "ignore", timeout: 30000 });

const dest = path.resolve(process.cwd(), "electron/icon.png");
copyFileSync(pngPath, dest);
console.log("icon written:", dest, "size:", execFileSync("powershell", ["-NoProfile", "-Command", `(Get-Item '${dest}').Length`]).toString().trim(), "bytes");
