/* =====================================================================
   app.js — controls, the 3-D view, single detonations, charts and the
   running verdict
   ===================================================================== */
(function () {
  'use strict';
  const PL = window.PLANETS, CM = window.CLIMATE, MS = window.MARSSIM, RN = window.PLANETRENDER;
  const $ = (id) => document.getElementById(id);
  const MT_J = PL.CONST.MT_J;

  const startKey = (location.hash || '').replace('#', '');
  const sim = new MS.Sim(PL.WORLDS[startKey] ? startKey : 'mars');
  const view = new RN.View($('gl'), $('fx'));
  view.setWorld(sim.w);
  view.setState(sim.visualState(), sim.plan);

  /* ------------------------------ helpers ------------------------------ */
  const fmt = (x, d) => {
    if (!isFinite(x)) return '∞';
    const a = Math.abs(x);
    if (a === 0) return '0';
    if (a < 1e-3 || a >= 1e6) return x.toExponential(d === undefined ? 2 : d);
    return x.toFixed(d === undefined ? (a < 10 ? 2 : a < 1000 ? 1 : 0) : d);
  };
  const mass = (kg) => {
    if (!(kg > 0)) return '0';
    if (kg >= 1e18) return fmt(kg / 1e18) + ' Eg';
    if (kg >= 1e15) return fmt(kg / 1e12) + ' Gt';
    if (kg >= 1e9) return fmt(kg / 1e9) + ' Mt';
    if (kg >= 1e6) return fmt(kg / 1e6) + ' kt';
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
  const press = (pa) => {
    if (!(pa > 0)) return 'none';
    if (pa < 1) return fmt(pa) + ' Pa';
    if (pa < 100) return fmt(pa, 2) + ' Pa';
    if (pa < 1e5) return fmt(pa / 100) + ' mbar';
    return fmt(pa / 1e5) + ' bar';
  };
  const dist = (m) => m >= 1000 ? fmt(m / 1000, m < 1e4 ? 1 : 0) + ' km' : fmt(m, 0) + ' m';
  const words = (n) => {
    if (!isFinite(n)) return '∞';
    if (n >= 1e15) return n.toExponential(2);
    if (n >= 1e12) return (n / 1e12).toPrecision(3) + ' trillion';
    if (n >= 1e9) return (n / 1e9).toPrecision(3) + ' billion';
    if (n >= 1e6) return (n / 1e6).toPrecision(3) + ' million';
    if (n >= 1e3) return Math.round(n).toLocaleString('en');
    return n >= 10 ? Math.round(n).toString() : fmt(n);
  };
  const yieldStr = (y) => y >= 1 ? `${+y.toPrecision(3)} Mt` : `${+(y * 1000).toPrecision(3)} kt`;
  const latStr = (l) => `${Math.abs(l).toFixed(1)}°${l >= 0 ? 'N' : 'S'}`;
  const lonStr = (l) => `${Math.abs(l).toFixed(1)}°${l >= 0 ? 'E' : 'W'}`;
  const row = (l, v, c) => `<div class="row"><label>${l}</label><span class="v ${c || ''}">${v}</span></div>`;
  const logMap = (v, lo, hi) => lo * Math.pow(hi / lo, v / 1000);
  const logInv = (x, lo, hi) => 1000 * Math.log(x / lo) / Math.log(hi / lo);

  /* ------------------------------ scenarios ---------------------------- */
  const LEAVE = { key: 'baseline', name: 'Leave it alone', apply: () => { } };
  const SPECIFIC = {
    mars: [
      { key: 'musk', name: "Musk's idea: nuke the poles", apply: (p) => { p.nukeOn = true; p.nukeYieldMt = 10; p.nukeCount = 1000; p.nukeYears = 10; p.nukeCoupling = 0.05; p.nukeTarget = 'cap'; }, speed: 1 },
      { key: 'arsenal', name: 'Fire the whole world arsenal', apply: (p) => { p.nukeOn = true; p.nukeYieldMt = 1; p.nukeCount = 1500; p.nukeYears = 1; p.nukeCoupling = 0.05; p.nukeTarget = 'cap'; }, speed: 0.2 },
      { key: 'allout', name: 'Build and fire a million arsenals', apply: (p) => { p.nukeOn = true; p.nukeYieldMt = 100; p.nukeCount = 200000; p.nukeYears = 100; p.nukeCoupling = 0.1; p.nukeTarget = 'cap'; }, speed: 10 },
      { key: 'mirrorTip', name: 'Mirrors: tip the polar cap', apply: (p) => { p.mirrorOn = true; p.mirrorFrac = 0.12; }, speed: 10 },
      { key: 'pfc', name: 'Perfluorocarbon factories', apply: (p) => { p.pfcOn = true; p.pfcRate_kg_yr = 2e11; }, speed: 20 },
      { key: 'comets', name: 'Redirect comets for 500 years', apply: (p) => { p.cometOn = true; p.cometMass_kg = 2.6e14; p.cometPerYear = 2; }, speed: 10 },
      { key: 'everything', name: 'Everything at once, for a millennium', speed: 20, apply: (p) => {
        p.mirrorOn = true; p.mirrorFrac = 0.25; p.pfcOn = true; p.pfcRate_kg_yr = 5e11;
        p.cometOn = true; p.cometPerYear = 2; p.bakeOn = true; p.bakeRate_kg_yr = 2e14; p.dust = 0.05;
      } }
    ],
    venus: [
      { key: 'nuke', name: 'Nuke it: a thousand world arsenals', apply: (p) => { p.nukeOn = true; p.nukeYieldMt = 1; p.nukeCount = 150000; p.nukeYears = 10; p.nukeTarget = 'rego'; }, speed: 1 },
      { key: 'shade90', name: 'Sunshade blocking 90% of the light', apply: (p) => { p.mirrorOn = true; p.mirrorFrac = -0.90; }, speed: 20 },
      { key: 'shade98', name: 'Sunshade blocking 98%: freeze out the air', apply: (p) => { p.mirrorOn = true; p.mirrorFrac = -0.98; }, speed: 20 }
    ],
    earth: [
      { key: 'warm10', name: 'Sun 10% brighter: the ice sheets go', apply: (p) => { p.mirrorOn = true; p.mirrorFrac = 0.10; }, speed: 50 },
      { key: 'runaway', name: 'Sun 25% brighter: runaway greenhouse', apply: (p) => { p.mirrorOn = true; p.mirrorFrac = 0.25; }, speed: 200 },
      { key: 'snowball', name: '20% sunshade: snowball Earth', apply: (p) => { p.mirrorOn = true; p.mirrorFrac = -0.20; }, speed: 50 },
      { key: 'co2', name: 'CO₂ at 3× today\'s emissions, forever', apply: (p) => { p.bakeOn = true; p.bakeRate_kg_yr = 1e14; }, speed: 5 }
    ],
    moon: [
      { key: 'nukeIce', name: 'Nuke the polar ice: every world arsenal', apply: (p) => { p.nukeOn = true; p.nukeYieldMt = 1; p.nukeCount = 1500; p.nukeYears = 1; p.nukeTarget = 'ice'; }, speed: 0.2 },
      { key: 'comets', name: '2,500 comets over 500 years', apply: (p) => { p.cometOn = true; p.cometPerYear = 5; }, speed: 20 }
    ],
    titan: [
      { key: 'warm', name: 'Mirrors: four times the sunlight', apply: (p) => { p.mirrorOn = true; p.mirrorFrac = 3; }, speed: 20 },
      { key: 'dim', name: 'Dim the Sun by 60%: the air rains out', apply: (p) => { p.mirrorOn = true; p.mirrorFrac = -0.6; }, speed: 20 }
    ],
    pluto: [
      { key: 'wake', name: 'Mirrors: five times the sunlight', apply: (p) => { p.mirrorOn = true; p.mirrorFrac = 4; }, speed: 20 },
      { key: 'nuke', name: 'Nuke Sputnik Planitia: 1,000 arsenals', apply: (p) => { p.nukeOn = true; p.nukeYieldMt = 1; p.nukeCount = 150000; p.nukeYears = 10; p.nukeTarget = 'cap'; }, speed: 1 }
    ],
    triton: [
      { key: 'wake', name: 'Mirrors: five times the sunlight', apply: (p) => { p.mirrorOn = true; p.mirrorFrac = 4; }, speed: 20 },
      { key: 'nuke', name: 'Nuke the nitrogen cap: 1,000 arsenals', apply: (p) => { p.nukeOn = true; p.nukeYieldMt = 1; p.nukeCount = 150000; p.nukeYears = 10; p.nukeTarget = 'cap'; }, speed: 1 }
    ],
    trappist1e: [
      { key: 'comets', name: '2,500 comets over 500 years', apply: (p) => { p.cometOn = true; p.cometPerYear = 5; }, speed: 20 }
    ]
  };
  function scenariosFor(w) {
    if (SPECIFIC[w.key]) return [LEAVE].concat(SPECIFIC[w.key]);
    const list = [LEAVE];
    if (w.res0.ice_h2o > 0) list.push({ key: 'nukeIce', name: 'Nuke the ice: 1,000 world arsenals', apply: (p) => { p.nukeOn = true; p.nukeYieldMt = 1; p.nukeCount = 150000; p.nukeYears = 10; p.nukeTarget = 'ice'; }, speed: 1 });
    list.push({ key: 'mirror', name: 'Mirrors: triple the sunlight', apply: (p) => { p.mirrorOn = true; p.mirrorFrac = 2; }, speed: 20 });
    list.push({ key: 'comets', name: '1,000 comets over 500 years', apply: (p) => { p.cometOn = true; p.cometPerYear = 2; }, speed: 20 });
    return list;
  }
  function targetsFor(w, st) {
    const t = [];
    if (w.res0.cap_co2 > 0 || w.res0.cap_n2 > 0 || st.cap_co2 > 0 || st.cap_n2 > 0)
      t.push(['cap', (w.res0.cap_n2 > 0 || st.cap_n2 > 0) ? 'nitrogen ice' : (w.polarTrap ? 'polar CO₂ ice' : 'frozen CO₂')]);
    if (w.res0.ocean_h2o > 0) t.push(['ocean', 'the ocean']);
    if (w.res0.ice_h2o > 0) t.push(['ice', 'water ice']);
    if (w.res0.rego_co2 > 0) t.push(['rego', 'regolith']);
    if (w.res0.carb_co2 > 0) t.push(['carb', 'carbonate rock']);
    if (!t.length) t.push(['rego', 'bare rock (nothing volatile)']);
    return t;
  }

  /* ------------------------------ controls ----------------------------- */
  const GROUPS = [
    ['Inner solar system', ['mercury', 'venus', 'earth', 'moon', 'mars']],
    ['Asteroid belt', ['ceres']],
    ['Moons of Jupiter', ['io', 'europa', 'ganymede', 'callisto']],
    ['Moons of Saturn', ['titan', 'enceladus']],
    ['Neptune and beyond', ['triton', 'pluto']],
    ['Another star', ['trappist1e']]
  ];
  $('world').innerHTML = GROUPS.map(([g, ks]) => `<optgroup label="${g}">` +
    ks.filter((k) => PL.WORLDS[k]).map((k) => `<option value="${k}">${PL.WORLDS[k].name}</option>`).join('') + '</optgroup>').join('');

  let scenarios = [];
  function fillScenarios() {
    scenarios = scenariosFor(sim.w);
    $('scenario').innerHTML = scenarios.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
    const t = targetsFor(sim.w, sim.st);
    $('nTarget').innerHTML = t.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
    if (!t.some(([k]) => k === sim.plan.nukeTarget)) sim.plan.nukeTarget = t[0][0];
  }

  function newWorld(key) {
    sim.plan = MS.defaultPlan();
    sim.setWorld(key);
    fillScenarios();
    sim.plan.nukeTarget = targetsFor(sim.w, sim.st)[0][0];
    view.setWorld(sim.w);
    spawn.n = sim.nukesFired; spawn.c = sim.cometsUsed; spawn.pendN = 0; spawn.pendC = 0;
    hideBlast();
    try { history.replaceState(null, '', '#' + key); } catch (e) { /* file:// */ }
    syncAll();
  }

  $('world').value = sim.w.key;
  $('world').onchange = (e) => newWorld(e.target.value);
  $('scenario').onchange = (e) => {
    const sc = scenarios[+e.target.value];
    sim.plan = MS.defaultPlan();
    sim.plan.nukeTarget = targetsFor(sim.w, sim.w.res0)[0][0];
    sc.apply(sim.plan);
    sim.reset();
    view.setWorld(sim.w);
    spawn.n = 0; spawn.c = 0; spawn.pendN = 0; spawn.pendC = 0;
    hideBlast();
    sim.speedYrPerSec = sc.speed || 2;
    if (sim.paused) $('play').onclick();
    syncAll();
  };
  $('play').onclick = () => {
    sim.paused = !sim.paused;
    $('play').textContent = sim.paused ? '▶ Run' : '❚❚ Pause';
  };
  $('reset').onclick = () => {
    sim.reset(); view.setWorld(sim.w);
    spawn.n = 0; spawn.c = 0; spawn.pendN = 0; spawn.pendC = 0;
    hideBlast(); syncAll();
  };
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

  /* sunlight slider: log of the multiplier, 500 = unchanged.  Down to a
     sunshade blocking 99.95%, up to five times the sunlight. */
  const mirSet = (v) => {
    const k = v < 500 ? 3.3 : 0.7;
    sim.plan.mirrorFrac = Math.pow(10, k * (v - 500) / 500) - 1;
    if (Math.abs(sim.plan.mirrorFrac) < 1e-4) sim.plan.mirrorFrac = 0;
    if (v !== 500) sim.plan.mirrorOn = true;
  };
  const mirGet = () => {
    const b = 1 + sim.plan.mirrorFrac;
    return 500 + 500 * Math.log10(Math.max(b, 1e-4)) / (b < 1 ? 3.3 : 0.7);
  };

  const sliders = [
    ['nY', (v) => sim.plan.nukeYieldMt = logMap(v, 0.001, 100), () => logInv(sim.plan.nukeYieldMt, 0.001, 100)],
    ['nC', (v) => sim.plan.nukeCount = Math.round(logMap(v, 1, 1e7)), () => logInv(sim.plan.nukeCount, 1, 1e7)],
    ['nT', (v) => sim.plan.nukeYears = Math.round(logMap(v, 1, 1e5)), () => logInv(sim.plan.nukeYears, 1, 1e5)],
    ['nK', (v) => sim.plan.nukeCoupling = v / 1000, () => sim.plan.nukeCoupling * 1000],
    ['nF', (v) => sim.plan.nukeFission = v / 100, () => sim.plan.nukeFission * 100],
    ['mF', mirSet, mirGet],
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

  /* ---------------------- the single device ---------------------- */
  let bombMt = 1;
  const PRESETS = [['15 kt', 0.015, 'Hiroshima, 1945'], ['475 kt', 0.475, 'W88, a modern warhead'],
    ['1 Mt', 1, 'a large strategic warhead'], ['50 Mt', 50, 'Tsar Bomba, the largest ever tested']];
  $('presets').innerHTML = PRESETS.map(([l, , t], i) => `<span class="chip" data-i="${i}" title="${t}">${l}</span>`).join('');
  $('presets').onclick = (e) => {
    const i = e.target.getAttribute('data-i');
    if (i === null) return;
    bombMt = PRESETS[+i][1];
    syncBomb();
  };
  $('sdY').oninput = (e) => { bombMt = logMap(+e.target.value, 0.001, 100); syncBomb(); };
  function syncBomb() {
    $('sdY').value = Math.round(logInv(bombMt, 0.001, 100));
    $('sdYV').textContent = yieldStr(bombMt);
    $('presets').querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', Math.abs(PRESETS[+c.dataset.i][1] - bombMt) / bombMt < 0.02));
  }

  let closeUps = true;
  function detonateAt(pick) {
    const rep = sim.detonate(pick.lat, pick.lon, bombMt, pick.cls.kind);
    spawn.n = sim.nukesFired;
    view.addBlast(pick.dir, {
      fireball: rep.fireball, crater: rep.crater, plumeTop: rep.plumeTop, vacuum: rep.vacuum,
      target: pick.cls.kind, yieldMt: bombMt, tag: yieldStr(bombMt),
      delay: closeUps ? 2.1 : 0                     /* let the camera arrive first */
    });
    if (closeUps) view.focusOn(pick.dir, rep.plumeTop);
    showBlast(rep, pick);
    update(true);
    return rep;
  }

  function hideBlast() { $('blast').style.display = 'none'; }
  function showBlast(rep, pick) {
    const w = sim.w, s = sim.snapshot();
    const Ykt = rep.yieldMt * 1000;
    const ratio = rep.fireball / (66 * Math.pow(Ykt, 0.4));
    const fb = rep.vacuum ? 'none — no air to heat'
      : dist(rep.fireball) + (ratio > 1.2 ? ` <span style="color:var(--dim2)">(×${ratio.toFixed(1)} Earth's: thin air)</span>`
        : ratio < 0.85 ? ` <span style="color:var(--dim2)">(dense air holds it in)</span>` : '');
    const cs = rep.yieldMt * sim.plan.nukeFission * 3.29;
    const all = isFinite(rep.devicesForAll)
      ? `${words(rep.devicesForAll)} devices = ${words(rep.devicesForAll * rep.yieldMt / 1500)} world arsenals`
      : 'impossible — nothing here to release';
    const exag = view.trueScale ? 1 : view.lastExag;
    $('blast').innerHTML =
      `<h5>${yieldStr(rep.yieldMt)} on ${rep.surface} <span>${latStr(pick.lat)} ${lonStr(pick.lon)}</span>` +
      `<i class="x" id="blastX" title="close">✕</i></h5>` +
      row('energy', `${fmt(rep.E / 6.3e13, 0)}× Hiroshima`) +
      row('fireball radius', fb) +
      row('crater radius', dist(rep.crater)) +
      row(rep.vacuum ? 'ejecta arcs up to' : 'cloud top', '~' + dist(rep.plumeTop)) +
      row('released', rep.mass > 0 ? `${mass(rep.mass)} of ${rep.freed}` : rep.freed, rep.mass > 0 ? 'hi' : 'bad') +
      (rep.mass > 0 ? row('share of that reservoir', fmt(rep.fracOfReservoir * 100) + '%') : '') +
      (rep.mass > 0 ? row('surface pressure change', `+${fmt(rep.pressureRise)} Pa` +
        (s.pPa > 0 ? ` (${fmt(100 * rep.pressureRise / s.pPa)}%)` : '')) : '') +
      row('to release all of it', all, isFinite(rep.devicesForAll) ? '' : 'bad') +
      row('Cs-137 fallout', `${fmt(cs)} PBq`) +
      `<div class="note">For scale, Chernobyl released ~85 PBq of Cs-137. ` +
      (exag > 1.05 ? `The blast is drawn <b>×${words(exag)}</b> larger than life at this zoom — press <i>true scale</i> or zoom in to see its real size. ` : 'Drawn at true scale. ') +
      (w.key === 'earth' ? '<br><span class="warn">On Earth the real climate danger is soot from burning cities — nuclear winter — which this model does not include.</span>' : '') +
      (rep.surface === 'CO₂ polar ice' ? '<br>While the cap survives it pins the pressure to its frost point, so most of this CO₂ will snow back out.' : '') +
      `</div>` +
      `<div class="btnrow"><button class="btn" id="blastWatch">▶ watch it close up</button></div>`;
    $('blast').style.display = 'block';
    $('blastX').onclick = hideBlast;
    $('blastWatch').onclick = () => view.focusOn(pick.dir, rep.plumeTop);
  }

  /* --------------------------- view controls --------------------------- */
  const fx = $('fx');
  const pointers = new Map();
  let drag = null, pinch = null, hoverXY = null;
  fx.addEventListener('pointerdown', (e) => {
    fx.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      drag = null;
    } else drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
  });
  fx.addEventListener('pointermove', (e) => {
    const rc = fx.getBoundingClientRect();
    hoverXY = { x: e.clientX - rc.left, y: e.clientY - rc.top };
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.d > 0 && d > 0) view.zoom(pinch.d / d);
      pinch.d = d;
      return;
    }
    if (drag) {
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) { drag.moved = true; fx.classList.add('dragging'); }
      if (drag.moved) { view.orbit(e.clientX - drag.lx, e.clientY - drag.ly); drag.lx = e.clientX; drag.ly = e.clientY; }
    }
  });
  const endPointer = (e, cancel) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && !drag.moved && !cancel) {
      const rc = fx.getBoundingClientRect();
      const pick = view.pick(e.clientX - rc.left, e.clientY - rc.top);
      if (pick) detonateAt(pick);
    }
    drag = null;
    fx.classList.remove('dragging');
  };
  fx.addEventListener('pointerup', (e) => endPointer(e, false));
  fx.addEventListener('pointercancel', (e) => endPointer(e, true));
  fx.addEventListener('pointerleave', () => { hoverXY = null; $('tip').style.display = 'none'; });
  fx.addEventListener('wheel', (e) => { e.preventDefault(); view.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });

  const toggle = (id, get, set) => {
    const el = $(id);
    el.onclick = () => { set(!get()); el.classList.toggle('on', get()); };
    el.classList.toggle('on', get());
  };
  toggle('vSpin', () => view.spinOn, (v) => view.spinOn = v);
  toggle('vTrue', () => view.trueScale, (v) => view.trueScale = v);
  toggle('vFall', () => view.showFallout, (v) => view.showFallout = v);
  $('vReset').onclick = () => view.resetView();
  toggle('vClose', () => closeUps, (v) => closeUps = v);
  $('vOrbit').onclick = () => view.exitFocus();
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') view.exitFocus(); });

  function updateTip() {
    const tip = $('tip');
    if (!hoverXY || drag && drag.moved) { tip.style.display = 'none'; return; }
    const p = view.pick(hoverXY.x, hoverXY.y);
    if (!p) { tip.style.display = 'none'; return; }
    tip.innerHTML = `${latStr(p.lat)} ${lonStr(p.lon)} · ${p.cls.label} — click: <i>${yieldStr(bombMt)}</i>`;
    tip.style.display = 'block';
    const vw = $('view').clientWidth;
    const tx = hoverXY.x + 14 + tip.offsetWidth > vw ? hoverXY.x - tip.offsetWidth - 10 : hoverXY.x + 14;
    tip.style.left = tx + 'px';
    tip.style.top = (hoverXY.y + 14) + 'px';
  }

  /* ------------------ campaign detonations on the globe ------------------ */
  const spawn = { n: 0, c: 0, pendN: 0, pendC: 0, tC: 0 };
  function spawnCampaign(now) {
    spawn.pendN += sim.nukesFired - spawn.n; spawn.n = sim.nukesFired;
    spawn.pendC += sim.cometsUsed - spawn.c; spawn.c = sim.cometsUsed;
    const p = sim.plan;
    if (spawn.pendN >= 1) {
      const n = spawn.pendN; spawn.pendN = 0;
      const k = n >= 3 ? 3 : 1;
      const bs = MS.blastScale(sim.w, sim.snapshot(), p.nukeYieldMt);
      const kind = { cap: 'cap', ocean: 'ocean', ice: 'ice' }[p.nukeTarget] || 'rock';
      for (let i = 0; i < k; i++) {
        const dir = view.randomSpot(kind);
        if (dir) view.addBlast(dir, { fireball: bs.fireball, crater: bs.crater, plumeTop: bs.plumeTop, vacuum: bs.vacuum,
          target: kind, campaign: true, yieldMt: p.nukeYieldMt, count: n / k, countLabel: words(n / k) });
      }
    }
    if (spawn.pendC >= 1 && now - spawn.tC > 0.6) {
      const n = Math.floor(spawn.pendC); spawn.pendC -= n; spawn.tC = now;
      const E = 0.5 * p.cometMass_kg * Math.pow(p.cometSpeed_kms * 1000, 2);
      const bs = MS.blastScale(sim.w, sim.snapshot(), E / MT_J);
      const st = sim.st;
      const kind = st.cap_co2 > 0 || st.cap_n2 > 0 ? 'cap' : st.ice_h2o > 0 ? 'ice' : 'rock';
      const dir = view.randomSpot(kind);
      if (dir) view.addComet(dir, { fireball: Math.min(bs.fireball, 0.3 * sim.w.R), crater: bs.crater, plumeTop: bs.plumeTop,
        vacuum: bs.vacuum, target: 'ice', yieldMt: E / MT_J, tag: n > 1 ? `${words(n)} comets` : 'comet' });
    }
  }

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

    $('nYV').textContent = yieldStr(p.nukeYieldMt);
    $('nCV').textContent = words(p.nukeCount) + '/yr';
    $('nTV').textContent = words(p.nukeYears) + ' yr';
    $('nKV').textContent = (p.nukeCoupling * 100).toFixed(1) + '%';
    $('nFV').textContent = (p.nukeFission * 100).toFixed(0) + '%';

    const totalMt = p.nukeYieldMt * p.nukeCount * p.nukeYears;
    const fo = MS.fallout(w, totalMt * p.nukeFission);
    $('nukeNote').innerHTML =
      `Campaign total <b>${fmt(totalMt)} Mt</b> = <b>${fmt(totalMt / 1500)}×</b> the world's ` +
      `present ~1500 Mt arsenal. Only a fraction of a nuclear yield ever reaches the target — ` +
      `most of the thermal pulse radiates away or goes into shattering rock.` +
      (totalMt > 0 ? `<br><span class="err">Fallout:</span> ${fmt(fo.cs137_PBq)} PBq of Cs-137, ` +
        `${fmt(fo.perArea)} Bq/m² spread over the whole planet = <b>${fmt(fo.chernobylZones)}×</b> ` +
        `the Chernobyl exclusion-zone threshold, everywhere.` : '');

    const f = p.mirrorFrac;
    $('mFV').textContent = f === 0 ? 'unchanged' : f > 0 ? `+${fmt(f * 100, f < 0.1 ? 1 : 0)}%` : `${fmt(-f * 100, -f > 0.99 ? 2 : 1)}% blocked`;
    const spec = MS.mirrorSpec(w, f);
    $('mirNote').innerHTML = f > 0
      ? `A mirror <b>${words(2 * spec.radius / 1000)} km</b> across, ${mass(spec.mass_kg)} of foil at 10 g/m². ` +
        `Once built it works forever and leaves nothing radioactive behind.`
      : f < 0
        ? `A sunshade <b>${words(2 * spec.radius / 1000)} km</b> across at the L1 point, ${mass(spec.mass_kg)} of film. ` +
          `Shade a hot world enough and its air condenses onto the ground.`
        : `Drag right to add sunlight with orbital mirrors, left to block it with a sunshade.`;

    $('pRV').textContent = mass(p.pfcRate_kg_yr) + '/yr';
    $('pfcNote').innerHTML =
      `Perfluorocarbons are thousands of times more effective per molecule than CO₂ and last ` +
      `for millennia. Marinova et al. (2005) found ~0.1 Pa of an optimised mixture gives about ` +
      `10 K on Mars — here that would be ${mass(PL.massFor(w, 0.1))} of gas.`;

    const dia = Math.cbrt(p.cometMass_kg / 500 / (Math.PI / 6));
    const Ec = 0.5 * p.cometMass_kg * Math.pow(p.cometSpeed_kms * 1000, 2);
    $('cDV').textContent = fmt(dia / 1000) + ' km';
    $('cNV').textContent = fmt(p.cometPerYear) + '/yr';
    $('comNote').innerHTML =
      `Each body carries ${mass(p.cometMass_kg)} of volatiles and lands with ` +
      `<b>${fmt(Ec / MT_J)} Mt</b> of kinetic energy — ${fmt(Ec / (1500 * MT_J))}× ` +
      `the world arsenal, per impact. Comets add matter; bombs only move it around.`;

    $('dustV').textContent = (p.dust >= 0 ? '−' : '+') + fmt(Math.abs(p.dust) * 100, 0) + '% albedo';
    $('bRV').textContent = mass(p.bakeRate_kg_yr) + '/yr';
  }

  function syncAll() { $('world').value = sim.w.key; syncHeader(); syncPanels(); syncBomb(); view.setState(sim.visualState(), sim.plan); update(true); }

  /* ------------------------------ readouts ----------------------------- */
  function headline(w, s, st) {
    const L = PL.LIMITS, p = s.pPa, T = s.T;
    const o2 = s.p && s.p.o2 ? s.p.o2 : 0;
    if (s.runaway) return ['Runaway greenhouse — the oceans are boiling away.', 'var(--red)'];
    if (T > 373 && p > 5e5) return ['A crushing furnace.', 'var(--red)'];
    if (T > 330) return ['Lethally hot.', 'var(--red)'];
    if (p >= L.pressureSuitFree_Pa && p <= 5e5 && T >= 273.15)
      return o2 > 16000 ? ['Breathable. This is home.', 'var(--green)'] : ['Habitable without a pressure suit — bring oxygen.', 'var(--green)'];
    if (T >= 273.15 && p >= L.triplePoint_Pa) return ['Above freezing, liquid water possible — but far too thin to breathe.', 'var(--amber)'];
    if (T >= 273.15) return ['Above freezing, but no real air.', 'var(--amber)'];
    if (p > 5e5) return ['Crushing, and frozen.', 'var(--red)'];
    if (p >= L.armstrong_Pa) return ['Real air — but frozen solid.', 'var(--amber)'];
    if (p >= 1) return ['No. A thin, frozen atmosphere.', 'var(--red)'];
    return ['No. Airless and frozen.', 'var(--red)'];
  }

  function describe(vs, w) {
    const out = [];
    const gas = vs.capSpecies === 'n2' ? 'nitrogen' : 'CO₂';
    if (vs.capFrac > 0) {
      if (w.render.heart) out.push(`nitrogen ice in Sputnik Planitia (${fmt(vs.capFrac * 100, 0)}% left)`);
      else if (w.polarTrap && vs.capLat < 90) out.push(`${gas} ice caps poleward of ${Math.round(vs.capLat)}°`);
      else if (!w.polarTrap && vs.capLat < 1) out.push(`the whole surface under ${gas} frost`);
      else if (!w.polarTrap && vs.capLat < 90) out.push(`${gas} frost poleward of ${Math.round(vs.capLat)}°`);
    }
    if (vs.cryoSeaFrac > 0.002) out.push(`liquid-${gas} seas over ${fmt(vs.cryoSeaFrac * 100, 1)}%`);
    if (vs.seaFrac > 0.002) out.push(`oceans over ${fmt(vs.seaFrac * 100, 0)}%${vs.frozenSea ? ', frozen' : ''}`);
    if (vs.iceLat < 89.5 && !w.render.iceNative) out.push(vs.iceLat < 1 ? 'ice from pole to pole' : `water-ice sheets poleward of ${Math.round(vs.iceLat)}°`);
    if (vs.cloud > 0.15) out.push(vs.runaway ? 'steam clouds' : vs.cloudKind === 1 ? 'sulphuric-acid clouds' : vs.cloudKind === 2 ? 'orange organic haze' : 'water clouds');
    out.push(vs.pPa > 100 ? `${press(vs.pPa)} of air` : vs.pPa > 0.5 ? 'a trace of air' : 'airless');
    if (vs.glow > 0.02) out.push(`the rock glows at ${fmt(vs.T - 273.15, 0)} °C`);
    return out.join(' · ');
  }

  function update(force) {
    const w = sim.w, s = sim.snapshot(), st = sim.st, vs = view.vs || sim.visualState();

    const [ans, tone] = headline(w, s, st);
    $('verdict').innerHTML =
      `<div class="lab">${w.name}, after ${years(sim.t)}</div>` +
      `<div class="ans" style="color:${tone}">${ans}</div>` +
      `<div class="sub">${press(s.pPa)} and ${fmt(s.C, 1)} °C. Earth is 1013 mbar and +15 °C; ` +
      `the summit of Everest is 337 mbar.</div>`;
    $('checks').innerHTML = CM.verdict(w, s)
      .map((c) => `<div class="check ${c.ok ? 'ok' : 'no'}"><i>${c.ok ? '✓' : '✗'}</i><span>${c.text}</span></div>`)
      .join('');

    $('hudTL').innerHTML = `<b>${w.name}</b><div class="st">t + ${years(sim.t)} · ${press(s.pPa)} · ${fmt(s.C, 1)} °C</div>` +
      `<div class="see">${describe(vs, w)}</div>`;
    const recent = view.effects.length > 0;
    const clk = view.heroClock();
    const clock = (t) => t < 60 ? `${t.toFixed(1)} s` : `${Math.floor(t / 60)} min ${String(Math.floor(t % 60)).padStart(2, '0')} s`;
    $('vOrbit').style.display = view.fcs ? '' : 'none';
    $('hint').textContent = view.fcs ? 'drag to circle the blast · scroll to move in or back out · Esc for orbit'
      : 'click to detonate · drag to turn · scroll to zoom';
    $('hudTR').innerHTML = (clk ? `<span class="sc">${clk.tag || ''} · T+ ${clock(clk.t)}</span>` +
        (clk.k > 1.01 ? `<br>cloud's climb shown ×${Math.round(clk.k)} faster` : '<br>real time') + '<br>' : '') +
      (view.trueScale ? '<span class="sc">true scale</span><br>blasts drawn at their real size'
      : recent && view.lastExag > 1.05 ? `<span class="sc">blasts ×${words(view.lastExag)} life size</span><br>zoom in or press <i>true scale</i>`
        : 'blast effects are enlarged to be visible') +
      (view.mode !== 'webgl2' ? `<br><span class="warn">WebGL2 unavailable — coarse CPU globe</span>` : '');

    $('stats').innerHTML = [
      ['pressure', press(s.pPa), 'at the surface'],
      ['temperature', fmt(s.C, 1), '°C, global mean'],
      ['vs Earth', fmt(100 * s.pPa / PL.LIMITS.earthSeaLevel_Pa, 2) + '%', 'of sea level'],
      ['liquid water', s.warmFrac > 0 && s.liquidPossible ? fmt(s.warmFrac * 100, 1) + '%' : 'none', 'of the surface could hold it'],
      ['devices fired', words(sim.nukesFired), 'nuclear'],
      ['energy spent', fmt(sim.energyUsed_J / MT_J), 'megatons'],
      ['= world arsenals', fmt(sim.energyUsed_J / MT_J / 1500), '× 1500 Mt']
    ].map(([k, n, u]) => `<div><div class="k">${k}</div><div class="n">${n}</div><div class="u">${u}</div></div>`).join('');

    const comp = [['CO₂', s.p.co2], ['N₂', s.p.n2], ['O₂ + Ar', s.p.o2], ['H₂O', s.p.h2o], ['PFCs', s.p.pfc]]
      .filter(([, v]) => v > 1e-6);
    const sp = w.capSpecies || (st.cap_n2 > 0 ? 'n2' : st.cap_co2 > 0 ? 'co2' : null);
    const airKg = st.atm_co2 + st.atm_n2 + st.atm_o2;
    $('atmos').innerHTML =
      row('surface pressure', press(s.pPa), 'hi') +
      comp.map(([k, v]) => row('&nbsp;&nbsp;' + k, press(v))).join('') +
      row('mean temperature', fmt(s.C, 1) + ' °C', 'hi') +
      row('effective temperature', fmt(s.Teff - 273.15, 1) + ' °C') +
      row('greenhouse warming', (s.gh >= 0 ? '+' : '') + fmt(s.gh, 1) + ' K', 'cy') +
      row('bond albedo', fmt(s.A, 3)) +
      row('sunlight absorbed', fmt(s.absorbed, 0) + ' W/m²') +
      (sp ? row(`${sp === 'n2' ? 'N₂' : 'CO₂'} frost point`, fmt(PL.tsat(sp, Math.max(s.p[sp] || 0, 1e-9)), 1) + ' K') : '') +
      row('escape rate', fmt(s.escape_kgs, 1) + ' kg/s') +
      (airKg > 0 ? row('half gone in', years((airKg / 2) / Math.max(s.escape_kgs, 1e-9) / PL.CONST.YR_S), 'ok') : '') +
      row('air Jeans λ', fmt(s.lambdaAir, 0) + ' — ' + CM.retention(s.lambdaAir).text, CM.retention(s.lambdaAir).keeps ? 'ok' : 'bad') +
      row('hydrogen λ', fmt(s.lambdaH2, 1) + ' — ' + CM.retention(s.lambdaH2).text, CM.retention(s.lambdaH2).keeps ? 'ok' : 'bad') +
      `<div class="note">The Jeans parameter λ — gravitational binding over thermal energy — decides
       what a world can keep. Above ~15 a gas stays for billions of years; below ~6 it bleeds away.</div>`;

    $('worldout').innerHTML =
      row('gravity', fmt(w.g, 2) + ' m/s²') +
      row('radius', fmt(w.R / 1000, 0) + ' km') +
      row('escape velocity', fmt(w.v_esc / 1000, 2) + ' km/s') +
      row('sunlight', fmt(w.S0, 1) + ' W/m²', 'cy') +
      row('&nbsp;&nbsp;vs Earth', fmt(100 * w.S0 / 1361, 1) + '%') +
      row('observed mean', `${fmt(w.T_obs - 273.15, 0)} °C, ${press(w.p_obs)}`) +
      row('1 mbar of air needs', mass(w.kg_per_mbar)) +
      `<div class="note">${w.notes}<br><br><b>Model confidence:</b> ${w.confidence}</div>`;

    /* reservoirs, on a log scale so a 10¹⁵ kg air and a 10²¹ kg ocean both show */
    const R = [
      ['CO₂ in the air', 'atm_co2', 'var(--cyan)', 0], ['N₂ in the air', 'atm_n2', '#8fb8ff', 0],
      ['O₂ + argon in the air', 'atm_o2', '#b4f0ff', 0], ['water vapour', 'atm_h2o', '#9ac', 1],
      ['CO₂ ice', 'cap_co2', 'var(--ink)', 0], ['nitrogen ice / liquid', 'cap_n2', '#dfe4f2', 0],
      ['CO₂ in the regolith', 'rego_co2', 'var(--rust)', 0], ['CO₂ locked in carbonates', 'carb_co2', 'var(--dim2)', 0],
      ['water ice', 'ice_h2o', '#cfe3ff', 1], ['liquid ocean', 'ocean_h2o', '#2a7fd4', 1]
    ].filter(([, k]) => st[k] > 0 || w.res0[k] > 0);
    const vals = R.map(([, k]) => st[k]).filter((v) => v > 0);
    const hi = vals.length ? Math.log10(Math.max.apply(null, vals)) : 1, lo = hi - 9;
    const kgPa = (kg) => kg * w.g / w.area;
    $('reservoirs').innerHTML = (R.length ? R.map(([k, key, c, water]) => {
      const v = st[key];
      const wv = v > 0 ? Math.max(1, 100 * (Math.log10(v) - lo) / (hi - lo)) : 0;
      const extra = water ? `${fmt(v / 1000 / w.area, 2)} m deep if spread` : `${press(kgPa(v))} as air`;
      return `<div class="res"><div class="lab"><span>${k}</span><em>${mass(v)} · ${extra}</em></div>
       <div class="bar"><i style="width:${wv.toFixed(1)}%;background:${c}"></i></div></div>`;
    }).join('') : '<div class="note" style="margin:0">Nothing volatile at all.</div>') +
      `<div class="note">Bars are logarithmic: each tenth of the width is ten times more. ` +
      ((st.cap_co2 + st.cap_n2 + st.rego_co2) > 0
        ? `Everything a bomb could turn into air — ice and regolith — adds up to <b>${press(kgPa(st.atm_co2 + st.atm_n2 + st.cap_co2 + st.cap_n2 + st.rego_co2))}</b>` +
          (st.carb_co2 > 0 ? `; baking every carbonate too, <b>${press(kgPa(st.atm_co2 + st.atm_n2 + st.cap_co2 + st.cap_n2 + st.rego_co2 + st.carb_co2))}</b>.` : '.') +
          (w.key === 'mars' ? ' This is the wall the whole idea runs into: Mars does not have enough carbon dioxide, at any price.' : '')
        : 'There is no frozen gas here for a bomb to release.') + `</div>`;

    const targets = [
      ['liquid water possible (6.1 mbar)', PL.LIMITS.triplePoint_Pa],
      ['no pressure suit needed (300 mbar)', PL.LIMITS.pressureSuitFree_Pa],
      ['Earth sea level (1013 mbar)', PL.LIMITS.earthSeaLevel_Pa]
    ];
    $('requirement').innerHTML = '<div class="note" style="margin:0 0 8px">' +
      `Working backwards from a pressure target with bombs, at ${(sim.plan.nukeCoupling * 100).toFixed(1)}% coupling:</div>` +
      targets.map(([label, pa]) => {
        if (s.pPa >= pa) return row(label, 'already there', 'ok');
        const r = MS.requirement(w, sim.plan, pa);
        if (r.need_kg <= 0) return row(label, 'already there', 'ok');
        return row(label, r.possible ? `${fmt(r.Mt)} Mt = ${fmt(r.arsenals)} arsenals` : 'impossible — the gas does not exist', r.possible ? 'hi' : 'bad');
      }).join('') +
      `<div class="note">A "world arsenal" is 1500 Mt, roughly every nuclear weapon on Earth.
       Comets are the honest alternative: one 10 km ice body delivers ${mass(2.6e14)} of volatiles —
       it adds matter instead of merely rearranging it.` +
      (w.key === 'venus' ? ' Venus has the opposite problem — try the sunshade scenarios.' : '') + `</div>`;

    $('log').innerHTML = sim.events.map((e) =>
      `<div class="${e.tone}"><time>${years(e.t)}</time>${e.msg}</div>`).join('')
      || '<div style="color:var(--dim2)">Nothing has happened yet.</div>';

    drawChart($('chartP'), sim.history, (h) => Math.max(h.p, 1e-6), 'Pa', 'var(--cyan)', true);
    drawChart($('chartT'), sim.history, (h) => h.T - 273.15, '°C', 'var(--rust)', false, 0);
  }

  $('about').innerHTML = `
    <div class="note" style="margin:0">
    A global-mean box model, not a GCM. Every world is calibrated so that, left alone, it stays at
    its observed pressure and temperature; the greenhouse coefficients come from Venus, Earth and
    Titan and then predict the rest (Earth's CO₂-doubling response comes out at +1.4 K without
    feedbacks and +1.8 K with water vapour, without being tuned for it).<br><br>
    <b>What the globe shows</b> is read from the model: cap edges from the ice mass, sea level
    from the ocean volume, ice lines from the temperature, cloud decks, the optical depth of the
    sky, and the rock glowing past the Draper point. The terrain itself is procedural, not real
    topography. Blast effects are enlarged to stay visible unless you press <i>true scale</i>.<br><br>
    <b>Single detonations</b> use Glasstone &amp; Dolan (1977): fireball 66 m·Y<sub>kt</sub><sup>0.4</sup>
    scaled for air density, crater 23 m·Y<sub>kt</sub><sup>⅓</sup> scaled for gravity, and the
    energy that reaches the target divided by what it takes to vaporise it.<br><br>
    <b>Sources</b><br>
    · Jakosky &amp; Edwards 2018, Nature Astronomy 2, 634 — Mars' CO₂ inventory, and why it is not enough.<br>
    · Forget et al. 2013, Icarus 222, 81 — the ceiling on CO₂ warming.<br>
    · Marinova et al. 2005, JGR 110, E03002 — perfluorocarbon warming.<br>
    · Goldblatt et al. 2013, Nature Geoscience 6, 661 — the runaway greenhouse limit.<br>
    · Glasstone &amp; Dolan 1977, <i>The Effects of Nuclear Weapons</i>.<br>
    · NASA planetary fact sheets; MAVEN escape rates; Agol et al. 2021 for TRAPPIST-1e.<br><br>
    <b>What it does not model:</b> chemistry, dust storms, weather, seasons, thermal inertia
    (it jumps to equilibrium), ice-albedo feedback, Io's tidal heating, Titan's methane cycle,
    nuclear winter, or where breathable oxygen would come from.
    </div>`;

  /* ------------------------------ charts ------------------------------- */
  function fit(c) {
    const r = c.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(r.width * d));
    if (c.width !== w) c.width = w;
    return { x: c.getContext('2d'), W: w, H: c.height };
  }
  function drawChart(c, hist, pick, unit, colour, log, zeroLine) {
    const { x, W, H } = fit(c);
    x.clearRect(0, 0, W, H);
    if (hist.length < 2) return;
    const pad = { l: 52, r: 8, t: 8, b: 18 };
    const xs = hist.map((h) => h.t), ys = hist.map(pick);
    const t0 = xs[0], t1 = Math.max(xs[xs.length - 1], t0 + 1e-6);
    let lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    if (log) {
      lo = Math.log10(Math.max(lo, 1e-6)); hi = Math.log10(Math.max(hi, 1e-6));
      if (hi - lo < 0.05) { lo -= 0.1; hi += 0.1; }
    } else if (hi - lo < 1e-9) hi = lo + 1;
    const pd = (hi - lo) * 0.12; lo -= pd; hi += pd;
    const X = (t) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
    const Y = (v) => {
      const f = ((log ? Math.log10(Math.max(v, 1e-6)) : v) - lo) / (hi - lo);
      return H - pad.b - f * (H - pad.t - pad.b);
    };
    x.strokeStyle = 'rgba(176,149,130,0.13)'; x.lineWidth = 1;
    x.font = '9.5px ui-monospace,monospace'; x.fillStyle = 'rgba(176,149,130,0.7)';
    for (let i = 0; i <= 4; i++) {
      const g = lo + (hi - lo) * i / 4;
      const v = log ? Math.pow(10, g) : g;
      const y = Y(v);
      x.beginPath(); x.moveTo(pad.l, y); x.lineTo(W - pad.r, y); x.stroke();
      x.fillText(log ? press(v) : fmt(v, 1), 3, y + 3);
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
    x.fillText(years(t1), W - pad.r - 44, H - 5);
    if (!log) x.fillText(unit, pad.l + 2, pad.t + 8);
  }

  /* ------------------------------ loop --------------------------------- */
  let last = performance.now(), acc = 0, spawnT = 0;
  function loop(nowMs) {
    const now = nowMs / 1000;
    const dtReal = Math.min((nowMs - last) / 1000, 0.1); last = nowMs;
    if (!sim.paused && !document.hidden) {
      const dt = sim.speedYrPerSec * dtReal;
      const n = Math.min(200, Math.max(1, Math.ceil(dt / 25)));
      for (let i = 0; i < n; i++) sim.step(dt / n);
    }
    spawnT += dtReal;
    if (spawnT > 0.16) { spawnT = 0; spawnCampaign(now); }
    view.setState(sim.visualState(), sim.plan);
    try { view.frame(now, dtReal); } catch (e) { console.error(e); }
    updateTip();
    acc += dtReal;
    if (acc > 0.15) { acc = 0; update(); }
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', () => update(true));
  sim.speedYrPerSec = 2;
  fillScenarios();
  spawn.n = sim.nukesFired; spawn.c = sim.cometsUsed;
  syncAll();
  if (view.mode !== 'webgl2') {
    $('fallback').style.display = 'block';
    $('fallback').textContent = (view.glError || 'WebGL2 unavailable') + ' — showing a coarse CPU-drawn globe.';
    setTimeout(() => { $('fallback').style.display = 'none'; }, 7000);
  }
  requestAnimationFrame(loop);

  /* ------------------------------ test hook ---------------------------- */
  window.__TF = {
    sim, view, PL, CM, MS, RN,
    selfTest: () => CM.selfTest(true),
    snapshot: () => {
      const s = sim.snapshot();
      return { world: sim.w.key, t: sim.t, pPa: s.pPa, mbar: s.pPa / 100, C: s.C, cap: sim.st.cap_co2, atm: sim.st.atm_co2,
        energyMt: sim.energyUsed_J / MT_J, mode: view.mode, effects: view.effects.length };
    },
    setWorld: (k) => { $('world').value = k; newWorld(k); },
    setScenario: (key) => {
      const i = scenarios.findIndex((s) => s.key === key);
      if (i < 0) return false;
      $('scenario').value = String(i); $('scenario').onchange({ target: { value: String(i) } });
      return true;
    },
    run: (yrs) => { const n = Math.ceil(yrs / 5); for (let i = 0; i < n; i++) sim.step(yrs / n); update(true); },
    detonate: (lat, lon, y) => {
      if (y) bombMt = y;
      const dir = RN.dirFromLatLon(lat, lon);
      const cls = RN.classify(sim.w, view.vs, view.look, dir[0], dir[1], dir[2]);
      return detonateAt({ lat, lon, dir, cls });
    },
    pickCenter: () => view.pick(view.cssW / 2, view.cssH / 2),
    focus: (lat, lon, plumeTop) => view.focusOn(RN.dirFromLatLon(lat, lon), plumeTop),
    exitFocus: () => view.exitFocus(),
    lookAt: (lat, lon, dist) => {
      view.fcs = null; view.fly = null;
      const d = view.toWorld(RN.dirFromLatLon(lat, lon));
      view.cam.pitch = Math.max(-1.45, Math.min(1.45, Math.asin(d[1])));
      view.cam.yaw = Math.atan2(d[0], d[2]);
      if (dist) view.cam.dist = dist;
    }
  };
})();
