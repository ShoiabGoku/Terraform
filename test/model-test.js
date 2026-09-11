/* Headless verification of the terraforming box model.
   Run: node test/model-test.js                                          */
const PL = require('../src/planets.js');
const CM = require('../src/climate.js');
const S = require('../src/sim.js');
const { Sim, defaultPlan, requirement, fallout, mirrorSpec } = S;

let pass = 0, total = 0;
function check(name, ok, detail) {
  total++; if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
}
const mars = PL.WORLDS.mars;

/* ---- 1. an untouched Mars just sits there ---- */
{
  const sim = new Sim('mars');
  const p0 = sim.snapshot().pPa;
  for (let i = 0; i < 2000; i++) sim.step(1);
  const s = sim.snapshot();
  check('undisturbed Mars stays put over 2000 years',
    Math.abs(s.pPa - p0) / p0 < 0.05 && Math.abs(s.T - 216) < 3,
    `${(p0 / 100).toFixed(2)} → ${(s.pPa / 100).toFixed(2)} mbar, T = ${s.T.toFixed(1)} K`);
}

/* ---- 2. THE question: fire the entire world arsenal at the caps ---- */
{
  const sim = new Sim('mars');
  Object.assign(sim.plan, {
    nukeOn: true, nukeYieldMt: 1, nukeCount: 1500, nukeYears: 1,
    nukeCoupling: 0.05, nukeTarget: 'cap'
  });
  const before = sim.snapshot();
  for (let i = 0; i < 200; i++) sim.step(0.05);
  const after = sim.snapshot();
  const dmbar = (after.pPa - before.pPa) / 100;
  check("the world's entire arsenal barely moves the needle",
    dmbar < 0.01,
    `1500 Mt at 5% coupling added ${dmbar.toExponential(2)} mbar ` +
    `(${(after.pPa / 100).toFixed(3)} mbar total). Still ${(after.T - 273.15).toFixed(0)} °C`);
}

/* ---- 3. how much would it actually take? ---- */
{
  const plan = defaultPlan();
  plan.nukeCoupling = 0.05;
  const r = requirement(mars, plan, 1e5);            /* aim for 1 bar */
  check('1 bar by nuclear sublimation is not physically available',
    !r.possible,
    `need ${(r.need_kg / 1e18).toFixed(2)}e18 kg; every reservoir on the planet ` +
    `including carbonates holds ${(r.availAll / 1e18).toFixed(2)}e18 kg. ` +
    `Energy would be ${r.Mt.toExponential(2)} Mt = ${r.arsenals.toExponential(2)} world arsenals`);
}

/* ---- 4. even a modest target is beyond reach ---- */
{
  const plan = defaultPlan(); plan.nukeCoupling = 0.05;
  const r = requirement(mars, plan, PL.LIMITS.armstrong_Pa);   /* 62.7 mbar */
  check('even the Armstrong limit needs thousands of arsenals',
    r.arsenals > 1e3,
    `reaching 62.7 mbar needs ${r.Mt.toExponential(2)} Mt = ` +
    `${r.arsenals.toExponential(2)} world arsenals at 5% coupling; ` +
    `the CO₂ itself ${r.possibleEasy ? 'does' : 'does not'} exist in reachable form`);
}

/* ---- 5. sublime literally everything reachable — where do we land? ---- */
{
  const sim = new Sim('mars');
  sim.st.atm_co2 += sim.st.cap_co2 + sim.st.rego_co2;
  sim.st.cap_co2 = 0; sim.st.rego_co2 = 0;
  const s = sim.snapshot();
  check('all reachable CO₂ at once still leaves Mars hostile',
    s.pPa < 1e4 && s.T < 273.15,
    `${(s.pPa / 100).toFixed(1)} mbar, ${(s.T - 273.15).toFixed(1)} °C — ` +
    `${s.pPa > PL.LIMITS.triplePoint_Pa ? 'above' : 'below'} the triple point, ` +
    `${s.pPa > PL.LIMITS.armstrong_Pa ? 'above' : 'below'} the Armstrong limit`);
}

/* ---- 6. ...and bake every carbonate too ---- */
{
  const sim = new Sim('mars');
  sim.st.atm_co2 += sim.st.cap_co2 + sim.st.rego_co2 + sim.st.carb_co2;
  sim.st.cap_co2 = sim.st.rego_co2 = sim.st.carb_co2 = 0;
  const s = sim.snapshot();
  check('every gram of CO₂ on Mars still does not reach freezing',
    s.T < 273.15,
    `${(s.pPa / 100).toFixed(0)} mbar gives ${(s.T - 273.15).toFixed(1)} °C — ` +
    `still ${(273.15 - s.T).toFixed(0)} K short of melting ice`);
}

/* ---- 7. the runaway question: does warming feed itself? ---- */
{
  const sim = new Sim('mars');
  /* give it a huge one-off shove, then leave it entirely alone */
  sim.st.atm_co2 += sim.st.cap_co2; sim.st.cap_co2 = 0;
  const kick = sim.snapshot();
  for (let i = 0; i < 5000; i++) sim.step(1);
  const end = sim.snapshot();
  check('the CO₂ feedback stalls rather than running away',
    end.pPa < 3 * kick.pPa,
    `kicked to ${(kick.pPa / 100).toFixed(1)} mbar; 5000 years later ` +
    `${(end.pPa / 100).toFixed(1)} mbar at ${(end.T - 273.15).toFixed(1)} °C. ` +
    `It stalls because the planet runs out of CO₂, not because it cools`);
}

/* ---- 8. fallout from a campaign that big ---- */
{
  const f = fallout(mars, 3.4e6);     /* fission Mt for the polar-cap job */
  check('the fallout is globally catastrophic', f.chernobylZones > 10,
    `${f.cs137_PBq.toExponential(2)} PBq of Cs-137 = ${f.perArea.toExponential(2)} Bq/m² ` +
    `everywhere = ${f.chernobylZones.toFixed(0)}× the Chernobyl exclusion-zone threshold, planet-wide`);
}

/* ---- 9. what does work better: mirrors ---- */
{
  const sim = new Sim('mars');
  sim.plan.mirrorOn = true; sim.plan.mirrorFrac = 0.2;
  for (let i = 0; i < 3000; i++) sim.step(1);
  const s = sim.snapshot();
  const spec = mirrorSpec(mars, 0.2);
  check('orbital mirrors warm it, and keep working for free', s.T > 216,
    `+20% sunlight → ${(s.T - 273.15).toFixed(1)} °C and ${(s.pPa / 100).toFixed(1)} mbar. ` +
    `Needs a mirror ${(2 * spec.radius / 1000).toFixed(0)} km across weighing ` +
    `${(spec.mass_kg / 1e9).toFixed(1)} Mt`);
}

/* ---- 10. and the per-kilogram winner ---- */
{
  const sim = new Sim('mars');
  sim.plan.pfcOn = true; sim.plan.pfcRate_kg_yr = 2e11;   /* 200 Mt/yr */
  for (let i = 0; i < 100; i++) sim.step(1);
  const s = sim.snapshot();
  const made = sim.pfcMade_kg;
  check('PFC factories are the most effective lever per kilogram',
    s.T > 220,
    `${(made / 1e12).toFixed(1)} Gt of perfluorocarbons over a century → ` +
    `${(s.T - 273.15).toFixed(1)} °C. Compare the ${(4.66e16 / 1e12).toFixed(0)} Gt of ice ` +
    `the bombs were trying to move`);
}

/* ---- 11. comets carry more energy than the bombs, and mass too ---- */
{
  const plan = defaultPlan();
  const E_comet = 0.5 * plan.cometMass_kg * Math.pow(plan.cometSpeed_kms * 1000, 2);
  const arsenal_J = 1500 * PL.CONST.MT_J;
  check('one 10 km comet outguns the world arsenal', E_comet > 100 * arsenal_J,
    `${(E_comet / PL.CONST.MT_J).toExponential(2)} Mt of kinetic energy, ` +
    `${(E_comet / arsenal_J).toExponential(1)}× the world arsenal — and it delivers ` +
    `${(plan.cometMass_kg / 1e12).toFixed(0)} Gt of volatiles rather than merely moving them`);
}

/* ---- 12. escape is not the obstacle people think ---- */
{
  const sim = new Sim('mars');
  sim.st.atm_co2 = PL.massFor(mars, 1e5);
  const s = sim.snapshot();
  const halfLife = (sim.st.atm_co2 / 2) / s.escape_kgs / PL.CONST.YR_S;
  check('a built atmosphere would last far longer than civilisation',
    halfLife > 1e7,
    `losing ${s.escape_kgs.toFixed(1)} kg/s, half gone in ${halfLife.toExponential(2)} years. ` +
    `Keeping it is easy; making it is the hard part`);
}

/* ---- 13. every world loads and runs ---- */
for (const key of Object.keys(PL.WORLDS)) {
  const sim = new Sim(key);
  let bad = false;
  for (let i = 0; i < 400; i++) {
    sim.step(2);
    const s = sim.snapshot();
    if (!isFinite(s.T) || !isFinite(s.pPa) || s.T < 0) bad = true;
  }
  const s = sim.snapshot();
  check(`world "${key}" integrates cleanly`, !bad,
    `${(s.pPa / 100).toExponential(2)} mbar, ${s.T.toFixed(0)} K, ` +
    `CO₂ λ = ${s.lambdaCO2.toFixed(1)} (${CM.retention(s.lambdaCO2).text})`);
}


/* ---- 14. the headline comparison, as a regression ---- */
{
  const run = (apply, yrs) => {
    const sim = new Sim('mars');
    apply(sim.plan);
    const n = Math.ceil(yrs / 5);
    for (let i = 0; i < n; i++) sim.step(yrs / n);
    const s = sim.snapshot();
    return { mbar: s.pPa / 100, C: s.T - 273.15, Mt: sim.energyUsed_J / PL.CONST.MT_J,
             capGone: sim.st.cap_co2 <= 0 };
  };

  const musk = run((p) => { p.nukeOn = true; p.nukeYieldMt = 10; p.nukeCount = 1000; p.nukeYears = 10; p.nukeCoupling = 0.05; }, 500);
  check('nuking the poles with 67 world arsenals changes nothing',
    Math.abs(musk.mbar - 6.11) < 0.05 && !musk.capGone,
    `${musk.Mt.toExponential(2)} Mt spent → ${musk.mbar.toFixed(2)} mbar, ${musk.C.toFixed(1)} °C. ` +
    `The cap survives, so whatever you sublime simply snows back out`);

  const allout = run((p) => { p.nukeOn = true; p.nukeYieldMt = 100; p.nukeCount = 2e5; p.nukeYears = 100; p.nukeCoupling = 0.1; }, 2000);
  check('a million arsenals does destroy the cap — and still fails',
    allout.capGone && allout.C < -40,
    `${allout.Mt.toExponential(2)} Mt = ${(allout.Mt / 1500).toExponential(2)} world arsenals → ` +
    `${allout.mbar.toFixed(1)} mbar at ${allout.C.toFixed(1)} °C`);

  const mirror = run((p) => { p.mirrorOn = true; p.mirrorFrac = 0.12; }, 3000);
  check('mirrors reach the same place for zero megatons',
    mirror.capGone && mirror.Mt === 0 && mirror.mbar > allout.mbar * 0.9,
    `0 Mt of weapons → ${mirror.mbar.toFixed(1)} mbar at ${mirror.C.toFixed(1)} °C, ` +
    `warmer than the all-out nuclear campaign and with no fallout`);

  check('the nuclear option is strictly dominated', mirror.C > allout.C,
    `mirrors ${mirror.C.toFixed(1)} °C vs bombs ${allout.C.toFixed(1)} °C, ` +
    `for ${allout.Mt.toExponential(1)} Mt less energy`);
}

/* ---- 15. the cap is a thermostat: partial removal is undone ---- */
{
  const sim = new Sim('mars');
  const before = sim.st.cap_co2;
  sim.st.cap_co2 *= 0.5;                       /* vaporise half of it */
  sim.st.atm_co2 += before * 0.5;
  const kicked = sim.snapshot().pPa;
  for (let i = 0; i < 1000; i++) sim.step(1);
  const settled = sim.snapshot().pPa;
  check('removing half the cap is undone within centuries',
    (settled - 610) < 0.1 * (kicked - 610) && Math.abs(settled - 610) < 60,
    `kicked to ${(kicked / 100).toFixed(0)} mbar, settled back to ${(settled / 100).toFixed(2)} mbar. ` +
    `While ice remains the cap pins the pressure to the vapour curve — you must remove all of it`);
}

console.log(`\n${pass}/${total} model checks passed`);
process.exit(pass === total ? 0 : 1);
