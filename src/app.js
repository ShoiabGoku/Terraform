/* =====================================================================
   app.js — controls, charts and the running verdict
   ===================================================================== */
(function () {
  'use strict';
  const PL = window.PLANETS, CM = window.CLIMATE, MS = window.MARSSIM;
  const $ = (id) => document.getElementById(id);
  const sim = new MS.Sim('mars');

  /* ------------------------------ helpers ------------------------------ */
  const fmt = (x, d) => {
    if (!isFinite(x)) return '∞';
    const a = Math.abs(x);
    if (a === 0) return '0';
    if (a < 1e-3 || a >= 1e6) return x.toExponential(d === undefined ? 2 : d);
    return x.toFixed(d === undefined ? (a < 10 ? 2 : a < 1000 ? 1 : 0) : d);
  };
  const mass = (kg) => {
    if (kg >= 1e18) return fmt(kg / 1e18) + ' Eg';
    if (kg >= 1e15) return fmt(kg / 1e12) + ' Gt';
    if (kg >= 1e9) return fmt(kg / 1e9) + ' Mt';
    if (kg >= 1e3) return fmt(kg / 1e3) + ' t';
    return fmt(kg) + ' kg';
  };
  const years = (y) => {
    if (y < 1) return fmt(y * 365) + ' days';
    if (y < 1e4) return fmt(y, 0) + ' yr';
    if (y < 1e6) return fmt(y / 1e3) + ' kyr';
    if (y < 1e9) return fmt(y / 1e6) + ' Myr';
    return fmt(y / 1e9) + ' Gyr';
  };
  const row = (l, v, c) => `<div class="row"><label>${l}</label><span class="v ${c || ''}">${v}</span></div>`;
  const logMap = (v, lo, hi) => lo * Math.pow(hi / lo, v / 1000);
  const logInv = (x, lo, hi) => 1000 * Math.log(x / lo) / Math.log(hi / lo);

  /* ------------------------------ scenarios ---------------------------- */
  const SCENARIOS = {
    baseline: { name: 'Leave it alone', apply: (p) => { } },
    musk: {
      name: "Musk's idea: nuke the poles",
      apply: (p) => { p.nukeOn = true; p.nukeYieldMt = 10; p.nukeCount = 1000; p.nukeYears = 10; p.nukeCoupling = 0.05; p.nukeTarget = 'cap'; }
    },
    arsenal: {
      name: "Fire the whole world arsenal",
      apply: (p) => { p.nukeOn = true; p.nukeYieldMt = 1; p.nukeCount = 1500; p.nukeYears = 1; p.nukeCoupling = 0.05; p.nukeTarget = 'cap'; }
    },
    allout: {
      name: 'Build and fire a million arsenals',
      apply: (p) => { p.nukeOn = true; p.nukeYieldMt = 100; p.nukeCount = 200000; p.nukeYears = 100; p.nukeCoupling = 0.1; p.nukeTarget = 'cap'; }
    },
    mirrorTip: {
      name: 'Mirrors: tip the polar cap',
      apply: (p) => { p.mirrorOn = true; p.mirrorFrac = 0.12; }
    },
    pfc: {
      name: 'Perfluorocarbon factories',
      apply: (p) => { p.pfcOn = true; p.pfcRate_kg_yr = 2e11; }
    },
    comets: {
      name: 'Redirect comets for 500 years',
      apply: (p) => { p.cometOn = true; p.cometMass_kg = 2.6e14; p.cometPerYear = 2; }
    },
    everything: {
      name: 'Everything at once, for a millennium',
      apply: (p) => {
        p.mirrorOn = true; p.mirrorFrac = 0.25;
        p.pfcOn = true; p.pfcRate_kg_yr = 5e11;
        p.cometOn = true; p.cometPerYear = 2;
        p.bakeOn = true; p.bakeRate_kg_yr = 2e14;
        p.dust = 0.05;
      }
    }
  };

  /* ------------------------------ controls ----------------------------- */
  $('world').innerHTML = Object.keys(PL.WORLDS)
    .map((k) => `<option value="${k}">${PL.WORLDS[k].name}</option>`).join('');
  $('scenario').innerHTML = Object.keys(SCENARIOS)
    .map((k) => `<option value="${k}">${SCENARIOS[k].name}</option>`).join('');

  $('world').onchange = (e) => { sim.setWorld(e.target.value); syncAll(); };
  $('scenario').onchange = (e) => {
    const keep = { speed: sim.speedYrPerSec };
    sim.plan = MS.defaultPlan();
    SCENARIOS[e.target.value].apply(sim.plan);
    sim.reset();
    sim.speedYrPerSec = keep.speed;
    syncAll();
  };
  $('play').onclick = () => {
    sim.paused = !sim.paused;
    $('play').textContent = sim.paused ? '▶ Run' : '❚❚ Pause';
  };
  $('reset').onclick = () => { sim.reset(); syncAll(); };
  $('speed').oninput = (e) => { sim.speedYrPerSec = logMap(+e.target.value, 0.05, 5000); syncHeader(); };

  function chip(id, get, set) {
    const el = $(id);
    el.onclick = () => { set(!get()); syncAll(); };
    return () => { el.classList.toggle('on', get()); el.textContent = get() ? 'on' : 'off'; };
  }
  const chipSync = [
    chip('nukeOn', () => sim.plan.nukeOn, (v) => sim.plan.nukeOn = v),
    chip('mirOn', () => sim.plan.mirrorOn, (v) => sim.plan.mirrorOn = v),
    chip('pfcOn', () => sim.plan.pfcOn, (v) => sim.plan.pfcOn = v),
    chip('comOn', () => sim.plan.cometOn, (v) => sim.plan.cometOn = v),
    chip('bakeOn', () => sim.plan.bakeOn, (v) => sim.plan.bakeOn = v)
  ];

  const sliders = [
    ['nY', (v) => sim.plan.nukeYieldMt = logMap(v, 0.001, 100), () => logInv(sim.plan.nukeYieldMt, 0.001, 100)],
    ['nC', (v) => sim.plan.nukeCount = Math.round(logMap(v, 1, 1e7)), () => logInv(sim.plan.nukeCount, 1, 1e7)],
    ['nT', (v) => sim.plan.nukeYears = Math.round(logMap(v, 1, 1e5)), () => logInv(sim.plan.nukeYears, 1, 1e5)],
    ['nK', (v) => sim.plan.nukeCoupling = v / 1000, () => sim.plan.nukeCoupling * 1000],
    ['nF', (v) => sim.plan.nukeFission = v / 100, () => sim.plan.nukeFission * 100],
    ['mF', (v) => sim.plan.mirrorFrac = v / 1000 * 2, () => sim.plan.mirrorFrac / 2 * 1000],
    ['pR', (v) => sim.plan.pfcRate_kg_yr = v === 0 ? 0 : logMap(v, 1e6, 1e14), () => logInv(Math.max(sim.plan.pfcRate_kg_yr, 1e6), 1e6, 1e14)],
    ['cD', (v) => sim.plan.cometMass_kg = (Math.PI / 6) * Math.pow(logMap(v, 100, 5e4), 3) * 500, () => logInv(Math.cbrt(sim.plan.cometMass_kg / 500 / (Math.PI / 6)), 100, 5e4)],
    ['cN', (v) => sim.plan.cometPerYear = v === 0 ? 0 : logMap(v, 0.001, 100), () => logInv(Math.max(sim.plan.cometPerYear, 0.001), 0.001, 100)],
    ['bR', (v) => sim.plan.bakeRate_kg_yr = v === 0 ? 0 : logMap(v, 1e9, 1e16), () => logInv(Math.max(sim.plan.bakeRate_kg_yr, 1e9), 1e9, 1e16)],
    ['dust', (v) => sim.plan.dust = -v / 100, () => -sim.plan.dust * 100]
  ];
  for (const [id, set] of sliders) $(id).oninput = (e) => { set(+e.target.value); syncPanels(); };
  $('nTarget').onchange = (e) => { sim.plan.nukeTarget = e.target.value; syncPanels(); };

  document.querySelectorAll('.sec>h3').forEach((h) => {
    h.onclick = () => h.parentElement.classList.toggle('closed');
  });

  /* ------------------------------ panels ------------------------------- */
  function syncHeader() {
    $('speedV').textContent = years(sim.speedYrPerSec) + '/s';
    $('speed').value = Math.round(logInv(sim.speedYrPerSec, 0.05, 5000));
  }

  function syncPanels() {
    const p = sim.plan, w = sim.w;
    for (const f of chipSync) f();
    for (const [id, , get] of sliders) $(id).value = Math.round(Math.max(0, Math.min(1000, get())));
    $('nTarget').value = p.nukeTarget;

    $('nYV').textContent = p.nukeYieldMt >= 1 ? fmt(p.nukeYieldMt) + ' Mt' : fmt(p.nukeYieldMt * 1000) + ' kt';
    $('nCV').textContent = fmt(p.nukeCount, 0) + '/yr';
    $('nTV').textContent = fmt(p.nukeYears, 0) + ' yr';
    $('nKV').textContent = (p.nukeCoupling * 100).toFixed(1) + '%';
    $('nFV').textContent = (p.nukeFission * 100).toFixed(0) + '%';

    const totalMt = p.nukeYieldMt * p.nukeCount * p.nukeYears;
    const fo = MS.fallout(w, totalMt * p.nukeFission);
    $('nukeNote').innerHTML =
      `Campaign total <b>${fmt(totalMt)} Mt</b> = <b>${fmt(totalMt / 1500)}×</b> the world's ` +
      `present ~1500 Mt arsenal.<br>` +
      `Only a fraction of a nuclear yield ever reaches the ice — most of the thermal pulse ` +
      `radiates straight back to space through a thin atmosphere.` +
      (totalMt > 0 ? `<br><span class="err">Fallout:</span> ${fmt(fo.cs137_PBq)} PBq of Cs-137, ` +
        `${fmt(fo.perArea)} Bq/m² spread over the whole planet = <b>${fmt(fo.chernobylZones)}×</b> ` +
        `the Chernobyl exclusion-zone threshold, everywhere.` : '');

    $('mFV').textContent = '+' + (p.mirrorFrac * 100).toFixed(1) + '%';
    const spec = MS.mirrorSpec(w, p.mirrorFrac);
    $('mirNote').innerHTML = p.mirrorFrac > 0
      ? `A mirror <b>${fmt(2 * spec.radius / 1000, 0)} km</b> across, ${mass(spec.mass_kg)} of foil at 10 g/m². ` +
        `Once built it works forever and leaves nothing radioactive behind.`
      : `Sunlight is free and permanent. The catch is the area: it scales with the planet's own disc.`;

    $('pRV').textContent = mass(p.pfcRate_kg_yr) + '/yr';
    $('pfcNote').innerHTML =
      `Perfluorocarbons are thousands of times more effective per molecule than CO₂ and last ` +
      `for millennia. Marinova et al. (2005) found ~0.1 Pa of an optimised mixture gives about ` +
      `10 K — that is ${mass(PL.massFor(w, 0.1))}, against the ${mass(w.res0.cap_co2)} of ice ` +
      `the bombs are trying to move.`;

    const dia = Math.cbrt(p.cometMass_kg / 500 / (Math.PI / 6));
    const Ec = 0.5 * p.cometMass_kg * Math.pow(p.cometSpeed_kms * 1000, 2);
    $('cDV').textContent = fmt(dia / 1000) + ' km';
    $('cNV').textContent = fmt(p.cometPerYear) + '/yr';
    $('comNote').innerHTML =
      `Each body carries ${mass(p.cometMass_kg)} of volatiles and lands with ` +
      `<b>${fmt(Ec / PL.CONST.MT_J)} Mt</b> of kinetic energy — ${fmt(Ec / (1500 * PL.CONST.MT_J))}× ` +
      `the world arsenal, per impact. Comets add matter; bombs only move it around.`;

    $('dustV').textContent = (sim.plan.dust >= 0 ? '−' : '+') + fmt(Math.abs(sim.plan.dust) * 100, 0) + '% albedo';
    $('bRV').textContent = mass(p.bakeRate_kg_yr) + '/yr';
  }

  function syncAll() { syncHeader(); syncPanels(); update(true); }

  /* ------------------------------ readouts ----------------------------- */
  function update(force) {
    const w = sim.w, s = sim.snapshot(), st = sim.st;

    /* headline verdict */
    const reach = st.cap_co2 + st.rego_co2 + st.atm_co2;
    let ans, tone;
    if (s.pPa >= PL.LIMITS.pressureSuitFree_Pa && s.T >= 273.15) { ans = 'Habitable without a suit.'; tone = 'var(--green)'; }
    else if (s.T >= 273.15) { ans = 'Above freezing, but far too thin to breathe.'; tone = 'var(--amber)'; }
    else if (s.pPa >= PL.LIMITS.armstrong_Pa) { ans = 'Thicker, but still frozen solid.'; tone = 'var(--amber)'; }
    else { ans = 'No. Still a near-vacuum, still frozen.'; tone = 'var(--red)'; }

    $('verdict').innerHTML =
      `<div class="lab">after ${years(sim.t)} of effort</div>` +
      `<div class="ans" style="color:${tone}">${ans}</div>` +
      `<div class="sub">${fmt(s.pPa / 100)} mbar and ${fmt(s.C, 1)} °C. Earth is 1013 mbar and +15 °C; ` +
      `the summit of Everest is 337 mbar.</div>`;

    $('checks').innerHTML = CM.verdict(w, s)
      .map((c) => `<div class="check ${c.ok ? 'ok' : 'no'}"><i>${c.ok ? '✓' : '✗'}</i><span>${c.text}</span></div>`)
      .join('');

    $('stats').innerHTML = [
      ['pressure', fmt(s.pPa / 100), 'mbar'],
      ['temperature', fmt(s.C, 1), '°C'],
      ['vs Earth', fmt(100 * s.pPa / PL.LIMITS.earthSeaLevel_Pa, 2) + '%', 'of sea level'],
      ['liquid water', s.warmFrac > 0 ? fmt(s.warmFrac * 100, 1) + '%' : 'none', 'of the surface'],
      ['energy spent', fmt(sim.energyUsed_J / PL.CONST.MT_J), 'megatons'],
      ['= world arsenals', fmt(sim.energyUsed_J / PL.CONST.MT_J / 1500), '× 1500 Mt']
    ].map(([k, n, u]) => `<div><div class="k">${k}</div><div class="n">${n}</div><div class="u">${u}</div></div>`).join('');

    $('atmos').innerHTML =
      row('surface pressure', fmt(s.pPa / 100) + ' mbar', 'hi') +
      row('mean temperature', fmt(s.C, 1) + ' °C', 'hi') +
      row('effective temperature', fmt(s.Teff - 273.15, 1) + ' °C') +
      row('greenhouse warming', '+' + fmt(s.gh, 1) + ' K', 'cy') +
      row('bond albedo', fmt(s.A, 3)) +
      row('CO₂ frost point', fmt(s.frost, 1) + ' K') +
      row('escape rate', fmt(s.escape_kgs, 1) + ' kg/s') +
      row('half gone in', years((st.atm_co2 / 2) / Math.max(s.escape_kgs, 1e-9) / PL.CONST.YR_S), 'ok') +
      row('CO₂ Jeans λ', fmt(s.lambdaCO2, 0) + ' — ' + CM.retention(s.lambdaCO2).text,
        CM.retention(s.lambdaCO2).keeps ? 'ok' : 'bad') +
      row('hydrogen λ', fmt(s.lambdaH2, 1) + ' — ' + CM.retention(s.lambdaH2).text,
        CM.retention(s.lambdaH2).keeps ? 'ok' : 'bad') +
      `<div class="note">The Jeans parameter is why Mars looks the way it does: it holds CO₂ for
       billions of years but cannot hold hydrogen at all, so it kept its carbon dioxide and lost
       its water.</div>`;

    $('worldout').innerHTML =
      row('gravity', fmt(w.g, 2) + ' m/s²') +
      row('radius', fmt(w.R / 1000, 0) + ' km') +
      row('escape velocity', fmt(w.v_esc / 1000, 2) + ' km/s') +
      row('sunlight', fmt(w.S0, 0) + ' W/m²', 'cy') +
      row('&nbsp;&nbsp;vs Earth', fmt(100 * w.S0 / 1361, 0) + '%') +
      row('1 mbar of air needs', mass(w.kg_per_mbar)) +
      `<div class="note">${w.notes}<br><br><b>Model confidence:</b> ${w.confidence}</div>`;

    /* reservoirs */
    const R = [
      ['in the air', st.atm_co2, 'var(--cyan)'],
      ['polar ice', st.cap_co2, 'var(--ink)'],
      ['adsorbed in regolith', st.rego_co2, 'var(--rust)'],
      ['locked in carbonate rock', st.carb_co2, 'var(--dim2)']
    ];
    const tot = R.reduce((a, r) => a + r[1], 0) || 1;
    $('reservoirs').innerHTML = R.map(([k, v, c]) =>
      `<div class="res"><div class="lab"><span>${k}</span>
        <em>${mass(v)} · ${fmt(v / w.kg_per_mbar, 1)} mbar</em></div>
       <div class="bar"><i style="width:${(100 * v / tot).toFixed(2)}%;background:${c}"></i></div></div>`).join('') +
      `<div class="note">Everything you could actually reach adds up to
       <b>${fmt((st.atm_co2 + st.cap_co2 + st.rego_co2) / w.kg_per_mbar, 0)} mbar</b>.
       Even baking every carbonate on the planet only gets you
       <b>${fmt(tot / w.kg_per_mbar, 0)} mbar</b>. This is the wall the whole idea runs into:
       Mars does not have enough carbon dioxide, at any price.</div>`;

    /* requirement calculator */
    const targets = [
      ['liquid water possible (6.1 mbar)', PL.LIMITS.triplePoint_Pa],
      ['no pressure suit needed (300 mbar)', PL.LIMITS.pressureSuitFree_Pa],
      ['Earth sea level (1013 mbar)', PL.LIMITS.earthSeaLevel_Pa]
    ];
    $('requirement').innerHTML = '<div class="note" style="margin:0 0 8px">' +
      `Working backwards from a pressure target, at your current ${(sim.plan.nukeCoupling * 100).toFixed(1)}% coupling:</div>` +
      targets.map(([label, pa]) => {
        const r = MS.requirement(w, sim.plan, pa);
        if (r.need_kg <= 0) return row(label, 'already there', 'ok');
        return row(label,
          r.possible
            ? `${fmt(r.Mt)} Mt = ${fmt(r.arsenals)} arsenals`
            : `impossible — the CO₂ does not exist`,
          r.possible ? 'hi' : 'bad');
      }).join('') +
      `<div class="note">A "world arsenal" here is 1500 Mt, roughly every nuclear weapon on Earth.
       Comets are the honest alternative: one 10 km ice body delivers
       ${mass(2.6e14)} of volatiles and lands with thousands of arsenals' worth of energy —
       it adds matter instead of merely rearranging it.</div>`;

    $('log').innerHTML = sim.events.map((e) =>
      `<div class="${e.tone}"><time>${years(e.t)}</time>${e.msg}</div>`).join('')
      || '<div style="color:var(--dim2)">Nothing has happened yet.</div>';

    drawPlanet(s);
    drawChart($('chartP'), sim.history, (h) => h.p / 100, 'mbar', 'var(--cyan)', true);
    drawChart($('chartT'), sim.history, (h) => h.T - 273.15, '°C', 'var(--rust)', false, 0);
  }

  $('about').innerHTML = `
    <div class="note" style="margin:0">
    A global-mean box model, not a GCM. It is calibrated so that an untouched Mars sits exactly
    at its observed 6.109 mbar and 216 K, and so that a full bar of CO₂ reproduces the published
    result that pure CO₂ <i>cannot</i> push Mars above freezing.<br><br>
    <b>Sources</b><br>
    · Jakosky &amp; Edwards 2018, <i>Inventory of CO₂ available for terraforming Mars</i>,
      Nature Astronomy 2, 634 — the volatile inventory, and the conclusion that it is not enough.<br>
    · Forget et al. 2013, Icarus 222, 81 — the ceiling on CO₂ greenhouse warming.<br>
    · Marinova et al. 2005, JGR 110, E03002 — perfluorocarbon warming.<br>
    · MAVEN escape rates; NASA planetary fact sheets.<br><br>
    <b>What it does not model:</b> atmospheric chemistry, dust storms, regional climate, the
    biology, or where the nitrogen and oxygen would come from. Venus and Titan are listed for
    contrast but are outside the parameterisation's range.
    </div>`;

  /* ------------------------------ drawing ------------------------------ */
  function fit(c) {
    const r = c.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(r.width * d)), h = Math.max(2, Math.round((c.height || 200)));
    if (c.width !== w) c.width = w;
    return { x: c.getContext('2d'), W: w, H: c.height, d };
  }

  function drawPlanet(s) {
    const { x, W, H } = fit($('planet'));
    x.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.34;

    /* atmosphere haze grows with pressure */
    const pf = Math.min(1, Math.log10(Math.max(s.pPa, 1) / 100) / 3);
    if (pf > 0) {
      const g = x.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * (1.02 + 0.30 * pf));
      g.addColorStop(0, `rgba(150,190,235,${0.30 * pf + 0.05})`);
      g.addColorStop(1, 'rgba(150,190,235,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(cx, cy, R * (1.02 + 0.30 * pf), 0, 7); x.fill();
    }

    /* the surface, warming from rust toward damp blue-green */
    const warm = Math.max(0, Math.min(1, (s.T - 220) / 60));
    const g2 = x.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    g2.addColorStop(0, `rgb(${Math.round(215 - 80 * warm)},${Math.round(120 + 60 * warm)},${Math.round(75 + 70 * warm)})`);
    g2.addColorStop(1, `rgb(${Math.round(110 - 50 * warm)},${Math.round(52 + 40 * warm)},${Math.round(32 + 45 * warm)})`);
    x.fillStyle = g2;
    x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();

    /* polar caps, sized by how much CO2 ice is left */
    const capFrac = sim.w.res0.cap_co2 > 0 ? sim.st.cap_co2 / sim.w.res0.cap_co2 : 0;
    if (capFrac > 0.001) {
      x.fillStyle = 'rgba(245,250,255,0.92)';
      for (const sgn of [-1, 1]) {
        x.save(); x.beginPath(); x.arc(cx, cy, R, 0, 7); x.clip();
        x.beginPath();
        x.ellipse(cx, cy + sgn * R * 0.94, R * 0.72 * Math.pow(capFrac, 0.4), R * 0.30 * Math.pow(capFrac, 0.5), 0, 0, 7);
        x.fill(); x.restore();
      }
    }
    /* terminator */
    const sh = x.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.2, cx, cy, R * 1.25);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.72)');
    x.fillStyle = sh; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();

    x.fillStyle = 'rgba(176,149,130,0.9)';
    x.font = '11px ui-monospace,monospace';
    x.fillText(`${sim.w.name} · t + ${years(sim.t)}`, 12, 18);
    if (capFrac <= 0.001 && sim.w.res0.cap_co2 > 0) {
      x.fillStyle = '#ffb347';
      x.fillText('polar CO₂ cap: gone', 12, 34);
    }
  }

  function drawChart(c, hist, pick, unit, colour, log, zeroLine) {
    const { x, W, H } = fit(c);
    x.clearRect(0, 0, W, H);
    if (hist.length < 2) return;
    const pad = { l: 46, r: 8, t: 8, b: 18 };
    const xs = hist.map((h) => h.t), ys = hist.map(pick);
    const t0 = xs[0], t1 = Math.max(xs[xs.length - 1], t0 + 1e-6);
    let lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    if (log) { lo = Math.max(lo, 1e-4); hi = Math.max(hi, lo * 1.5); }
    if (hi - lo < 1e-9) { hi = lo + 1; }
    const pd = (hi - lo) * 0.12; lo -= pd; hi += pd;
    const X = (t) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
    const Y = (v) => {
      const f = log ? (Math.log10(Math.max(v, 1e-4)) - Math.log10(Math.max(lo, 1e-4))) / (Math.log10(hi) - Math.log10(Math.max(lo, 1e-4)))
        : (v - lo) / (hi - lo);
      return H - pad.b - f * (H - pad.t - pad.b);
    };
    x.strokeStyle = 'rgba(176,149,130,0.13)'; x.lineWidth = 1;
    x.font = '9.5px ui-monospace,monospace'; x.fillStyle = 'rgba(176,149,130,0.7)';
    for (let i = 0; i <= 4; i++) {
      const v = log ? Math.pow(10, Math.log10(Math.max(lo, 1e-4)) + (Math.log10(hi) - Math.log10(Math.max(lo, 1e-4))) * i / 4)
        : lo + (hi - lo) * i / 4;
      const y = Y(v);
      x.beginPath(); x.moveTo(pad.l, y); x.lineTo(W - pad.r, y); x.stroke();
      x.fillText(fmt(v, 1), 4, y + 3);
    }
    if (zeroLine !== undefined && zeroLine > lo && zeroLine < hi) {
      x.strokeStyle = 'rgba(90,230,168,0.45)'; x.setLineDash([4, 4]);
      x.beginPath(); x.moveTo(pad.l, Y(zeroLine)); x.lineTo(W - pad.r, Y(zeroLine)); x.stroke();
      x.setLineDash([]);
      x.fillStyle = 'rgba(90,230,168,0.8)'; x.fillText('freezing', W - pad.r - 48, Y(zeroLine) - 4);
    }
    x.beginPath();
    hist.forEach((h, i) => { const px = X(h.t), py = Y(pick(h)); i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.strokeStyle = colour; x.lineWidth = 1.8; x.stroke();
    x.fillStyle = 'rgba(176,149,130,0.7)';
    x.fillText(years(t1), W - pad.r - 40, H - 5);
    x.fillText(unit, pad.l + 2, pad.t + 8);
  }

  /* ------------------------------ loop --------------------------------- */
  let last = performance.now(), acc = 0;
  function loop(now) {
    const dtReal = Math.min((now - last) / 1000, 0.1); last = now;
    if (!sim.paused && !document.hidden) {
      const dt = sim.speedYrPerSec * dtReal;
      /* sub-step so fast-forward stays accurate */
      const n = Math.min(200, Math.max(1, Math.ceil(dt / 25)));
      for (let i = 0; i < n; i++) sim.step(dt / n);
    }
    acc += dtReal;
    if (acc > 0.12) { acc = 0; update(); }
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', () => update(true));
  sim.speedYrPerSec = 2;
  syncAll();
  requestAnimationFrame(loop);

  window.__TF = {
    sim, PL, CM, MS,
    selfTest: () => CM.selfTest(true),
    snapshot: () => {
      const s = sim.snapshot();
      return { t: sim.t, mbar: s.pPa / 100, C: s.C, cap: sim.st.cap_co2, atm: sim.st.atm_co2,
        energyMt: sim.energyUsed_J / PL.CONST.MT_J };
    },
    setScenario: (k) => { $('scenario').value = k; $('scenario').onchange({ target: { value: k } }); },
    run: (yrs) => { const n = Math.ceil(yrs / 5); for (let i = 0; i < n; i++) sim.step(yrs / n); update(true); }
  };
})();
