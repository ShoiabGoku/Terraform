/* =====================================================================
   sim.js — interventions, single detonations, and the model in time
   ---------------------------------------------------------------------
   Two ways to use a nuclear weapon here:

     campaign   N devices a year for M years, fed straight into the
                reservoirs.  This is how you test "would it work".
     detonate   one device, at one latitude and longitude.  It works out
                what it hit (polar ice, ocean, water ice, bare rock),
                how big the fireball and crater are, how much it
                actually vaporised, and what fraction of the job that is.

   Everything else is the physics that decides whether any of it lasts:
     polar cold traps   Mars' CO2 caps, Pluto's and Triton's N2 ice.
                        While ice remains they pin the pressure to the
                        vapour curve, so gas you release snows back out.
     condensation       cool a world below its gas's saturation point
                        and the air itself rains out — Venus under a
                        sunshade, Titan dimmed, Mars chilled.
     water              vapour tracks saturation; ice and ocean trade
                        places with temperature; and if a wet world
                        absorbs more than the 282 W/m² a steam-saturated
                        atmosphere can radiate, the oceans boil — the
                        runaway greenhouse.
     escape             Jeans loss plus solar-wind stripping.
   ===================================================================== */
(function (global) {
  'use strict';

  const PL = global.PLANETS;
  const CM = global.CLIMATE;
  const { MT_J, YR_S } = PL.CONST;
  const S = {};

  /* joules to mobilise 1 kg from each reservoir */
  function energyPerKg(which, T) {
    const c = PL.CO2;
    switch (which) {
      case 'cap':  return c.cp_ice * (195 - c.T_ice) + c.L_sub;              /* CO2 ice */
      case 'capn2': return PL.N2.cp_ice * (60 - PL.N2.T_ice) + PL.N2.L_sub;  /* N2 ice */
      case 'rego': return 0.35e6;
      case 'carb': return 4.0e6;
      case 'ocean': return 4186 * Math.max(0, 373 - (T || 288)) + PL.H2O.L_vap;
      case 'ice':  return PL.H2O.cp_ice * Math.max(0, 273 - (T || 150)) + PL.H2O.L_sub;
      case 'rock': return 800 * 700;                                          /* heat rock to ~900 K */
      default: return c.L_sub;
    }
  }
  S.energyPerKg = energyPerKg;

  /* Bodies you could drop on a planet.  Densities and volatile fractions
     are the measured ranges for each class: comets are dirty ice, C-type
     (carbonaceous) asteroids carry ~10% water bound in clays plus carbon,
     S-type (stony) ones are essentially dry.  Impact speeds are the mean
     for that population arriving at Mars. */
  S.BODIES = {
    comet:        { name: 'comet (dirty ice)',            rho: 500,  vol: 0.80, v: 25, note: 'Oort cloud or a Jupiter-family comet: mostly water ice, but they come from the outer system and only pass by on their own schedule.' },
    carbonaceous: { name: 'carbonaceous asteroid (C-type)', rho: 2000, vol: 0.10, v: 10, note: 'The common outer-belt rock: ~10% water bound into clays, plus carbon and organics. Three quarters of the belt by number.' },
    stony:        { name: 'stony asteroid (S-type)',        rho: 2700, vol: 0.005, v: 10, note: 'Inner-belt and most Mars-crossers: dry. It delivers heat and rock, almost no air.' }
  };
  /* What it costs to put one on a collision course, in delta-v. */
  S.SOURCES = {
    crosser:  { name: 'a Mars-crossing asteroid (~20,000 known)', dv: 30,   note: 'Already crosses Mars\' orbit: a nudge years ahead moves the miss into a hit.' },
    resonance:{ name: 'main belt, nudged into a resonance',       dv: 5,    note: 'Let the 3:1 Kirkwood gap do the work — almost free, but delivery takes 10⁵–10⁶ years.' },
    direct:   { name: 'main belt, pushed straight down',          dv: 2400, note: 'Drop it from 2.5 AU to Mars in one go. The honest number for "just move an asteroid".' }
  };

  /* Is there anything out there to throw?  Order-of-magnitude survey
     numbers.  n1km is how many bodies bigger than 1 km the reservoir holds,
     and the population falls off as D^-slope, so N(>D) = n1km * D_km^-slope.
     Comets are different: they are not sitting still, they fall in, so what
     limits you is the arrival rate — arrivals1km per year bigger than 1 km,
     with the same size law.
       main belt      ~1.9 million bodies > 1 km, ~200 > 100 km, 2.4e21 kg in
                      total, 39% of it in Ceres alone
       Mars-crossers  ~28,000 known, nearly all 1-5 km, mostly dry S-types
       Jupiter-family ~500 active comets > 1 km, coming back every ~7 years
       long-period    a few > 1 km fall in each year; a 10 km one is rarer
                      than once a decade                                   */
  S.RESERVOIRS = {
    belt:     { name: 'the main belt', n1km: 1.9e6, slope: 2.2, mass: 2.39e21, arrivals1km: 0, reach: 'each one needs its own mission out to 2-3 AU' },
    crossers: { name: 'known Mars-crossers', n1km: 2.8e4, slope: 2.6, mass: 2e19, arrivals1km: 0, reach: 'already crossing Mars; the cheapest to move, but mostly dry rock' },
    jfc:      { name: 'Jupiter-family comets', n1km: 500, slope: 2.0, mass: 5e17, arrivals1km: 70, reach: 'they come back every ~7 years, so you can plan for them — but they are small' },
    lpc:      { name: 'long-period comets', n1km: 1e11, slope: 2.0, mass: 1e26, arrivals1km: 3, reach: 'the Oort cloud is inexhaustible and unreachable: you can only work with the few that fall in' }
  };
  S.reservoirFor = function (plan) {
    if (plan.bodyKind === 'comet') return plan.bodySource === 'direct' ? 'lpc' : 'jfc';
    return plan.bodySource === 'crosser' ? 'crossers' : 'belt';
  };
  /* How many bodies of this size exist or arrive, against the rate asked for. */
  S.supply = function (plan) {
    const key = S.reservoirFor(plan), r = S.RESERVOIRS[key];
    const dkm = Math.max((plan.bodyDia_m || 1e4) / 1000, 0.01);
    const count = r.n1km * Math.pow(dkm, -r.slope);
    const arrivals = r.arrivals1km * Math.pow(dkm, -r.slope);
    const rate = plan.cometPerYear || 0;
    const massEach = plan.cometMass_kg;
    return {
      key, name: r.name, reach: r.reach, count, arrivals, rate,
      /* comets have to come to you; rocks sit still until you fetch them */
      arrivalLimited: r.arrivals1km > 0,
      shortfall: arrivals > 0 ? rate / arrivals : Infinity,
      yearsToExhaust: rate > 0 ? count / rate : Infinity,
      massYears: rate > 0 && massEach > 0 ? r.mass / (massEach * rate) : Infinity
    };
  };

  function defaultPlan() {
    return {
      nukeOn: false, nukeYieldMt: 1, nukeCount: 10000, nukeYears: 10,
      nukeCoupling: 0.05, nukeFission: 0.5, nukeTarget: 'cap',
      mirrorOn: false, mirrorFrac: 0,        /* negative = sunshade */
      pfcOn: false, pfcRate_kg_yr: 0,
      cometOn: false, cometMass_kg: 2.6e14, cometPerYear: 0,
      cometSpeed_kms: 10, cometVolatileFrac: 0.8,
      cometDeltaV_ms: 10, cometNukeEff: 0.01,   /* the nuclear nudge that retargets one */
      bodyKind: 'comet', bodySource: 'crosser', bodyDia_m: 1e4,
      dust: 0,
      bakeOn: false, bakeRate_kg_yr: 0
    };
  }
  S.defaultPlan = defaultPlan;

  /* ------------------------------------------------------------------ */
  function Sim(worldKey) {
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
    this.t = 0;
    this.st = Object.assign({ atm_pfc: 0 }, w.res0);
    for (const k of ['atm_co2', 'atm_n2', 'atm_o2', 'atm_h2o', 'cap_co2', 'cap_n2',
      'rego_co2', 'carb_co2', 'ice_h2o', 'ocean_h2o']) if (!(this.st[k] >= 0)) this.st[k] = 0;
    this.energyUsed_J = 0;
    this.nukesFired = 0;
    this.fissionMt = 0;
    this.cometsUsed = 0;
    this.cometNukeMt = 0;
    this.cometDevices = 0;
    this.pfcMade_kg = 0;
    this.escaped_kg = 0;
    this.runaway = false;
    this.history = [];
    this.events = [];
    this.scars = [];            /* permanent marks left by single detonations */
    this.lastBlast = null;
    this.peak = { p: 0, T: 0 };
    this._capKey = null;
    this._warned = {};
    this.record(true);
  };

  Sim.prototype.log = function (msg, tone) {
    this.events.unshift({ t: this.t, msg, tone: tone || 'info' });
    if (this.events.length > 50) this.events.pop();
  };

  Sim.prototype.opts = function () {
    const p = this.plan;
    return { mirrorBoost: p.mirrorOn ? Math.max(0.0005, 1 + p.mirrorFrac) : 1, dust: p.dust };
  };

  Sim.prototype.snapshot = function () {
    const w = this.w;
    const s = CM.surfaceTemp(w, this.st, this.opts());
    s.escape_kgs = CM.escapeRate(w, this.st, s.T);
    s.warmFrac = CM.warmFraction(w, s.T, s.pPa);
    s.muMean = CM.meanMolar(this.st);
    s.lambdaAir = CM.jeansLambda(w, s.T, s.muMean);
    s.lambdaCO2 = CM.jeansLambda(w, s.T, 0.044);
    s.lambdaH2 = CM.jeansLambda(w, s.T, 0.002);
    s.frost = PL.tsat('co2', Math.max(s.p.co2, 1e-9));
    s.mbar = s.pPa / 100;
    s.bar = s.pPa / 1e5;
    s.C = s.T - 273.15;
    s.runaway = this.runaway;
    /* pole-to-equator contrast: thin air cannot carry heat poleward */
    s.D = Math.min(80, 40 * Math.pow(1e5 / Math.max(s.pPa, 100), 0.25));
    s.Teq = s.T + s.D / 3;
    s.Tpole = s.T - 2 * s.D / 3;
    s.liquidPossible = s.pPa >= PL.LIMITS.triplePoint_Pa && s.Teq > 273.15 && s.T < 640;
    return s;
  };

  /* area fraction of the globe colder than 273 K, and the latitude of
     that ice line, from T(lat) = T + D (1/3 - sin^2 lat) */
  S.iceLine = function (s) {
    const x = (s.T - 273.15) / s.D + 1 / 3;          /* = sin^2 of the ice line */
    if (x >= 1) return { lat: 90, frac: 0 };
    if (x <= 0) return { lat: 0, frac: 1 };
    const sl = Math.sqrt(x);
    return { lat: Math.asin(sl) * 180 / Math.PI, frac: 1 - sl };
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

    /* ---- the campaign ---- */
    if (p.nukeOn && this.t < p.nukeYears) {
      const devices = p.nukeCount * Math.min(dt, p.nukeYears - this.t);
      const E = devices * p.nukeYieldMt * MT_J;
      this.nukesFired += devices;
      this.fissionMt += devices * p.nukeYieldMt * p.nukeFission;
      this.energyUsed_J += E;
      this.release(E * p.nukeCoupling, this.campaignTarget());
    }
    if (p.bakeOn && p.bakeRate_kg_yr > 0) {
      const got = Math.min(p.bakeRate_kg_yr * dt, st.carb_co2);
      st.carb_co2 -= got; st.atm_co2 += got;
      this.energyUsed_J += got * energyPerKg('carb');
    }
    if (p.pfcOn && p.pfcRate_kg_yr > 0) {
      const m = p.pfcRate_kg_yr * dt;
      st.atm_pfc += m; this.pfcMade_kg += m;
    }
    if (p.cometOn && p.cometPerYear > 0) {
      const n = p.cometPerYear * dt;
      this.cometsUsed += n;
      const mass = n * p.cometMass_kg;
      const v = p.cometSpeed_kms * 1000;
      const E = 0.5 * mass * v * v;
      this.energyUsed_J += E;
      /* the nuclear devices spent moving them (in deep space: no fallout here) */
      const bill = S.cometBill(p);
      this.cometNukeMt += bill.Mt * n;
      this.cometDevices += bill.devices * n;
      this.energyUsed_J += bill.E * n;
      const hit = st.cap_co2 > 0 ? 'cap' : st.cap_n2 > 0 ? 'capn2' : st.ice_h2o > 0 ? 'ice' : null;
      if (hit) this.release(E * 0.3, hit, true);
      /* only its volatiles become air — water, some CO₂, a trace of
         nitrogen.  The rock stays rock. */
      const vol = mass * p.cometVolatileFrac;
      st.atm_h2o += vol * 0.80;
      st.atm_co2 += vol * 0.18;
      st.atm_n2 += vol * 0.02;
    }

    let s = this.snapshot();
    const opts = this.opts();

    /* ---- polar cold traps pin the air to the vapour curve ---- */
    if (w.polarTrap && w.capSpecies) {
      const sp = w.capSpecies, capKey = 'cap_' + sp, atmKey = 'atm_' + sp;
      if (st[capKey] > 0) {
        const key = [opts.mirrorBoost.toFixed(4), (opts.dust || 0).toFixed(3),
          Math.round(Math.log10(1 + st.atm_pfc) * 20), Math.round(Math.log10(1 + st.atm_h2o) * 20),
          Math.round(Math.log10(1 + st.atm_n2 * (sp === 'co2' ? 1 : 0)) * 20)].join('|');
        if (key !== this._capKey) { this._capEq = CM.capEquilibrium(w, st, opts); this._capKey = key; }
        const target = PL.massFor(w, this._capEq.pPa);
        const relax = Math.min(1, dt / 30);
        let move = (target - st[atmKey]) * relax;
        move = Math.max(-st[atmKey] * 0.9, Math.min(move, st[capKey]));
        st[capKey] -= move; st[atmKey] += move;
        if (st[capKey] <= 0) {
          st[capKey] = 0;
          this.log(`The ${sp === 'co2' ? 'CO₂' : 'nitrogen'} ice is completely gone. Nothing is left to snow back out — the atmosphere is finally free to change.`, 'good');
        }
      }
    }

    /* ---- global condensation: chill a world below its gas's saturation
            point and the air itself rains out ---- */
    for (const sp of ['co2', 'n2']) {
      const capKey = 'cap_' + sp, atmKey = 'atm_' + sp;
      if (w.polarTrap && w.capSpecies === sp && st[capKey] > 0) continue;
      const pSp = s.p[sp];
      const Tsat = PL.tsat(sp, Math.max(pSp, 1e-9));
      if (pSp > 1 && s.T < Tsat) {
        const target = PL.massFor(w, PL.psat(sp, s.T));
        const cond = Math.max(0, (st[atmKey] - target) * Math.min(1, dt / 20));
        st[atmKey] -= cond; st[capKey] += cond;
        if (cond > 0 && !this._warned['collapse_' + sp]) {
          this._warned['collapse_' + sp] = true;
          this.log(`${sp === 'co2' ? 'CO₂' : 'Nitrogen'} is condensing out of the air: the planet is below its saturation point at ${(pSp / 1e5).toFixed(pSp > 1e5 ? 1 : 4)} bar. The atmosphere is collapsing onto the surface.`, 'bad');
        }
      } else if (st[capKey] > 0 && s.T > Tsat + 0.5 && !(w.polarTrap && w.capSpecies === sp)) {
        const target = PL.massFor(w, Math.min(PL.psat(sp, s.T), 1e12));
        const evap = Math.max(0, Math.min(st[capKey], (target - st[atmKey]) * Math.min(1, dt / 20)));
        st[capKey] -= evap; st[atmKey] += evap;
      }
    }

    /* ---- regolith ---- */
    if (w.res0.rego_co2 > 0) {
      const eq = CM.regolithEquil(w, w.res0.rego_co2, s.pPa, s.T);
      const move = (st.rego_co2 - eq) * Math.min(1, dt / 50);
      st.rego_co2 -= move; st.atm_co2 += move;
    }

    /* ---- water ---- */
    s = this.snapshot();
    this.stepWater(dt, s);

    /* ---- escape, shared across the gases in proportion ---- */
    s = this.snapshot();
    const airKeys = ['atm_co2', 'atm_n2', 'atm_o2'];
    const airMass = airKeys.reduce((a, k) => a + st[k], 0);
    if (airMass > 0) {
      const lost = Math.min(airMass, s.escape_kgs * dt * YR_S);
      for (const k of airKeys) st[k] -= lost * (st[k] / airMass);
      this.escaped_kg += lost;
      if (s.lambdaAir < 15 && lost > 0.01 * airMass && !this._warned.escape) {
        this._warned.escape = true;
        this.log(`The air is escaping to space — Jeans parameter λ = ${s.lambdaAir.toFixed(1)}. ${w.name} is too small or too warm to hold it.`, 'bad');
      }
    }
    /* hydrogen from split water leaks away too on small worlds */
    if (st.atm_h2o > 0 && s.lambdaH2 < 6) {
      const leak = st.atm_h2o * Math.min(1, dt / 5000);
      st.atm_h2o -= leak; this.escaped_kg += leak;
    }

    for (const k of Object.keys(st)) if (!(st[k] >= 0)) st[k] = 0;
    this.t += dt;
    this.record();
  };

  /* Water: vapour tracks saturation, liquid and ice trade with the
     climate, and a wet world absorbing past the Simpson-Nakajima limit
     boils its oceans away. */
  Sim.prototype.stepWater = function (dt, s) {
    const w = this.w, st = this.st;
    const total = st.atm_h2o + st.ocean_h2o + st.ice_h2o;
    if (total <= 0) return;

    /* The runaway greenhouse.  Once a steam-saturated atmosphere forms
       its outgoing radiation is capped near 282 W/m², so the steam does
       not rain back out: the excess keeps boiling the ocean until it is
       gone.  A 10 W/m² hysteresis stops it flickering at the threshold. */
    const surfaceWater = st.ocean_h2o + st.ice_h2o;
    const limit = PL.LIMITS.runaway_Wm2;
    if (this.runaway && (s.absorbed < limit - 10 || surfaceWater <= 0)) this.runaway = false;
    if (this.runaway && s.absorbed <= limit) return;          /* hold the steam */
    if (surfaceWater > 0 && s.T < 640 && s.absorbed > limit && s.pPa > 1000) {
      const excess = (s.absorbed - PL.LIMITS.runaway_Wm2) * w.area * dt * YR_S;
      const boil = Math.min(surfaceWater, excess / PL.H2O.L_vap);
      const fromOcean = Math.min(st.ocean_h2o, boil);
      st.ocean_h2o -= fromOcean; st.ice_h2o -= Math.min(st.ice_h2o, boil - fromOcean);
      st.atm_h2o += boil;
      if (!this.runaway) {
        this.runaway = true;
        this.log(`Runaway greenhouse. ${w.name} absorbs ${s.absorbed.toFixed(0)} W/m², past the 282 W/m² a steam-saturated sky can radiate. The oceans are boiling away.`, 'bad');
      }
      return;
    }
    if (s.T >= 640) {                     /* above water's critical point */
      st.atm_h2o += st.ocean_h2o + st.ice_h2o;
      st.ocean_h2o = 0; st.ice_h2o = 0;
      return;
    }

    /* vapour relaxes toward the calibrated humidity of saturation.  Ice
       hiding in permanent shadow (Mercury, the Moon, Ceres) never sees
       the global mean temperature, so it stays out of the cycle — and
       vapour that returns to such a world freezes into those traps. */
    const exchangeable = st.atm_h2o + st.ocean_h2o + (w.coldTrapped ? 0 : st.ice_h2o);
    const vEq = Math.min(exchangeable, PL.massFor(w, (w._rh || 0.145) * PL.h2oPsat(s.T)));
    const dv = (vEq - st.atm_h2o) * Math.min(1, dt / 1);
    if (dv > 0) {
      const fromOcean = Math.min(st.ocean_h2o, dv);
      st.ocean_h2o -= fromOcean;
      if (!w.coldTrapped) st.ice_h2o -= Math.min(st.ice_h2o, dv - fromOcean);
      st.atm_h2o += dv;
    } else {
      const back = -dv;
      st.atm_h2o -= back;
      if (s.liquidPossible) st.ocean_h2o += back; else st.ice_h2o += back;
    }

    /* liquid vs ice.  Anchored to each world's present split, so Earth
       keeps its ice sheets; warm it and they melt, cool it and they grow. */
    const surf = st.ocean_h2o + st.ice_h2o;
    if (surf > 0) {
      const il = S.iceLine(s);
      const r0 = w.res0;
      const f0 = (r0.ocean_h2o + r0.ice_h2o) > 0 ? r0.ocean_h2o / (r0.ocean_h2o + r0.ice_h2o) : 0;
      const warmArea = 1 - il.frac;
      const ref = w._warmArea0;
      let liquid = 0;
      if (s.liquidPossible) {
        const c = f0 > 0 && ref > 0 ? f0 / ref : 1.16;
        liquid = Math.max(0, Math.min(1, warmArea * c));
      }
      const target = surf * liquid;
      const move = (target - st.ocean_h2o) * Math.min(1, dt / 200);
      st.ocean_h2o += move; st.ice_h2o -= move;
      if (st.ocean_h2o > 1e17 && w.res0.ocean_h2o === 0 && !this._warned.sea) {
        this._warned.sea = true;
        this.log(`Liquid water is pooling on the surface of ${w.name}.`, 'good');
      }
    }
  };

  /* where a campaign aims: the world's own condensed reservoir if it has one */
  Sim.prototype.campaignTarget = function () {
    const p = this.plan, w = this.w;
    if (p.nukeTarget === 'cap' && this.st.cap_n2 > 0 && (w.capSpecies === 'n2' || !(this.st.cap_co2 > 0))) return 'capn2';
    return p.nukeTarget;
  };

  /* Put E joules into a reservoir; move what it can free. */
  Sim.prototype.release = function (E, which, quiet) {
    const st = this.st;
    const map = { cap: ['cap_co2', 'atm_co2'], capn2: ['cap_n2', 'atm_n2'],
      rego: ['rego_co2', 'atm_co2'], carb: ['carb_co2', 'atm_co2'],
      ocean: ['ocean_h2o', 'atm_h2o'], ice: ['ice_h2o', 'atm_h2o'] };
    const pair = map[which] || map.cap;
    const can = E / energyPerKg(which, this.snapshot().T);
    const got = Math.min(can, st[pair[0]]);
    st[pair[0]] -= got; st[pair[1]] += got;
    if (!quiet && got < can && st[pair[0]] <= 0 && !this._warned['empty_' + which]) {
      this._warned['empty_' + which] = true;
      this.log(`That reservoir is exhausted — extra energy now has nothing left to release.`, 'bad');
    }
    return got;
  };

  /* ------------------------------------------------------------------
     ONE DEVICE.  `surface` is what the renderer says is at that spot
     ('cap', 'ocean', 'ice', 'rock'); the renderer and the physics share
     the same terrain noise so the two agree.

     Blast scaling from Glasstone & Dolan, The Effects of Nuclear Weapons
     (1977), which is for Earth's sea-level air:
         fireball radius   R_fb ~ 66 m * Y_kt^0.4
         crater radius     R_c  ~ 23 m * Y_kt^(1/3)   (dry soil, surface burst)
     scaled for thinner air (fireball grows as rho^-1/3; in near-vacuum
     there is no fireball at all, only an X-ray flash) and for gravity
     (craters grow as g^-0.17 in the gravity regime).
     ------------------------------------------------------------------ */
  /* Sizes of one explosion of yieldMt on this world as it is now. */
  S.blastScale = function (w, s, yieldMt) {
    const Ykt = yieldMt * 1000;
    const rho = s.pPa > 0 ? (s.pPa * s.muMean) / (8.314 * s.T) : 0;
    const vacuum = rho < 1e-4;
    const fireball = vacuum ? 0 : 66 * Math.pow(Ykt, 0.4) * Math.min(6, Math.cbrt(1.225 / rho));
    const crater = 23 * Math.cbrt(Ykt) * Math.pow(9.80665 / w.g, 0.17);
    /* how high the debris climbs.  In air a buoyant thermal stalls after a
       few scale heights (Earth: ~20 km for 1 Mt, growing as Y^0.25).  In
       vacuum there is no cloud, only ejecta on ballistic arcs (~300 m/s). */
    const Hs = vacuum ? 0 : 8.314 * s.T / (s.muMean * w.g);
    const plumeTop = Math.min(0.3 * w.R, vacuum ? 300 * 300 / (2 * w.g)
      : 20e3 * Math.pow(yieldMt, 0.25) * Math.min(3, Math.max(0.4, Hs / 8500)));
    return { rho, vacuum, fireball, crater, plumeTop, Hs };
  };

  Sim.prototype.detonate = function (latDeg, lonDeg, yieldMt, surface) {
    const w = this.w, st = this.st, p = this.plan;
    const s = this.snapshot();
    const E = yieldMt * MT_J;
    const { vacuum, fireball, crater, plumeTop } = S.blastScale(w, s, yieldMt);

    let which, resKey, label;
    if (surface === 'cap' && st.cap_n2 > 0 && (w.capSpecies === 'n2' || !(st.cap_co2 > 0))) {
      which = 'capn2'; resKey = 'cap_n2'; label = w.polarTrap ? 'nitrogen ice' : 'condensed nitrogen';
    }
    else if (surface === 'cap' && st.cap_co2 > 0) { which = 'cap'; resKey = 'cap_co2'; label = 'CO₂ polar ice'; }
    else if (surface === 'ocean' && st.ocean_h2o > 0) { which = 'ocean'; resKey = 'ocean_h2o'; label = 'open ocean'; }
    else if ((surface === 'ice' || surface === 'cap') && st.ice_h2o > 0) { which = 'ice'; resKey = 'ice_h2o'; label = 'water ice'; }
    else { which = 'rock'; resKey = null; label = 'bare rock'; }

    const coupled = E * p.nukeCoupling;
    let mass = 0, freed = 'nothing volatile';
    if (which === 'rock') {
      /* heat a plug of rock and drive off what little gas it holds */
      const rockHeated = coupled / energyPerKg('rock');
      const frac = w.res0.rego_co2 > 0 ? w.res0.rego_co2 / (w.area * 100 * 1500) : 0;
      mass = Math.min(st.rego_co2, rockHeated * frac);
      st.rego_co2 -= mass; st.atm_co2 += mass;
      freed = mass > 0 ? 'CO₂ baked out of the regolith' : 'nothing — there is no volatile here';
    } else {
      mass = Math.min(st[resKey], coupled / energyPerKg(which, s.T));
      st[resKey] -= mass;
      const to = which === 'capn2' ? 'atm_n2' : (which === 'ocean' || which === 'ice') ? 'atm_h2o' : 'atm_co2';
      st[to] += mass;
      freed = { cap: 'CO₂ vapour', capn2: 'nitrogen gas', ocean: 'steam', ice: 'water vapour' }[which];
    }

    this.nukesFired += 1;
    this.fissionMt += yieldMt * p.nukeFission;
    this.energyUsed_J += E;

    const reservoir = resKey ? st[resKey] + mass : 0;
    const job = which === 'rock' ? w.res0.rego_co2 : (w.res0[resKey] || reservoir);
    const report = {
      lat: latDeg, lon: lonDeg, yieldMt, E, surface: label, freed,
      fireball, crater, plumeTop, vacuum, mass,
      pressureRise: mass * w.g / w.area,
      fracOfReservoir: reservoir > 0 ? mass / reservoir : 0,
      devicesForAll: mass > 0 && job > 0 ? job / mass : Infinity,
      ofWorldArsenal: yieldMt / 1500
    };
    this.lastBlast = report;
    this.scars.push({ lat: latDeg, lon: lonDeg, r: crater, surface: which, t: this.t });
    if (this.scars.length > 64) this.scars.shift();
    this.log(`${fmtY(yieldMt)} device on ${label} at ${latDeg.toFixed(0)}°, ${lonDeg.toFixed(0)}°: ` +
      `${mass > 0 ? fmtKg(mass) + ' of ' + freed : 'released nothing'}.`, 'info');
    this.record(true);
    return report;
  };

  function fmtY(y) { return y >= 1 ? `${+y.toPrecision(3)} Mt` : `${+(y * 1000).toPrecision(3)} kt`; }
  function fmtKg(m) {
    if (m >= 1e12) return (m / 1e12).toPrecision(3) + ' Gt';
    if (m >= 1e9) return (m / 1e9).toPrecision(3) + ' Mt';
    if (m >= 1e3) return (m / 1e3).toPrecision(3) + ' t';
    return m.toPrecision(3) + ' kg';
  }

  /* ------------------------------------------------------------------
     What the renderer needs to draw the planet as it is right now.
     ------------------------------------------------------------------ */
  Sim.prototype.visualState = function () {
    const w = this.w, st = this.st, s = this.snapshot(), r0 = w.res0;
    const il = S.iceLine(s);
    /* the gas that freezes out here: the world's own cap species, or
       whichever air has rained out (Titan has no caps, until you dim it) */
    let sp = w.capSpecies;
    if (!w.polarTrap && (st.cap_n2 > 1e12 || st.cap_co2 > 1e12)) sp = st.cap_n2 > st.cap_co2 ? 'n2' : 'co2';

    /* gas frozen (or liquefied) onto the ground */
    let capLat = 90, capFrac = 0, cryoSeaFrac = 0;
    if (sp && w.polarTrap && r0['cap_' + sp] > 0) {
      /* polar caps shrink as they sublime; area goes roughly as mass^0.5 */
      capFrac = Math.max(0, st['cap_' + sp] / r0['cap_' + sp]);
      const a = (sp === 'n2' ? 0.20 : 0.03) * Math.sqrt(capFrac);
      capLat = a > 1e-5 ? Math.asin(Math.max(-1, 1 - 2 * a)) * 180 / Math.PI : 90;
    } else if (sp && st['cap_' + sp] > 1e12) {
      /* the air itself has condensed: Venus under a sunshade, Titan dimmed */
      const m = st['cap_' + sp], cv = PL.CURVES[sp];
      capFrac = m / (m + st['atm_' + sp] + 1);
      const liquid = s.T > cv.Tt && s.pPa > PL.psat(sp, cv.Tt);
      if (liquid) {
        const rho = sp === 'n2' ? 808 : 1100;
        cryoSeaFrac = 1 - Math.exp(-(m / rho / w.area) / 1700);
      } else {
        /* frost spreads from the poles; a couple of metres whitens everything */
        const cover = Math.min(1, (m / 1600 / w.area) / 2);
        capLat = Math.asin(Math.max(0, 1 - cover)) * 180 / Math.PI;
      }
    }

    /* water: open sea fills the lowlands; ice sheets cover what is below
       freezing, as far as ~2 km of ice will stretch */
    const gelSea = st.ocean_h2o / 1000 / w.area;
    const gelIce = st.ice_h2o / 1000 / w.area;
    const seaFrac = gelSea > 0 ? 1 - Math.exp(-gelSea / 1700) : 0;
    const iceFrac = gelIce > 0 ? Math.min(il.frac, gelIce / 2000) : 0;
    const iceLat = iceFrac > 0 ? Math.asin(Math.max(0, 1 - iceFrac)) * 180 / Math.PI : 90;
    const hydro = st.ocean_h2o > 0 && s.T > 230;
    const dried = r0.ocean_h2o > 0 && st.ocean_h2o < 0.05 * r0.ocean_h2o;
    const arid = dried ? 1 : Math.max(0, Math.min(1, (s.T - 300) / 40));

    /* clouds */
    let cloud = 0, cloudKind = 0;
    if (w.key === 'venus') { cloud = Math.min(1, s.pPa / (0.4 * w.p_obs)); cloudKind = 1; }
    else if (w.key === 'titan') { cloud = Math.min(1, s.pPa / (0.4 * w.p_obs)); cloudKind = 2; }
    if (s.dH2O > 0.5 && s.T < 647) {          /* no liquid droplets above water's critical point */
      const wc = Math.min(0.72, 0.08 + 0.6 * s.dH2O / 35);
      if (wc > cloud) { cloud = wc; cloudKind = 0; }
    }
    if (this.runaway) { cloud = Math.max(cloud, 0.9); cloudKind = 0; }

    /* sky: Rayleigh scattering in proportion to pressure, plus Mars' dust */
    const rayTau = 0.1 * Math.pow(Math.max(s.bar, 0), 0.95);
    const dustTau = w.key === 'mars' ? 0.35 * Math.min(1, s.pPa / 300) : 0;
    const Hkm = (8.314 * Math.max(s.T, 30) / (s.muMean * w.g)) / 1000;
    const shell = s.pPa > 1e-3 ? Math.max(0.008, Math.min(0.09, (Hkm * 1000 / w.R) * 18)) : 0;
    const mix = Math.min(1, rayTau / (rayTau + dustTau + 1e-9));
    const tint = w.render.atmo;
    const blue = [0.30, 0.55, 1.0];
    /* a world under a cloud deck shows the deck's own colour at the limb */
    const deck = (w.key === 'venus' || w.key === 'titan') && s.pPa > 0.3 * w.p_obs;
    /* very thick skies scatter every colour many times over and turn white */
    const whiten = 1 - Math.exp(-rayTau / 3), white = [0.86, 0.88, 0.94];
    const atmoCol = deck ? tint.slice() : tint.map((c, i) => (c * (1 - mix) + blue[i] * mix) * (1 - whiten) + white[i] * whiten);

    const fo = S.fallout(w, this.fissionMt);
    return {
      T: s.T, pPa: s.pPa,
      capLat, capFrac, capSpecies: sp || null, cryoSeaFrac,
      iceLat, frostLat: il.lat, seaFrac, frozenSea: s.T < 271, hydro, arid,
      cloud, cloudKind,
      atmoTau: Math.min(8, rayTau + dustTau + (cloudKind ? 1.5 * cloud : 0)),
      atmoShell: shell, atmoCol, scaleH: s.pPa > 1e-3 ? Hkm * 1000 / w.R : 0,
      fallout: fo.chernobylZones > 0 ? Math.min(1, Math.log10(1 + fo.chernobylZones) / 3) : 0,
      /* rock starts to glow visibly at the Draper point, 798 K */
      glow: s.T > 798 ? Math.min(1, (s.T - 798) / 700) : 0,
      sunBoost: this.opts().mirrorBoost,
      runaway: this.runaway, scars: this.scars
    };
  };

  /* ------------------------------------------------------------------ */
  S.requirement = function (w, plan, targetPa) {
    const need_kg = PL.massFor(w, targetPa) - (w.res0.atm_co2 + w.res0.atm_n2 + w.res0.atm_o2);
    const avail = w.res0.cap_co2 + w.res0.rego_co2 + w.res0.cap_n2;
    const availAll = avail + w.res0.carb_co2;
    const target = plan.nukeTarget === 'cap' && w.capSpecies === 'n2' ? 'capn2' : plan.nukeTarget;
    const E = (Math.max(need_kg, 0) * energyPerKg(target)) / Math.max(plan.nukeCoupling, 1e-6);
    const Mt = E / MT_J;
    return {
      need_kg, avail, availAll, E, Mt, arsenals: Mt / 1500,
      possible: need_kg <= availAll, possibleEasy: need_kg <= avail,
      comets: need_kg / (plan.cometMass_kg * plan.cometVolatileFrac)
    };
  };

  /* What it costs to put one comet on a collision course, and what it
     brings.  A standoff burst ablates the surface and pushes: only a per
     cent or so of the yield ends up as momentum, so the bill is
        E = 1/2 m dv^2 / efficiency.
     The comet then arrives with its own orbital energy, thousands of times
     more than the nudge, plus the volatiles — which is the whole point.
     These bursts happen in deep space, so their fallout never reaches the
     planet. */
  S.cometBill = function (plan) {
    const E = 0.5 * plan.cometMass_kg * Math.pow(plan.cometDeltaV_ms || 0, 2) / Math.max(plan.cometNukeEff || 0.01, 1e-4);
    const Mt = E / MT_J;
    const impactMt = 0.5 * plan.cometMass_kg * Math.pow(plan.cometSpeed_kms * 1000, 2) / MT_J;
    return {
      E, Mt, impactMt, gain: Mt > 0 ? impactMt / Mt : Infinity,
      arsenals: Mt / 1500, devices: Mt / 25,          /* 25 Mt each: the B41, the largest ever built */
      pu_t: Mt / 25 * 4 / 1000,                       /* ~4 kg of plutonium in each primary */
      mass_t: Mt / 25 * 4.8                           /* 4.8 t each at the best yield-to-weight ever achieved */
    };
  };

  /* Cs-137 from the fission yield: atmospheric testing put ~189 fission
     Mt into the environment and ~622 PBq of Cs-137, so ~3.3 PBq/Mt. */
  S.fallout = function (w, fissionMt) {
    const cs137_PBq = fissionMt * 3.29;
    const perArea = (cs137_PBq * 1e15) / w.area;
    return { cs137_PBq, perArea, chernobylZones: perArea / 5.55e5 };
  };

  S.mirrorSpec = function (w, frac) {
    const area = Math.abs(frac) * w.cross;
    return { area, radius: Math.sqrt(area / Math.PI), mass_kg: area * 0.01, shade: frac < 0 };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = S;
  global.MARSSIM = S;
})(typeof globalThis !== 'undefined' ? globalThis : this);
