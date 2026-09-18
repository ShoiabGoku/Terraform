/* Multi-planet physics and single-detonation checks.
   Run: node test/worlds-test.js                                         */
const PL = require('../src/planets.js');
const CM = require('../src/climate.js');
const S = require('../src/sim.js');
const { Sim } = S;

let pass = 0, total = 0;
function check(name, ok, detail) {
  total++; if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
}
const fp = (p) => p < 100 ? p.toPrecision(3) + ' Pa' : p < 1e5 ? (p / 100).toPrecision(4) + ' mbar' : (p / 1e5).toPrecision(4) + ' bar';
function run(k, apply, yrs, dt) {
  const sim = new Sim(k); apply(sim.plan, sim);
  dt = dt || 2; const n = Math.ceil(yrs / dt);
  for (let i = 0; i < n; i++) sim.step(yrs / n);
  return { sim, s: sim.snapshot() };
}

/* ---- 1. nothing moves unless you move it ---- */
{
  let worst = '', ok = true;
  for (const k of PL.ORDER) {
    const sim = new Sim(k), a = sim.snapshot();
    for (let i = 0; i < 1000; i++) sim.step(2);
    const b = sim.snapshot();
    const dp = a.pPa > 0.01 ? Math.abs(b.pPa - a.pPa) / a.pPa : Math.abs(b.pPa - a.pPa);
    const bad = Math.abs(b.T - a.T) > 0.5 || (a.pPa > 0.01 ? dp > 0.01 : b.pPa > 0.01);
    if (bad) { ok = false; worst += ` ${k}(${fp(a.pPa)}→${fp(b.pPa)}, ${a.T.toFixed(1)}→${b.T.toFixed(1)} K)`; }
  }
  check('all 15 worlds hold still for 2000 years untouched', ok,
    ok ? 'pressure within 1% and temperature within 0.5 K on every world' : 'drift:' + worst);
}

/* ---- 2. Venus sunshade: a sharp collapse threshold ---- */
{
  const a = run('venus', (p) => { p.mirrorOn = true; p.mirrorFrac = -0.97; }, 3000);
  const b = run('venus', (p) => { p.mirrorOn = true; p.mirrorFrac = -0.98; }, 3000);
  const frozen = b.sim.st.cap_co2 / PL.WORLDS.venus.res0.atm_co2;
  check('Venus: 97% shade holds, 98% freezes the CO₂ out',
    a.s.pPa > 80e5 && b.s.pPa < 5e5 && frozen > 0.99,
    `97% → ${fp(a.s.pPa)} at ${(a.s.T - 273.15).toFixed(0)} °C;  98% → ${fp(b.s.pPa)} at ` +
    `${(b.s.T - 273.15).toFixed(0)} °C with ${(frozen * 100).toFixed(1)}% of the CO₂ frozen onto the ground, ` +
    `leaving its nitrogen`);
}

/* ---- 3. Earth: warming melts ice, too much boils the oceans ---- */
{
  const warm = run('earth', (p) => { p.mirrorOn = true; p.mirrorFrac = 0.10; }, 5000);
  const r0 = PL.WORLDS.earth.res0;
  check('Earth +10%: ice sheets melt into the sea',
    warm.sim.st.ice_h2o < 0.2 * r0.ice_h2o && warm.sim.st.ocean_h2o > r0.ocean_h2o && !warm.sim.runaway,
    `ice ${(r0.ice_h2o / 1e18).toFixed(0)}e18 → ${(warm.sim.st.ice_h2o / 1e18).toFixed(1)}e18 kg, ` +
    `${(warm.s.T - 273.15).toFixed(1)} °C, no runaway`);
  const safe = run('earth', (p) => { p.mirrorOn = true; p.mirrorFrac = 0.18; }, 20000, 4);
  const hot = run('earth', (p) => { p.mirrorOn = true; p.mirrorFrac = 0.25; }, 20000, 4);
  check('Earth: +18% holds, +25% runs away and boils the oceans',
    !safe.sim.runaway && safe.sim.st.ocean_h2o > 0.9 * r0.ocean_h2o &&
    hot.sim.st.ocean_h2o < 0.01 * r0.ocean_h2o && hot.s.pPa > 100e5 && hot.s.T > 1200,
    `+18% → ${(safe.s.T - 273.15).toFixed(0)} °C, oceans intact;  +25% → ${fp(hot.s.pPa)} of steam at ` +
    `${(hot.s.T - 273.15).toFixed(0)} °C, ${(hot.sim.st.ocean_h2o / r0.ocean_h2o * 100).toFixed(1)}% of the ocean left`);
  const cold = run('earth', (p) => { p.mirrorOn = true; p.mirrorFrac = -0.2; }, 5000);
  check('Earth under a 20% sunshade cools and grows ice',
    cold.s.T < 280 && cold.sim.st.ice_h2o > 2 * r0.ice_h2o,
    `${(cold.s.T - 273.15).toFixed(1)} °C, ice ×${(cold.sim.st.ice_h2o / r0.ice_h2o).toFixed(1)}`);
}

/* ---- 4. Titan's nitrogen rains out when dimmed ---- */
{
  const r = run('titan', (p) => { p.mirrorOn = true; p.mirrorFrac = -0.6; }, 3000);
  check('Titan dimmed by 60%: nitrogen condenses out of the sky',
    r.s.pPa < 0.5 * PL.WORLDS.titan.p_obs && r.sim.st.cap_n2 > 1e18,
    `1.47 bar → ${fp(r.s.pPa)}, ${(r.sim.st.cap_n2 / 1e18).toFixed(1)}e18 kg of liquid/solid N₂ on the ground`);
}

/* ---- 5. Pluto and Triton have atmospheres waiting in their ice ---- */
for (const k of ['pluto', 'triton']) {
  const r = run(k, (p) => { p.mirrorOn = true; p.mirrorFrac = 4; }, 3000);
  check(`${PL.WORLDS[k].name} under 5× sunlight sublimates a real atmosphere`,
    r.s.pPa > 100 * PL.WORLDS[k].p_obs,
    `${fp(PL.WORLDS[k].p_obs)} → ${fp(r.s.pPa)} of nitrogen at ${r.s.T.toFixed(0)} K; ` +
    `λ(N₂) = ${r.s.lambdaAir.toFixed(0)} (${CM.retention(r.s.lambdaAir).text})`);
}

/* ---- 6. a bare exoplanet can be given an atmosphere ---- */
{
  const r = run('trappist1e', (p) => { p.cometOn = true; p.cometPerYear = 5; }, 500);
  check('TRAPPIST-1e: comets build an atmosphere from nothing', r.s.pPa > 500,
    `0 → ${fp(r.s.pPa)}, ${(r.s.T - 273.15).toFixed(0)} °C after 2500 comets`);
}

/* ---- 7. one bomb on the Martian polar cap ---- */
{
  const sim = new Sim('mars');
  const r = sim.detonate(-86, 0, 1, 'cap');
  const expect = (1 * PL.CONST.MT_J * 0.05) / S.energyPerKg('cap');
  check('1 Mt on the Martian cap: what one device actually does',
    Math.abs(r.mass - expect) / expect < 1e-9 && r.devicesForAll > 1e7 && r.crater > 200 && r.fireball > 1000,
    `vaporised ${(r.mass / 1e9).toFixed(2)} Mt of CO₂ = ${(r.fracOfReservoir * 100).toExponential(2)}% of the cap; ` +
    `fireball ${(r.fireball / 1000).toFixed(1)} km (thin air lets it grow), crater ${r.crater.toFixed(0)} m; ` +
    `you would need ${r.devicesForAll.toExponential(2)} of them`);
}

/* ---- 8. one bomb in Earth's ocean, one on the airless Moon ---- */
{
  const e = new Sim('earth').detonate(0, -150, 1, 'ocean');
  check('1 Mt in the Pacific boils a lake, not an ocean', e.mass > 1e7 && e.fracOfReservoir < 1e-9,
    `${(e.mass / 1e9).toFixed(3)} Mt of steam = ${(e.fracOfReservoir).toExponential(2)} of the ocean`);
  const m = new Sim('moon').detonate(0, 0, 1, 'rock');
  check('1 Mt on the Moon: no air, no fireball, nothing to release',
    m.vacuum && m.fireball === 0 && m.mass === 0,
    `in vacuum there is only an X-ray flash; crater ${m.crater.toFixed(0)} m (low gravity makes it larger)`);
  const pl = new Sim('pluto').detonate(20, 180, 1, 'cap');
  check('1 Mt on Sputnik Planitia sublimates nitrogen', pl.mass > 1e8 && /nitrogen/.test(pl.freed),
    `${(pl.mass / 1e9).toFixed(2)} Mt of ${pl.freed}`);
}

/* ---- 9. what the renderer is told ---- */
{
  const sim = new Sim('mars'), v0 = sim.visualState();
  sim.st.cap_co2 *= 0.01;
  const v1 = sim.visualState();
  const e = new Sim('earth').visualState(), v = new Sim('venus').visualState();
  check('visual state tracks the physics',
    v0.capLat > 65 && v0.capLat < 75 && v1.capLat > v0.capLat && e.seaFrac > 0.7 && e.seaFrac < 0.85 && v.cloud > 0.99,
    `Mars cap edge ${v0.capLat.toFixed(1)}° → ${v1.capLat.toFixed(1)}° at 1% of its ice; ` +
    `Earth sea cover ${(e.seaFrac * 100).toFixed(0)}% (real ~71%); Venus cloud ${v.cloud.toFixed(2)}`);
}

console.log(`\n${pass}/${total} world checks passed`);
process.exit(pass === total ? 0 : 1);
