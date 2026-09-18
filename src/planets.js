/* =====================================================================
   planets.js — fifteen worlds and what they are actually made of
   ---------------------------------------------------------------------
   Physical data are NASA planetary fact-sheet values unless noted.
   Volatile reservoirs are in kg.  Pressures throughout the model are
   *column* pressures, p = m g / A: the weight of each gas's column per
   unit area.  They sum exactly to the surface pressure, and the column
   mass is also what sets how much a gas absorbs, which is what the
   greenhouse cares about.

   Reservoirs
     atm_co2  atm_n2  atm_o2  atm_h2o   gases in the air (o2 = O2+Ar lump)
     cap_co2  cap_n2                     condensed ice / liquid of those gases
     rego_co2                            CO2 adsorbed in regolith
     carb_co2                            CO2 locked in carbonate rock
     ice_h2o  ocean_h2o                  water, frozen and liquid
   ===================================================================== */
(function (global) {
  'use strict';

  const PL = {};
  const SIGMA = 5.670374419e-8;
  const S_EARTH = 1361;
  const MT_J = 4.184e15;
  const YR_S = 3.15576e7;
  PL.CONST = { SIGMA, S_EARTH, MT_J, YR_S };

  PL.CO2 = { L_sub: 573e3, cp_ice: 850, T_ice: 150, molar: 0.04401 };
  PL.N2 = { L_sub: 2.25e5, cp_ice: 1500, T_ice: 35, molar: 0.02801 };
  PL.H2O = { L_sub: 2.83e6, L_vap: 2.26e6, L_fus: 3.34e5, cp_ice: 2050, molar: 0.018015 };
  PL.MOLAR = { co2: 0.04401, n2: 0.02801, o2: 0.0290, h2o: 0.018015, pfc: 0.188 };

  /* ------------------------------------------------------------------
     Vapour-pressure curves.  Each has a solid branch below the triple
     point and a liquid branch up to the critical point, fitted so the
     two meet exactly at the triple point.  Above the critical
     temperature the gas cannot condense at any pressure.

       CO2  triple 216.58 K / 5.18 bar   critical 304.13 K / 73.8 bar
            solid branch is Kieffer's Mars fit: 148 K at 6 mbar, which is
            where the Martian caps actually sit.  Liquid branch gives
            35.5 bar at 273 K (measured 34.9).
       N2   triple 63.15 K / 0.125 bar   critical 126.2 K / 34.0 bar
            solid branch through Pluto (1 Pa at 37 K) and Triton (1.4 Pa
            at 38 K); liquid branch boils at 77.3 K at 0.98 bar
            (measured 77.35 K at 1.013 bar).
     ------------------------------------------------------------------ */
  const CURVES = {
    co2: { Tt: 216.58, Tc: 304.13, pc: 7.3773e6,
           sA: Math.log(1.2264e12), sB: 3167.8, lA: 22.2665, lB: 1962.4 },
    n2:  { Tt: 63.15, Tc: 126.19, pc: 3.3958e6,
           sA: 22.78, sB: 842.9, lA: 20.655, lB: 708.8 }
  };
  PL.CURVES = CURVES;

  /* saturation pressure, Pa; Infinity above the critical point */
  PL.psat = (sp, T) => {
    const c = CURVES[sp];
    T = Math.max(T, 10);
    if (T >= c.Tc) return Infinity;
    return T < c.Tt ? Math.exp(c.sA - c.sB / T) : Math.exp(c.lA - c.lB / T);
  };
  /* condensation temperature at pressure p, K */
  PL.tsat = (sp, p) => {
    const c = CURVES[sp];
    p = Math.max(p, 1e-12);
    if (p >= c.pc) return c.Tc;
    const pt = Math.exp(c.sA - c.sB / c.Tt);
    return p < pt ? c.sB / (c.sA - Math.log(p)) : c.lB / (c.lA - Math.log(p));
  };
  /* kept for the Mars-specific code and tests */
  PL.co2Psat = (T) => PL.psat('co2', T);
  PL.co2Frost = (p) => PL.tsat('co2', p);

  /* water over ice / liquid (Buck 1981), Pa */
  PL.h2oPsat = (T) => {
    const t = T - 273.15;
    if (T <= 273.16) return 611.15 * Math.exp((23.036 - t / 333.7) * (t / (279.82 + t)));
    return 611.21 * Math.exp((18.678 - t / 234.5) * (t / (257.14 + t)));
  };

  PL.LIMITS = {
    triplePoint_Pa: 611.657,
    armstrong_Pa: 6270,
    pressureSuitFree_Pa: 30000,
    earthSeaLevel_Pa: 101325,
    runaway_Wm2: 282          /* Simpson-Nakajima limit for a water world */
  };

  /* ------------------------------------------------------------------
     The worlds.
       albedo      observed Bond albedo at the present atmosphere
       albedoSurf  bare-ground albedo if the clouds/haze were gone
       haze        fixed anti-greenhouse from organic haze (Titan only)
       capSpecies  which gas freezes out into a polar/surface trap
       polarTrap   true if that cap sits in vapour equilibrium with the air
       magnet      shielding from a global magnetic field (1 = none)
       coldTrapped ice survives only in permanently shadowed craters, so
                   it sits outside the global water cycle
       render      how the planet is drawn
     ------------------------------------------------------------------ */
  const W = {
    mercury: {
      name: 'Mercury', coldTrapped: true, R: 2.4397e6, g: 3.70, M: 3.3011e23, a_AU: 0.387098,
      albedo: 0.088, albedoSurf: 0.088, rotation_h: 4222.6, T_obs: 440, p_obs: 1e-9,
      capSpecies: null, magnet: 0.6, modelled: true,
      confidence: 'fair for the energy balance; but an airless slow rotator swings from 700 K to 100 K, so a single global mean is only indicative',
      res: { atm_co2: 0, atm_n2: 0, atm_o2: 0, atm_h2o: 0, cap_co2: 0, cap_n2: 0,
             rego_co2: 0, carb_co2: 0, ice_h2o: 1e15, ocean_h2o: 0 },
      notes: 'Water ice survives in permanently shadowed polar craters — about 10¹⁵ kg by MESSENGER\'s estimate. Everything else here is baked dry.',
      render: { style: 0, c0: [0.38, 0.37, 0.36], c1: [0.62, 0.60, 0.58], c2: [0.25, 0.24, 0.24], c3: [0.95, 0.96, 1.0], crater: 1.0, rough: 0.6, seed: 3.1, atmo: [0.5, 0.6, 1.0] }
    },

    venus: {
      name: 'Venus', R: 6.0518e6, g: 8.87, M: 4.8675e24, a_AU: 0.723332,
      albedo: 0.77, albedoSurf: 0.15, rotation_h: -5832.5, T_obs: 737, p_obs: 9.2e6,
      capSpecies: 'co2', polarTrap: false, magnet: 1, modelled: true,
      confidence: 'good for the global energy balance — calibrated to 737 K under 92 bar. Its sulphuric-acid clouds are taken as observed, not modelled',
      res: { atm_co2: 4.664e20, atm_n2: 1.0896e19, atm_o2: 0, atm_h2o: 4e15,
             cap_co2: 0, cap_n2: 0, rego_co2: 0, carb_co2: 0, ice_h2o: 0, ocean_h2o: 0 },
      notes: 'The opposite problem to Mars: far too much atmosphere. Nuking it does nothing useful. The serious proposal is a sunshade — cool it enough and the CO₂ itself rains out.',
      render: { style: 3, c0: [0.42, 0.33, 0.24], c1: [0.60, 0.48, 0.34], c2: [0.95, 0.45, 0.15], c3: [0.9, 0.9, 0.85], crater: 0.1, rough: 0.35, seed: 7.7, atmo: [1.0, 0.86, 0.55] }
    },

    earth: {
      name: 'Earth', R: 6.371e6, g: 9.80665, M: 5.9722e24, a_AU: 1.0,
      albedo: 0.306, albedoSurf: 0.15, rotation_h: 23.934, T_obs: 288, p_obs: 101325,
      capSpecies: 'co2', polarTrap: false, magnet: 0.05, modelled: true,
      confidence: 'good — calibrated to 288 K, and it predicts the CO₂-doubling response (+1.4 K without feedback, ~+1.8 K with water vapour) without being tuned for it. Clouds, ice-albedo and lapse-rate feedbacks are not in it',
      res: { atm_co2: 3.292e15, atm_n2: 3.979e18, atm_o2: 1.287e18, atm_h2o: 1.269e16,
             cap_co2: 0, cap_n2: 0, rego_co2: 0, carb_co2: 3.7e20,
             ice_h2o: 2.9e19, ocean_h2o: 1.335e21 },
      notes: 'The reference. A useful check that the model gets a world right when it has no reason to — and a place to try the experiments nobody should run for real.',
      render: { style: 2, c0: [0.30, 0.42, 0.20], c1: [0.55, 0.45, 0.30], c2: [0.06, 0.18, 0.40], c3: [0.95, 0.97, 1.0], crater: 0.0, rough: 0.55, seed: 11.3, atmo: [0.35, 0.58, 1.0] }
    },

    moon: {
      name: 'The Moon', coldTrapped: true, R: 1.7374e6, g: 1.62, M: 7.342e22, a_AU: 1.0,
      albedo: 0.11, albedoSurf: 0.11, rotation_h: 655.7, T_obs: 250, p_obs: 3e-10,
      capSpecies: null, magnet: 1, modelled: true,
      confidence: 'fair for the energy balance; nothing to build an atmosphere from, and it could not keep a warm one',
      res: { atm_co2: 0, atm_n2: 0, atm_o2: 0, atm_h2o: 0, cap_co2: 0, cap_n2: 0,
             rego_co2: 0, carb_co2: 0, ice_h2o: 6e14, ocean_h2o: 0 },
      notes: 'About 600 million tonnes of water ice in permanently shadowed craters. At 250 K the Jeans parameter for water is marginal, and for hydrogen hopeless.',
      render: { style: 0, c0: [0.28, 0.28, 0.29], c1: [0.62, 0.61, 0.60], c2: [0.18, 0.18, 0.19], c3: [0.95, 0.96, 1.0], crater: 0.9, rough: 0.5, seed: 1.7, maria: 1, atmo: [0.5, 0.6, 1.0] }
    },

    mars: {
      name: 'Mars', R: 3.3895e6, g: 3.7211, M: 6.4171e23, a_AU: 1.523679,
      albedo: 0.250, albedoSurf: 0.250, rotation_h: 24.6229, T_obs: 210, p_obs: 610,
      capSpecies: 'co2', polarTrap: true, magnet: 1, modelled: true,
      confidence: 'good — the model was built for Mars and is calibrated against published 1-D and 3-D results for thin CO₂ atmospheres',
      res: { atm_co2: 2.32e16, atm_n2: 5e14, atm_o2: 0, atm_h2o: 2e12,
             cap_co2: 4.66e16, cap_n2: 0, rego_co2: 1.55e17, carb_co2: 5.82e17,
             ice_h2o: 2.1e19, ocean_h2o: 0 },
      notes: 'Inventory from Jakosky & Edwards (2018). Everything you can reach adds up to about 58 mbar; the rest is chemically bound in rock.',
      render: { style: 1, c0: [0.62, 0.30, 0.16], c1: [0.78, 0.48, 0.30], c2: [0.30, 0.16, 0.11], c3: [0.97, 0.97, 1.0], crater: 0.35, rough: 0.6, seed: 4.2, atmo: [0.90, 0.60, 0.40] }
    },

    ceres: {
      name: 'Ceres', coldTrapped: true, R: 4.697e5, g: 0.28, M: 9.3835e20, a_AU: 2.7675,
      albedo: 0.04, albedoSurf: 0.04, rotation_h: 9.074, T_obs: 168, p_obs: 1e-9,
      capSpecies: null, magnet: 1, modelled: true,
      confidence: 'fair for the energy balance; with 0.28 m/s² of gravity nothing you warm up stays',
      res: { atm_co2: 0, atm_n2: 0, atm_o2: 0, atm_h2o: 0, cap_co2: 0, cap_n2: 0,
             rego_co2: 0, carb_co2: 1e17, ice_h2o: 2.3e20, ocean_h2o: 0 },
      notes: 'Perhaps a quarter water by mass, and bright salt deposits in Occator crater. Escape velocity 510 m/s.',
      render: { iceNative: 1, style: 0, c0: [0.22, 0.22, 0.23], c1: [0.33, 0.33, 0.34], c2: [0.9, 0.92, 0.95], c3: [0.95, 0.96, 1.0], crater: 0.8, rough: 0.5, seed: 9.1, spots: 1, atmo: [0.5, 0.6, 1.0] }
    },

    io: {
      name: 'Io', R: 1.8216e6, g: 1.796, M: 8.9319e22, a_AU: 5.2044,
      albedo: 0.63, albedoSurf: 0.63, rotation_h: 42.46, T_obs: 110, p_obs: 1e-4,
      capSpecies: null, magnet: 1, modelled: true,
      confidence: 'poor — its thin SO₂ atmosphere and the tidal heating that powers 400 volcanoes are not in this model',
      res: { atm_co2: 0, atm_n2: 0, atm_o2: 0, atm_h2o: 0, cap_co2: 0, cap_n2: 0,
             rego_co2: 0, carb_co2: 0, ice_h2o: 0, ocean_h2o: 0 },
      notes: 'The most volcanic body in the solar system, and bone dry. It sits inside Jupiter\'s radiation belts at ~36 Sv a day.',
      render: { style: 6, c0: [0.85, 0.72, 0.30], c1: [0.95, 0.88, 0.55], c2: [0.55, 0.18, 0.08], c3: [0.95, 0.95, 0.8], crater: 0.0, rough: 0.4, seed: 5.5, atmo: [0.9, 0.85, 0.6] }
    },

    europa: {
      name: 'Europa', R: 1.5608e6, g: 1.315, M: 4.7998e22, a_AU: 5.2044,
      albedo: 0.68, albedoSurf: 0.68, rotation_h: 85.23, T_obs: 102, p_obs: 1e-6,
      capSpecies: null, magnet: 1, modelled: true,
      confidence: 'fair for the energy balance; the ocean under the ice is not coupled to the surface in this model',
      res: { atm_co2: 0, atm_n2: 0, atm_o2: 0, atm_h2o: 0, cap_co2: 0, cap_n2: 0,
             rego_co2: 0, carb_co2: 0, ice_h2o: 3e21, ocean_h2o: 0 },
      notes: 'Probably twice Earth\'s ocean volume, under 15-25 km of ice, at 5.2 AU.',
      render: { iceNative: 1, style: 4, c0: [0.82, 0.78, 0.70], c1: [0.93, 0.92, 0.88], c2: [0.55, 0.30, 0.18], c3: [0.97, 0.98, 1.0], crater: 0.05, rough: 0.2, seed: 6.6, atmo: [0.5, 0.6, 1.0] }
    },

    ganymede: {
      name: 'Ganymede', R: 2.6341e6, g: 1.428, M: 1.4819e23, a_AU: 5.2044,
      albedo: 0.43, albedoSurf: 0.43, rotation_h: 171.7, T_obs: 110, p_obs: 1e-6,
      capSpecies: null, magnet: 0.3, modelled: true,
      confidence: 'fair for the energy balance; the only moon with its own magnetic field',
      res: { atm_co2: 0, atm_n2: 0, atm_o2: 0, atm_h2o: 0, cap_co2: 0, cap_n2: 0,
             rego_co2: 0, carb_co2: 0, ice_h2o: 7e22, ocean_h2o: 0 },
      notes: 'Bigger than Mercury, about half water, with a magnetosphere of its own.',
      render: { iceNative: 1, style: 5, c0: [0.36, 0.33, 0.30], c1: [0.72, 0.70, 0.66], c2: [0.5, 0.45, 0.4], c3: [0.95, 0.96, 1.0], crater: 0.45, rough: 0.45, seed: 8.8, atmo: [0.5, 0.6, 1.0] }
    },

    callisto: {
      name: 'Callisto', R: 2.4103e6, g: 1.235, M: 1.0759e23, a_AU: 5.2044,
      albedo: 0.22, albedoSurf: 0.22, rotation_h: 400.5, T_obs: 134, p_obs: 7.5e-7,
      capSpecies: null, magnet: 1, modelled: true,
      confidence: 'fair for the energy balance',
      res: { atm_co2: 1e4, atm_n2: 0, atm_o2: 0, atm_h2o: 0, cap_co2: 0, cap_n2: 0,
             rego_co2: 0, carb_co2: 0, ice_h2o: 5e22, ocean_h2o: 0 },
      notes: 'The most heavily cratered surface known, and outside Jupiter\'s worst radiation — NASA\'s HOPE study picked it as the place to base a crew.',
      render: { iceNative: 1, style: 0, c0: [0.20, 0.18, 0.16], c1: [0.36, 0.33, 0.29], c2: [0.8, 0.8, 0.8], c3: [0.95, 0.96, 1.0], crater: 1.0, rough: 0.55, seed: 2.9, rays: 1, atmo: [0.5, 0.6, 1.0] }
    },

    titan: {
      name: 'Titan', R: 2.5747e6, g: 1.352, M: 1.3452e23, a_AU: 9.5826,
      albedo: 0.265, albedoSurf: 0.15, rotation_h: 382.7, T_obs: 93.7, p_obs: 146700, haze: -9,
      capSpecies: null, magnet: 1, modelled: true,
      confidence: 'partial — calibrated to 93.7 K, but its methane is lumped in with the nitrogen and the haze anti-greenhouse is held at its observed −9 K',
      res: { atm_co2: 0, atm_n2: 9.039e18, atm_o2: 0, atm_h2o: 0, cap_co2: 0, cap_n2: 0,
             rego_co2: 0, carb_co2: 0, ice_h2o: 5e22, ocean_h2o: 0 },
      notes: 'The one world with the atmosphere problem already solved: 1.5 bar of nitrogen. What it lacks is heat — it gets 1% of Earth\'s sunlight.',
      render: { iceNative: 1, style: 7, c0: [0.35, 0.25, 0.14], c1: [0.55, 0.42, 0.25], c2: [0.12, 0.10, 0.08], c3: [0.9, 0.8, 0.6], crater: 0.05, rough: 0.3, seed: 12.5, atmo: [1.0, 0.62, 0.25] }
    },

    enceladus: {
      name: 'Enceladus', R: 2.521e5, g: 0.113, M: 1.08e20, a_AU: 9.5826,
      albedo: 0.81, albedoSurf: 0.81, rotation_h: 32.9, T_obs: 75, p_obs: 1e-9,
      capSpecies: null, magnet: 1, modelled: true,
      confidence: 'fair for the energy balance; escape velocity is 240 m/s, so nothing is retained',
      res: { atm_co2: 0, atm_n2: 0, atm_o2: 0, atm_h2o: 0, cap_co2: 0, cap_n2: 0,
             rego_co2: 0, carb_co2: 0, ice_h2o: 5e19, ocean_h2o: 0 },
      notes: 'The brightest body in the solar system, venting its buried ocean into space through the "tiger stripes".',
      render: { iceNative: 1, style: 8, c0: [0.90, 0.92, 0.95], c1: [0.98, 0.99, 1.0], c2: [0.45, 0.60, 0.75], c3: [0.98, 0.99, 1.0], crater: 0.3, rough: 0.3, seed: 13.3, atmo: [0.5, 0.6, 1.0] }
    },

    triton: {
      name: 'Triton', R: 1.3534e6, g: 0.779, M: 2.14e22, a_AU: 30.07,
      albedo: 0.76, albedoSurf: 0.76, rotation_h: -141.0, T_obs: 38, p_obs: 1.4,
      capSpecies: 'n2', polarTrap: true, magnet: 1, modelled: true,
      confidence: 'fair — the nitrogen frost cycle uses the same vapour-equilibrium physics as Mars\' CO₂ caps; the ice inventory is an estimate',
      res: { atm_co2: 0, atm_n2: 4.14e13, atm_o2: 0, atm_h2o: 0, cap_co2: 0, cap_n2: 1e17,
             rego_co2: 0, carb_co2: 0, ice_h2o: 5e21, ocean_h2o: 0 },
      notes: 'A captured Kuiper-belt object, orbiting backwards, with nitrogen geysers and a surface held at 38 K by its own frost.',
      render: { iceNative: 1, style: 9, c0: [0.78, 0.70, 0.66], c1: [0.90, 0.84, 0.80], c2: [0.62, 0.48, 0.42], c3: [0.98, 0.97, 0.96], crater: 0.15, rough: 0.3, seed: 14.4, atmo: [0.55, 0.7, 1.0] }
    },

    pluto: {
      name: 'Pluto', R: 1.1883e6, g: 0.62, M: 1.303e22, a_AU: 39.482,
      albedo: 0.72, albedoSurf: 0.72, rotation_h: -153.29, T_obs: 40, p_obs: 1.0,
      capSpecies: 'n2', polarTrap: true, magnet: 1, modelled: true,
      confidence: 'fair — same frost physics as Triton; the Sputnik Planitia ice mass is an estimate (~3×10¹⁸ kg)',
      res: { atm_co2: 0, atm_n2: 2.862e13, atm_o2: 0, atm_h2o: 0, cap_co2: 0, cap_n2: 3e18,
             rego_co2: 0, carb_co2: 0, ice_h2o: 4e21, ocean_h2o: 0 },
      notes: 'A surprise: Sputnik Planitia holds roughly a bar\'s worth of nitrogen as ice. Pluto has the raw material. It just cannot stay warm, and if it did the gas would escape.',
      render: { iceNative: 1, style: 9, c0: [0.55, 0.36, 0.26], c1: [0.78, 0.64, 0.52], c2: [0.26, 0.14, 0.10], c3: [0.97, 0.95, 0.92], crater: 0.35, rough: 0.35, seed: 15.9, heart: 1, atmo: [0.45, 0.6, 1.0] }
    },

    trappist1e: {
      name: 'TRAPPIST-1e', R: 5.861e6, g: 8.03, M: 4.133e24, a_AU: 1, insolation: 0.662,
      albedo: 0.30, albedoSurf: 0.30, rotation_h: 146.2, T_obs: 230, p_obs: 0,
      capSpecies: 'co2', polarTrap: false, magnet: 1, modelled: true,
      confidence: 'speculative — mass, radius and sunlight are measured (Agol et al. 2021); whether it has any atmosphere at all is unknown, so it starts bare',
      res: { atm_co2: 0, atm_n2: 0, atm_o2: 0, atm_h2o: 0, cap_co2: 0, cap_n2: 0,
             rego_co2: 0, carb_co2: 0, ice_h2o: 0, ocean_h2o: 0 },
      notes: 'An Earth-sized world 40 light-years away in its star\'s habitable zone, probably tidally locked. Its red dwarf flares violently. Starts as bare rock — give it an atmosphere with comets and see what it does.',
      render: { style: 10, c0: [0.30, 0.24, 0.22], c1: [0.48, 0.40, 0.36], c2: [0.18, 0.14, 0.13], c3: [0.95, 0.96, 1.0], crater: 0.25, rough: 0.55, seed: 17.2, atmo: [0.55, 0.62, 1.0], redStar: 1 }
    }
  };

  for (const k of Object.keys(W)) {
    const w = W[k];
    w.key = k;
    w.area = 4 * Math.PI * w.R * w.R;
    w.cross = Math.PI * w.R * w.R;
    w.S0 = S_EARTH * (w.insolation !== undefined ? w.insolation : 1 / (w.a_AU * w.a_AU));
    w.v_esc = Math.sqrt(2 * w.g * w.R);
    w.kg_per_Pa = w.area / w.g;
    w.kg_per_mbar = 100 * w.area / w.g;
    w.res0 = Object.assign({}, w.res);
  }
  PL.WORLDS = W;
  PL.ORDER = ['mercury', 'venus', 'earth', 'moon', 'mars', 'ceres', 'io', 'europa',
    'ganymede', 'callisto', 'titan', 'enceladus', 'triton', 'pluto', 'trappist1e'];

  /* column pressure of one reservoir, and the inverse */
  PL.pressure = (w, m) => (m * w.g) / w.area;
  PL.massFor = (w, pPa) => (pPa * w.area) / w.g;

  PL.Teff = (S, A) => Math.pow(Math.max(S, 0) * (1 - A) / (4 * SIGMA), 0.25);

  if (typeof module !== 'undefined' && module.exports) module.exports = PL;
  global.PLANETS = PL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
