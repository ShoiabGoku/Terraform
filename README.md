# TERRAFORM — can you nuke Mars into having an atmosphere?

A planetary atmosphere sandbox for testing terraforming hypotheses against actual numbers.
Pick a world, pull levers — nuclear detonations, orbital mirrors, greenhouse-gas factories,
redirected comets — and watch what the physics does.

```bash
node serve.js     # then open http://localhost:8124
```

Or just open **`terraform.html`** — one self-contained file, no server, no dependencies.

---

## The short answer

**No.** But not for the reason most people give.

| What you do | Energy spent | Result |
|---|---|---|
| Nuke the poles (67 world arsenals) | 1.0×10⁵ Mt | **6.11 mbar, −57 °C — no change at all** |
| Fire every weapon on Earth | 1500 Mt | no change |
| Build and fire a *million* arsenals | 2.0×10⁹ Mt | 18.1 mbar, −55 °C |
| Orbital mirrors instead | **0 Mt** | 19.2 mbar, **−48 °C** |
| Everything at once, for 1000 years | 6.4×10⁹ Mt | 112 mbar, −9 °C |

The nuclear option is *strictly dominated*: a mirror array does better, for no weapons and no
fallout. Three things make the bombs pointless.

**1. The polar cap is a thermostat.** While CO₂ ice remains, the surface pressure is pinned to
the vapour pressure at the cap temperature. Vaporise half the cap and it snows back out within
centuries — the simulation does exactly this. To change anything permanently you must remove
*all* of it.

**2. There isn't enough CO₂.** This is the wall. Following Jakosky & Edwards (2018), everything
reachable — atmosphere, polar ice, adsorbed regolith — totals about **58 mbar**. Bake every
carbonate rock on the planet and you reach **208 mbar**. Earth is 1013. Subliming just the south
polar cap costs **6.8 million megatons**, about **4,500× the world arsenal**, at a physically
impossible 100% coupling.

**3. Even if you had it, CO₂ can't warm Mars.** A full bar of pure CO₂ gives −39 °C, because
Rayleigh scattering raises the albedo about as fast as the greenhouse grows. Forget et al. (2013)
found the same ceiling. Every gram of CO₂ on Mars still leaves it 45 K short of melting ice.

### The thing everybody gets backwards

"Mars can't hold an atmosphere, the solar wind stripped it away" is **false on any timescale that
matters**. At MAVEN's measured loss rate, stripping a fresh 1 bar atmosphere would take
**4×10¹⁰ years** — three times the age of the universe. Keeping an atmosphere is easy. *Making*
one is the hard part.

Why Mars looks the way it does is better explained by the Jeans parameter λ = gRm/kT: Mars holds
CO₂ at **λ = 190** (billions of years) but hydrogen at **λ = 4.3** (immediately). It kept its
carbon dioxide and lost its water.

### What would actually work

A **+9.6% increase in sunlight** tips the polar cap into complete sublimation — a mirror
2,101 km across, 35 Mt of foil. It still only reaches 19 mbar, but it costs nothing to run and
leaves nothing radioactive. Perfluorocarbon factories are the best lever per kilogram: 20 Gt of
gas beats 46,600 Gt of ice the bombs were trying to move. And a single 10 km comet lands with
2,100× the world arsenal in kinetic energy while *delivering* volatiles rather than merely
rearranging them.

---

## The model

A global-mean box model, not a GCM, calibrated so an untouched Mars sits exactly at its observed
**6.109 mbar and 216 K** as a *stable* fixed point.

- **Radiation** — T_eff from albedo and distance, plus a CO₂ greenhouse parameterisation
  `ΔT = 55(1 − e^(−1.0116 p^0.4619))` K anchored on published results, with albedo rising with
  pressure from Rayleigh scattering.
- **The cap** — while CO₂ ice exists, solve `σT_cap⁴ = absorbed + IR_down(p_sat(T_cap))` for the
  joint cap/atmosphere equilibrium, taking the *stable* root. This is what produces the thermostat
  behaviour and the tipping point.
- **Regolith** — a Freundlich isotherm normalised to the world's present state.
- **Escape** — solar-wind stripping calibrated to MAVEN, plus Jeans escape from λ.
- **Interventions** — nukes (with coupling efficiency and Cs-137 fallout), mirrors, PFC
  factories, comet delivery, surface darkening, carbonate calcination.

### Verification

```bash
node -e "require('./src/planets.js');require('./src/climate.js').selfTest(true)"   # 10
node test/model-test.js                                                            # 22
```

| Check | Result |
|---|---|
| Mars effective temperature | 209.8 K vs NASA's 209.8 K |
| Present-day state | 6.11 mbar, greenhouse +6.3 K (literature ~5 K) |
| CO₂ frost point at 6 mbar | 147.9 K — the caps really do sit at ~148 K |
| 1 bar of pure CO₂ | −39 °C, matching Forget et al. 2013's ceiling |
| Reachable CO₂ inventory | 58 mbar, per Jakosky & Edwards 2018 |
| Undisturbed Mars over 2000 yr | 6.11 → 6.11 mbar, no drift |
| Half the cap removed | recovers to 6.11 mbar within centuries |
| Solar-wind stripping of 1 bar | 4×10¹⁰ years |

### Sources

- Jakosky & Edwards 2018, *Inventory of CO₂ available for terraforming Mars*, Nature Astronomy 2, 634
- Forget et al. 2013, Icarus 222, 81 — the CO₂ greenhouse ceiling
- Marinova et al. 2005, JGR 110, E03002 — perfluorocarbon warming
- MAVEN escape rates; NASA planetary fact sheets

### Honest limits

Global-mean only — no regional climate, dust storms, or atmospheric chemistry. Nitrogen and
oxygen are not modelled, and you would need both. Venus and Titan are listed for contrast but sit
outside the parameterisation's valid range. Nuclear coupling efficiency is a slider precisely
because it is poorly constrained; the conclusion is unchanged across its whole range, which is
the point.

```
src/planets.js   worlds, volatile inventories, thermodynamic data
src/climate.js   radiation, greenhouse, cap equilibrium, escape + self-test
src/sim.js       interventions and time integration
src/app.js       controls, charts, verdict
test/            verification
build.js         inlines everything into terraform.html
```

`window.__TF` exposes `sim`, `snapshot()`, `setScenario()` and `run(years)` for driving it headlessly.
