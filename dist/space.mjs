// Asterlight voyage — the scroll-driven flight in front of the sky explorer.
//
// One fixed <canvas id="cosmos"> sits behind the whole page. Scrolling through
// <section id="voyage"> drives one deterministic story:
//   OBSERVE an observatory on a hill at night, city lights below, a galaxy above
//   FOCUS   the main dome opens, the camera pushes down the telescope and out
//           through the eyepiece, then the stars stretch
//   CROSS   the camera flies through the galaxy past the five challenge targets
//   ARRIVE  it slows in front of a second galaxy and locks a field reticle
// After the voyage the same canvas stays behind the explorer, dimmed.
//
// Self-contained: plain Canvas 2D, no dependencies, no build step, and it never
// touches app.mjs state. It only reads #ra / #dec for the telemetry line.
import {targets} from './targets.mjs';

const canvas = document.getElementById('cosmos');
const voyage = document.getElementById('voyage');
const ctx = canvas?.getContext('2d');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Accent colours used on the canvas: Asterlight lime, cool grey, white.
const PAL = ['#d9ef85', '#c8cdd8', '#ffffff'];
const GR = ['217,239,133', '200,205,216', '255,255,255'];

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const wrap = (v, size) => ((v % size) + size) % size;

// ---------------------------------------------------------------- preloader
// The wordmark is built out of small squares, then lifts away.
function preloader() {
  const host = document.getElementById('preloader');
  if (!host) return Promise.resolve();
  const done = () => { host.classList.add('gone'); setTimeout(() => host.remove(), 700); };
  if (reduced) { done(); return Promise.resolve(); }
  const c = host.querySelector('canvas'), g = c.getContext('2d');
  return Promise.race([document.fonts?.load?.('400 100px "Instrument Serif"').catch(() => {}) ?? Promise.resolve(), new Promise(r => setTimeout(r, 600))]).then(() => new Promise(resolve => {
    const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (!w || !h) { done(); resolve(); return; }
    c.width = w * dpr; c.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const size = Math.min(150, w / 6.2), cell = Math.max(4, Math.round(size / 16));
    const off = document.createElement('canvas'); off.width = w; off.height = h;
    const o = off.getContext('2d');
    o.font = `400 ${size * 1.15}px "Instrument Serif", Georgia, serif`;
    o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff';
    o.fillText('asterlight', w / 2, h / 2);
    const data = o.getImageData(0, 0, w, h).data, squares = [];
    for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell)
      if (data[((y + (cell >> 1)) * w + x + (cell >> 1)) * 4 + 3] > 128)
        squares.push({x, y, delay: Math.random() * 0.55 + (x / w) * 0.25, lime: Math.random() < 0.07});
    const start = performance.now();
    const skip = () => { host.removeEventListener('pointerdown', skip); finish(); };
    host.addEventListener('pointerdown', skip);
    let raf, finished = false;
    function finish() { if (finished) return; finished = true; cancelAnimationFrame(raf); done(); resolve(); }
    (function draw(now) {
      const t = (now - start) / 1000;
      g.clearRect(0, 0, w, h);
      for (const s of squares) {
        const k = clamp((t - s.delay) / 0.35);
        if (!k) continue;
        const lift = t > 1.2 ? (t - 1.2) * (s.delay + 0.4) * 60 : 0;
        g.globalAlpha = k * (t > 1.2 ? clamp(1 - (t - 1.2) * 2.8) : 1);
        g.fillStyle = s.lime ? PAL[0] : '#e9eef8';
        const z = cell * (0.35 + 0.5 * k);
        g.fillRect(s.x + (cell - z) / 2, s.y + (cell - z) / 2 - lift, z, z);
      }
      g.globalAlpha = 1;
      if (t > 1.55) finish(); else raf = requestAnimationFrame(draw);
    })(start);
  }));
}

// ------------------------------------------------------------- text decode
// Copy resolves letter by letter from glyph noise when its chapter arrives.
const GLYPHS = '<>/\\|=+*:·01ΔΣΛ░▒';
const running = new WeakMap();
function decode(el) {
  if (reduced || !el) return;
  running.get(el)?.cancel();
  const nodes = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const originals = nodes.map(n => n.__orig ?? (n.__orig = n.textContent));
  const total = originals.reduce((s, t) => s + t.length, 0);
  const start = performance.now(), dur = 520 + total * 9;
  let raf;
  const restore = () => nodes.forEach((n, i) => (n.textContent = originals[i]));
  running.set(el, {cancel() { cancelAnimationFrame(raf); restore(); }});
  (function step(now) {
    const reveal = clamp((now - start) / dur) * total;
    let seen = 0;
    nodes.forEach((n, i) => {
      const src = originals[i];
      let out = '';
      for (let j = 0; j < src.length; j++) {
        const ch = src[j];
        out += seen + j < reveal || ch === ' ' || ch === '\n' ? ch : seen + j < reveal + 14 ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : ' ';
      }
      seen += src.length;
      n.textContent = out;
    });
    if (reveal < total) raf = requestAnimationFrame(step); else { restore(); running.delete(el); }
  })(start);
}

// ------------------------------------------------- reveals, cursor, progress
function ambient() {
  const glow = Object.assign(document.createElement('div'), {className: 'cursor-glow'});
  const bar = Object.assign(document.createElement('div'), {className: 'progress'});
  glow.setAttribute('aria-hidden', 'true'); bar.setAttribute('aria-hidden', 'true');
  document.body.append(glow, bar);
  if (!reduced) addEventListener('pointermove', e => { glow.style.setProperty('--mx', e.clientX + 'px'); glow.style.setProperty('--my', e.clientY + 'px'); }, {passive: true});
  const page = () => document.body.style.setProperty('--page', (scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)).toFixed(4));
  addEventListener('scroll', page, {passive: true}); page();
  const groups = [['.section-heading', '.workbench', '.data-strip'], ['.field-guide>div', '.field-guide li'], ['footer']];
  const items = groups.flatMap(g => g.flatMap(sel => [...document.querySelectorAll(sel)]));
  if (reduced || !('IntersectionObserver' in window)) return;
  items.forEach(el => { el.dataset.reveal = ''; const sib = el.matches('li') ? [...el.parentNode.children].indexOf(el) : 0; el.style.setProperty('--d', `${sib * 0.1}s`); });
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    en.target.classList.add('is-in'); io.unobserve(en.target);
    en.target.querySelectorAll('h2').forEach(h => decode(h));
  }), {rootMargin: '0px 0px -12% 0px'});
  items.forEach(el => io.observe(el));
}
ambient();

// -------------------------------------------------------------------- scene
if (ctx && voyage) {
  const chapters = [...voyage.querySelectorAll('[data-chapter]')];
  const navButtons = [...document.querySelectorAll('[data-goto]')];
  const telemetry = document.getElementById('telemetry');
  const explore = document.getElementById('explore');
  const raInput = document.getElementById('ra'), decInput = document.getElementById('dec');
  for (const el of document.querySelectorAll('[data-decode]')) el.setAttribute('aria-label', el.textContent.trim());

  let w = 0, h = 0, dpr = 1, F = 1, cx = 0, cy = 0, diag2 = 1;
  let pRaw = 0, p = 0, post = 0, last = performance.now(), clock = 0;
  let mouse = [0.5, 0.5], lean = [0, 0];
  let camZ = 0, camY = 0, prevZ = 0, prevY = 0;
  let activeChapter = -1;

  // Rand with a fixed seed so the sky is the same on every visit.
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;

  // Flight speed over the voyage; integrated into a camera depth table.
  const SPEED = [[0, 0], [0.33, 0], [0.42, 0.7], [0.5, 3], [0.54, 3.1], [0.65, 0.9], [0.76, 1.6], [0.9, 0.25], [1, 0]];
  const speedAt = x => { for (let i = 1; i < SPEED.length; i++) if (x <= SPEED[i][0]) { const [a, va] = SPEED[i - 1], [b, vb] = SPEED[i]; return lerp(va, vb, smooth(0, 1, (x - a) / (b - a))); } return 0; };
  const Z_END = 16000, TABLE = 600, depth = new Float32Array(TABLE + 1);
  for (let i = 1; i <= TABLE; i++) depth[i] = depth[i - 1] + speedAt(i / TABLE);
  for (let i = 0; i <= TABLE; i++) depth[i] *= Z_END / depth[TABLE];
  const zAt = x => { const f = clamp(x) * TABLE, i = Math.floor(f); return i >= TABLE ? depth[TABLE] : lerp(depth[i], depth[i + 1], f - i); };

  // ---- starfield: an endless tube of stars that wraps around the camera.
  const TUBE = 2600, DEPTH = 7000;
  const STAR_TINTS = ['233,238,255', '210,224,255', '255,236,214', '217,239,133', '196,181,253'];
  const stars = Array.from({length: reduced ? 900 : 1500}, () => ({
    x: rnd() * TUBE, y: rnd() * TUBE, z: rnd() * DEPTH,
    r: 0.5 + rnd() * rnd() * 2.2, c: STAR_TINTS[(rnd() * rnd() * STAR_TINTS.length) | 0], a: 0.35 + rnd() * 0.65, tw: rnd() * 6.28,
  }));

  // ---- galaxies: spiral arms of stars and dust (after sift's Galaxy.jsx), in 3D.
  const COOL = ['122,82,255', '47,107,255', '236,72,153', '34,211,238', '167,139,250', '244,114,182', '20,184,166', '96,165,250'];
  const WARM = ['217,239,133', '255,190,120', '255,155,105', '196,181,253', '120,200,180', '250,230,170'];
  function galaxy({x, y, z, R, count, arms, tiltX, tiltZ, palette, wind = 5.2}) {
    const pts = Array.from({length: count}, () => {
      const d = Math.pow(rnd(), 0.7);
      return {arm: ((rnd() * arms) | 0) * (6.283 / arms), d, sx: gauss() * (0.05 + d * 0.11), sy: gauss() * (0.05 + d * 0.11), sw: gauss() * 0.035 * (1.2 - d),
        r: rnd() < 0.05 ? 1.7 + rnd() * 1.6 : 0.6 + rnd() * 1.1, c: palette[(rnd() * palette.length) | 0], a: 0.2 + rnd() * 0.6, tw: rnd() * 6.28};
    });
    const clouds = [];
    for (let k = 0; k < arms; k++) for (let i = 1; i <= 6; i++) clouds.push({arm: k * (6.283 / arms), d: i / 7, size: 0.16 + (i / 7) * 0.12, c: palette[(i * 3 + k * 2) % palette.length], a: 0.075});
    return {x, y, z, R, pts, clouds, arms, wind, cX: Math.cos(tiltX), sX: Math.sin(tiltX), cZ: Math.cos(tiltZ), sZ: Math.sin(tiltZ), palette};
  }
  const G1Z = zAt(0.63);
  const galaxies = [
    galaxy({x: 760, y: -300, z: G1Z, R: 2100, count: reduced ? 2200 : 4600, arms: 2, tiltX: 1.05, tiltZ: -0.38, palette: COOL}),
    galaxy({x: 0, y: -640, z: Z_END + 3600, R: 2400, count: reduced ? 1400 : 2400, arms: 3, tiltX: 1.15, tiltZ: 0.3, palette: WARM, wind: 4.4}),
  ];

  // Five challenge targets pinned as waypoints along the galaxy crossing.
  const waypoints = Object.values(targets).map((t, i) => ({
    name: t.name, ra: t.ra, dec: t.dec,
    x: [380, 620, 240, 540, 330][i], y: [-300, -90, -420, 60, -230][i], z: G1Z + [-2300, -1500, -650, 250, 1100][i],
  }));

  // Soft round sprites, one per colour, for glows and dust.
  const sprites = new Map();
  const sprite = c => {
    if (sprites.has(c)) return sprites.get(c);
    const s = document.createElement('canvas'); s.width = s.height = 128;
    const g = s.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, `rgba(${c},1)`); grad.addColorStop(0.35, `rgba(${c},0.35)`); grad.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128); sprites.set(c, s); return s;
  };

  // ---- the observatory on its hill. Drawn procedurally in local units: the
  // building is ~1040 wide, the summit is y = 0, up is negative. The camera
  // pushes into the slit of the main dome, finds the refractor inside, goes
  // to its eyepiece and looks through it into space.
  const meteors = [];
  const FOCUS = [0, -270], TAU = Math.PI * 2;
  const cityLights = Array.from({length: reduced ? 600 : 1400}, () => {
    const x = (rnd() * 2 - 1) * 4200, y = 340 + Math.pow(rnd(), 1.4) * 760;
    return {x, y, s: 1.4 + rnd() * 2.4 * (y / 500), warm: rnd() < 0.78, tw: rnd() * TAU, a: 0.35 + rnd() * 0.6};
  });
  const brush = Array.from({length: 700}, () => {
    const x = (rnd() * 2 - 1) * 1700;
    return {x, d: rnd(), r: 2 + rnd() * 5};
  });
  const windows = [];
  for (const side of [-1, 1]) for (let x = 192; x < 455; x += 22) windows.push({x: side * x - 5, y: -70, w: 9, h: 24, tw: rnd() * TAU});
  for (let x = -150; x <= 140; x += 30) for (const y of [-160, -122]) if (Math.abs(x + 5) > 52) windows.push({x, y, w: 13, h: 22, tw: rnd() * TAU});
  // Height of the hill under x (the summit plateau carries the building).
  const hillY = x => { const a = Math.abs(x); if (a < 600) return 0; const t = Math.min(1, (a - 600) / 1050); return 330 * (t * t * (3 - 2 * t)) + Math.sin(x * 0.011) * 10 * t; };
  function obsLayout() {
    const wide = w >= 860;
    const s0 = wide ? Math.min((w * 0.44) / 1000, (h * 0.66) / 760) : Math.min((w * 0.82) / 1000, (h * 0.3) / 760);
    return {s0, ox: wide ? w * 0.66 : w / 2, oy: wide ? h * 0.48 : h * 0.68};
  }
  function drawObservatory() {
    const {s0, ox, oy} = obsLayout();
    const zt = smooth(0.06, 0.22, p), S = s0 * Math.exp(Math.pow(zt, 1.7) * Math.log(110));
    const k = smooth(0.06, 0.16, p);
    const ax = lerp(ox + FOCUS[0] * s0, cx, k) + lean[0] * -14 * (1 - k), ay = lerp(oy + FOCUS[1] * s0, cy, k);
    const open = smooth(0.02, 0.1, p), lw = 1 / S, tw = t => (reduced ? 1 : 0.75 + 0.25 * Math.sin(clock * 2 + t));
    const oa = 1 - smooth(0.165, 0.215, p); // dissolves into the dome's interior
    if (oa <= 0) return;
    ctx.save();
    ctx.globalAlpha = oa;
    ctx.translate(ax, ay); ctx.scale(S, S); ctx.translate(-FOCUS[0], -FOCUS[1]);
    // Mountains behind: a higher ridge to the left, lower hills to the right.
    ctx.fillStyle = '#0e1322'; ctx.beginPath(); ctx.moveTo(-5000, 1400);
    for (let x = -5000; x <= 5000; x += 100) ctx.lineTo(x, 120 - 260 * Math.exp(-(((x + 1900) / 1100) ** 2)) - 140 * Math.exp(-(((x - 2300) / 900) ** 2)) + Math.sin(x * 0.004) * 30);
    ctx.lineTo(5000, 1400); ctx.closePath(); ctx.fill();
    // The hill itself.
    ctx.beginPath(); ctx.moveTo(-2000, 1400);
    for (let x = -2000; x <= 2000; x += 25) ctx.lineTo(x, hillY(x));
    ctx.lineTo(2000, 1400); ctx.closePath();
    const hill = ctx.createLinearGradient(0, 0, 0, 340);
    hill.addColorStop(0, '#262d42'); hill.addColorStop(0.5, '#171c2c'); hill.addColorStop(1, '#0c0f19');
    ctx.fillStyle = hill; ctx.fill();
    ctx.strokeStyle = 'rgba(205,215,235,0.35)'; ctx.lineWidth = lw * 1.6; ctx.stroke();
    // Brush on the slopes and the winding road up.
    ctx.fillStyle = '#0d111d';
    for (const b of brush) { const y = hillY(b.x) + 6 + b.d * 40; if (Math.abs(b.x) > 560) { ctx.beginPath(); ctx.arc(b.x, y, b.r, 0, TAU); ctx.fill(); } }
    ctx.strokeStyle = 'rgba(200,190,170,0.22)'; ctx.lineWidth = lw * 1.4; ctx.beginPath();
    ctx.moveTo(-1700, hillY(-1700) + 20); ctx.bezierCurveTo(-1300, 180, -1500, 120, -1000, 110); ctx.bezierCurveTo(-700, 100, -900, 30, -560, 10); ctx.stroke();
    // The city at the foot of the hill, full of lights.
    ctx.fillStyle = '#04060b'; ctx.fillRect(-5000, 330, 10000, 1400);
    ctx.strokeStyle = 'rgba(255,200,140,0.10)'; ctx.lineWidth = lw * 2; ctx.beginPath(); ctx.moveTo(-5000, 330); ctx.lineTo(5000, 330); ctx.stroke();
    for (const L of cityLights) {
      ctx.fillStyle = L.warm ? `rgba(255,${196 + ((L.tw * 9) % 40)},130,${L.a * tw(L.tw)})` : `rgba(215,228,255,${L.a * 0.8 * tw(L.tw)})`;
      ctx.fillRect(L.x, L.y + 8, L.s, L.s);
    }
    // The building: pale concrete under floodlights, bronze domes.
    const wall = ctx.createLinearGradient(0, -220, 0, 0);
    wall.addColorStop(0, '#c9c5ba'); wall.addColorStop(1, '#8f8b82');
    const edge = 'rgba(40,38,34,0.55)';
    const block = (x0, y0, x1, y1, fill = wall) => { ctx.fillStyle = fill; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); };
    const dome = (dx, dy, rx, ry) => {
      const g = ctx.createRadialGradient(dx - rx * 0.35, dy - ry * 0.75, rx * 0.05, dx, dy, rx * 1.15);
      g.addColorStop(0, '#7f8f86'); g.addColorStop(0.5, '#3d4a45'); g.addColorStop(1, '#1b2321');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(dx, dy, rx, ry, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = lw;
      for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.ellipse(dx, dy, rx * (1 - i * 0.19), ry, 0, Math.PI, TAU); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(210,225,215,0.35)'; ctx.lineWidth = lw * 1.2; ctx.beginPath(); ctx.ellipse(dx, dy, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.45); ctx.stroke();
    };
    // Floodlight glow on the lawn.
    const lawn = ctx.createRadialGradient(0, 0, 0, 0, 0, 640);
    lawn.addColorStop(0, 'rgba(255,225,170,0.06)'); lawn.addColorStop(1, 'rgba(255,225,170,0)');
    ctx.fillStyle = lawn; ctx.beginPath(); ctx.ellipse(0, -40, 700, 380, 0, 0, TAU); ctx.fill();
    block(-540, -22, 540, 0, '#7d796f');
    for (const s of [-1, 1]) {
      const a = s < 0 ? -470 : 170, b = s < 0 ? -170 : 470;
      block(a, -96, b, -22);
      ctx.fillStyle = 'rgba(60,56,50,0.35)';
      for (let x = a + 10; x < b - 6; x += 16) ctx.fillRect(x, -88, 3, 62);
      block(s > 0 ? 395 : -475, -142, s > 0 ? 475 : -395, -96);
      dome(s * 435, -142, 47, 45);
    }
    block(-176, -178, 176, -22);
    block(-150, -198, 150, -178);
    block(-132, -218, 132, -198);
    dome(0, -218, 134, 128);
    // Slit opening and the refractor's tube showing through it.
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, -218, 134, 128, 0, Math.PI, TAU); ctx.closePath(); ctx.clip();
    const sw = lerp(4, 50, open);
    ctx.fillStyle = '#03050a'; ctx.fillRect(-sw / 2, -350, sw, 140);
    ctx.globalAlpha = open * oa; ctx.fillStyle = 'rgba(255,214,150,0.18)'; ctx.fillRect(-sw / 2, -350, sw, 140);
    ctx.globalAlpha = oa;
    ctx.translate(-4, -228); ctx.rotate(0.16);
    const tube = ctx.createLinearGradient(-13, 0, 13, 0);
    tube.addColorStop(0, '#6d6b66'); tube.addColorStop(0.45, '#e8e5dc'); tube.addColorStop(1, '#8a877f');
    ctx.fillStyle = tube; ctx.fillRect(-12, -70 - 40 * open, 24, 80 + 40 * open);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-14, -74 - 40 * open, 28, 6);
    ctx.restore();
    // Entrance, windows, the Astronomers Monument on the lawn.
    ctx.fillStyle = 'rgba(255,214,150,0.9)'; ctx.fillRect(-24, -76, 48, 54);
    block(-46, -128, 46, -76);
    for (const W of windows) { ctx.fillStyle = `rgba(255,208,140,${0.6 * tw(W.tw)})`; ctx.fillRect(W.x, W.y, W.w, W.h); }
    ctx.fillStyle = '#b9b5aa'; ctx.beginPath(); ctx.moveTo(-322, 24); ctx.lineTo(-298, 24); ctx.lineTo(-303, -175); ctx.lineTo(-310, -196); ctx.lineTo(-317, -175); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.stroke();
    block(-336, 14, -284, 26, '#8f8b82');
    ctx.restore();
  }

  // ---- inside the dome: a long white refractor on its pier, pointing up
  // through the open slit. Local units, pivot at (0,0), up is negative.
  const EYE = [-150, 238]; // the eyepiece the camera ends up looking into
  function drawTelescope() {
    if (p < 0.16) return;
    const m = Math.min(w, h), s0 = m / 1250, GLASS = 16, diag = Math.sqrt(diag2);
    // Starts slightly close (we just came through the slit), eases back to frame
    // the telescope, then dollies into the eyepiece, accelerating like a camera move.
    const settle = smooth(0.165, 0.24, p), push = smooth(0.24, 0.45, p);
    const S = s0 * lerp(1.6, 1, settle) * Math.exp(Math.pow(push, 2.2) * Math.log((diag * 1.2) / (GLASS * s0)));
    if (GLASS * S > diag * 1.15) return;
    const base = [cx + w * 0.04, cy - h * 0.02], k = smooth(0.24, 0.36, p);
    const ax = lerp(base[0] + EYE[0] * s0, cx, k), ay = lerp(base[1] + EYE[1] * s0, cy, k);
    const lw = 1 / S;
    ctx.save();
    ctx.translate(ax, ay); ctx.scale(S, S); ctx.translate(-EYE[0], -EYE[1]);
    ctx.save();
    ctx.beginPath(); ctx.rect(-6000, -6000, 12000, 12000); ctx.arc(EYE[0], EYE[1], GLASS, 0, TAU, true); ctx.clip();
    // The dome's inside is dark, with ribs, except the slit where the sky shows.
    ctx.fillStyle = '#06080d'; ctx.beginPath(); ctx.rect(-4000, -4000, 8000, 8000);
    ctx.moveTo(-150, -4000); ctx.lineTo(-150, -420); ctx.lineTo(150, -420); ctx.lineTo(150, -4000); ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(160,170,190,0.10)'; ctx.lineWidth = lw * 2;
    for (let i = -6; i <= 6; i++) { if (Math.abs(i) < 1) continue; ctx.beginPath(); ctx.moveTo(i * 170, 700); ctx.quadraticCurveTo(i * 120, -500, Math.sign(i) * 150, -1400); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(200,210,230,0.25)'; ctx.lineWidth = lw * 3;
    ctx.beginPath(); ctx.moveTo(-150, -1400); ctx.lineTo(-150, -420); ctx.lineTo(150, -420); ctx.lineTo(150, -1400); ctx.stroke();
    // Warm lamp low on the floor.
    const lamp = ctx.createRadialGradient(-420, 520, 0, -420, 520, 700);
    lamp.addColorStop(0, 'rgba(255,170,90,0.18)'); lamp.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.fillStyle = lamp; ctx.fillRect(-1200, -200, 1600, 1200);
    // Pier.
    const pier = ctx.createLinearGradient(-90, 0, 90, 0);
    pier.addColorStop(0, '#4a4945'); pier.addColorStop(0.4, '#bdb9ae'); pier.addColorStop(1, '#5c5a55');
    ctx.fillStyle = pier; ctx.beginPath(); ctx.moveTo(-60, 70); ctx.lineTo(60, 70); ctx.lineTo(95, 640); ctx.lineTo(-95, 640); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a3936'; ctx.fillRect(-110, 630, 220, 26);
    // Equatorial head and counterweights.
    ctx.save(); ctx.rotate(-0.55);
    ctx.fillStyle = '#2b2b2b'; ctx.fillRect(-14, -10, 28, 260);
    ctx.fillStyle = '#1b1b1b'; ctx.fillRect(-46, 150, 92, 46); ctx.fillRect(-42, 205, 84, 40);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-46, 150, 92, 6); ctx.fillRect(-42, 205, 84, 5);
    ctx.restore();
    ctx.fillStyle = '#d6d2c6'; ctx.beginPath(); ctx.roundRect(-62, -30, 124, 104, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = lw * 2; ctx.stroke();
    ctx.fillStyle = '#9d998e'; ctx.beginPath(); ctx.arc(0, 20, 30, 0, TAU); ctx.fill();
    // The tube: long, cream white, angled up toward the slit.
    ctx.save(); ctx.rotate(0.38);
    const R = 46, top = -920, bot = 300;
    const shade = ctx.createLinearGradient(-R, 0, R, 0);
    shade.addColorStop(0, '#5f5d58'); shade.addColorStop(0.35, '#f1eee6'); shade.addColorStop(0.6, '#d8d4ca'); shade.addColorStop(1, '#77746d');
    ctx.fillStyle = shade; ctx.fillRect(-R, top, R * 2, bot - top);
    ctx.fillStyle = shade; ctx.fillRect(-R - 9, top - 120, R * 2 + 18, 130); // dew shield
    ctx.fillStyle = '#0b0b0c'; ctx.beginPath(); ctx.ellipse(0, top - 120, R + 9, 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1c1c1c'; for (const y of [-330, 40]) ctx.fillRect(-R - 8, y, R * 2 + 16, 22); // tube rings
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = top; y < bot; y += 140) ctx.fillRect(-R, y, R * 2, 2);
    // Finder scope riding on top.
    ctx.fillStyle = shade; ctx.fillRect(R + 14, -560, 22, 300);
    ctx.fillStyle = '#1c1c1c'; ctx.fillRect(R - 2, -520, 22, 10); ctx.fillRect(R - 2, -330, 22, 10); ctx.fillRect(R + 12, -566, 26, 8);
    // Focuser, star diagonal and the eyepiece at the bottom end.
    ctx.fillStyle = '#26262a'; ctx.fillRect(-26, bot, 52, 70);
    ctx.fillStyle = '#9a9a9e'; ctx.fillRect(-30, bot + 18, 60, 8);
    ctx.restore();
    // Diagonal + eyepiece drawn unrotated so the eyepiece faces the camera.
    ctx.fillStyle = '#2a2a2e'; ctx.beginPath(); ctx.roundRect(EYE[0] - 10, EYE[1] - 50, 60, 60, 8); ctx.fill();
    const ep = ctx.createRadialGradient(EYE[0] - 6, EYE[1] - 8, 2, EYE[0], EYE[1], 40);
    ep.addColorStop(0, '#5a5a60'); ep.addColorStop(0.55, '#1a1a1d'); ep.addColorStop(1, '#0a0a0b');
    ctx.fillStyle = ep; ctx.beginPath(); ctx.arc(EYE[0], EYE[1], 34, 0, TAU); ctx.fill();
    ctx.fillStyle = '#050506'; ctx.beginPath(); ctx.arc(EYE[0], EYE[1], 21, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(200,200,210,0.5)'; ctx.lineWidth = lw * 1.5; ctx.beginPath(); ctx.arc(EYE[0], EYE[1], 34, 0, TAU); ctx.stroke();
    ctx.restore(); // end of the clip: the glass itself shows the real sky behind
    // Inside the glass: a soft field-stop vignette and a faint coating reflection.
    const vg = ctx.createRadialGradient(EYE[0], EYE[1], GLASS * 0.7, EYE[0], EYE[1], GLASS);
    vg.addColorStop(0, 'rgba(1,1,3,0)'); vg.addColorStop(1, 'rgba(1,1,3,0.95)');
    ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(EYE[0], EYE[1], GLASS, 0, TAU); ctx.fill();
    const glint = 1 - smooth(0.3, 0.4, p);
    if (glint > 0) {
      ctx.strokeStyle = `rgba(150,175,230,${0.22 * glint})`; ctx.lineWidth = GLASS * 0.06;
      ctx.beginPath(); ctx.arc(EYE[0], EYE[1], GLASS * 0.62, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
    }
    ctx.restore();
  }

  // ---- layout
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    w = innerWidth; h = innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    F = Math.max(w, h) * 0.72; cx = w / 2; cy = h / 2; diag2 = cx * cx + cy * cy;
  }
  addEventListener('resize', resize);
  addEventListener('pointermove', e => { mouse = [e.clientX / w, e.clientY / h]; }, {passive: true});

  // ---- chapter nav, scroll hint, telemetry
  for (const b of navButtons) b.addEventListener('click', () => {
    const id = b.dataset.goto, target = id === 'explore' ? explore : chapters.find(c => c.dataset.chapter === id);
    const top = id === 'observe' ? 0 : target.getBoundingClientRect().top + scrollY + (id === 'explore' ? -10 : innerHeight * 0.05);
    scrollTo({top, behavior: reduced ? 'auto' : 'smooth'});
  });
  function setChapter(i) {
    if (i === activeChapter) return;
    activeChapter = i;
    chapters.forEach((c, j) => c.classList.toggle('is-active', j === i));
    navButtons.forEach(b => b.setAttribute('aria-current', String(b.dataset.goto === (i >= chapters.length ? 'explore' : chapters[i]?.dataset.chapter))));
    if (chapters[i]) chapters[i].querySelectorAll('[data-decode]').forEach((el, k) => setTimeout(() => decode(el), k * 120));
    document.body.dataset.voyage = i >= chapters.length ? 'explore' : chapters[i]?.dataset.chapter || '';
  }
  const pad = n => String(Math.floor(n)).padStart(2, '0');
  let lastTelemetry = '';
  function updateTelemetry() {
    if (!telemetry) return;
    const secs = p * 754, ra = Number.parseFloat(raInput?.value), dec = Number.parseFloat(decInput?.value);
    const heading = Number.isFinite(ra) && Number.isFinite(dec) ? `HEADING RA ${ra.toFixed(2)}° DEC ${dec >= 0 ? '+' : ''}${dec.toFixed(2)}°` : 'HEADING —';
    const text = `${p < 0.06 ? 'T−00:10 · HOLD' : `T+${pad(secs / 60)}:${pad(secs % 60)}`} · DRIVE ${speedAt(p).toFixed(2)} · ${heading}`;
    if (text !== lastTelemetry) telemetry.textContent = lastTelemetry = text;
  }

  // ---- projection with a slight barrel bow, like looking through a lens.
  function project(x, y, z, out) {
    if (z < 12) return false;
    const s = F / z; let dx = x * s, dy = y * s;
    const rn2 = (dx * dx + dy * dy) / diag2, k = 1 + 0.07 * rn2;
    out[0] = cx + dx * k; out[1] = cy + dy * k; out[2] = s; out[3] = rn2;
    return true;
  }
  const P = [0, 0, 0, 0], Q = [0, 0, 0, 0];

  // Chromatic fringe toward the frame edges: red pushed out, blue pulled in.
  function fringe(x, y, rn2, size, alpha, c) {
    const k = rn2 - 0.42;
    if (k <= 0 || size < 0.9) { ctx.fillStyle = `rgba(${c},${alpha})`; ctx.fillRect(x - size / 2, y - size / 2, size, size); return; }
    const off = k * 9, ux = (x - cx) / Math.sqrt(diag2), uy = (y - cy) / Math.sqrt(diag2);
    ctx.fillStyle = `rgba(255,70,90,${alpha * 0.8})`; ctx.fillRect(x + ux * off - size / 2, y + uy * off - size / 2, size, size);
    ctx.fillStyle = `rgba(70,120,255,${alpha * 0.8})`; ctx.fillRect(x - ux * off - size / 2, y - uy * off - size / 2, size, size);
    ctx.fillStyle = `rgba(${c},${alpha * 0.7})`; ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }

  function drawStars(streak) {
    const camX = lean[0] * 60;
    for (const s of stars) {
      const rx = wrap(s.x - camX, TUBE) - TUBE / 2, ry = wrap(s.y - camY, TUBE) - TUBE / 2, rz = wrap(s.z - camZ, DEPTH) + 20;
      if (!project(rx, ry, rz, P)) continue;
      const fade = clamp(1 - rz / DEPTH) * clamp(rz / 300), tw = reduced ? 1 : 0.75 + 0.25 * Math.sin(clock * 1.6 + s.tw);
      const alpha = s.a * fade * tw;
      if (alpha < 0.02 || P[0] < -40 || P[0] > w + 40 || P[1] < -40 || P[1] > h + 40) continue;
      const size = Math.min(3.4, s.r * P[2] * 3.2);
      if (streak) {
        const pz = wrap(s.z - prevZ - (camZ - prevZ) * 2.2, DEPTH) + 20, py = wrap(s.y - prevY - (camY - prevY) * 2.2, TUBE) - TUBE / 2;
        if (pz > rz && Math.abs(py - ry) < TUBE / 2 && project(rx, py, pz, Q)) {
          const len = Math.hypot(P[0] - Q[0], P[1] - Q[1]);
          if (len > 2 && len < 260) {
            ctx.strokeStyle = `rgba(${s.c},${alpha})`; ctx.lineWidth = Math.max(0.6, size * 0.8);
            ctx.beginPath(); ctx.moveTo(Q[0], Q[1]); ctx.lineTo(P[0], P[1]); ctx.stroke();
            continue;
          }
        }
      }
      fringe(P[0], P[1], P[3], size, alpha, s.c);
    }
  }

  function drawGalaxy(G, fade) {
    if (fade <= 0) return;
    const spin = (reduced ? 0 : clock) * 0.012, camX = lean[0] * 60, gy = G.y - camY * 0.04;
    const place = (u, v, wv, out) => {
      const y1 = v * G.cX - wv * G.sX, z1 = v * G.sX + wv * G.cX;
      const x2 = u * G.cZ - y1 * G.sZ, y2 = u * G.sZ + y1 * G.cZ;
      return project(G.x + x2 - camX, gy + y2, G.z + z1 - camZ, out);
    };
    // Dust clouds along the arms and a bright core.
    for (const c of G.clouds) {
      const a = c.arm + c.d * G.wind + spin;
      if (!place(Math.cos(a) * c.d * G.R, Math.sin(a) * c.d * G.R, 0, P)) continue;
      const size = c.size * G.R * P[2] * 2;
      if (size > w * 7) continue;
      ctx.globalAlpha = c.a * fade * (size > w * 2 ? clamp((w * 7 - size) / (w * 5)) * 0.8 : 1);
      ctx.drawImage(sprite(c.c), P[0] - size / 2, P[1] - size / 2, size, size);
    }
    if (place(0, 0, 0, P)) {
      const core = G.R * 0.7 * P[2], near = clamp((w * 2.5 - core) / w);
      ctx.globalAlpha = 0.5 * fade * near; ctx.drawImage(sprite(G.palette[4]), P[0] - core / 2, P[1] - core / 2, core, core);
      const hot = core * 0.28;
      ctx.globalAlpha = 0.9 * fade * near; ctx.drawImage(sprite('255,255,255'), P[0] - hot / 2, P[1] - hot / 2, hot, hot);
    }
    ctx.globalAlpha = 1;
    for (const s of G.pts) {
      const a = s.arm + s.d * G.wind + spin * (1.4 - s.d * 0.6);
      if (!place((Math.cos(a) * s.d + s.sx) * G.R, (Math.sin(a) * s.d + s.sy) * G.R, s.sw * G.R, P)) continue;
      if (P[0] < -20 || P[0] > w + 20 || P[1] < -20 || P[1] > h + 20) continue;
      const dz = G.z - camZ, near = clamp((F / P[2]) / 160);
      const tw = reduced ? 1 : 0.75 + 0.25 * Math.sin(clock * 1.3 + s.tw);
      const size = clamp(s.r * P[2] * 9, 0.45, 3);
      fringe(P[0], P[1], P[3], size, s.a * fade * tw * near * (dz < -G.R ? clamp(1 + (dz + G.R) / G.R) : 1), s.c);
    }
  }

  // Now and then a meteor crosses the frame.
  function drawMeteors(dt) {
    if (reduced) return;
    if (Math.random() < dt * (0.35 + post * 0.25) && meteors.length < 3) {
      const a = 0.35 + Math.random() * 0.5, fromLeft = Math.random() < 0.5;
      meteors.push({x: fromLeft ? Math.random() * w * 0.6 : w * 0.4 + Math.random() * w * 0.6, y: -20 + Math.random() * h * 0.35, vx: Math.cos(a) * (fromLeft ? 1 : -1) * 900, vy: Math.sin(a) * 900, life: 0, max: 0.7 + Math.random() * 0.6});
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.life += dt; m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.life > m.max) { meteors.splice(i, 1); continue; }
      const k = Math.sin((m.life / m.max) * Math.PI), tx = m.x - m.vx * 0.16, ty = m.y - m.vy * 0.16;
      const g = ctx.createLinearGradient(tx, ty, m.x, m.y);
      g.addColorStop(0, 'rgba(217,239,133,0)'); g.addColorStop(1, `rgba(244,250,255,${0.85 * k})`);
      ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(m.x, m.y); ctx.stroke();
      ctx.globalAlpha = k; ctx.drawImage(sprite('230,240,255'), m.x - 6, m.y - 6, 12, 12); ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawWaypoints() {
    ctx.font = '500 10px "Geist Mono", ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    for (const wp of waypoints) {
      const rz = wp.z - camZ;
      if (rz < 60 || rz > 3400) continue;
      if (!project(wp.x - lean[0] * 60, wp.y - camY * 0.04, rz, P)) continue;
      const a = clamp((3400 - rz) / 900) * clamp((rz - 60) / 380);
      if (a < 0.02) continue;
      const x = P[0], y = P[1], side = x > w * 0.68 ? -1 : 1;
      const r = 3 + 6 * clamp(P[2] * 1.5);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#f4f8ff'; ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, r * 0.35), 0, 6.283); ctx.fill();
      ctx.strokeStyle = `rgba(${GR[0]},0.9)`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 6.283); ctx.stroke();
      const ex = x + side * 34, ey = y - 30;
      ctx.beginPath(); ctx.moveTo(x + side * (r + 5) * 0.7, y - (r + 5) * 0.7); ctx.lineTo(ex, ey); ctx.lineTo(ex + side * 46, ey); ctx.stroke();
      ctx.textAlign = side > 0 ? 'left' : 'right';
      const tx = ex + side * 52;
      ctx.fillStyle = 'rgba(236,242,228,0.95)'; ctx.fillText(wp.name.toUpperCase(), tx, ey - 6);
      ctx.fillStyle = 'rgba(169,178,197,0.9)'; ctx.fillText(`RA ${wp.ra.toFixed(2)}° · DEC ${wp.dec >= 0 ? '+' : ''}${wp.dec.toFixed(2)}°`, tx, ey + 8);
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }

  function drawReticle(k) {
    if (k <= 0) return;
    const r = Math.min(w, h) * 0.13 * (1.25 - 0.25 * k), rot = (1 - k) * 0.6;
    ctx.save(); ctx.translate(cx, h * 0.34); ctx.globalAlpha = k * (1 - post);
    ctx.strokeStyle = `rgba(${GR[0]},0.85)`; ctx.lineWidth = 1;
    ctx.rotate(rot);
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, 0, r, i * 1.5708 + 0.18, i * 1.5708 + 1.39); ctx.stroke(); }
    for (let i = 0; i < 4; i++) { ctx.rotate(1.5708); ctx.beginPath(); ctx.moveTo(r - 8, 0); ctx.lineTo(r + 10, 0); ctx.stroke(); }
    ctx.rotate(-rot - 4 * 1.5708);
    ctx.strokeStyle = `rgba(${GR[2]},0.6)`;
    ctx.strokeRect(-r * 0.42, -r * 0.42, r * 0.84, r * 0.84);
    ctx.font = '500 10px "Geist Mono", ui-monospace, monospace'; ctx.fillStyle = `rgba(${GR[0]},0.9)`; ctx.textAlign = 'center';
    ctx.fillText('FIELD LOCKED · NORTH UP · EAST LEFT', 0, -r - 20);
    ctx.restore();
  }

  // ---- main loop
  let frameGap = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dtRaw = Math.min(0.05, (now - last) / 1000);
    // Behind the explorer the scene only needs to idle: ~24 fps is plenty.
    frameGap += dtRaw; last = now;
    const idle = post >= 1 && Math.abs(pRaw - p) < 1e-4;
    if (idle && frameGap < 1 / 24) return;
    const dt = Math.min(0.05, frameGap); frameGap = 0;
    clock += dt;

    const vr = voyage.getBoundingClientRect(), er = explore?.getBoundingClientRect();
    pRaw = clamp(-vr.top / Math.max(1, vr.height - innerHeight));
    post = er ? clamp((innerHeight * 0.5 - er.top) / (innerHeight * 0.5)) : 0;
    p = reduced ? pRaw : p + (pRaw - p) * Math.min(1, dt * 7);
    if (Math.abs(pRaw - p) < 1e-4) p = pRaw;
    lean[0] += ((mouse[0] - 0.5) - lean[0]) * Math.min(1, dt * 2); lean[1] += ((mouse[1] - 0.5) - lean[1]) * Math.min(1, dt * 2);

    prevZ = camZ; prevY = camY;
    camZ = zAt(p) + (reduced ? 0 : clock * 14);
    camY = 0;

    // Active chapter: the last one whose top has passed the middle of the screen.
    let idx = 0;
    chapters.forEach((c, i) => { if (c.getBoundingClientRect().top < innerHeight * 0.55) idx = i; });
    if (post > 0.6) idx = chapters.length;
    setChapter(idx);
    updateTelemetry();
    canvas.style.setProperty('--post', post.toFixed(3));
    document.body.style.setProperty('--voyage', p.toFixed(4));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#03050b'; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    drawGalaxy(galaxies[1], clamp(0.35 + p));
    drawGalaxy(galaxies[0], 1);
    const moving = Math.abs(camZ - prevZ) + Math.abs(camY - prevY) > 6;
    drawStars(moving && !reduced);
    ctx.globalCompositeOperation = 'source-over';
    drawMeteors(dt);
    if (p < 0.47) drawTelescope();
    if (p < 0.22) drawObservatory();
    drawWaypoints();
    drawReticle(smooth(0.9, 0.99, p));

  }

  resize();
  preloader().then(() => { if (activeChapter === 0) decode(chapters[0].querySelector('[data-decode]')); });
  requestAnimationFrame(t => { last = t; frame(t); });
}
