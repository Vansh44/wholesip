#!/usr/bin/env python3
"""Generate supabase/homepage_hero_seed.sql — the WholeSip hero carousel as a
leading custom_code section on the homepage store_pages row (slug "")."""
import json, os

BASE = "https://oiblxqrvyekxdbimvhod.supabase.co/storage/v1/object/public/media/dashboard-uploads/"
A = {
    "almondBottle": BASE + "nei10q9mscn_1780343457832.png",
    "singleAlmond": BASE + "ngvkthdf3b_1780343562983.png",
    "almonds": BASE + "xdmdafqscc_1780343810851.png",
    "blueberryBottle": BASE + "jmunueumdml_1780343501018.png",
    "singleBlueberry": BASE + "i0y7x9sjox_1780343588753.png",
    "blueberries": BASE + "n2e74hl15l_1780343843904.png",
    "pistachioBottle": BASE + "9m3686ix2i_1780343537281.png",
    "singlePistachio": BASE + "pcijqkoaf2_1780343617414.png",
    "pistachios": BASE + "f33nes0qxrs_1780343888420.png",
}

HERO_ID = "c0de0000-0000-4000-8000-000000000001"

# --- HTML -------------------------------------------------------------------
HTML = """
<div class="hero" id="smhero">
  <div class="bgtext-wrap">
    <h1 class="bgtext">ALMOND</h1>
    <h1 class="bgtext">BLUEBERRY</h1>
    <h1 class="bgtext">PISTACHIO</h1>
  </div>
  <div class="nuts"></div>
  <div class="nuts"></div>
  <div class="nuts"></div>
  <div class="bottles">
    <a class="bottle" href="/shop/almond-milk"><img alt="Almond Ragda" /></a>
    <a class="bottle" href="/shop"><img alt="Blueberry Ragda" /></a>
    <a class="bottle" href="/shop"><img alt="Pistachio Ragda" /></a>
  </div>
  <button class="ctrl prev" aria-label="Previous slide"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
  <button class="ctrl next" aria-label="Next slide"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
  <div class="dots"></div>
</div>
"""

# --- CSS --------------------------------------------------------------------
CSS = """
@import url('https://fonts.googleapis.com/css2?family=Stick+No+Bills:wght@700;800&display=swap');
* { box-sizing: border-box; }
.hero {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 820px;
  min-height: 560px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-color: #E09771;
  transition: background-color 1s cubic-bezier(0.4, 0, 0.2, 1);
}
.bgtext-wrap {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none; z-index: 1;
}
.bgtext {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -46%) scale(0.96);
  font-family: 'Stick No Bills', 'Arial Narrow', Impact, sans-serif;
  font-weight: 800;
  font-size: clamp(120px, 22vw, 420px);
  line-height: 1; color: #fff; white-space: nowrap; margin: 0;
  letter-spacing: -2px; opacity: 0;
  transition: opacity 0.8s cubic-bezier(0.4,0,0.2,1), transform 0.8s cubic-bezier(0.4,0,0.2,1);
}
.bgtext.active { transform: translate(-50%, -50%) scale(1); opacity: 1; }
.bottles {
  position: relative; z-index: 10;
  width: clamp(200px, 22vw, 413px);
  aspect-ratio: 826 / 1728;
  animation: breathe 8s ease-in-out infinite;
  margin-top: 80px;
}
.bottle {
  position: absolute; top: 0; left: 0; right: 0; margin: 0 auto;
  width: 100%; height: 90%; display: block; cursor: pointer;
  transition: opacity 0.8s cubic-bezier(0.4,0,0.2,1), transform 0.8s cubic-bezier(0.175,0.885,0.32,1.275);
  opacity: 0; transform: scale(0.92) rotate(-6deg); pointer-events: none;
}
.bottle img {
  width: auto; height: 100%; margin: 0 auto; display: block;
  filter: drop-shadow(0 20px 40px rgba(0,0,0,0.15));
}
.bottle.active { opacity: 1; transform: scale(1) rotate(0deg); pointer-events: auto; }
.bottle.active:hover { transform: scale(1.04) rotate(-1deg); transition: transform 0.5s cubic-bezier(0.175,0.885,0.32,1.275); }
.nuts { position: absolute; inset: 0; pointer-events: none; opacity: 0; z-index: 5;
  transition: opacity 0.8s cubic-bezier(0.4,0,0.2,1); }
.nuts.active { opacity: 1; }
.nut { position: absolute; z-index: 5; animation: float ease-in-out infinite; }
.nutrot { width: clamp(70px, 8.5vw, 160px); display: flex; align-items: center; justify-content: center; }
.nutimg { width: 100%; height: auto; object-fit: contain; filter: drop-shadow(0 10px 20px rgba(0,0,0,0.12)); }
.ctrl {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 52px; height: 52px; border-radius: 50%;
  background: rgba(255,255,255,0.25); border: 1px solid rgba(255,255,255,0.35);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  color: #323232; display: flex; align-items: center; justify-content: center;
  cursor: pointer; z-index: 30; opacity: 0; visibility: hidden;
  transition: opacity 0.3s ease, background-color 0.2s ease, transform 0.2s ease, visibility 0.3s ease, border-color 0.2s ease;
}
.prev { left: 40px; } .next { right: 40px; }
.hero:hover .ctrl { opacity: 1; visibility: visible; }
.ctrl:hover { background: rgba(255,255,255,0.65); border-color: rgba(255,255,255,0.5); transform: translateY(-50%) scale(1.08); }
.ctrl:active { transform: translateY(-50%) scale(0.95); }
.dots { position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; z-index: 30; }
.dot { width: 10px; height: 10px; border-radius: 5px; background: rgba(255,255,255,0.35); cursor: pointer; border: none;
  transition: width 0.3s cubic-bezier(0.4,0,0.2,1), background-color 0.3s ease; }
.dot:hover { background: rgba(255,255,255,0.7); }
.dot.active { width: 32px; background: #fff; }
@keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
@keyframes breathe { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-8px) scale(1.02); } }
@media (max-width: 768px) {
  .hero { min-height: 460px; }
  .bgtext { font-size: clamp(65px, 15vw, 180px); letter-spacing: -1px; }
  .bottles { width: clamp(140px, 45vw, 220px); }
  .nutrot { width: clamp(40px, 10vw, 75px); }
  .ctrl { width: 42px; height: 42px; opacity: 0.8; visibility: visible; }
  .prev { left: 12px; } .next { right: 12px; }
  .dots { bottom: 24px; gap: 8px; }
  .dot { width: 8px; height: 8px; } .dot.active { width: 24px; }
}
"""

# --- JS ---------------------------------------------------------------------
slides = [
    {"color": "#E09771", "single": A["singleAlmond"], "cluster": A["almonds"], "bottle": A["almondBottle"]},
    {"color": "#9575AB", "single": A["singleBlueberry"], "cluster": A["blueberries"], "bottle": A["blueberryBottle"]},
    {"color": "#73AC96", "single": A["singlePistachio"], "cluster": A["pistachios"], "bottle": A["pistachioBottle"]},
]
nuts = [
    {"left": "85.3%", "top": "73.1%", "rotate": "-8.84deg", "type": "single", "delay": "0.9s", "duration": "5.6s"},
    {"left": "20.7%", "top": "45.4%", "rotate": "-6.28deg", "type": "single", "delay": "0.8s", "duration": "6.0s"},
    {"left": "6.2%", "top": "77.4%", "rotate": "-6.28deg", "type": "single", "delay": "1.7s", "duration": "5.9s"},
    {"left": "24.3%", "top": "13.1%", "rotate": "-6.28deg", "type": "cluster", "delay": "0.0s", "duration": "7.0s"},
    {"left": "64.6%", "top": "38.7%", "rotate": "-8.84deg", "type": "single", "delay": "0.5s", "duration": "5.4s"},
    {"left": "62.5%", "top": "75.5%", "rotate": "-52.08deg", "type": "cluster", "delay": "2.6s", "duration": "6.3s"},
    {"left": "-0.8%", "top": "46.7%", "rotate": "-29.59deg", "type": "cluster", "delay": "1.5s", "duration": "6.8s"},
    {"left": "24.7%", "top": "76.9%", "rotate": "-14.23deg", "type": "cluster", "delay": "0.4s", "duration": "7.2s"},
    {"left": "5.1%", "top": "11.0%", "rotate": "-52.13deg", "type": "single", "delay": "0.2s", "duration": "6.2s"},
    {"left": "66.3%", "top": "8.2%", "rotate": "-54.69deg", "type": "cluster", "delay": "1.1s", "duration": "6.5s"},
    {"left": "87.0%", "top": "15.3%", "rotate": "-54.69deg", "type": "single", "delay": "2.3s", "duration": "5.8s"},
    {"left": "83.7%", "top": "40.8%", "rotate": "-14.23deg", "type": "single", "delay": "2.0s", "duration": "6.6s"},
]

JS = """
var SLIDES = %s;
var NUTS = %s;
var hero = document.getElementById('smhero');
var groups = hero.querySelectorAll('.nuts');
var bottles = hero.querySelectorAll('.bottle');
groups.forEach(function (g, gi) {
  var s = SLIDES[gi];
  bottles[gi].querySelector('img').src = s.bottle;
  NUTS.forEach(function (n) {
    var c = document.createElement('div'); c.className = 'nut';
    c.style.left = n.left; c.style.top = n.top;
    c.style.animationDelay = n.delay; c.style.animationDuration = n.duration;
    var w = document.createElement('div'); w.className = 'nutrot';
    w.style.transform = 'rotate(' + n.rotate + ')';
    var img = document.createElement('img'); img.className = 'nutimg'; img.alt = '';
    img.loading = 'lazy'; img.src = n.type === 'single' ? s.single : s.cluster;
    w.appendChild(img); c.appendChild(w); g.appendChild(c);
  });
});
var dotsWrap = hero.querySelector('.dots');
SLIDES.forEach(function (s, i) {
  var b = document.createElement('button'); b.className = 'dot';
  b.setAttribute('aria-label', 'Go to slide ' + (i + 1));
  b.addEventListener('click', function () { go(i); });
  dotsWrap.appendChild(b);
});
var dots = dotsWrap.querySelectorAll('.dot');
var bg = hero.querySelectorAll('.bgtext');
var active = 0, timer = null, hovered = false;
function render() {
  hero.style.backgroundColor = SLIDES[active].color;
  for (var i = 0; i < SLIDES.length; i++) {
    bg[i].classList.toggle('active', i === active);
    groups[i].classList.toggle('active', i === active);
    bottles[i].classList.toggle('active', i === active);
    dots[i].classList.toggle('active', i === active);
  }
}
function go(i) { active = (i + SLIDES.length) %% SLIDES.length; render(); }
function stop() { if (timer) { clearInterval(timer); timer = null; } }
function start() { stop(); if (hovered) return; timer = setInterval(function () { go(active + 1); }, 3000); }
hero.querySelector('.prev').addEventListener('click', function () { go(active - 1); });
hero.querySelector('.next').addEventListener('click', function () { go(active + 1); });
hero.addEventListener('mouseenter', function () { hovered = true; stop(); });
hero.addEventListener('mouseleave', function () { hovered = false; start(); });
render(); start();
""" % (json.dumps(slides), json.dumps(nuts))

config = {
    "html": HTML.strip(),
    "css": CSS.strip(),
    "js": JS.strip(),
    "height_mode": "auto",
    "fixed_height": 700,
}
section = {"id": HERO_ID, "type": "custom_code", "enabled": True, "config": config}
section_json = json.dumps(section, ensure_ascii=False)

for f, label in [(config["html"], "HTML"), (config["css"], "CSS"), (config["js"], "JS")]:
    assert len(f) < 64 * 1024, f"{label} exceeds 64KB"
assert "$hero$" not in section_json

sql = """-- =============================================================
-- homepage_hero_seed.sql — the WholeSip hero carousel.
--
-- Phase 4a converted Hero.jsx into a leading custom_code section on the
-- homepage store_pages row (slug ""). The bulk migration
-- (homepage_to_store_pages.sql) intentionally left this out because it carries
-- vendored HTML/CSS/JS; this file IS that "one-time hero seed".
--
-- The hero runs inside the sandboxed custom-code iframe (see
-- app/(storefront)/components/sections/custom-code-frame.tsx):
--   * bottle links use relative hrefs (resolve against the store host) and
--     open in a new tab — the sandbox forbids top-frame navigation by design;
--   * the display font loads from Google Fonts via @import.
--
-- Idempotent: keyed on the fixed section id %s. Re-running removes any existing
-- copy and re-prepends the fresh one to BOTH draft `sections` and
-- `published_sections`. Regenerate with scratchpad/gen_hero_seed.py.
--
-- Apply via Supabase MCP apply_migration / execute_sql. WholeSip only
-- (store a0000000-0000-4000-8000-000000000001).
-- =============================================================

WITH hero AS (
  SELECT $hero$%s$hero$::jsonb AS obj
)
UPDATE store_pages sp
SET
  sections = (
    SELECT jsonb_build_array((SELECT obj FROM hero))
         || COALESCE(jsonb_agg(e) FILTER (WHERE e->>'id' <> '%s'), '[]'::jsonb)
    FROM jsonb_array_elements(sp.sections) e
  ),
  published_sections = (
    SELECT jsonb_build_array((SELECT obj FROM hero))
         || COALESCE(jsonb_agg(e) FILTER (WHERE e->>'id' <> '%s'), '[]'::jsonb)
    FROM jsonb_array_elements(sp.published_sections) e
  ),
  status = 'published',
  updated_at = NOW()
WHERE sp.store_id = 'a0000000-0000-4000-8000-000000000001'
  AND sp.slug = '';
""" % (HERO_ID, section_json, HERO_ID, HERO_ID)

out = os.path.join(os.path.dirname(__file__), "homepage_hero_seed.sql")
with open(out, "w") as fh:
    fh.write(sql)
print("wrote", out, "-", len(section_json), "bytes of section json")
print("html", len(config["html"]), "css", len(config["css"]), "js", len(config["js"]))
