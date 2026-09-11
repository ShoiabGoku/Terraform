/* =====================================================================
   climate.js — the box model: energy in, greenhouse, reservoirs, escape
   ---------------------------------------------------------------------
   This is a global-mean model, not a GCM.  It is built to get the
   question "can you nuke Mars into having an atmosphere?" right, and it
   is calibrated so that it reproduces published results at the points
   that matter:

     * Mars today: 6.1 mbar, T_eff 210 K, greenhouse ~5 K
     * Mars under 1 bar of pure CO2: ~235-240 K, i.e. still frozen.
       Forget et al. (2013, Icarus 222, 81) and Wordsworth et al. found
       that pure CO2 simply cannot push Mars past freezing, because
       Rayleigh scattering raises the albedo as fast as the greenhouse
       grows.  That ceiling is the single most important fact in the
       whole terraforming argument, so the parameterisation is built to
       reproduce it rather than to look encouraging.

   The greenhouse term is
        dT(p) = Gmax * (1 - exp(-k p^m))      p in bar
   with Gmax = 55 K, k = 1.0116, m = 0.4619 chosen to pass through
   (0.006 bar, 5 K) and (1 bar, 35 K).  Albedo rises with pressure from
   Rayleigh scattering and CO2 cloud, which is what produces the ceiling.
   ===================================================================== */
(function (global) {
  'use strict';

  const PL = global.PLANETS;
  const { SIGMA } = PL.CONST;
  const CM = {};

  /* ---------------- radiation ---------------- */

  /* Bond albedo as the atmosphere thickens: Rayleigh scattering by CO2
     plus condensate cloud.  Saturates near 0.55. */
  CM.albedo = (w, pPa, dust) => {
    const p = pPa / 1e5;
    const A0 = w.albedo;
    const A = A0 + (0.55 - A0) * (1 - Math.exp(-p / 1.5));
    /* deliberate darkening (soot, dust, engineered absorber) */
    return Math.max(0.02, Math.min(0.9, A + (dust || 0)));
  };

  /* Greenhouse warming from a CO2-dominated atmosphere, K. */
  CM.greenhouseCO2 = (pPa) => {
    const p = Math.max(pPa, 0) / 1e5;
    if (p <= 0) return 0;
    return 55 * (1 - Math.exp(-1.0116 * Math.pow(p, 0.4619)));
  };

  /* Super-greenhouse gases.  Marinova et al. (2005, JGR 110, E03002)
     found an optimised perfluorocarbon mixture at ~0.1 Pa partial
     pressure gives roughly 10 K on Mars; warming grows sub-linearly as
     the bands saturate. */
  CM.greenhousePFC = (pPa) => {
    if (pPa <= 0) return 0;
    return 30 * (1 - Math.exp(-pPa / 0.32));
  };

  /* Water vapour feedback, only meaningful once it is warm enough for
     vapour to be present in quantity.  Kept deliberately modest. */
  CM.greenhouseH2O = (T, pPa) => {
    if (T < 210) return 0;
    const pv = PL.h2oPsat(T);
    const frac = pv / Math.max(pPa, 1);
    return 12 * (1 - Math.exp(-frac / 0.02));
  };

  /* Global mean surface temperature.
     `mirrorBoost` is the multiplier on intercepted sunlight from orbital
     mirrors (1 = none). */
  CM.surfaceTemp = (w, st, opts) => {
    opts = opts || {};
    const pPa = PL.pressure(w, st.atm_co2 + (st.atm_n2 || 0));
    const A = CM.albedo(w, pPa, opts.dust);
    const S = w.S0 * (opts.mirrorBoost || 1);
    const Teff = PL.Teff(S, A);
    const gh = CM.greenhouseCO2(pPa) +
      CM.greenhousePFC(PL.pressure(w, st.atm_pfc || 0)) +
      CM.greenhouseH2O(Teff + CM.greenhouseCO2(pPa), pPa);
    return { T: Teff + gh, Teff, A, gh, pPa, S };
  };

  /* ---------------- reservoir exchange ---------------- */

  /* How much CO2 the regolith holds at equilibrium.  A Freundlich-type
     isotherm: more at high pressure, much less when warm.  The reference
     point is the world's own present-day state as this model computes it,
     so an untouched planet sits exactly in equilibrium and only moves
     when you actually do something to it. */
  CM.regolithEquil = (w, capacity, pPa, T) => {
    if (capacity <= 0) return 0;
    const p0 = w._p0 || 610, T0 = w._T0 || 216;
    const f = Math.pow(Math.max(pPa, 1e-6) / p0, 0.5) * Math.exp((3200 / T) - (3200 / T0));
    return capacity * Math.min(1, f);
  };

  /* ---- the polar CO2 cap ----------------------------------------
     The cap does not sit at the global mean temperature. It sits at the
     frost point of the atmosphere above it, because any attempt to warm
     it past that simply sublimes CO2 until the vapour pressure catches
     up. So its temperature is pinned, and whether it grows or shrinks is
     decided by the energy balance at the cap:

         net = absorbed sunlight + downwelling IR - sigma T_frost^4

     That buffering is why Mars' caps are stable today, and it is also a
     negative feedback: thicken the atmosphere and the frost point rises,
     so the cap radiates more and tends to grow back. You have to
     out-muscle it.

     `capSolarCoef` is set per world so that the present-day cap is in
     balance — the honest way to anchor a box model of this kind.        */
  CM.capBalance = (w, pPa, Tatm, S) => {
    const Tcap = PL.co2Frost(Math.max(pPa, 1e-6));
    const emitted = SIGMA * Math.pow(Tcap, 4);
    const absorbed = (w._capSolar || 0.0088) * S * (1 - 0.65);
    const irDown = CM.emissivity(pPa) * SIGMA * Math.pow(Tatm, 4);
    return { Tcap, net: absorbed + irDown - emitted, emitted, absorbed, irDown };
  };

  /* The equilibrium the cap and the air settle into together.

     While any CO2 ice remains, the surface pressure is not free: it is
     the saturation pressure at the cap temperature, and the cap
     temperature is whatever balances its radiation budget. So we solve

         sigma T_cap^4  =  absorbed sunlight + downwelling IR( p_sat(T_cap) )

     for T_cap by bisection, and read the pressure off the vapour curve.
     Raise the sunlight and the whole curve shifts: the cap warms, the
     pressure rises, and it keeps rising until the ice runs out. That
     last clause is the crux of the terraforming question.               */
  CM.capEquilibrium = (w, st, opts) => {
    const S = w.S0 * ((opts && opts.mirrorBoost) || 1);
    const absorbed = (w._capSolar || 0.0088) * S * (1 - 0.65);
    const f = (Tcap) => {
      const p = PL.co2Psat(Tcap);
      const atm = CM.surfaceTemp(w, Object.assign({}, st, { atm_co2: PL.massFor(w, p) }), opts);
      const irDown = CM.emissivity(p) * SIGMA * Math.pow(atm.T, 4);
      return absorbed + irDown - SIGMA * Math.pow(Tcap, 4);
    };
    /* Scan upward for a crossing from + to -, which is the stable one: a
       cap slightly warmer than this radiates more than it absorbs and
       cools back down. A - to + crossing is a tipping point, not a
       resting place, and must not be mistaken for one. */
    const T0 = 80, T1 = 330, N = 250;
    let prevT = T0, prevF = f(T0);
    for (let i = 1; i <= N; i++) {
      const T = T0 + (T1 - T0) * (i / N);
      const F = f(T);
      if (prevF > 0 && F <= 0) {
        let lo = prevT, hi = T;
        for (let k = 0; k < 60; k++) {
          const mid = 0.5 * (lo + hi);
          if (f(mid) > 0) lo = mid; else hi = mid;
        }
        const Tcap = 0.5 * (lo + hi);
        return { Tcap, pPa: PL.co2Psat(Tcap), stable: true };
      }
      prevT = T; prevF = F;
    }
    /* No stable resting point below 330 K: the cap sublimes away entirely. */
    return { Tcap: T1, pPa: PL.co2Psat(T1), stable: false, runaway: true };
  };

  /* Atmospheric escape.

     The standard measure of whether a world can keep a gas is the Jeans
     parameter, the ratio of gravitational binding to thermal energy at
     the exobase:
         lambda = g R m / (k T_exo)
     Above ~30 a gas is held for the age of the solar system; below ~15
     it is gone quickly.  This one number explains a great deal: Mars
     holds CO2 comfortably but cannot hold hydrogen, which is precisely
     why it lost its water and kept its carbon dioxide.

     On top of thermal escape Mars suffers solar-wind stripping, because
     it has no global magnetic field.  MAVEN measures a few kg/s today.
     The point worth taking away is that neither process is remotely fast
     enough to undo a newly built atmosphere on a human timescale.       */
  /* Pressure scale over which a CO2 atmosphere becomes optically thick in
     the thermal infrared. ~400 mbar; at Mars' present 6 mbar the air is
     nearly transparent, which is why the caps can radiate to space. */
  const EPS_SCALE = 40000;
  CM.emissivity = (pPa) => 0.1 + 0.75 * (1 - Math.exp(-pPa / EPS_SCALE));

  const KB = 1.380649e-23, NA = 6.02214076e23;

  CM.jeansLambda = (w, T, molar) => {
    const m = (molar === undefined ? 0.044 : molar) / NA;
    const Texo = Math.max(T, 50) * 1.6;          /* exobase runs hotter */
    return (w.g * w.R * m) / (KB * Texo);
  };

  /* Plain-language retention verdict for a gas on this world. */
  CM.retention = (lam) => {
    if (lam > 30) return { keeps: true, text: 'held for billions of years' };
    if (lam > 15) return { keeps: true, text: 'leaks away over millions of years' };
    if (lam > 6) return { keeps: false, text: 'escapes over thousands of years' };
    return { keeps: false, text: 'escapes almost immediately' };
  };

  CM.escapeRate = (w, st, T) => {
    const pPa = PL.pressure(w, st.atm_co2 + (st.atm_n2 || 0));
    if (pPa <= 0) return 0;

    /* Non-thermal stripping, calibrated to MAVEN's few kg/s at Mars and
       scaled by the solar wind flux, which falls off as 1/a^2. */
    const swind = 1 / (w.a_AU * w.a_AU) / (1 / (1.5237 * 1.5237));
    const strip = 3.0 * swind * Math.pow(Math.max(pPa, 1e-9) / 610, 0.3);

    /* Thermal (Jeans) escape of the bulk gas. */
    const lam = CM.jeansLambda(w, T, 0.044);
    const Texo = T * 1.6;
    const vth = Math.sqrt((2 * KB * Texo) / (0.044 / NA));
    const nExo = (pPa / (KB * Texo)) * 1e-9;      /* crude exobase density */
    const flux = (nExo * vth) / (2 * Math.sqrt(Math.PI)) * (1 + lam) * Math.exp(-lam);
    const jeans = flux * (0.044 / NA) * w.area;

    return strip + (isFinite(jeans) ? jeans : 0);   /* kg/s */
  };

  /* ---------------- habitability read-outs ---------------- */

  /* Mars' mean temperature hides a big swing. This spreads the global
     mean into a crude latitude/season/diurnal distribution so we can ask
     what fraction of the surface ever sees liquid water, rather than
     only asking about the mean. */
  CM.warmFraction = (w, Tmean, pPa) => {
    if (pPa < PL.LIMITS.triplePoint_Pa) return 0;
    const swing = 60 * Math.pow(610 / Math.max(pPa, 610), 0.25);  /* thick air evens it out */
    const Tpeak = Tmean + swing;
    if (Tpeak <= 273.15) return 0;
    const f = (Tpeak - 273.15) / (2 * swing);
    return Math.max(0, Math.min(1, f));
  };

  CM.verdict = (w, snap) => {
    const L = PL.LIMITS, p = snap.pPa, T = snap.T;
    const out = [];
    out.push(p >= L.triplePoint_Pa
      ? { ok: true, text: `Above the triple point (${(p / 100).toFixed(1)} mbar) — liquid water is at least possible.` }
      : { ok: false, text: `Below the 6.1 mbar triple point — water can only ever be ice or vapour.` });
    out.push(p >= L.armstrong_Pa
      ? { ok: true, text: `Above the Armstrong limit — your own saliva and tears would not boil.` }
      : { ok: false, text: `Below the Armstrong limit (62.7 mbar) — exposed body fluids boil at body temperature. A pressure suit is still mandatory.` });
    out.push(T >= 273.15
      ? { ok: true, text: `Mean surface temperature ${(T - 273.15).toFixed(1)} °C — above freezing.` }
      : { ok: false, text: `Mean surface temperature ${(T - 273.15).toFixed(1)} °C — still frozen.` });
    out.push(p >= L.pressureSuitFree_Pa
      ? { ok: true, text: `Enough pressure to walk around in a breathing mask rather than a suit.` }
      : { ok: false, text: `Nowhere near the ~300 mbar needed to go without a pressure suit.` });
    return out;
  };

  /* Anchor the two tuned coefficients to each world's observed present
     state, so "do nothing" really does mean nothing changes. */
  CM.calibrate = (w) => {
    const st = w.res0;
    const s0 = CM.surfaceTemp(w, st, {});
    w._T0 = s0.T;
    w._p0 = s0.pPa;
    if (w.res0.cap_co2 > 0 && s0.pPa > 1) {
      /* pick the one free coefficient so that the cap/atmosphere
         equilibrium lands exactly on the observed surface pressure */
      const Tcap = PL.co2Frost(s0.pPa);
      const irDown = CM.emissivity(s0.pPa) * SIGMA * Math.pow(s0.T, 4);
      const emitted = SIGMA * Math.pow(Tcap, 4);
      w._capSolar = Math.max(0, (emitted - irDown) / (w.S0 * (1 - 0.65)));
    } else {
      w._capSolar = 0.0088;
    }
    return w;
  };
  for (const k of Object.keys(PL.WORLDS)) CM.calibrate(PL.WORLDS[k]);

  /* ==================================================================
     SELF TEST — against observation and published model results
     ================================================================== */
  function selfTest(verbose) {
    const R = [];
    const log = (n, ok, d) => R.push({ name: n, ok, detail: d });
    const near = (x, y, tol) => Math.abs(x - y) <= tol;
    const mars = PL.WORLDS.mars;

    /* 1. Mars' effective temperature from its own albedo and distance */
    {
      const Te = PL.Teff(mars.S0, mars.albedo);
      log('Mars effective temperature', near(Te, 210, 1.5),
        `${Te.toFixed(1)} K from S=${mars.S0.toFixed(1)} W/m², A=0.25 ` +
        `(NASA fact sheet gives 209.8 K)`);
    }

    /* 2. present-day state reproduces the observed pressure and temperature */
    {
      const st = Object.assign({}, mars.res);
      const s = CM.surfaceTemp(mars, st, {});
      log('Mars today: pressure and temperature', near(s.pPa, 610, 20) && near(s.T, 213, 4),
        `${(s.pPa / 100).toFixed(2)} mbar (obs 6.1), T = ${s.T.toFixed(1)} K ` +
        `(obs ~210), greenhouse ${s.gh.toFixed(1)} K (lit. ~5 K)`);
    }

    /* 3. the CO2 frost point must land on the observed polar cap value */
    {
      const Tf = PL.co2Frost(610);
      log('CO2 frost point at 6 mbar = polar cap temperature', near(Tf, 148, 2),
        `${Tf.toFixed(1)} K — the caps really do sit at ~148 K`);
    }

    /* 4. THE key result: a full bar of CO2 still leaves Mars frozen */
    {
      const st = { atm_co2: PL.massFor(mars, 1e5) };
      const s = CM.surfaceTemp(mars, st, {});
      log('1 bar of pure CO2 still leaves Mars below freezing',
        s.T > 225 && s.T < 250,
        `T = ${s.T.toFixed(1)} K = ${(s.T - 273.15).toFixed(0)} °C, albedo risen to ` +
        `${s.A.toFixed(2)} — matches Forget et al. 2013, who found pure CO2 cannot reach 273 K`);
    }

    /* 5. total reachable CO2 is tiny — the Jakosky & Edwards conclusion */
    {
      const reachable = mars.res.cap_co2 + mars.res.rego_co2 + mars.res.atm_co2;
      const mbar = reachable / mars.kg_per_mbar;
      const withCarb = (reachable + mars.res.carb_co2) / mars.kg_per_mbar;
      log('all reachable CO2 is well under 100 mbar', mbar < 100,
        `${mbar.toFixed(0)} mbar reachable (${withCarb.toFixed(0)} mbar if you could also ` +
        `bake every carbonate) — Jakosky & Edwards 2018 reach the same conclusion`);
    }

    /* 6. energy to sublimate the polar cap, in world arsenals */
    {
      const perKg = PL.CO2.cp_ice * (195 - PL.CO2.T_ice) + PL.CO2.L_sub;
      const E = mars.res.cap_co2 * perKg;
      const Mt = E / PL.CONST.MT_J;
      log('subliming the polar cap costs millions of megatons',
        Mt > 1e6 && Mt < 2e7,
        `${(Mt / 1e6).toFixed(2)} million Mt = ${(Mt / 1500).toExponential(2)} times the ` +
        `world's ~1500 Mt arsenal, and that is at 100% coupling`);
    }

    /* 7. escape is irrelevant on human timescales — the surprise */
    {
      const st = { atm_co2: PL.massFor(mars, 1e5) };
      const s = CM.surfaceTemp(mars, st, {});
      const rate = CM.escapeRate(mars, st, s.T);
      const yrs = st.atm_co2 / rate / PL.CONST.YR_S;
      log('solar wind takes geological time to strip 1 bar', yrs > 1e8,
        `${rate.toFixed(1)} kg/s → ${yrs.toExponential(2)} years. ` +
        `"Mars can't hold an atmosphere" is false on any human timescale`);
    }

    /* 8. the Jeans parameter explains what each world can hold */
    {
      const lamCO2 = CM.jeansLambda(mars, 220, 0.044);
      const lamH = CM.jeansLambda(mars, 220, 0.001);
      const lamCeres = CM.jeansLambda(PL.WORLDS.ceres, 168, 0.044);
      log('Jeans parameter: Mars keeps CO2, loses hydrogen, Ceres keeps nothing',
        lamCO2 > 30 && lamH < 15 && lamCeres < 15,
        `Mars CO2 lambda = ${lamCO2.toFixed(0)} (${CM.retention(lamCO2).text}), ` +
        `Mars hydrogen = ${lamH.toFixed(1)} (${CM.retention(lamH).text}) — which is why ` +
        `Mars lost its water but kept its CO2; Ceres CO2 = ${lamCeres.toFixed(1)}`);
    }

    /* 9. regolith stays put at present conditions, releases when warm */
    {
      const cap = mars.res.rego_co2;
      const cold = CM.regolithEquil(mars, cap, 610, 210);
      const warm = CM.regolithEquil(mars, cap, 610, 280);
      log('regolith holds CO2 when cold, gives it up when warm',
        cold > 0.9 * cap && warm < 0.4 * cap,
        `${(100 * cold / cap).toFixed(0)}% retained at 210 K, ` +
        `${(100 * warm / cap).toFixed(0)}% at 280 K`);
    }

    /* 10. a PFC factory is far more effective per kilogram than a bomb */
    {
      const dT = CM.greenhousePFC(0.1);
      const mass = PL.massFor(mars, 0.1);
      log('perfluorocarbons beat bombs per kilogram', dT > 5,
        `0.1 Pa of optimised PFCs = ${(mass / 1e12).toFixed(1)} Gt gives ${dT.toFixed(1)} K ` +
        `(Marinova et al. 2005 get ~10 K)`);
    }

    const pass = R.filter(r => r.ok).length;
    if (verbose) {
      for (const r of R) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  —  ${r.detail}`);
      console.log(`\n${pass}/${R.length} climate checks passed`);
    }
    return { results: R, pass, total: R.length };
  }
  CM.selfTest = selfTest;

  if (typeof module !== 'undefined' && module.exports) module.exports = CM;
  global.CLIMATE = CM;
})(typeof globalThis !== 'undefined' ? globalThis : this);
