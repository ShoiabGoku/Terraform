/* =====================================================================
   climate.js — one radiative model, calibrated across real worlds
   ---------------------------------------------------------------------
   Global-mean, not a GCM.  Surface temperature is built in two layers.

   1. Band absorption, additive in kelvin, which is what dominates thin
      atmospheres and saturates as the bands fill:
         CO2    dT = 55 (1 - exp(-1.0116 p_eff^0.4619))
         H2O    dT = 35 (1 - exp(-k_w  sqrt(p_eff)))
         PFC    super-greenhouse gases (Marinova et al. 2005)
      p_eff = sqrt(p_gas * p_total) in bar — pressure broadening in the
      strong-line limit, where a line's equivalent width goes as the
      square root of absorber amount times line width, and line width
      grows with total pressure.  For pure CO2 this reduces exactly to
      p_CO2, so the Mars calibration is untouched.

   2. Collision-induced absorption, which closes the spectral windows in
      thick atmospheres, applied as an Eddington grey optical depth:
         T_s = T_thin (1 + 3 tau / 4)^(1/4)
         tau = c1 p_CO2^2 + c2 f(T) p_N2^2 + c3 p_H2O^2
      f(T) is the overlap between the planet's thermal emission and the
      far-infrared N2 band, which only matters on very cold worlds.

   Three coefficients, fitted to three real worlds:
         c1 = 4.846e-3   Venus    737 K under 92 bar, with its ~30 ppm of
                         water vapour included (a dry fit gives 7.6e-3
                         and then overshoots to 822 K once the real
                         water is added — pressure broadening makes
                         even a trace matter at 92 bar)
         c2 = 0.9471     Titan    93.7 K under 1.5 bar N2
         k_w = 4.993     Earth    288 K
   and then NOT tuned for anything else.  Out of sample it gives:
         Mars today                216.1 K   (unchanged from Mars-only fit)
         Mars under 1 bar CO2      236.4 K   (Forget et al. 2013: can't
                                             exceed ~240 K; still frozen)
         Earth, 2x CO2, no feedback  +1.42 K (literature ~1.2 K)
         Earth, 2x CO2, water vapour +1.78 K (Planck+WV ~2 K)
   ===================================================================== */
(function (global) {
  'use strict';

  const PL = global.PLANETS;
  const { SIGMA } = PL.CONST;
  const CM = {};

  const C1 = 4.8463e-3, C2 = 0.9471, KW = 4.9928, C3 = 0.010;
  CM.COEF = { C1, C2, KW, C3 };

  /* ---------------- composition ---------------- */
  CM.pressures = (w, st) => {
    const P = (m) => ((m || 0) * w.g) / w.area;
    const co2 = P(st.atm_co2), n2 = P(st.atm_n2), o2 = P(st.atm_o2);
    const h2o = P(st.atm_h2o), pfc = P(st.atm_pfc);
    return { co2, n2, o2, h2o, pfc, tot: co2 + n2 + o2 + h2o + pfc };
  };

  CM.meanMolar = (st) => {
    const M = PL.MOLAR;
    let m = 0, n = 0;
    for (const [k, mu] of [['atm_co2', M.co2], ['atm_n2', M.n2], ['atm_o2', M.o2], ['atm_h2o', M.h2o]]) {
      const x = st[k] || 0; m += x; n += x / mu;
    }
    return n > 0 ? m / n : 0.044;
  };

  /* ---------------- radiation ---------------- */

  /* Bond albedo.  Cloud- and haze-covered worlds keep their observed
     albedo while their atmosphere lasts and fade toward bare ground as
     it is removed; any thickening beyond the present adds Rayleigh
     scattering, which is what caps the CO2 greenhouse on Mars.  Around
     a red dwarf Rayleigh scattering is much weaker (it goes as λ^-4). */
  CM.albedo = (w, pPa, dust) => {
    const As = w.albedoSurf !== undefined ? w.albedoSurf : w.albedo;
    let A = As;
    if (w.p_obs > 0) {
      const wgt = Math.min(1, (1 - Math.exp(-3 * pPa / w.p_obs)) / (1 - Math.exp(-3)));
      A = As + (w.albedo - As) * wgt;
    }
    const ray = w.render && w.render.redStar ? 0.2 : 1;
    const extra = Math.max(0, pPa - (w.p_obs || 0)) / 1e5;
    A += Math.max(0, 0.55 - A) * ray * (1 - Math.exp(-extra / 1.5));
    return Math.max(0.02, Math.min(0.9, A + (dust || 0)));
  };

  const bandCO2 = (pbar) => pbar <= 0 ? 0 : 55 * (1 - Math.exp(-1.0116 * Math.pow(pbar, 0.4619)));
  /* pure-CO2 convenience, kept for the Mars tests */
  CM.greenhouseCO2 = (pPa) => bandCO2(Math.max(pPa, 0) / 1e5);

  CM.greenhousePFC = (pPa) => pPa <= 0 ? 0 : 30 * (1 - Math.exp(-pPa / 0.32));

  CM.surfaceTemp = (w, st, opts) => {
    opts = opts || {};
    const p = CM.pressures(w, st);
    const b = (x) => x / 1e5;
    const pt = b(p.tot);

    /* band strengths, as calibrated at each world's present sunlight */
    const bCO2 = bandCO2(Math.sqrt(b(p.co2) * pt));
    const pw = Math.sqrt(b(p.h2o) * pt);
    const bH2O = pw > 0 ? 35 * (1 - Math.exp(-KW * Math.sqrt(pw))) : 0;
    const bPFC = CM.greenhousePFC(p.pfc);

    /* Clouds.  A world with an active water cycle grows clouds, and
       clouds are bright: Earth's 0.306 is roughly half cloud.  Proxied
       by the strength of the water-vapour greenhouse, normalised so
       present Earth reproduces its own albedo.  Acts only as a floor, so
       it cannot touch worlds whose observed albedo already includes
       their clouds (Venus, Earth itself). */
    /* Water vapour is left out of the Rayleigh brightening: it absorbs
       strongly in the near-infrared, which offsets its scattering, and
       steam atmospheres end up with albedos of only ~0.2-0.3 (Goldblatt
       et al. 2013).  Counting it would let a boiling ocean brighten the
       planet enough to switch its own runaway greenhouse off. */
    let A = CM.albedo(w, p.tot - p.h2o, opts.dust);
    if (p.tot > 1000 && bH2O > 0) {
      const As = w.albedoSurf !== undefined ? w.albedoSurf : w.albedo;
      A = Math.max(A, Math.min(0.9, As + 0.155 * Math.min(1, bH2O / 23.5) + (opts.dust || 0)));
    }

    const S = w.S0 * (opts.mirrorBoost === undefined ? 1 : opts.mirrorBoost);
    const Teff = PL.Teff(S, A);

    /* Greenhouse warming traps absorbed sunlight, so it scales with the
       sunlight: in a grey atmosphere T_s = T_eff (1 + 3tau/4)^(1/4). The
       band terms are calibrated in kelvin at the present T_eff; scaling
       them by T_eff/T_eff0 leaves every calibration untouched but stops
       an unlit planet from keeping 80 K of greenhouse with nothing to
       trap — which is what lets a Venus sunshade actually work. */
    const k = Teff / (w._Teff0 || Teff);
    const dCO2 = bCO2 * k, dH2O = bH2O * k, dPFC = bPFC * k;
    const haze = (w.haze || 0) * k * (w.p_obs > 0 ? Math.min(1, p.tot / w.p_obs) : 0);
    const thin = Math.max(Teff + dCO2 + dH2O + dPFC + haze, 3);

    let T = thin, tau = 0;
    for (let i = 0; i < 40; i++) {
      const f = Math.exp(-(T - 94) / 60);
      tau = C1 * b(p.co2) * b(p.co2) + C2 * f * b(p.n2) * b(p.n2) + C3 * b(p.h2o) * b(p.h2o);
      const Tn = thin * Math.pow(1 + 0.75 * tau, 0.25);
      if (Math.abs(Tn - T) < 1e-7) { T = Tn; break; }
      T = Tn;
    }
    return { T, Teff, A, gh: T - Teff, pPa: p.tot, S, p, tau, dCO2, dH2O, dPFC, haze,
             absorbed: S * (1 - A) / 4 };
  };

  /* ---------------- reservoir exchange ---------------- */

  /* On an airless world the reference pressure is zero and a pressure
     isotherm would conclude nothing can stay adsorbed — yet the gas is
     observably there, held by the cold.  So below 1 Pa it is temperature
     that governs release. */
  CM.regolithEquil = (w, capacity, pPa, T) => {
    if (capacity <= 0) return 0;
    const p0 = w._p0 || 610, T0 = w._T0 || 216;
    const thermal = Math.exp((3200 / T) - (3200 / T0));
    const f = p0 < 1 ? thermal : Math.pow(Math.max(pPa, 1e-6) / p0, 0.5) * thermal;
    return capacity * Math.min(1, f);
  };

  /* Pressure scale over which the air becomes opaque in the thermal IR. */
  const EPS_SCALE = 40000;
  CM.emissivity = (pPa) => 0.1 + 0.75 * (1 - Math.exp(-pPa / EPS_SCALE));

  /* ---- polar cold traps (Mars CO2; Pluto and Triton N2) -------------
     While ice remains, the air is pinned to the vapour pressure at the
     ice temperature, and the ice temperature is whatever balances the
     cap's own radiation budget:
         sigma T_cap^4 = absorbed sunlight + downwelling IR(p_sat(T_cap))
     Solved for the stable root.  This is the thermostat that makes a
     partial bombing campaign pointless. */
  const CAP_ALBEDO = 0.65;
  const SCAN = { co2: [80, 300], n2: [20, 125] };

  CM.capBalance = (w, pPa, Tatm, S) => {
    const sp = w.capSpecies || 'co2';
    const Tcap = PL.tsat(sp, Math.max(pPa, 1e-9));
    const emitted = SIGMA * Math.pow(Tcap, 4);
    const absorbed = (w._capSolar || 0.0088) * S * (1 - CAP_ALBEDO);
    const irDown = CM.emissivity(pPa) * SIGMA * Math.pow(Tatm, 4);
    return { Tcap, net: absorbed + irDown - emitted, emitted, absorbed, irDown };
  };

  CM.capEquilibrium = (w, st, opts) => {
    const sp = w.capSpecies || 'co2';
    const key = 'atm_' + sp;
    const S = w.S0 * ((opts && opts.mirrorBoost !== undefined) ? opts.mirrorBoost : 1);
    const absorbed = (w._capSolar || 0.0088) * S * (1 - CAP_ALBEDO);
    const trial = Object.assign({}, st);
    const f = (Tcap) => {
      const p = PL.psat(sp, Tcap);
      trial[key] = PL.massFor(w, p);
      const atm = CM.surfaceTemp(w, trial, opts);
      const irDown = CM.emissivity(atm.pPa) * SIGMA * Math.pow(atm.T, 4);
      return absorbed + irDown - SIGMA * Math.pow(Tcap, 4);
    };
    const [T0, T1] = SCAN[sp];
    const N = 140;
    let prevT = T0, prevF = f(T0);
    for (let i = 1; i <= N; i++) {
      const T = T0 + (T1 - T0) * (i / N);
      const F = f(T);
      if (prevF > 0 && F <= 0) {
        let lo = prevT, hi = T;
        for (let k = 0; k < 50; k++) {
          const mid = 0.5 * (lo + hi);
          if (f(mid) > 0) lo = mid; else hi = mid;
        }
        const Tcap = 0.5 * (lo + hi);
        return { Tcap, pPa: PL.psat(sp, Tcap), stable: true };
      }
      prevT = T; prevF = F;
    }
    return { Tcap: T1, pPa: PL.psat(sp, T1), stable: false, runaway: true };
  };

  /* ---------------- escape ----------------
     Jeans parameter lambda = g R m / (k T_exo): above ~30 a gas is kept
     for the age of the solar system, below ~15 it goes quickly.  Worlds
     without a magnetic field are also stripped by the solar wind, which
     MAVEN measures at a few kg/s at Mars. */
  const KB = 1.380649e-23, NA = 6.02214076e23;

  CM.jeansLambda = (w, T, molar) => {
    const m = (molar === undefined ? 0.044 : molar) / NA;
    const Texo = Math.max(T, 20) * 1.6;
    return (w.g * w.R * m) / (KB * Texo);
  };

  CM.retention = (lam) => {
    if (lam > 30) return { keeps: true, text: 'held for billions of years' };
    if (lam > 15) return { keeps: true, text: 'leaks away over millions of years' };
    if (lam > 6) return { keeps: false, text: 'escapes over thousands of years' };
    return { keeps: false, text: 'escapes almost immediately' };
  };

  CM.escapeRate = (w, st, T) => {
    const p = CM.pressures(w, st);
    if (p.tot <= 0) return 0;
    const mu = CM.meanMolar(st);
    const swind = (1.5237 * 1.5237) / (w.a_AU * w.a_AU);
    const strip = 3.0 * swind * (w.magnet === undefined ? 1 : w.magnet) *
      Math.pow(Math.max(p.tot, 1e-9) / 610, 0.3);
    const lam = CM.jeansLambda(w, T, mu);
    const Texo = Math.max(T, 20) * 1.6;
    const vth = Math.sqrt((2 * KB * Texo) / (mu / NA));
    const nExo = (p.tot / (KB * Texo)) * 1e-9;
    const flux = (nExo * vth) / (2 * Math.sqrt(Math.PI)) * (1 + lam) * Math.exp(-lam);
    const jeans = flux * (mu / NA) * w.area;
    return strip + (isFinite(jeans) ? jeans : 0);
  };

  /* ---------------- habitability ---------------- */

  CM.warmFraction = (w, Tmean, pPa) => {
    if (pPa < PL.LIMITS.triplePoint_Pa) return 0;
    const swing = 60 * Math.pow(610 / Math.max(pPa, 610), 0.25);
    const Tpeak = Tmean + swing;
    if (Tpeak <= 273.15) return 0;
    return Math.max(0, Math.min(1, (Tpeak - 273.15) / (2 * swing)));
  };

  CM.verdict = (w, snap) => {
    const L = PL.LIMITS, p = snap.pPa, T = snap.T;
    const out = [];
    out.push(p >= L.triplePoint_Pa
      ? { ok: true, text: `Above the triple point (${(p / 100).toFixed(p < 1e4 ? 1 : 0)} mbar) — liquid water is at least possible.` }
      : { ok: false, text: 'Below the 6.1 mbar triple point — water can only ever be ice or vapour.' });
    out.push(p >= L.armstrong_Pa
      ? { ok: true, text: 'Above the Armstrong limit — exposed body fluids would not boil.' }
      : { ok: false, text: 'Below the Armstrong limit (62.7 mbar) — body fluids boil at body temperature. Pressure suit mandatory.' });
    const Tok = T >= 273.15 && T <= 320;
    out.push(Tok
      ? { ok: true, text: `Mean surface ${(T - 273.15).toFixed(1)} °C — within the range liquid water and people tolerate.` }
      : { ok: false, text: T < 273.15 ? `Mean surface ${(T - 273.15).toFixed(1)} °C — frozen.` : `Mean surface ${(T - 273.15).toFixed(0)} °C — lethally hot.` });
    out.push(p >= L.pressureSuitFree_Pa && p <= 5e5
      ? { ok: true, text: 'A pressure you could walk around in with only a breathing mask.' }
      : { ok: false, text: p > 5e5 ? `Crushing: ${(p / 1e5).toFixed(0)} bar, like being ${((p / 1e5 - 1) * 10).toFixed(0)} m under the sea.` : 'Nowhere near the ~300 mbar needed to go without a pressure suit.' });
    if (snap.runaway) out.push({ ok: false, text: 'Runaway greenhouse: the oceans are boiling off faster than the planet can radiate the heat away.' });
    return out;
  };

  /* Anchor each world's free coefficients to its observed present state,
     so leaving it alone genuinely leaves it alone. */
  CM.calibrate = (w) => {
    const st = w.res0;
    /* the present effective temperature is the reference the band
       strengths are scaled against, so it must exist first */
    w._Teff0 = PL.Teff(w.S0, CM.albedo(w, CM.pressures(w, st).tot, 0));
    const s0 = CM.surfaceTemp(w, st, {});
    w._T0 = s0.T;
    w._p0 = s0.pPa;
    if (w.polarTrap && w.capSpecies) {
      const sp = w.capSpecies;
      const pSp = CM.pressures(w, st)[sp];
      const Tcap = PL.tsat(sp, Math.max(pSp, 1e-9));
      const irDown = CM.emissivity(s0.pPa) * SIGMA * Math.pow(s0.T, 4);
      const emitted = SIGMA * Math.pow(Tcap, 4);
      w._capSolar = Math.max(0, (emitted - irDown) / (w.S0 * (1 - CAP_ALBEDO)));
    } else {
      w._capSolar = 0.0088;
    }
    /* humidity: how far below saturation the air sits today.  Mars is
       cold-trapped and bone dry; Earth sits at the familiar ~14% column
       average.  Worlds with no air get a generic value for later. */
    const pw = CM.pressures(w, st).h2o;
    const ps = PL.h2oPsat(s0.T);
    /* a world with no water in its air today gets Earth's column
       humidity, so water delivered later (by comets) behaves normally */
    w._rh = (pw > 0 && s0.T < 640 && ps > 0) ? Math.min(1, pw / ps) : 0.145;
    const il = (() => { const D = Math.min(80, 40 * Math.pow(1e5 / Math.max(s0.pPa, 100), 0.25));
      const x = (s0.T - 273.15) / D + 1 / 3; return x >= 1 ? 0 : x <= 0 ? 1 : 1 - Math.sqrt(x); })();
    w._warmArea0 = 1 - il;
    return w;
  };
  for (const k of Object.keys(PL.WORLDS)) CM.calibrate(PL.WORLDS[k]);

  /* ==================================================================
     SELF TEST
     ================================================================== */
  function selfTest(verbose) {
    const R = [];
    const log = (n, ok, d) => R.push({ name: n, ok, detail: d });
    const near = (x, y, tol) => Math.abs(x - y) <= tol;
    const W = PL.WORLDS, mars = W.mars;
    const now = (w) => CM.surfaceTemp(w, w.res0, {});

    {
      const Te = PL.Teff(mars.S0, mars.albedo);
      log('Mars effective temperature', near(Te, 210, 1.5),
        `${Te.toFixed(1)} K from S = ${mars.S0.toFixed(1)} W/m², A = 0.25 (NASA: 209.8 K)`);
    }
    {
      const s = now(mars);
      log('Mars today', near(s.pPa, 610, 20) && near(s.T, 213, 4),
        `${(s.pPa / 100).toFixed(2)} mbar (obs 6.1), ${s.T.toFixed(1)} K, greenhouse ${s.gh.toFixed(1)} K (lit. ~5)`);
    }
    log('CO₂ frost point at 6 mbar = Martian cap temperature', near(PL.tsat('co2', 610), 148, 2),
      `${PL.tsat('co2', 610).toFixed(1)} K`);
    {
      const s = CM.surfaceTemp(mars, { atm_co2: PL.massFor(mars, 1e5) }, {});
      log('1 bar of pure CO₂ still leaves Mars frozen (Forget et al. 2013)', s.T > 225 && s.T < 250,
        `${s.T.toFixed(1)} K = ${(s.T - 273.15).toFixed(0)} °C, albedo ${s.A.toFixed(2)}`);
    }

    /* --- the three calibration worlds --- */
    for (const [k, obs, tol] of [['venus', 737, 12], ['earth', 288, 2], ['titan', 93.7, 2]]) {
      const s = now(W[k]);
      log(`${W[k].name} reproduced`, near(s.T, obs, tol),
        `${s.T.toFixed(1)} K at ${(s.pPa / 1e5).toFixed(s.pPa > 1e6 ? 0 : 3)} bar (observed ${obs} K)`);
    }

    /* --- out of sample: Earth's CO2-doubling response --- */
    {
      const e = W.earth;
      const run = (co2mult, feedback) => {
        const st = Object.assign({}, e.res0, { atm_co2: e.res0.atm_co2 * co2mult });
        let T = 288;
        for (let i = 0; i < 80; i++) {
          if (feedback) st.atm_h2o = PL.massFor(e, e._rh * PL.h2oPsat(T));
          T = CM.surfaceTemp(e, st, {}).T;
        }
        return T;
      };
      const noFb = run(2, false) - run(1, false);
      const wv = run(2, true) - run(1, true);
      log('Earth 2×CO₂ response, never fitted', noFb > 1.0 && noFb < 1.7 && wv > 1.4 && wv < 2.6,
        `+${noFb.toFixed(2)} K without feedback (lit. ~1.2), +${wv.toFixed(2)} K with water vapour ` +
        `(Planck+WV ~2; full IPCC ECS 2.5–4 adds clouds, ice, lapse rate)`);
    }

    /* --- the vapour curves --- */
    log('N₂ boils at 77.3 K at 1 atm', near(PL.tsat('n2', 101325), 77.35, 0.6),
      `${PL.tsat('n2', 101325).toFixed(2)} K (measured 77.35 K)`);
    log('liquid CO₂ vapour pressure at 0 °C', near(PL.psat('co2', 273.15) / 1e5, 34.85, 1.5),
      `${(PL.psat('co2', 273.15) / 1e5).toFixed(2)} bar (measured 34.85)`);
    log('Pluto and Triton sit on the N₂ frost curve',
      near(PL.tsat('n2', 1.0), 37, 2) && near(PL.tsat('n2', 1.4), 38, 2),
      `Pluto ${PL.tsat('n2', 1.0).toFixed(1)} K at 1 Pa, Triton ${PL.tsat('n2', 1.4).toFixed(1)} K at 1.4 Pa`);

    /* --- inventory, energy, escape --- */
    {
      const r = mars.res;
      const mbar = (r.cap_co2 + r.rego_co2 + r.atm_co2 + r.atm_n2) / mars.kg_per_mbar;
      log('all reachable Martian CO₂ is well under 100 mbar', mbar < 100,
        `${mbar.toFixed(0)} mbar (Jakosky & Edwards 2018)`);
      const perKg = PL.CO2.cp_ice * (195 - PL.CO2.T_ice) + PL.CO2.L_sub;
      const Mt = r.cap_co2 * perKg / PL.CONST.MT_J;
      log('subliming the Martian polar cap costs millions of megatons', Mt > 1e6 && Mt < 2e7,
        `${(Mt / 1e6).toFixed(2)} million Mt = ${(Mt / 1500).toExponential(2)} world arsenals at 100% coupling`);
    }
    {
      const st = { atm_co2: PL.massFor(mars, 1e5) };
      const yrs = st.atm_co2 / CM.escapeRate(mars, st, 234) / PL.CONST.YR_S;
      log('solar wind would take geological time to strip 1 bar', yrs > 1e8,
        `${yrs.toExponential(2)} years`);
    }
    {
      const lamCO2 = CM.jeansLambda(mars, 220, 0.044), lamH = CM.jeansLambda(mars, 220, 0.001);
      const lamCeres = CM.jeansLambda(W.ceres, 168, 0.044);
      log('Jeans: Mars keeps CO₂, loses hydrogen; Ceres keeps nothing',
        lamCO2 > 30 && lamH < 15 && lamCeres < 15,
        `Mars CO₂ λ=${lamCO2.toFixed(0)}, H λ=${lamH.toFixed(1)}; Ceres CO₂ λ=${lamCeres.toFixed(1)}`);
    }
    {
      const e = W.earth, s = now(e);
      log('Earth sits below the runaway-greenhouse limit', s.absorbed < PL.LIMITS.runaway_Wm2,
        `absorbs ${s.absorbed.toFixed(0)} W/m² against the ${PL.LIMITS.runaway_Wm2} W/m² Simpson–Nakajima limit`);
    }

    const pass = R.filter((r) => r.ok).length;
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
