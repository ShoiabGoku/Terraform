/* =====================================================================
   planets.js — target worlds and what volatiles they actually have
   ---------------------------------------------------------------------
   Every number here is observational or from a published inventory, with
   the source named.  The volatile reservoirs are the whole ballgame: you
   cannot build an atmosphere out of gas the planet does not have, and on
   Mars that turns out to be the binding constraint rather than gravity
   or the solar wind.

   Reservoir masses are stored in kg.  The handy conversion is that on a
   world of surface area A and gravity g, a surface pressure p needs
        m = p A / g
   so 1 mbar on Mars is 3.88e15 kg of gas.
   ===================================================================== */
(function (global) {
  'use strict';

  const PL = {};

  const SIGMA = 5.670374419e-8;      /* Stefan-Boltzmann, W/m^2/K^4 */
  const S_EARTH = 1361;              /* solar constant at 1 AU, W/m^2 */
  const MT_J = 4.184e15;             /* joules per megaton of TNT */
  const YR_S = 3.15576e7;

  PL.CONST = { SIGMA, S_EARTH, MT_J, YR_S };

  /* CO2 properties near Martian conditions */
  PL.CO2 = {
    L_sub: 573e3,        /* enthalpy of sublimation at ~195 K, J/kg */
    cp_ice: 850,         /* specific heat of CO2 ice, J/kg/K */
    T_ice: 150,          /* typical cap temperature before heating, K */
    molar: 0.04401       /* kg/mol */
  };
  PL.H2O = { L_sub: 2.83e6, cp_ice: 2050, L_fus: 3.34e5, molar: 0.018015 };

  /* ------------------------------------------------------------------
     Worlds.  `res` holds volatile reservoirs in kg.

     Mars inventory follows Jakosky & Edwards (2018), "Inventory of CO2
     available for terraforming Mars", Nature Astronomy 2, 634 — the
     paper that actually totted this up and concluded there is not
     enough.  Their headline numbers, as equivalent surface pressure:
        present atmosphere        ~6 mbar
        south polar CO2 ice      ~10-12 mbar
        CO2 adsorbed in regolith  ~4-40 mbar (very uncertain)
        carbonate minerals       ~150 mbar, but locked in rock and
                                  needing ~900 K to drive off
     ------------------------------------------------------------------ */
  const WORLDS = {
    mars: {
      name: 'Mars',
      R: 3.3895e6,                 /* m */
      g: 3.7211,
      M: 6.4171e23,
      a_AU: 1.523679,
      albedo: 0.250,               /* Bond albedo, NASA Mars fact sheet */
      rotation_h: 24.6229,
      T_obs: 210,                  /* observed global mean surface T, K */
      p_obs: 610,                  /* observed mean surface pressure, Pa */
      modelled: true,
      confidence: 'good — the greenhouse parameterisation is calibrated ' +
        'against published 1-D and 3-D results for thin CO2 atmospheres',
      res: {
        atm_co2: 2.37e16,          /* = 6.1 mbar */
        cap_co2: 4.66e16,          /* 12 mbar, south polar residual + buried */
        rego_co2: 1.55e17,         /* 40 mbar, adsorbed — upper end of the range */
        carb_co2: 5.82e17,         /* 150 mbar locked in carbonate rock */
        ice_h2o: 2.1e19,           /* polar layered deposits + ground ice */
        atm_h2o: 2e12
      },
      notes: 'The only world here the model is really built for. ' +
        'Everything you can reach adds up to about 20 mbar; the rest is ' +
        'chemically bound in rock.'
    },

    moon: {
      name: 'The Moon',
      R: 1.7374e6, g: 1.625, M: 7.342e22, a_AU: 1.0,
      albedo: 0.11, rotation_h: 655.7, T_obs: 250, p_obs: 3e-10,
      modelled: true,
      confidence: 'poor — essentially no volatiles and no way to hold a ' +
        'warm atmosphere; shown to make the contrast concrete',
      res: {
        atm_co2: 1e4, cap_co2: 0, rego_co2: 0, carb_co2: 0,
        ice_h2o: 6e14,             /* permanently shadowed crater ice, ~600 Mt */
        atm_h2o: 0
      },
      notes: 'Escape actually is the problem here: the Moon is too small ' +
        'and too warm to retain anything you release.'
    },

    titan: {
      name: 'Titan',
      R: 2.5747e6, g: 1.352, M: 1.3452e23, a_AU: 9.5826,
      albedo: 0.22, rotation_h: 382.7, T_obs: 94, p_obs: 146700,
      modelled: false,
      confidence: 'not modelled — Titan already has 1.5 bar of N2 plus a ' +
        'methane greenhouse and an organic-haze anti-greenhouse that this ' +
        'CO2 parameterisation does not represent',
      res: {
        atm_co2: 0, cap_co2: 0, rego_co2: 0, carb_co2: 0,
        ice_h2o: 4e22, atm_h2o: 0
      },
      notes: 'Has the atmosphere problem solved and a temperature problem ' +
        'instead: 94 K, and 10 AU from the Sun.'
    },

    europa: {
      name: 'Europa',
      R: 1.5608e6, g: 1.315, M: 4.7998e22, a_AU: 5.2044,
      albedo: 0.68, rotation_h: 85.2, T_obs: 102, p_obs: 1e-6,
      modelled: true,
      confidence: 'poor — surface is water ice at 102 K with no CO2 ' +
        'reservoir to speak of',
      res: {
        atm_co2: 0, cap_co2: 0, rego_co2: 0, carb_co2: 0,
        ice_h2o: 3e21, atm_h2o: 1e5
      },
      notes: 'All the water you could want, under an ice shell, at 5 AU.'
    },

    ceres: {
      name: 'Ceres',
      R: 4.73e5, g: 0.27, M: 9.3839e20, a_AU: 2.7675,
      albedo: 0.09, rotation_h: 9.07, T_obs: 168, p_obs: 1e-9,
      modelled: true,
      confidence: 'poor — 0.27 m/s^2 of gravity cannot hold a warm ' +
        'atmosphere for geological times',
      res: {
        atm_co2: 0, cap_co2: 1e15, rego_co2: 1e16, carb_co2: 1e17,
        ice_h2o: 2e20, atm_h2o: 1e6
      },
      notes: 'Escape velocity is 510 m/s. Anything you warm up leaves.'
    }
  };

  /* Derived geometry and insolation */
  for (const k of Object.keys(WORLDS)) {
    const w = WORLDS[k];
    w.key = k;
    w.area = 4 * Math.PI * w.R * w.R;
    w.cross = Math.PI * w.R * w.R;
    w.S0 = S_EARTH / (w.a_AU * w.a_AU);          /* solar constant, W/m^2 */
    w.v_esc = Math.sqrt(2 * w.g * w.R);
    /* kg of gas per pascal, and per mbar, of surface pressure */
    w.kg_per_Pa = w.area / w.g;
    w.kg_per_mbar = 100 * w.area / w.g;
    w.res0 = Object.assign({}, w.res);
  }
  PL.WORLDS = WORLDS;

  /* Pressure from an atmospheric mass, and back again. */
  PL.pressure = (w, m) => (m * w.g) / w.area;          /* Pa */
  PL.massFor = (w, pPa) => (pPa * w.area) / w.g;       /* kg */

  /* Equilibrium (effective) temperature for a given Bond albedo. */
  PL.Teff = (S, A) => Math.pow((S * (1 - A)) / (4 * SIGMA), 0.25);

  /* CO2 sublimation curve.  p_sat = 1.2264e12 exp(-3167.8/T) Pa is the
     standard Mars-regime fit (Kieffer); it puts the frost point at 148 K
     for today's 6 mbar, which is exactly what the polar caps do. */
  PL.co2Psat = (T) => 1.2264e12 * Math.exp(-3167.8 / Math.max(T, 40));
  PL.co2Frost = (pPa) => 3167.8 / Math.log(1.2264e12 / Math.max(pPa, 1e-12));

  /* Water vapour saturation over ice / liquid (Buck), Pa. */
  PL.h2oPsat = (T) => {
    if (T <= 273.16) return 611.15 * Math.exp((23.036 - (T - 273.15) / 333.7) * ((T - 273.15) / (279.82 + (T - 273.15))));
    return 611.21 * Math.exp((18.678 - (T - 273.15) / 234.5) * ((T - 273.15) / (257.14 + (T - 273.15))));
  };

  /* Thresholds a human body cares about. */
  PL.LIMITS = {
    triplePoint_Pa: 611.657,     /* below this liquid water cannot exist at all */
    armstrong_Pa: 6270,          /* body-temperature water boils; ~62.7 mbar */
    pressureSuitFree_Pa: 30000,  /* rough floor for unpressurised survival with O2 */
    earthSeaLevel_Pa: 101325
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = PL;
  global.PLANETS = PL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
