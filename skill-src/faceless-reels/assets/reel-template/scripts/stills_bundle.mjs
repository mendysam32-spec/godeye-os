// Check stills from an existing bundle (npx remotion bundle src/index.ts --out-dir <bundle>),
// so the whole public/ folder (several GB) is not copied again for every series of stills.
// node scripts/stills_bundle.mjs <bundle> <output folder> <composition:frame> [...]
// CHROME_MODE=chrome-for-testing (optional): when the "headless-shell" browser renders nothing anymore ("Waiting for
// root component to load" timeout even on an empty composition), Chrome for Testing works.
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';

const [, , serveUrl, outDir, ...targets] = process.argv;
const chromeMode = process.env.CHROME_MODE ?? 'headless-shell';
fs.mkdirSync(outDir, {recursive: true});
const browser = await openBrowser('chrome', {chromeMode});
const compositions = new Map();
for (const t of targets) {
  const [id, f] = t.split(':');
  if (!compositions.has(id)) {
    compositions.set(id, await selectComposition({serveUrl, id, puppeteerInstance: browser, chromeMode}));
  }
  const frame = Number(f);
  const output = path.join(outDir, `${id}-f${String(frame).padStart(5, '0')}.jpg`);
  await renderStill({composition: compositions.get(id), serveUrl, frame, output, imageFormat: 'jpeg', jpegQuality: 80, puppeteerInstance: browser, chromeMode});
  console.log('ok', id, frame);
}
await browser.close({silent: true});
