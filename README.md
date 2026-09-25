# TERRAFORM — bomb, shade or warm a world, and watch it change

A planetary atmosphere sandbox for testing terraforming ideas against real numbers, on
**15 worlds**. Drop a nuclear device anywhere on a 3-D globe and see exactly what it does. Run a
campaign of thousands. Build orbital mirrors or a sunshade, redirect comets, make greenhouse
gases — then watch the planet respond: polar caps shrink, air freezes onto the ground, seas
fill the lowlands, oceans boil, rock starts to glow.

```bash
node serve.js     # then open http://localhost:8124
```

Or just open **`terraform.html`** — one self-contained file, no server, no dependencies.
Needs WebGL2 for the full globe; without it a coarser globe is drawn on the CPU.

---

## What you are looking at

The globe is ray-cast per pixel in a WebGL2 shader, and **every layer on it is read from the
simulation**, not painted:

| On the globe | Comes from |
|---|---|
| polar CO₂ / N₂ caps | the ice mass left — the edge moves as it sublimes |
| frost over everything | the air itself condensing (Venus under a sunshade) |
| seas | the ocean volume, filling the lowest terrain first |
| liquid-nitrogen seas | condensed N₂ above its triple point (Titan, dimmed) |
| ice sheets, sea ice, snow | the ice mass and the latitude where it drops below 0 °C |
| clouds | water vapour greenhouse; Venus's acid deck; Titan's haze |
| the sky at the limb | optical depth and scale height of the real air column |
| glowing ground | surface above the Draper point (798 K) |
| craters | every single detonation you fire |

**Click the planet to detonate a device there.** It works out what you hit — polar ice, ocean,
water ice or rock — using JavaScript twins of the shader's noise functions, so the click hits
exactly what the pixel shows (checked in the browser with `__TF.view.parityTest(300)`: 99–100%
agreement across worlds and states). You get the fireball, the blast ring, a mushroom cloud that
casts a shadow, or — on an airless world — ejecta on ballistic arcs, and a report:

> **1 Mt on Mars' polar cap:** fireball 4.6 km (4.3× Earth's — the air is thin), crater 271 m,
> cloud top ~26 km. Vaporises **342 kt of CO₂**, 7×10⁻⁷ % of the cap, and raises the pressure by
> 9×10⁻⁶ Pa. Releasing all of it would take **136 million devices = 90,772 world arsenals.**

**Close-ups.** After you click, the camera flies down beside the blast, low over the ground, and
you watch it happen at true scale: the flash floods the view, the fireball glows white then
orange, the shock ring races out, and a ray-marched mushroom cloud climbs, spreads into a rolling
vortex ring and casts its shadow, with dust in the stem and a base surge along the ground. It is
lit by the sun and from inside by the fireball, seen through the planet's own sky: blue haze on
Earth, butterscotch dust on Mars, orange smog on Titan, black and starry on the Moon (where there
is no cloud at all, only ejecta on ballistic arcs). The shape follows Glasstone & Dolan: about
half-way up after a minute, stable at the cloud-top height after ten, the cap about as wide as it
is high. The flash plays in real time (its thermal pulse lasts ~0.9 s for 1 Mt, ~5 s for 50 Mt);
the several-minute climb is shown ~15× faster, and the HUD shows the clock and the speed-up. Drag
to circle it, scroll to move in or back out, Esc to return to orbit.

From orbit, blast effects are enlarged so you can see them (the HUD says by how much); press
**true scale** and they shrink to their real size — a 50 Mt mushroom on Mars is a few pixels.
Zooming in with the wheel tips the camera toward the horizon, as from an aircraft.

---

## Mars: can you nuke it into having an atmosphere?

**No.** But not for the reason most people give.

| What you do | Energy | After 2000 years |
|---|---|---|
| Nuke the poles (Musk: 10,000 × 10 Mt) | 1.0×10⁵ Mt | **6.11 mbar, −57 °C — no change** |
| Fire every weapon on Earth | 1500 Mt | no change |
| Build and fire a *million* arsenals | 2.0×10⁹ Mt | 18.1 mbar, −54 °C |
| Orbital mirrors, +12% sunlight | **0 Mt** | 19.7 mbar, **−47 °C** |
| 1,000 comets over 500 years | 3.1×10⁹ Mt | 26.2 mbar, −53 °C |
| Everything at once, for 1000 years | 6.4×10⁹ Mt | 118 mbar, −2 °C, first seas |

**1. The polar cap is a thermostat.** While CO₂ ice remains, the pressure is pinned to the
vapour pressure at the cap temperature. Vaporise half the cap and it snows back out within
centuries. To change anything you must remove *all* of it.

**2. There isn't enough CO₂.** Following Jakosky & Edwards (2018), everything reachable —
atmosphere, polar ice, adsorbed regolith — totals about **58 mbar**; baking every carbonate on
the planet reaches **208 mbar**. Earth is 1013.

**3. Even if you had it, CO₂ can't warm Mars.** A full bar of pure CO₂ gives **−37 °C**, because
Rayleigh scattering raises the albedo about as fast as the greenhouse grows (Forget et al. 2013
find the same ceiling).

**The thing everybody gets backwards:** "the solar wind would strip it away" is false on any
timescale that matters — at MAVEN's measured rates a fresh 1 bar atmosphere lasts ~4×10¹⁰ years.
Keeping an atmosphere is easy. *Making* one is the hard part.

The mirror option strictly dominates: a 2,348 km mirror (43 Mt of foil) does better than a
million arsenals, for no weapons and no fallout.

---

## What humanity could actually build — and the one way it works

The sandbox's "million arsenals" is not a thing anyone can build. Real limits: each warhead's
primary needs ~4 kg of plutonium, each megaton of fusion yield ~16 t of lithium deuteride, and
the best yield-to-weight ever achieved was the B41 (25 Mt in 4,850 kg = 5.2 kt/kg). The world's
civil reactors make ~70–80 t of plutonium a year — enough to arm ~20,000 primaries a year, if
every gram were reprocessed for weapons.

| Programme | Devices | Total yield | Plutonium | Mass to launch | Dropped on the caps |
|---|---|---|---|---|---|
| every weapon on Earth today | 12,200 | 1,500 Mt | 49 t | 290 t | **no change at all** |
| 1960s peak output, for a decade | 30,000 | 3×10⁴ Mt | 120 t | 5,800 t | **no change** |
| a century of *all* the world's plutonium | 400,000 | 1×10⁷ Mt | 1,600 t | 1.9×10⁶ t | **no change** |
| a millennium of it | 2×10⁷ | 5×10⁸ Mt | 8×10⁴ t | 1×10⁸ t | +0.009 mbar |

The cap does not care: subliming the south cap needs 6.8 million Mt *coupled into the ice*, which
at a realistic 5% coupling is 1.4×10⁸ Mt — and whatever you release snows back out while any ice
remains.

**But there is a job nuclear weapons are extraordinarily good at here.** Use them as a lever, not
a blowtorch: a standoff burst nudges a comet onto a collision course, and the comet's own orbital
energy does the work.

- A 10 km comet weighs 2.6×10¹¹ t. Nudging it by 10 m/s, with 1% of the yield coupled into
  momentum, costs **311 Mt — twelve 25 Mt devices, 50 kg of plutonium, 60 t to launch.**
- It arrives with **3.1×10⁶ Mt** of kinetic energy: **10,000× the energy that moved it**, plus
  0.067 mbar-equivalent of new volatiles that the planet did not have.
- The same 311 Mt spent heating the polar cap directly releases 3×10⁻⁵ mbar of CO₂ — which snows
  back out.

### Comets or asteroids?

Comets are ice — 80% of one becomes air. Asteroids are rock, but they are next door and there are
~20,000 known Mars-crossers. A carbonaceous (C-type) asteroid is about 10% water bound in clays;
a stony (S-type) one is dry and delivers only heat. What matters is the nuclear yield per mbar of
air delivered, which is ½Δv²/coupling × (mass per mbar)/(volatile fraction):

| Body you move | From a Mars-crossing orbit (30 m/s) | Nudged into the 3:1 resonance (5 m/s) | Pushed straight out of the belt (2.4 km/s) |
|---|---|---|---|
| comet (80% volatile) | 5.2×10⁴ Mt per mbar | 1.4×10³ | 3.3×10⁸ |
| C-type asteroid (10%) | 4.2×10⁵ Mt per mbar | 1.2×10⁴ | 2.7×10⁹ |
| S-type asteroid (0.5%) | 8.4×10⁶ Mt per mbar | 2.3×10⁵ | 5.3×10¹⁰ |

Dropping a fresh rock from 2.5 AU costs 2.4 km/s and is hopeless — millions of warheads for one
asteroid. Everything depends on starting with a body that already crosses Mars and acting decades
ahead, when tens of metres per second are enough.

| Programme (10 km bodies, mirrors +25%, PFC plants 100 Mt/yr) | Devices a year | Plutonium a year | Result |
|---|---|---|---|
| 5 comets/yr for 300 yr, 10 m/s nudge | 62 | 0.25 t | 67 mbar, **−4 °C**, standing water over 44% |
| 20 C-type asteroids/yr for 300 yr, 10 m/s | 1,001 | 4 t | 83 mbar, **−2 °C**, water over 46% |
| 50 C-type asteroids/yr for 1000 yr, 10 m/s | 2,503 | 10 t | **321 mbar, +12 °C, 77% — no pressure suit** |
| 50 comets/yr for 1000 yr, 10 m/s | 5,631 | 23 t | **587 mbar, +18 °C, 97%** |
| 50 S-type (dry) asteroids/yr for 500 yr | 2,700 | 11 t | 44 mbar, −36 °C — heat, no air |

### Is there anything out there to throw?

The bomb bill is only half the problem. The other half is supply, and it kills the comet plan:

| Body | How many exist | How many come past per year |
|---|---|---|
| 10 km comets (Jupiter-family) | ~5 | **0.7** |
| 2 km comets | ~125 | ~17 |
| 10 km C-type Mars-crossers | ~70 | they sit still — you fetch them |
| 10 km asteroids in the belt | ~12,000 | you fetch them |
| 100 km asteroids in the belt | ~76 | you fetch them |

Fifty comets a year is **71× what the solar system delivers**. Catching *every* 10 km comet for a
thousand years would give 38 mbar; the entire Jupiter-family population is worth 129 mbar
once, and then it is gone. Comets are an upper bound on physics, not a plan.

The belt is a different story: ~37,000 mbar-equivalent of water sits in its carbonaceous rock, a
hundred times more than the programme needs. But 50 ten-kilometre rocks a year would empty the
supply of that size in 240 years — so move **fewer, bigger** bodies. The bill is per kilogram, so
one 100 km asteroid costs exactly what a thousand 10 km ones cost, and gives the same planet:

| Programme (C-type, 10 m/s nudge, mirrors +25%, PFC 100 Mt/yr) | Bodies used | Bombs a year | Result after 1000 yr |
|---|---|---|---|
| 50,000 rocks of 10 km, 50 a year | 50,000 of ~12,000 available ✗ | 2,503 | 321 mbar, +12 °C |
| **50 rocks of 100 km, one every 20 years** | **50 of ~76 available ✓** | **2,503** | **321 mbar, +12 °C, water over 77%** |
| 10 rocks of 100 km, one a century | 10 of ~76 ✓ | 501 | 106 mbar, +2 °C |

That is the shape of a real programme: not a bombardment of thousands of comets, but a few dozen
big carbonaceous asteroids, one every couple of decades, each nudged with the warheads of the
intervening years. The sandbox now prints the supply next to the bill and warns when you ask for
more bodies than exist.

Every one of those device counts is *below* what the world's reactors already make the plutonium
for. The limits that bite are the comets themselves (how many can be found and retargeted), the
mirror (2,300 km across), the perfluorocarbon plants (100 million tonnes a year, ~160 GW of power), and a
thousand years of not changing your mind. You would still have no oxygen to breathe.

The sandbox now prices this for you: the comet panel shows the nuclear bill per comet, per year,
in devices, plutonium and launch mass, and the energy gain. Those bursts happen in deep space, so
none of their fallout reaches the planet. Ready-made scenarios: **"A century of everything we
could build, at the poles"**, **"Bombs as comet-movers: 5 a year for 300 years"**, and **"The full
programme: 50 comets a year for a millennium"**.

---

## The other worlds

| World | Experiment | Result |
|---|---|---|
| **Venus** | a thousand world arsenals | 92 bar, 464 °C — nothing |
| | sunshade blocking 90% | still 92 bar, 141 °C |
| | sunshade blocking 97% | 92 bar, 34 °C |
| | sunshade blocking **98%** | **the CO₂ freezes out**: 2.1 bar of N₂ left at −119 °C |
| **Earth** | Sun 10% brighter | ice sheets melt, 23 °C |
| | Sun 18% brighter | 30 °C, oceans intact |
| | Sun 20% brighter | **runaway greenhouse** — past the 282 W/m² limit the oceans start to boil |
| | Sun 25% brighter | 254 bar of steam, 1292 °C, oceans gone, surface glowing |
| | 20% sunshade | −5 °C, ice to 28° latitude |
| **Moon** | 2,500 comets over 500 years | 35.7 mbar, +13 °C, liquid water |
| **Titan** | four times the sunlight | −149 °C — the air was never the problem |
| | Sun dimmed by 60% | the nitrogen rains out: 258 mbar, liquid-N₂ seas over 6% |
| **Pluto** | five times the sunlight | Sputnik Planitia sublimes: 20.5 mbar of N₂ at −225 °C |
| | a thousand arsenals on Sputnik Planitia | 1 Pa — it snows straight back out |
| **Triton** | five times the sunlight | 27.5 mbar of N₂ |
| **TRAPPIST-1e** | 2,500 comets | an atmosphere from nothing: 14.6 mbar, −34 °C |

Also: Mercury, Ceres, Io, Europa, Ganymede, Callisto and Enceladus, each with a stated
confidence — the model is best for Mars, Venus, Earth and Titan, rougher elsewhere.

---

## The model

A global-mean box model, not a GCM. Every world is calibrated so that, left alone, it holds its
observed pressure and temperature as a *stable* fixed point (all 15 are checked over 2000 years).

- **Greenhouse** — additive CO₂ and H₂O band terms with strong-line pressure broadening
  (p_eff = √(p_gas·p_total)), scaled by absorbed sunlight, plus collision-induced absorption
  (CO₂–CO₂, N₂–N₂, H₂O–H₂O) through an Eddington grey atmosphere. Three coefficients are fitted
  to Venus (737 K), Titan (93.7 K) and Earth (288 K) — and then predict, untuned, Earth's
  CO₂-doubling response: **+1.42 K** without feedback (literature ~1.2 K), **+1.78 K** with water
  vapour (~2 K).
- **Albedo** — clouds and hazes fade as the air goes; Rayleigh scattering brightens thick skies;
  water clouds appear on worlds that get wet.
- **Condensation** — saturation curves for CO₂ and N₂ with solid and liquid branches. Polar cold
  traps (Mars, Pluto, Triton) solve the cap/atmosphere equilibrium, taking the stable root;
  anywhere else, cool the world enough and the air rains out.
- **Water** — vapour at calibrated humidity, ice and ocean trading places with the ice line,
  and the **runaway greenhouse** past the Simpson–Nakajima limit (282 W/m², with hysteresis).
- **Escape** — Jeans parameter λ plus solar-wind stripping scaled to MAVEN.
- **Single detonations** — Glasstone & Dolan (1977): fireball 66 m·Y_kt^0.4 scaled for air
  density, crater 23 m·Y_kt^⅓ scaled for gravity, cloud top from the scale height, and the energy
  reaching the target divided by the energy needed to vaporise it. Cs-137 at 3.3 PBq per fission
  megaton.

### Verification

```bash
node -e "require('./src/planets.js');require('./src/climate.js').selfTest(true)"   # 16 checks
node test/model-test.js      # 32 — the Mars headline results
node test/worlds-test.js     # 14 — every world, thresholds, single detonations
node test/render-test.js     # 19 — the globe shows what the model says; the cloud's life
```

In the browser, `__TF.view.parityTest(300)` renders the surface classes on the GPU and checks
them against the click classifier.

### Sources

- Jakosky & Edwards 2018, Nature Astronomy 2, 634 — Mars' CO₂ inventory
- Forget et al. 2013, Icarus 222, 81 — the CO₂ greenhouse ceiling
- Marinova et al. 2005, JGR 110, E03002 — perfluorocarbon warming
- Goldblatt et al. 2013, Nature Geoscience 6, 661 — the runaway greenhouse limit
- Glasstone & Dolan 1977, *The Effects of Nuclear Weapons*
- NASA planetary fact sheets; MAVEN escape rates; Agol et al. 2021 (TRAPPIST-1e)

### Honest limits

Global mean only, and it jumps straight to equilibrium (no thermal inertia). No chemistry, dust
storms, seasons, ice-albedo feedback, Io's tidal heating, Titan's methane cycle, or nuclear
winter — on Earth the real danger of a nuclear war is soot, which is not in here. Airless
worlds' "mean temperature" is a radiative average, not what a thermometer would read at noon.
Terrain is procedural, not real topography. The nuclear coupling efficiency is a slider because
it is poorly constrained; the Mars conclusion holds across its whole range.

```
src/planets.js   15 worlds: inventories, thermodynamics, how each one looks
src/climate.js   radiation, greenhouse, condensation, escape + self-test
src/sim.js       interventions, single detonations, water, time integration
src/render.js    WebGL2 globe, ray-marched sky and mushroom clouds, close-up camera, CPU fallback
src/app.js       controls, click-to-detonate, charts, verdict
test/            verification
build.js         inlines everything into terraform.html
```

`window.__TF` exposes `sim`, `view`, `snapshot()`, `setWorld(key)`, `setScenario(key)`,
`run(years)`, `detonate(lat, lon, yieldMt)`, `focus(lat, lon, cloudTop_m)`, `exitFocus()` and
`lookAt(lat, lon, dist)` for driving it headlessly.
