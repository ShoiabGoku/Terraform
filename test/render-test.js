/* The renderer's side of the contract: what the globe shows must follow the
   physics, and a click must hit what the pixel shows.
   Run: node test/render-test.js
   (The GPU half of the click check — RN.View.parityTest — needs a browser:
    open the page and run __TF.view.parityTest(300).)                     */
const PL = require('../src/planets.js');
const CM = require('../src/climate.js');
const S = require('../src/sim.js');
const RN = require('../src/render.js');
const { Sim } = S;

let pass = 0, total = 0;
function check(name, ok, detail) {
  total++; if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
}
const pct = (x) => (100 * x).toFixed(1) + '%';

/* sample the globe evenly and count what classify() says is there */
function census(sim, N) {
  const w = sim.w, vs = sim.visualState(), t = RN.heightTable(w);
  const lvl = (f) => !(f > 0) ? -10 : f >= 1 ? 10 : t[Math.min(t.length - 1, Math.floor(f * t.length))];
  const look = { seaLevel: lvl(vs.seaFrac), cryoLevel: lvl(vs.cryoSeaFrac) };
  const c = { cap: 0, ocean: 0, ice: 0, rock: 0 };
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - y * y), th = ga * i + 0.37;
    c[RN.classify(w, vs, look, r * Math.cos(th), y, r * Math.sin(th)).kind]++;
  }
  for (const k in c) c[k] /= N;
  return { c, vs };
}
function run(k, apply, yrs) {
  const sim = new Sim(k); apply(sim.plan);
  const n = Math.ceil(yrs / 5);
  for (let i = 0; i < n; i++) sim.step(yrs / n);
  return sim;
}

/* ---- 1. the shader source is sane ---- */
{
  const f = RN.FRAG;
  let b = 0, p = 0;
  for (const ch of f) { if (ch === '{') b++; else if (ch === '}') b--; else if (ch === '(') p++; else if (ch === ')') p--; }
  const uniforms = [...f.matchAll(/uniform\s+\w+\s+([^;]+);/g)].flatMap((m) => m[1].split(',').map((x) => x.trim().replace(/\[.*$/, '')));
  const used = (f.match(/\bsmoothstep\s*\(/g) || []).length;
  const negPow = /pow\(\s*\(/.test(f);
  check('fragment shader: balanced, no raw smoothstep, no pow of a signed expression',
    b === 0 && p === 0 && used === 0 && !negPow && f.startsWith('#version 300 es'),
    `${uniforms.length} uniforms; GLSL smoothstep is undefined for reversed edges, so sstep() is used throughout`);
}

/* ---- 2. JS noise is deterministic and bounded ---- */
{
  const r = PL.WORLDS.mars.render;
  let lo = 9, hi = -9, same = true;
  for (let i = 0; i < 2000; i++) {
    const y = Math.random() * 2 - 1, a = Math.random() * 6.283, s = Math.sqrt(1 - y * y);
    const h = RN.noise.terrain(r, s * Math.cos(a), y, s * Math.sin(a), 6);
    const h2 = RN.noise.terrain(r, s * Math.cos(a), y, s * Math.sin(a), 6);
    if (h !== h2) same = false;
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  check('terrain height is deterministic and bounded', same && lo > -0.5 && hi < 1.5, `range ${lo.toFixed(3)} … ${hi.toFixed(3)}`);
}

/* ---- 3. the globe shows what the model says ---- */
{
  const e = census(new Sim('earth'), 6000);
  check('Earth: ocean pixels cover the modelled sea fraction',
    Math.abs(e.c.ocean - e.vs.seaFrac) < 0.03, `${pct(e.c.ocean)} of the globe vs seaFrac ${pct(e.vs.seaFrac)}`);

  const m = census(new Sim('mars'), 6000);
  const polar = 1 - Math.sin(m.vs.capLat * Math.PI / 180);
  check('Mars: CO₂ cap pixels cover both polar caps', Math.abs(m.c.cap - polar) < 0.02,
    `${pct(m.c.cap)} vs ${pct(polar)} poleward of ±${m.vs.capLat.toFixed(1)}°`);

  const sim = new Sim('mars'); sim.st.cap_co2 *= 0.05;
  const m2 = census(sim, 6000);
  check('Mars: melt 95% of the cap and the white shrinks', m2.c.cap < 0.5 * m.c.cap,
    `${pct(m.c.cap)} → ${pct(m2.c.cap)} (cap edge ${m.vs.capLat.toFixed(1)}° → ${m2.vs.capLat.toFixed(1)}°)`);

  const p = census(new Sim('pluto'), 8000);
  check('Pluto: Sputnik Planitia is a basin, not a polar cap', p.c.cap > 0.03 && p.c.cap < 0.12,
    `${pct(p.c.cap)} of the surface (the real basin is ~5%)`);

  const v = census(run('venus', (pl) => { pl.mirrorOn = true; pl.mirrorFrac = -0.98; }, 3000), 3000);
  check('Venus under a 98% sunshade: every pixel is CO₂ frost', v.c.cap > 0.999,
    `${pct(v.c.cap)} frost, cloud ${v.vs.cloud.toFixed(2)}`);

  const t = census(run('titan', (pl) => { pl.mirrorOn = true; pl.mirrorFrac = -0.6; }, 3000), 6000);
  check('Titan dimmed: nitrogen seas appear in the lowlands', Math.abs(t.c.cap - t.vs.cryoSeaFrac) < 0.02 && t.vs.cryoSeaFrac > 0.03,
    `${pct(t.c.cap)} of pixels vs cryoSeaFrac ${pct(t.vs.cryoSeaFrac)}`);

  const sb = census(run('earth', (pl) => { pl.mirrorOn = true; pl.mirrorFrac = -0.2; }, 5000), 6000);
  check('Snowball Earth: the ice sheets reach the tropics', sb.vs.iceLat < 40 && sb.vs.frozenSea,
    `ice to ${sb.vs.iceLat.toFixed(1)}°, sea frozen, ${pct(sb.c.ice)} of pixels are ice sheet`);
}

/* ---- 4. things the eye should see change ---- */
{
  const hot = run('earth', (pl) => { pl.mirrorOn = true; pl.mirrorFrac = 0.25; }, 20000);
  const v = hot.visualState();
  const whiteish = Math.min.apply(null, v.atmoCol) > 0.7;
  check('Runaway Earth: no liquid clouds above the critical point, a glowing surface, a white sky',
    v.cloud < 0.01 && v.glow > 0.5 && whiteish && v.seaFrac === 0,
    `T ${(v.T - 273.15).toFixed(0)} °C, glow ${v.glow.toFixed(2)}, sky rgb ${v.atmoCol.map((c) => c.toFixed(2)).join(',')}`);

  const ven = new Sim('venus').visualState();
  check('Venus today: 737 K is below the Draper point, so the ground does not glow', ven.glow === 0 && ven.cloud > 0.99,
    `glow ${ven.glow}, sulphuric cloud ${ven.cloud.toFixed(2)}`);
}

/* ---- 5. single-blast scaling ---- */
{
  const e = S.blastScale(PL.WORLDS.earth, new Sim('earth').snapshot(), 1);
  const m = S.blastScale(PL.WORLDS.mars, new Sim('mars').snapshot(), 1);
  const mo = S.blastScale(PL.WORLDS.moon, new Sim('moon').snapshot(), 1);
  check('1 Mt on Earth matches Glasstone & Dolan', Math.abs(e.fireball / 1045 - 1) < 0.1 && Math.abs(e.crater - 230) < 5 && Math.abs(e.plumeTop / 20e3 - 1) < 0.1,
    `fireball ${(e.fireball / 1e3).toFixed(2)} km, crater ${e.crater.toFixed(0)} m, cloud top ${(e.plumeTop / 1e3).toFixed(1)} km`);
  check('thin air lets the fireball grow; vacuum has none', m.fireball > 3 * e.fireball && mo.vacuum && mo.fireball === 0,
    `Mars ${(m.fireball / e.fireball).toFixed(1)}× Earth's; Moon ejecta apex ${(mo.plumeTop / 1e3).toFixed(0)} km`);
}

console.log(`\n${pass}/${total} render checks passed`);
process.exit(pass === total ? 0 : 1);
