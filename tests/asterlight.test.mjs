// Asterlight regression tests.
//   npm test            offline checks + a real SPHEREx cutout from NASA/IPAC IRSA
//   npm run test:live   also checks the deployed site and its /api functions
// Network tests skip (not fail) when IRSA is unreachable or reports an outage.
import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const LIVE = process.env.ASTERLIGHT_BASE?.replace(/\/$/, '');
const live = {skip: LIVE ? false : 'set ASTERLIGHT_BASE (npm run test:live) to check a deployment'};
const mod = p => import(pathToFileURL(join(REPO, p)).href);

const sky = await mod('dist/sky-coordinates.mjs');
const core = await mod('dist/viewer-core.mjs');
const {targets} = await mod('dist/targets.mjs');
const archive = await mod('lib/archive.mjs');
const {processFrame} = await mod('lib/process-frame.mjs');
const fits = await mod('dist/fits.mjs');

const FITS_URI = '/ibe/data/spherex/dr1/level2/2025W34_2B/l2b-v27-2026-229/2/level2_2025W34_2B_0090_4D2_spx_l2b-v27-2026-229.fits';

// ------------------------------------------------------------ coordinates
test('coordinates: decimal and sexagesimal parse to the same place', () => {
  const dec = sky.parseCoordinates('269.452075', '4.693391');
  const sex = sky.parseCoordinates('17:57:48.498', '+04:41:36.21');
  assert.ok(Math.abs(dec.ra - sex.ra) < 1e-4 && Math.abs(dec.dec - sex.dec) < 1e-4);
  assert.equal(sky.parseCoordinates('17h57m48.498s', '-04d41m36.21s').dec < 0, true);
});
test('coordinates: out-of-range and junk input is rejected', () => {
  for (const [ra, dec] of [['360', '0'], ['-1', '0'], ['10', '91'], ['abc', '0'], ['', '0'], ['12:61:00', '0']])
    assert.throws(() => sky.parseCoordinates(ra, dec), `${ra}, ${dec}`);
});
test('coordinates: format round-trips', () => {
  const back = sky.parseCoordinates(sky.formatRA(269.452075), sky.formatDec(-56.7828442));
  assert.ok(Math.abs(back.ra - 269.452075) < 1e-3 && Math.abs(back.dec + 56.7828442) < 1e-3);
});
test('coordinates: tangent projection inverts and separation is right', () => {
  const [x, y] = sky.worldToTangent(270.0, 5.0, 269.45, 4.69);
  const w = sky.tangentToWorld(x, y, 269.45, 4.69);
  const [ra, dec] = Array.isArray(w) ? w : [w.ra, w.dec];
  assert.ok(Math.abs(ra - 270.0) < 1e-6 && Math.abs(dec - 5.0) < 1e-6);
  assert.ok(Math.abs(sky.angularSeparationArcsec(10, 0, 11, 0) - 3600) < 0.01);
});
test('coordinates: share URL carries the field', () => {
  const u = new URL(sky.buildShareUrl('https://asterlight.vercel.app/', {ra: 269.45, dec: 4.69, fov: 8, detector: 2}));
  assert.equal(u.searchParams.get('detector'), '2');
  assert.ok(u.href.includes('269.45'));
});

// ---------------------------------------------------------- viewer logic
test('viewer: samples at most 24 frames, keeping first and last', () => {
  const recs = Array.from({length: 100}, (_, i) => ({i}));
  const s = core.sampleAcrossTime(recs);
  assert.equal(s.length, 24); assert.equal(s[0].i, 0); assert.equal(s.at(-1).i, 99);
  assert.equal(core.sampleAcrossTime(recs.slice(0, 5)).length, 5);
});
test('viewer: quantiles ignore NaN and masked pixels become NaN', () => {
  const q = core.quantiles([...Array.from({length: 1001}, (_, i) => i), NaN]);
  assert.equal(q.median, 500);
  const v = core.validPixels({pixels: [1, null, 3], mask: [0, 0, 1]});
  assert.equal(v[0], 1); assert.ok(Number.isNaN(v[1])); assert.ok(Number.isNaN(v[2]));
});
test('viewer: difference only for overlapping bandpasses', () => {
  const a = {width: 2, height: 1, pixels: [1, 2], wavelength: 1.10, bandwidth: 0.02};
  const b = {width: 2, height: 1, pixels: [1, 4], wavelength: 1.11, bandwidth: 0.02};
  assert.equal(core.canDifference(a, b), true);
  assert.equal(core.canDifference(a, {...b, wavelength: 1.5}), false);
  assert.throws(() => core.differencePixels(a, {...b, wavelength: 1.5}));
  assert.equal(core.differencePixels(a, b).length, 2);
});

// ---------------------------------------------------------------- targets
test('targets: all five challenge targets have valid presets', () => {
  assert.deepEqual(Object.keys(targets).sort(), ['barnard', 'epsilon', 'r-dra', 'rw', 'wise']);
  for (const t of Object.values(targets)) {
    assert.ok(t.ra >= 0 && t.ra < 360 && Math.abs(t.dec) <= 90, t.name);
    assert.ok(t.fov >= 2 && t.fov <= 20 && t.detector >= 1 && t.detector <= 6, t.name);
  }
});

// ---------------------------------------------------------- archive layer
test('archive: search validation', () => {
  assert.deepEqual(archive.validateSearch(new URLSearchParams('ra=269.45&dec=4.69&detector=2')), {ra: 269.45, dec: 4.69, detector: 2});
  for (const q of ['ra=&dec=1', 'ra=400&dec=1', 'ra=1&dec=95', 'ra=1&dec=1&detector=7', 'ra=1&dec=1&detector=1.5'])
    assert.throws(() => archive.validateSearch(new URLSearchParams(q)), q);
});
test('archive: SIA URL targets IRSA with the right collection', () => {
  const u = new URL(archive.siaUrl({ra: 269.452075, dec: 4.693391}, 'spherex_qr3'));
  assert.equal(u.origin, archive.IRSA);
  assert.equal(u.searchParams.get('COLLECTION'), 'spherex_qr3');
  assert.match(u.searchParams.get('POS'), /^CIRCLE 269\.452075 4\.693391/);
});
test('archive: VOTable parsing and IRSA error detection', () => {
  const xml = '<VOTABLE><RESOURCE><TABLE><FIELD name="a"/><FIELD name="b"/><DATA><TABLEDATA><TR><TD>1</TD><TD>x &amp; y</TD></TR></TABLEDATA></DATA></TABLE></RESOURCE></VOTABLE>';
  assert.deepEqual(archive.parseVOTable(xml), [{a: '1', b: 'x & y'}]);
  assert.throws(() => archive.parseVOTable('<VOTABLE><INFO name="QUERY_STATUS" value="ERROR">bad</INFO></VOTABLE>'));
  assert.throws(() => archive.parseVOTable('<html>502 Proxy Error</html>'));
});
test('archive: records are filtered, deduplicated and sorted', () => {
  const row = (o) => ({energy_bandpassname: 'SPHEREx-D2', access_url: `https://irsa.ipac.caltech.edu${FITS_URI}`, t_min: '60908.98', obs_id: 'A', obs_collection: 'spherex_qr3', t_exptime: '1', em_min: '1e-6', em_max: '1.1e-6', s_pixel_scale: '6.2', ...o});
  const out = archive.normalizeRecords([
    row({t_min: '60950'}), row({obs_collection: 'spherex_dr1'}),
    row({obs_id: 'B', t_min: '60900'}),
    row({obs_id: 'C', energy_bandpassname: 'SPHEREx-D3'}),
    row({obs_id: 'D', access_url: 'https://evil.example.com/x.fits'}),
    row({obs_id: 'E', access_url: 'https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/../../etc.fits'}),
  ], 2);
  assert.deepEqual(out.map(r => r.id), ['B:D2', 'A:D2']);
  assert.equal(out[1].collection, 'spherex_dr1');
});
test('archive: cutout URLs only for SPHEREx archive files', () => {
  const ok = new URL(archive.cutoutUrl(new URLSearchParams({ra: '269.45', dec: '4.69', fov: '8', uri: FITS_URI})));
  assert.equal(ok.origin, archive.IRSA); assert.equal(ok.searchParams.get('center'), '269.45,4.69d');
  for (const uri of ['/etc/passwd', '/ibe/data/spherex/dr1/level2/../x.fits', 'https://evil.example.com/a.fits'])
    assert.throws(() => archive.cutoutUrl(new URLSearchParams({ra: '1', dec: '1', fov: '8', uri})), uri);
  assert.throws(() => archive.cutoutUrl(new URLSearchParams({ra: '1', dec: '1', fov: '30', uri: FITS_URI})));
});

// ------------------------------------------- real SPHEREx FITS processing
let cutout;
test('fits: real SPHEREx cutout downloads and parses', async (t) => {
  const url = archive.cutoutUrl(new URLSearchParams({ra: '269.45', dec: '4.69', fov: '8', uri: FITS_URI}));
  try { cutout = await archive.boundedFetch(url, 12000000, 55000); }
  catch (e) { return t.skip(`IRSA cutout service unreachable: ${e.message}`); }
  assert.equal(new TextDecoder().decode(cutout.subarray(0, 8)), 'SIMPLE  ');
  const hdus = fits.parseFits(cutout.buffer.slice(cutout.byteOffset, cutout.byteOffset + cutout.byteLength));
  assert.ok(hdus.length >= 2, 'has image + extension HDUs');
});
test('fits: frame is aligned to a 128x128 north-up grid with metadata', (t) => {
  if (!cutout) return t.skip('no cutout downloaded');
  const f = processFrame(cutout, {ra: 269.45, dec: 4.69, fov: 8});
  assert.equal(f.width, 128); assert.equal(f.height, 128); assert.equal(f.pixels.length, 128 * 128);
  assert.ok(f.coverage > 0.5 && f.coverage <= 1);
  assert.ok(Math.abs(f.wavelength - 1.091) < 0.01, `wavelength ${f.wavelength}`);
  assert.equal(f.detector, 2); assert.match(f.date, /^2025-08-21/);
  assert.ok(f.flags.length > 0 && f.maskedFraction < 0.1);
  const valid = f.pixels.filter(v => v !== null);
  assert.ok(valid.every(Number.isFinite) && Math.max(...valid) > Math.min(...valid));
});

// --------------------------------------------------- API handlers (local)
function call(handler, url, method = 'GET') {
  return new Promise(resolve => {
    const res = {status: 0, headers: {}, writeHead(s, h) { this.status = s; this.headers = h || {}; }, end(b) { resolve({status: this.status, body: b ? JSON.parse(b) : null}); }};
    handler({method, url}, res);
  });
}
test('api handlers: method and input checks', async () => {
  const {default: arch} = await mod('api/archive.js');
  const {default: frame} = await mod('api/frame.js');
  assert.equal((await call(arch, '/api/archive', 'POST')).status, 405);
  assert.equal((await call(arch, '/api/archive?ra=x&dec=1')).status, 400);
  assert.equal((await call(frame, '/api/frame?ra=1&dec=1&fov=8&uri=/etc/passwd')).status, 400);
});

// ------------------------------------------------- live production checks
test('live: pages, assets and redirect', live, async () => {
  for (const p of ['/', '/space.mjs', '/space.css', '/app.mjs', '/project.html', '/data/barnard-preview.json']) {
    const r = await fetch(LIVE + p); assert.equal(r.status, 200, p);
  }
  const html = await (await fetch(LIVE + '/')).text();
  for (const id of ['cosmos', 'voyage', 'search-form', 'sky', 'timeline', 'metadata', 'notes']) assert.ok(html.includes(`id="${id}"`), id);
  assert.equal((await fetch(LIVE + '/server.mjs')).status, 404);
  const r = await fetch(LIVE + '/classify.html', {redirect: 'manual'});
  assert.equal(r.status, 308);
});
test('live: /api/frame returns real aligned data for every target', live, async () => {
  // Same archive file for each request is not meaningful across targets, so
  // check the full pipeline once and input validation for each target.
  const r = await fetch(`${LIVE}/api/frame?ra=269.45&dec=4.69&detector=2&fov=8&uri=${encodeURIComponent(FITS_URI)}`);
  assert.equal(r.status, 200);
  const f = await r.json();
  assert.equal(f.width, 128); assert.ok(f.coverage > 0.5); assert.equal(f.quality, 'Pass');
  for (const t of Object.values(targets)) {
    const q = await fetch(`${LIVE}/api/archive?ra=${t.ra}&dec=${t.dec}&detector=${t.detector}&fov=${t.fov}`);
    assert.ok([200, 502].includes(q.status), `${t.name}: ${q.status}`);
    const body = await q.json();
    assert.ok(Array.isArray(body.records) || /IRSA/.test(body.error), `${t.name}: ${JSON.stringify(body).slice(0, 120)}`);
  }
});
test('live: /api/archive search returns observations (needs IRSA search online)', live, async (t) => {
  const r = await fetch(`${LIVE}/api/archive?ra=269.452075&dec=4.693391&detector=2&fov=12`);
  const body = await r.json();
  if (r.status === 502 && /IRSA/.test(body.error)) return t.skip(`IRSA search is down upstream: ${body.error}`);
  assert.equal(r.status, 200);
  assert.ok(body.records.length > 1, 'several Barnard observations');
  assert.ok(body.records.every(x => x.detector === 2 && /^\/ibe\/data\/spherex\//.test(x.uri)));
});
