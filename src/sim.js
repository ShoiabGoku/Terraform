/* =====================================================================
   sim.js — interventions, and the box model marched through time
   ---------------------------------------------------------------------
   Levers you can pull, and what each one physically does:

     nukes     deposit energy.  Only a fraction couples into subliming
               ice; on a thin-atmosphere world most of the thermal pulse
               radiates straight back to space.  They also make fallout.
     mirrors   add intercepted sunlight.  Free forever once built, but
               the area required scales with the planet's cross-section.
     PFC       perfluorocarbon factories.  Per kilogram these are by far
               the most effective thing on the list.
     comets    deliver volatiles AND energy.  A 10 km ice body carries
               both more mass and more energy than the entire nuclear
               option, which is why serious proposals favour them.
     dust      darken the surface to absorb more sunlight.
     bake      mine and calcine carbonate rock to release bound CO2.
               Enormously energy-hungry, but it is where most of the
               planet's carbon actually is.

   The interesting behaviour is the feedback: warming sublimes polar CO2,
   which thickens the atmosphere, which warms further.  Whether that runs
   away or stalls depends entirely on how much CO2 the world has, which
   is the question the whole simulation exists to answer.
   ===================================================================== */
(function (global) {
  'use strict';

  const PL = global.PLANETS;
  const CM = global.CLIMATE;
  const { MT_J, YR_S } = PL.CONST;
  const S = {};

  /* Cost, in joules, of moving 1 kg of CO2 out of each reservoir. */
  function energyPerKg(which) {
    const c = PL.CO2;
    if (which === 'cap') return c.cp_ice * (195 - c.T_ice) + c.L_sub;
    if (which === 'rego') return 0.35e6;      /* desorption, weakly bound */
    if (which === 'carb') return 4.0e6;       /* calcination near 900 K */
    return c.L_sub;
  }
  S.energyPerKg = energyPerKg;

  /* ------------------------------------------------------------------ */
  function defaultPlan() {
    return {
      /* nuclear campaign */
      nukeOn: false,
      nukeYieldMt: 1,          /* per device */
      nukeCount: 10000,        /* devices per year */
      nukeYears: 10,
      nukeCoupling: 0.05,      /* fraction of yield that sublimes ice */
      nukeFission: 0.5,        /* fission fraction, drives fallout */
      nukeTarget: 'cap',       /* cap | rego | carb */

      /* orbital mirrors: extra intercepted sunlight, as a fraction of
         the planet's own cross-section */
      mirrorOn: false,
      mirrorFrac: 0,

      /* perfluorocarbon factories */
      pfcOn: false,
      pfcRate_kg_yr: 0,

      /* volatile delivery */
      cometOn: false,
      cometMass_kg: 2.6e14,    /* a 10 km ice body */
      cometPerYear: 0,
      cometSpeed_kms: 10,
      cometVolatileFrac: 0.8,

      /* surface darkening */
      dust: 0,

      /* carbonate calcination plants, kg of CO2 released per year */
      bakeOn: false,
      bakeRate_kg_yr: 0
    };
  }
  S.defaultPlan = defaultPlan;

  /* ------------------------------------------------------------------ */
  function Sim(worldKey) {
    /* the plan has to exist before setWorld takes its first snapshot */
    this.plan = defaultPlan();
    this.speedYrPerSec = 2;
    this.paused = false;
    this.setWorld(worldKey || 'mars');
  }
  S.Sim = Sim;

  Sim.prototype.setWorld = function (key) {
    this.w = PL.WORLDS[key];
    this.reset();
  };

  Sim.prototype.reset = function () {
    const w = this.w;
    this.t = 0;                       /* years since the campaign began */
    this.st = Object.assign({ atm_pfc: 0, atm_n2: 0 }, w.res0);
    this.energyUsed_J = 0;
    this.nukesFired = 0;
    this.fissionMt = 0;
    this.cometsUsed = 0;
    this.pfcMade_kg = 0;
    this.escaped_kg = 0;
    this.history = [];
    this.events = [];
    this.peak = { p: 0, T: 0 };
    this.record(true);
  };

  Sim.prototype.log = function (msg, tone) {
    this.events.unshift({ t: this.t, msg, tone: tone || 'info' });
    if (this.events.length > 40) this.events.pop();
  };

  /* One snapshot of the derived state. */
  Sim.prototype.snapshot = function () {
    const w = this.w, p = this.plan;
    const opts = {
      mirrorBoost: p.mirrorOn ? 1 + p.mirrorFrac : 1,
      dust: p.dust
    };
    const s = CM.surfaceTemp(w, this.st, opts);
    s.escape_kgs = CM.escapeRate(w, this.st, s.T);
    s.warmFrac = CM.warmFraction(w, s.T, s.pPa);
    s.lambdaCO2 = CM.jeansLambda(w, s.T, 0.044);
    s.lambdaH2 = CM.jeansLambda(w, s.T, 0.002);
    s.frost = PL.co2Frost(Math.max(s.pPa, 1e-6));
    s.mbar = s.pPa / 100;
    s.bar = s.pPa / 1e5;
    s.C = s.T - 273.15;
    return s;
  };

  Sim.prototype.record = function (force) {
    const s = this.snapshot();
    const last = this.history[this.history.length - 1];
    if (force || !last || this.t - last.t > 0.5) {
      this.history.push({ t: this.t, p: s.pPa, T: s.T, frac: s.warmFrac });
      if (this.history.length > 4000) this.history.shift();
    }
    if (s.pPa > this.peak.p) this.peak.p = s.pPa;
    if (s.T > this.peak.T) this.peak.T = s.T;
    return s;
  };

  /* ------------------------------------------------------------------
     Advance by dt years.
     ------------------------------------------------------------------ */
  Sim.prototype.step = function (dt) {
    if (dt <= 0) return;
    const w = this.w, p = this.plan, st = this.st;
    let s = this.snapshot();

    /* ---- energy-driven release (nukes, calcination) ---- */
    if (p.nukeOn && this.t < p.nukeYears) {
      const devices = p.nukeCount * dt;
      const E = devices * p.nukeYieldMt * MT_J;
      this.nukesFired += devices;
      this.fissionMt += devices * p.nukeYieldMt * p.nukeFission;
      this.energyUsed_J += E;
      this.release(E * p.nukeCoupling, p.nukeTarget);
    }
    if (p.bakeOn && p.bakeRate_kg_yr > 0) {
      const want = p.bakeRate_kg_yr * dt;
      const got = Math.min(want, st.carb_co2);
      st.carb_co2 -= got; st.atm_co2 += got;
      this.energyUsed_J += got * energyPerKg('carb');
    }

    /* ---- manufactured greenhouse gas ---- */
    if (p.pfcOn && p.pfcRate_kg_yr > 0) {
      const m = p.pfcRate_kg_yr * dt;
      st.atm_pfc += m; this.pfcMade_kg += m;
    }

    /* ---- delivered volatiles ---- */
    if (p.cometOn && p.cometPerYear > 0) {
      const n = p.cometPerYear * dt;
      this.cometsUsed += n;
      const mass = n * p.cometMass_kg;
      const v = p.cometSpeed_kms * 1000;
      const E = 0.5 * mass * v * v;
      this.energyUsed_J += E;
      /* the impact energy also sublimes native ice */
      this.release(E * 0.3, 'cap');
      st.atm_h2o += mass * p.cometVolatileFrac;
      st.atm_co2 += mass * (1 - p.cometVolatileFrac) * 0.5;
    }

    /* ---- the feedback: recompute, then let reservoirs seek equilibrium ---- */
    s = this.snapshot();

    /* Polar CO2 ice exchanges with the atmosphere through the frost
       point.  Warmer than the frost point and the cap sublimes; colder
       and the atmosphere snows out onto it.  Sunlight does the work,
       so the rate is set by the energy the cap absorbs. */
    /* While CO2 ice survives, the cap pins the pressure to the vapour
       curve. Anything you put into the air over and above that simply
       snows back out — which is why a partial bombing campaign
       accomplishes nothing permanent. */
    if (st.cap_co2 > 0) {
      const opts = { mirrorBoost: p.mirrorOn ? 1 + p.mirrorFrac : 1, dust: p.dust };
      const eq = CM.capEquilibrium(w, st, opts);
      const targetAtm = PL.massFor(w, eq.pPa);
      const relax = Math.min(1, dt / 30);          /* decades to settle */
      let move = (targetAtm - st.atm_co2) * relax; /* + = cap sublimes */
      move = Math.max(-st.atm_co2 * 0.9, Math.min(move, st.cap_co2));
      st.cap_co2 -= move; st.atm_co2 += move;
      if (st.cap_co2 <= 0) {
        st.cap_co2 = 0;
        this.log('The polar CO₂ cap is completely gone. From here the atmosphere is finally free — nothing is left to snow back out.', 'good');
      }
    }

    /* Regolith adsorption relaxes toward its isotherm over ~decades. */
    if (w.res0.rego_co2 > 0) {
      const capacity = w.res0.rego_co2;
      const eq = CM.regolithEquil(w, capacity, s.pPa, s.T);
      const held = st.rego_co2;
      const move = (held - eq) * Math.min(1, dt / 50);
      st.rego_co2 -= move; st.atm_co2 += move;
    }

    /* ---- escape ---- */
    const lost = s.escape_kgs * dt * YR_S;
    const take = Math.min(lost, st.atm_co2);
    st.atm_co2 -= take; this.escaped_kg += take;

    for (const k of ['atm_co2', 'cap_co2', 'rego_co2', 'carb_co2', 'atm_pfc', 'atm_h2o']) {
      if (!(st[k] >= 0)) st[k] = 0;
    }

    this.t += dt;
    this.record();
  };

  /* Put `E` joules into a reservoir and move what it can free. */
  Sim.prototype.release = function (E, which) {
    const st = this.st;
    const key = which === 'rego' ? 'rego_co2' : which === 'carb' ? 'carb_co2' : 'cap_co2';
    const perKg = energyPerKg(which);
    const can = E / perKg;
    const got = Math.min(can, st[key]);
    st[key] -= got;
    st.atm_co2 += got;
    if (got < can && st[key] <= 0 && !this._warned) {
      this._warned = true;
      this.log(`The ${which === 'cap' ? 'polar cap' : which === 'rego' ? 'regolith' : 'carbonate'} reservoir is exhausted — extra energy now has nothing left to release.`, 'bad');
    }
    return got;
  };

  /* ------------------------------------------------------------------
     What it would take, worked backwards from a pressure target.
     ------------------------------------------------------------------ */
  S.requirement = function (w, plan, targetPa) {
    const need_kg = PL.massFor(w, targetPa) - w.res0.atm_co2;
    const avail = w.res0.cap_co2 + w.res0.rego_co2;
    const availAll = avail + w.res0.carb_co2;
    const perKg = energyPerKg(plan.nukeTarget);
    const E = (need_kg * perKg) / Math.max(plan.nukeCoupling, 1e-6);
    const Mt = E / MT_J;
    return {
      need_kg, avail, availAll, E, Mt,
      arsenals: Mt / 1500,
      possible: need_kg <= availAll,
      possibleEasy: need_kg <= avail,
      /* comets instead */
      comets: need_kg / (plan.cometMass_kg * plan.cometVolatileFrac)
    };
  };

  /* Fallout from the fission yield.  Atmospheric weapons testing put
     about 189 Mt of fission into the environment and produced roughly
     622 PBq of caesium-137, so ~3.3 PBq per fission megaton. */
  S.fallout = function (w, fissionMt) {
    const cs137_PBq = fissionMt * 3.29;
    const perArea = (cs137_PBq * 1e15) / w.area;              /* Bq/m^2 */
    return {
      cs137_PBq, perArea,
      chernobylZones: perArea / 5.55e5    /* 15 Ci/km^2 exclusion threshold */
    };
  };

  /* Mirror area needed for a given boost, and its mass at 10 g/m^2. */
  S.mirrorSpec = function (w, frac) {
    const area = frac * w.cross;
    return {
      area, radius: Math.sqrt(area / Math.PI),
      mass_kg: area * 0.01
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = S;
  global.MARSSIM = S;
})(typeof globalThis !== 'undefined' ? globalThis : this);
