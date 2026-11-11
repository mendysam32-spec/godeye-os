"""Mermaid → SVG/PNG renderer via headless Chromium. Uses the bundled mermaid.min.js (offline)."""
import json
import shutil
import tempfile
from pathlib import Path
from string import Template

VENDOR = Path(__file__).resolve().parent.parent / "vendor" / "mermaid.min.js"

# Background per mermaid theme (text colors assume these).
THEME_BG = {
    "default": "#ffffff",
    "neutral": "#ffffff",
    "forest": "#ffffff",
    "dark": "#0b1220",
    "base": "#ffffff",
}

_HTML = Template("""<!doctype html>
<html><head><meta charset="utf-8">
<script src="./mermaid.min.js"></script>
<style>
  body { margin:0; padding:28px; background:$bg; font-family:"Segoe UI", Arial, sans-serif; }
  #out svg { display:block; }
  #err { white-space:pre-wrap; color:#b91c1c; font:13px Consolas, monospace; max-width:900px; }
</style></head>
<body>
<div id="out"></div><pre id="err"></pre>
<script>
const code = $code;
const config = $config;
mermaid.initialize(Object.assign({ startOnLoad: false, securityLevel: "loose" }, config));
mermaid.render("graph1", code).then(({ svg }) => {
  document.getElementById("out").innerHTML = svg;
  const el = document.querySelector("#out svg");
  if (el) {
    // Size to the diagram's natural size (viewBox), capped, so the PNG is
    // crisp and correctly proportioned instead of stretched to page width.
    const vb = el.viewBox.baseVal;
    let w = vb && vb.width ? vb.width : el.getBoundingClientRect().width;
    let h = vb && vb.height ? vb.height : el.getBoundingClientRect().height;
    const cap = 1400;
    if (w > cap) { h = h * (cap / w); w = cap; }
    el.setAttribute("width", Math.round(w));
    el.setAttribute("height", Math.round(h));
    el.style.maxWidth = "none";
  }
  document.title = "MERMAID_READY";
}).catch((err) => {
  document.getElementById("err").textContent = String((err && err.message) || err);
  document.title = "MERMAID_ERROR";
});
</script>
</body></html>""")


def render_one(code, out_base, theme="default", scale=2, want_svg=True, want_png=True):
    """Render one diagram. Returns dict with svg/png paths and pixel size.

    Raises RuntimeError with the Mermaid parse message on failure.
    """
    if not VENDOR.exists():
        raise FileNotFoundError(f"bundled mermaid.min.js missing: {VENDOR}")

    theme = str(theme or "default").lower()
    if theme not in THEME_BG:
        theme = "default"
    bg = THEME_BG[theme]

    work_dir = Path(tempfile.mkdtemp(prefix="diagram-studio-"))
    try:
        shutil.copyfile(VENDOR, work_dir / "mermaid.min.js")
        config = {"theme": theme, "fontFamily": '"Segoe UI", Arial, sans-serif'}
        html = _HTML.substitute(bg=bg, code=json.dumps(str(code or "")), config=json.dumps(config))
        (work_dir / "index.html").write_text(html, encoding="utf-8")

        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport={"width": 1600, "height": 1100}, device_scale_factor=max(1, int(scale)))
            page.goto((work_dir / "index.html").resolve().as_uri())
            try:
                page.wait_for_function(
                    "document.title === 'MERMAID_READY' || document.title === 'MERMAID_ERROR'",
                    timeout=30000,
                )
            except Exception:
                pass  # fall through; error text read below either way
            state = page.evaluate("document.title")
            if state != "MERMAID_READY":
                message = page.evaluate("document.getElementById('err').textContent") or "unknown mermaid error"
                raise RuntimeError(str(message).strip() or "mermaid render failed")

            result = {}
            if want_svg:
                svg = page.evaluate("document.getElementById('out').innerHTML")
                svg_path = Path(str(out_base) + ".svg")
                svg_path.write_text(svg, encoding="utf-8")
                result["svg"] = str(svg_path)
                result["svg_bytes"] = svg_path.stat().st_size

            if want_png:
                box = page.evaluate(
                    "(() => { const el = document.querySelector('#out svg');"
                    " const r = el.getBoundingClientRect();"
                    " return { w: Math.ceil(r.width), h: Math.ceil(r.height) }; })()"
                )
                png_path = Path(str(out_base) + ".png")
                page.locator("#out svg").first.screenshot(path=str(png_path), scale="device")
                result["png"] = str(png_path)
                result["png_bytes"] = png_path.stat().st_size
                result["width"] = int(box["w"])
                result["height"] = int(box["h"])

            browser.close()
        return result
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
