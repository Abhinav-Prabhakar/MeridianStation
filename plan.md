# MERIDIAN — A Photoreal First‑Person Escape Room

**Working title:** *MERIDIAN — Deep Listening Station*
**Status:** Pre-production. This document is the build contract.
**Deliverable:** A browser‑native, first‑person, photoreal 3D escape room. Locked 60 FPS at 1080p on Apple silicon, 1440p‑class internal resolution with dynamic scaling.
**Engine:** Three.js (WebGL2) + Rapier physics + Web Audio.

---

## 0. Brief & Design Pillars

You are lowered into a decommissioned 1962 acoustic‑listening bunker beneath a university physics building, to retrieve a tape archive before the site is sealed. The hatch closes above you. The blast door is the only way out, and it is dead.

Tone: **analogue, cold, damp, dust‑in‑light**. Bakelite, brass, rivets, linoleum, condensation, tungsten. No neon, no sci‑fi gloss, no glowing crystals. Everything is a real object built by a real institution in 1962 and abandoned in 1979.

### Pillars

| # | Pillar | Consequence for implementation |
|---|--------|-------------------------------|
| P1 | **It looks like a photograph, not a game** | Baked GI, real photometric lights, photogrammetry‑grade materials, no untextured surface, no perfect edge, no pure white, no pure black |
| P2 | **Everything is a physical object** | Every drawer slides, every dial rotates, every valve turns, every switch clunks. Minimum ~180 grabbable/actuatable objects |
| P3 | **The room is the puzzle** | No floating UI puzzles. Information lives on paper, plaques, gauges, and film |
| P4 | **Non‑linear middle act** | Four wings solvable in any order; the map rewards exploration, not a corridor |
| P5 | **Never unfair, never boring** | Tiered diegetic hints; every failure is loud, obvious, and safe; every solved state is visible from across the room |
| P6 | **60 FPS is a hard constraint** | Performance budget is designed first, art second (§3) |

### What "more than simple puzzles" means here

Each wing requires **four kinds of interaction** stacked:

1. **Search** — find a physical object in a cluttered, believable space.
2. **Manipulate** — operate a mechanism with real feel (torque, resistance, sound, animation).
3. **Reason** — combine information from two or more locations.
4. **Consequence** — the room physically changes: panels open, steam vents, lights change, sound plays, dust falls.

No puzzle is "enter 4 digits from a note". Every code is *derived*, and every derivation has a physical artifact.

---

## 1. Technical Stack

| Layer | Choice | Why |
|---|---|---|
| Renderer | **three.js r170+**, WebGL2 | Mature, KTX2/meshopt loaders, full control over passes |
| Language | TypeScript + Vite | Fast HMR, typed systems |
| Physics | **Rapier** (WASM, ~900 KB) | Fast, deterministic, handles 60+ dynamic bodies trivially |
| Baked GI | **Blender Cycles → lightmap atlas** | The single biggest photorealism gain. Real bounced light |
| IBL | **Poly Haven HDRIs** (CC0) | Correct specular response on metal/glass |
| Materials | PBR metal‑rough, KTX2 (Basis) compressed | 4–8× texture memory reduction |
| Post | Custom pass chain: GTAO → bloom → AgX tonemap → grain/vignette → FXAA | Hand‑tuned, ~3 ms total |
| Audio | Web Audio, real‑time convolution reverb per room | Rooms must *sound* like concrete, anechoic foam, tile |
| Persistence | localStorage (save state) | Resume after refresh |

**Not using:** React‑three‑fiber (bundle + abstraction cost), WebGPU path (fallback complexity for zero visual gain here), any post‑processing library (they are slow and generic).

---

## 2. Photorealism Doctrine

Twelve non‑negotiable rules. A pass does not ship until all twelve hold.

1. **Every surface has albedo + roughness + normal + AO at ≥2K**, with macro variation at 4K (large‑scale dirt, water stains, paint patchiness). Tiling reads as CG instantly; macro variation kills it.
2. **Baked global illumination.** Sunless interior light is ~70% bounce light. Direct‑only lighting looks like a game. Bake irradiance into a 4K lightmap per zone; keep dynamic shadows only for the flashlight and the 3–4 hero movers.
3. **Physically correct exposure.** One global exposure (~EV 6 for interiors), lights specified in lumen/candela, no per‑object brightness fudging. `renderer.toneMapping = AgX`, `outputColorSpace = sRGB`.
4. **Contact shadows everywhere.** Nothing floats. Small AO decals + capsule AO under every prop. This is the #1 tell of amateur 3D.
5. **Imperfection pass.** Every surface gets: edge wear via curvature mask, a dust film on up‑facing normals, grime in crevices, fingerprints on glass, streaks under water sources, chipped paint at handle heights, scuff arcs on floors where doors swing.
6. **Structural density.** Rooms have skirting, cornices, door architraves, conduit runs, pipe brackets, cable trays, patched plaster, mismatched paint patches, bolts, rivets, hinges with screws, floor drains. Empty wall = failed room.
7. **Prop scatter.** No prop is axis‑aligned. Papers askew, chairs turned, boxes stacked by a human, a mug left where someone put it down. 8–20 loose small items per room.
8. **Volumetrics, cheap.** Dust motes (GPU point sprites, 2–4k, ~0.2 ms), steam in the boiler room, haze density per room. God rays only through the basement grate and the blast door crack.
9. **Lens realism.** 60–65° vertical FOV, subtle chromatic aberration at edges, vignette, 1.5% film grain, bloom threshold high enough that only real light sources bloom. No motion blur (cost + nausea), no fake DOF except during inspect mode.
10. **Body presence.** Visible forearms + hands with IK, a held flashlight, footstep bob and sway. The camera is a head, not a drone.
11. **Sound sells the image.** Convolution reverb per room, surface‑correct footsteps (concrete/linoleum/water/metal grating), object‑specific foley. Silent rooms look fake.
12. **Nothing is clean, nothing is symmetric.** Asymmetry in wear, object placement, and light falloff.

### Texture/material library (target: ~28 materials)

Concrete (poured, board‑formed, painted), painted brick, glazed tile (white + green), linoleum tiles (green/cream, worn), terrazzo, hardwood (oak strip), steel (painted, rusted, galvanised, bare), cast iron, brass (polished, tarnished), copper, aluminium, bakelite (black, brown), rubber, leather, canvas, wool felt, paper (aged, fresh), cardboard, glass (window, bottle, instrument), dust, water, foam wedge, mirror, photographic paper.

---

## 3. Performance Budget

Target hardware: Apple M1/M2/M3, Safari/Chrome. Frame budget **16.6 ms**.

| Budget line | Limit |
|---|---|
| Draw calls / frame | ≤ **320** (merged static geometry + instancing) |
| Triangles visible | ≤ **1.4 M** |
| Dynamic shadow‑casting lights | ≤ **3** (flashlight, 1 hero, 1 room light) |
| Shadow map resolution | 1024 (flashlight), 2048 (hero) — PCSS filtered |
| Point/spot lights (non‑shadow) | ≤ **24** visible, clustered by room |
| Texture VRAM | ≤ **1.4 GB** (KTX2, streamed per zone) |
| Lightmap | 2 × 4096² atlas per zone, 2 zones resident |
| Post‑processing | ≤ **3.0 ms** |
| Physics bodies | ≤ **120** active, sleeping enabled |
| Dynamic resolution | 0.65× – 1.0× render scale, targeting 16.6 ms with 1.5 ms headroom |
| Load time | ≤ 8 s first paint, ≤ 1.5 s per zone transition (pre‑warmed) |

### Frame cost breakdown (design target)

| Stage | ms |
|---|---|
| JS game logic + input | 2.0 |
| Physics step | 0.8 |
| Shadow maps | 1.6 |
| Opaque geometry | 3.8 |
| Transparent + volumetrics | 1.2 |
| Post chain | 3.0 |
| UI/compositing | 0.6 |
| **Headroom** | **3.6** |

Mitigations if over budget, in order: (1) reduce render scale, (2) cut volumetrics, (3) reduce lightmap residency, (4) drop shadow map to 1024 and disable PCSS on non‑hero, (5) halve dust particle count. **Never** cut material maps or baked GI — those are the look.

Occlusion strategy: room‑granular PVS. Each room's geometry is a separate merged group; only rooms adjacent to the player's room render. Rotunda can see all four corridor mouths — corridors are always resident (cheap, low poly).

---

## 4. World Map

### 4.1 Plan view (top‑down, north = −Z)

```
                          ┌────────────────────────────────────────┐
                          │      RECORDS & CIPHER  (10 × 8)        │
                          │   card catalog · safe · tube station   │
                          │        ╔═══ STAIR ⌃ ═══╗               │
                          │        ║  OBSERVATION  ║  (above)      │
                          └────────╨──────┬────────╨───────────────┘
                                          │ N corridor (2.4 w)
   ┌──────────────────┐          ┌────────┴────────┐          ┌───────────────────┐
   │   DARKROOM       │          │                 │          │  ANECHOIC         │
   │   & PHOTO LAB    │          │    ROTUNDA      │          │  CHAMBER          │
   │   (7 × 6)        ═══════════╡   r = 6.0 m     ╞══════════│  (9 × 9)          │
   │  safelight·trays │ W corr.  │  8 faces        │ E corr.  │  wedges·oscillo   │
   └────────┬─────────┘          │  patchboard     │          └───────────────────┘
            │ crawlspace         │  · exit NE ══╗  │
            │ (1.1 × 1.2)        │  · fuse SW    │  │
            │                     │  · lift NW    │  │
   ┌────────┴─────────┐          └────────┬────────┘  │
   │  BOILER &        │                   │ S corridor│
   │  MACHINE ROOM    ═════════════════════╡           │
   │  (11 × 9)        │                   │           ╰──▶  BLAST DOOR
   │  valves · gauges │                   │               (sealed, NE face)
   │  [hatch ⌄]       │                   │
   └────────┬─────────┘                   │
            │                             │
   ╔════════╧══════════════════════════════════════════════╗
   ║  SUB‑LEVEL DRAINAGE TUNNEL (y = −3.4)  ~40 m of pipe   ║
   ║  loop: machine room → crawl → darkroom back wall       ║
   ╚═══════════════════════════════════════════════════════╝
```

### 4.2 Rotunda faces (octagon, r = 6.0 m, h = 5.5 m)

| Face | Bearing | Content |
|---|---|---|
| 1 | N | Corridor → Records |
| 2 | NE | **BLAST DOOR** (exit) — 1.9 × 2.6 m, 8 dogging bolts, gear box, 4‑digit dial, 4 solenoid lamps |
| 3 | E | Corridor → Anechoic |
| 4 | SE | Notice board, drinking fountain, fire hose reel |
| 5 | S | Corridor → Machine Room |
| 6 | SW | **Electrical cage** (chain‑link, padlocked) — fuse panel, wiring diagram |
| 7 | W | Corridor → Darkroom |
| 8 | NW | **Lift shaft** — stalled car at y = +4.2, inspection hatch, maintenance ladder |

### 4.3 Coordinate & size table

| Zone | Centre (x, y, z) | Footprint | Ceiling | Floor |
|---|---|---|---|---|
| Rotunda | 0, 0, 0 | r = 6.0 (octagon) | 5.5 | Terrazzo, brass inlay |
| N corridor | 0, 0, −9.0 | 2.4 × 6.0 | 3.2 | Linoleum |
| Records | 0, 0, −17.0 | 10.0 × 8.0 | 3.6 | Oak strip, rugs |
| Dome (L2) | 0, 5.0, −17.0 | r = 4.0, apex 9.0 | — | Timber deck |
| E corridor | 9.0, 0, 0 | 6.0 × 2.4 | 3.2 | Linoleum |
| Anechoic | 17.0, 0, 0 | 9.0 × 9.0 | 4.2 | Foam over grating |
| S corridor | 0, 0, 9.0 | 2.4 × 6.0 | 3.2 | Linoleum → steel plate |
| Machine room | 0, 0, 17.0 | 11.0 × 9.0 | 5.0 | Steel plate, standing water |
| W corridor | −9.0, 0, 0 | 6.0 × 2.4 | 3.2 | Linoleum |
| Darkroom | −14.0, 0, 0 | 7.0 × 6.0 | 3.0 | Tile, sloped to drain |
| Sub‑level | varies | 1.6 w tunnel | 2.2 | Wet concrete |
| Blast door lock | 0, 0, 0 → NE | 2.0 × 3.0 recess | 3.0 | Steel |

Total interior floor area **≈ 505 m²**. Distinct rooms: **6 major, 4 minor**.

### 4.4 Zones & transitions

- 10 zones. Each zone has its own lightmap atlas, HDRI probe, reverb impulse, and audio bed.
- Doors are real hinged meshes with physics constraints (self‑closing springs on fire doors).
- Two vertical transitions: stair to dome (10 steps, 3.9 m rise), ladder/hatch to sub‑level (−3.4 m).
- One crawlspace (0.9 m tall) between tunnel and darkroom — deliberately claustrophobic, flashlight‑only.

---

## 5. Room Dossiers

Format per room: **architecture → materials → props → lighting → interactions → puzzle → hints → audio → failure/reset.**

---

### 5.1 THE ROTUNDA — *Hub*

**Role:** Orientation, master puzzle, the exit. The emotional centre.

**Architecture:** Octagonal room, 12 m across, 5.5 m to a coffered plaster ceiling. Eight engaged pilasters with simple capitals. A raised terrazzo floor with a brass compass rose inlay at centre (the station's crest). Four corridor mouths with glazed fire doors (wire‑mesh glass, brass handles). Ring of steel conduit at 3.4 m. A cantilevered mezzanine ledge at 3.0 m on the SE face with the notice board.

**Materials:** Terrazzo (dark green/cream chip), painted plaster (faded institutional cream, water‑stained), brass inlay, glazed tile dado to 1.2 m, steel doors, black rubber kick plates.

**Props (34):** patchboard console (3.2 m wide, bakelite panels, 24 jacks, 6 cords, 4 meters); station clock (stopped at 04:12); duty roster board with sliding name plates; fire hose reel; drinking fountain; notice board with 9 pinned papers; two canvas‑backed chairs; a coat rack with one coat; a mop bucket; a floor drain; wall phone (dead until power); 4 emergency bulkhead lamps; a faded floor plan in a brass frame; 3 crates; a hand truck; a wall‑mounted first‑aid box (contains a **flathead screwdriver**); a scattered set of keys (red herrings, 5 keys); 6 cigarette butts; a fallen chair; cable runs.

**Lighting:**
| Fixture | Type | Temp | Intensity | Notes |
|---|---|---|---|---|
| 4 bulkhead lamps | Point | 2400 K | 40 lm each | Emergency state: only light at start |
| Ceiling pendant ring (6 × opal globes) | Point | 2700 K | 900 lm | Off until power restored, then warm bloom |
| Corridor spill | Rect area (baked) | 2700 K | — | Bounced pool of light at each mouth |
| Blast door crack | Spot | 6500 K | 120 lm | Cold night light leaking in — the goal is always visible |
| Dust shaft from NW vent | Spot (volumetric) | 4200 K | 300 lm | Pale beam, dust motes |

**Interactions:** heavy hinged corridor doors; patchboard cords (grab, drag, plug — 6 cords, 24 sockets, spring resistance); meter needles twitch with live channels; clock hands can be turned (red herring, but readable for time); wall phone (lift handset, dial tone after power); notice board papers readable and takeable; first‑aid box latch; hose reel crank; crates pushable (physics); chairs; brass floor plan readable.

**Puzzle — The Patchboard (master gate):**
- Console has **4 channel strips** (A/B/C/D), each with a lamp, a meter, and a source jack. And **4 solenoid jacks** on the door side, each engraved with a symbol: **⌖ (circle‑cross), ▲ (triangle), ≋ (wave), ✦ (star)**.
- A channel strip is *dead* until its wing puzzle is solved. Then its lamp glows amber and its jack goes live.
- Player must run a cord from each live channel jack to the **matching symbol** solenoid jack. The symbol mapping is learned from a memo in Records (§5.3). Lucky‑guessing is possible but punished (see failure).
- All four correctly patched simultaneously → the blast door's 4 lamps turn green and the gear box unlocks (Stage 1 of the finale).

**Hints:**
1. "The board wants four signals. Four wings. Four lamps."
2. "Every channel has a symbol stamped on its plate. The door wants the same symbols."
3. "The memo in Records lists them in order: A = ⌖, B = ▲, C = ≋, D = ✦." (direct)

**Failure:** wrong routing → main breaker trips: a hard *bang*, ceiling lights die, one cord pops out, meter needles slam. Player must walk to the SW cage and reset the breaker (5 s). Loud but safe. Teaches the cage location early.

**Audio:** vast stone reverb (RT60 2.4 s), clock tick (stopped — silence is the tell), distant water drip, mains hum that *starts* when power returns (huge emotional beat), door hinges.

---

### 5.2 ELECTRICAL CAGE (Rotunda SW) — *Act 1 gate*

**Architecture:** A chain‑link enclosure 2.2 × 1.8 m built against the rotunda wall, padlocked. Inside: a 1962 slate‑backed fuse panel, a brass wiring diagram in a glass frame, a dead man's switch, cable glands.

**Props (8):** padlock (needs **bolt cutters** or the key from the sub‑level satchel — two solutions, both valid), fuse panel (6 slots: 5A, 10A, 15A, 20A, 5A, 25A), 2 blown fuses already present (scorched, obviously dead), a wiring diagram, 3 spare bulbs, an earth strap, a wooden stool.

**Lighting:** single caged bulkhead lamp, 2700 K, 60 lm, buzzing. Hard shadows through the chain‑link (alpha‑tested, casts shadow — beautiful).

**Puzzle — Power:**
- 4 fuses missing. The panel's slots are stamped with ratings; the diagram inside the cage door states which circuit needs which rating.
- Fuses hidden (one per wing): **(10A)** machine‑room toolbox drawer, **(15A)** Records card catalog drawer "D", **(20A)** darkroom icebox, **(5A)** behind an anechoic wedge panel (needs the **putty knife**).
- Two decoy fuses with wrong ratings, visibly blown.
- Insert all four correct → main contacts close, whole station powers up in a staged cascade: rotunda pendants strike one by one (visible!), corridor lights, machine‑room fluorescents flicker on, the anechoic chamber's relay clicks, the patchboard hums.

This is the game's **best single moment**. Build the cascade deliberately: lamps strike left‑to‑right with individual ballast clicks, dust shakes loose from the ceiling.

**Hints:**
1. "Six slots. Four empty. Each slot is stamped with a number."
2. "The diagram behind the glass says which circuit takes which rating. Read it before you shove anything in."
3. "10A from the machine room, 15A from the catalog drawer marked D, 20A from the darkroom icebox, 5A from behind the anechoic wedge."

**Audio:** buzz → silence → *clunk* → rising hum → six ballast strikes → room tone bloom.

---

### 5.3 RECORDS & CIPHER ROOM — *North wing*

**Role:** Information hub. Teaches the symbol mapping. Contains the hidden safe. Holds the stair to the Dome.

**Architecture:** 10 × 8 m, 3.6 m ceiling. Oak strip floor with two worn runners. Painted brick walls, glazed tile dado. A mezzanine stair (open steel, 10 risers) climbs the north wall to a timber landing and the Dome door. Four tall windows with **painted‑over glass** (no daylight — sells the bunker). Fluorescent troffers (2, one dead). A bank of 6 filing cabinets. A 60‑drawer oak card catalog, 2.2 m tall. A reading table with a green banker's lamp. A pneumatic tube station (brass, 1.8 m) with a capsule stuck in the chute. A wall map of the North Atlantic under perspex, with 40 push‑pins and string. An adding machine. Two armchairs. A dead potted plant.

**Props (78):** 60 catalog drawers (individually openable, 1 in 4 contains a real index card); 6 filing cabinet drawers (3 have folders); 9 folders with readable documents; 4 ledgers; typewriter (keys depressible per key, ribbon dry); 3 desk lamps; 12 loose pens; stapler; hole punch; rubber stamps (4, one is a *symbol stamp* — used later); ink pad; 2 telephones; wall clock; fire blanket; waste bin with crumpled paper (readable, one is a hint); 3 boxes of index cards; a projecting‑table microfilm reader with a **microfilm reel** (contains the dome star chart); a 1.2 m brass telescope in a case aimed at nothing.

**The cipher (core puzzle):**
- On the duty roster board: four officers and their **shift order** (1st, 2nd, 3rd, 4th), names partially obscured.
- The card catalog is alphabetised *by surname*. Each officer's drawer contains a card with a **3‑character station code** (e.g. `A7Q`).
- A wall placard: *"STATION CODES ARE READ BY SHIFT. THE ADDING MACHINE SUMS THE FIGURES."*
- Pull the four codes in shift order, sum the numeric digits on the adding machine (a real, tactile calculator — you press the keys), → a **4‑digit number**.
- That number opens the wall safe behind the map (safe dial: drag‑rotate, with the satisfying click at each correct stop, and a "feel" rumble via haptics/audio).

**Safe contains:** the **symbol memo** (A = ⌖, B = ▲, C = ≋, D = ✦), a **punched tape** (Channel A token), a brass **padlock key** (alternate route into the electrical cage), and a **personnel file** with story.

**Secondary discovery — the stuck capsule:** a capsule is jammed in the tube chute at head height. You can see it, not reach it. Pull it out with the **wire hook** (found in the machine room) or by cycling the tube system (needs compressed air — machine room valve V3). Inside: the **microfilm reel** → read on the microfilm reader → the dome star chart. Two solutions, both physical. Good.

**Lighting:**
| Fixture | Type | Temp | Intensity |
|---|---|---|---|
| 2 ceiling troffers | Rect area (baked) | 4000 K | 2 × 1400 lm (one dead, flickers on power‑up) |
| Banker's lamp | Point | 2700 K | 220 lm, warm pool on the table |
| Microfilm reader | Point | 3200 K | 90 lm, tight cone |
| Stair bulkhead | Point | 2400 K | 60 lm |
| Window fake bounce | Baked | 5200 K | — (cool rim on the map wall) |

Strong warm/cool contrast: tungsten pool at the table against cold fluorescent overheads. This room is the game's "cozy" image.

**Interactions:** 60 drawers slide with wood‑on‑wood resistance and a stop; folders lift out; documents go to inspect mode (full‑screen readable, can be carried); adding machine keys with number wheels; safe dial with 40 detents and haptic clicks; map pins can be moved; string can be re‑routed; typewriter; microfilm crank (advances frames); telescope focus; stair gate at top (opens after 2 channels).

**Hints:**
1. "Nobody remembers a name they never filed."
2. "The roster has an order. The catalog has surnames. The machine adds."
3. "Shift order 1→4: Voss (A7Q), Aldritch (K2M), Pryce (R9D), Bell (B4B). Sum the figures: 7+2+9+4 = 22 … the safe wants four digits — read the placard again: codes are read by shift, figures summed in pairs."

**Audio:** quiet room, ticking clock, paper, drawer rumble, the adding machine's mechanical *chunk* per keypress, the safe's tumblers.

---

### 5.4 THE OBSERVATION DOME — *Upper level, north*

**Role:** Story climax, symbol verification, final code ordering. Visual showpiece.

**Access:** Steel stair from Records, gated at the landing. Gate opens once **2 of 4** channels are live (interlock lamp on the gate shows progress — no signposting text needed).

**Architecture:** A 4 m radius dome, apex 9.0 m, timber deck floor, copper‑lined interior with 1960s star chart panels. A slit aperture 0.4 m wide runs up the dome's north face to the sky, with a canvas cover that can be cranked open. A brass **orrery/star projector** (1.4 m, 12 rings, 40 constellation pins) at centre. A desk with the station log. A wall of 24 pigeonholes with rolled charts. A 6‑inch refractor on a pier.

**Lighting:**
| Fixture | Type | Temp | Intensity |
|---|---|---|---|
| Slit light (aperture open) | Directional, cool | 7200 K | 0.35 lux, soft shadows |
| Gooseneck map lamp | Point | 2400 K | 120 lm |
| Star projector bulb | Point | 3000 K | 40 lm (projected points on dome) |
| Bounce off copper dome | Baked | — | warm gradient |

With the slit open, a cold grey blade of light cuts the room and mist drifts in. **This is the money shot.** Reserve the best HDRI probe and the highest lightmap density (2048 px/m) for this room.

**Puzzle — Alignment:**
- The star chart (microfilm, §5.3) shows 4 constellations with their **right ascension** and the dome's copper panels are engraved with RA scales.
- Set 4 brass pins on the orrery to the charted positions. Each pin seats with a detent. Wrong position = the projector lamp stays dark.
- All 4 correct → the projector lamp ignites, the dome fills with a star field (real NASA/Gaia star catalogue subset — authenticity), and the **teletype** in the corner prints a strip:

  `SIGNAL LOCKED / SEQ: A-C-D-B / PRESSURE FALLS / HURRY`

- This gives the **final code's digit order** (each channel token carries one digit) and the endgame warning.

**Interactions:** canvas cover crank (chain, 12 turns, dust avalanche); pin placement (pick up, insert, rotate to detent); telescope (look through: real refractor view of the star field, focus knob); telescope pier bolts; station log (a readable ledger with the story, and a **hint page**); pigeonhole charts; the projector's 12 rings can be individually rotated (red herrings, but they move the star field — beautiful).

**Audio:** dome reverb is *enormous* (RT60 4.5 s), wind through the slit, the teletype's mechanical chatter, the projector's tiny motor.

---

### 5.5 THE ANECHOIC CHAMBER — *East wing*

**Role:** The audio puzzle. The most uncanny room.

**Architecture:** 9 × 9 m, 4.2 m ceiling. **Every surface** clad in 30 cm fibreglass wedge foam on a steel mesh substrate — walls, ceiling, floor (floor is foam over a grating, slightly springy underfoot). The wedge count is ~4,800 → **instanced mesh, one draw call.** A heavy steel door with a submarine wheel and a rubber gasket. Suspended steel catwalk to the centre. A measurement microphone on a boom. A control desk with an oscilloscope, signal generator, and tape machine. A velvet‑lined case with 4 tuning forks.

**The acoustic conceit:** this room has **RT60 ≈ 0.15 s**. On entering, the game *removes* reverb. Footsteps go dead. Your own breathing is the loudest thing. Players notice instantly and it's genuinely unsettling. (Technical: swap the convolver impulse for a near‑dry one + gentle high‑shelf rolloff.)

**Props (32):** 4 tuning forks (A3 220, C4 261.6, E4 329.6, G4 392 — labelled, in velvet); signal generator with coarse/fine/amplitude knobs and a real LED readout; oscilloscope with a live waveform (procedural, audio‑driven); tape machine (reel spins, plays a 40 s recording of the last technician — story + hint); boom microphone; 6 patch cables; a resonance chart on the wall (brass plate); 2 folding chairs; a fire extinguisher; a clipboard; the loose wedge panel (behind which is the 5A fuse).

**Puzzle — Resonance:**
- The chart states: *"The chamber rings at the sum of the case tones, halved."* → (220 + 261.6 + 329.6 + 392) = 1203.2 Hz → **601.6 Hz**.
- Set the generator: coarse knob (100 Hz steps), fine knob (1 Hz steps), amplitude to max. Turn it on.
- The oscilloscope shows the live waveform; a **resonance meter** peaks when within ±3 Hz of 601.6. The room audibly *hums*, the wedges vibrate, dust falls from the ceiling, and the catwalk rattles — a full-body payoff.
- Hold the peak for 3 s → a relay clicks, a wedge panel swings open, revealing the **Channel B token** and a **bakelite key**.

**Accessibility:** the puzzle is fully solvable with sound off (meter + scope + numeric readout). Never require hearing.

**Lighting:**
| Fixture | Type | Temp | Intensity |
|---|---|---|---|
| 2 caged work lamps | Point | 3200 K | 300 lm, hard shadows through cages |
| Oscilloscope glow | Emissive + point | 5200 K | 25 lm (green trace, is the only cool light) |
| Indicator strip | Emissive | 2100 K | 10 lm |
| Door gasket leak | Rect (baked) | 2700 K | spill from corridor |

Because the foam is near‑black and eats light, this room is a **low‑key** image: two small hard pools, deep crushed shadows, the green scope glow. Excellent for demonstrating the lighting engine.

**Hints:**
1. "Four forks in a case. A chart that mentions a sum."
2. "Add the four fork frequencies, then halve. The generator's fine dial is 1 Hz."
3. "220 + 261.6 + 329.6 + 392 = 1203.2. Halve → 601.6. Set coarse 600, fine 01.6."

---

### 5.6 BOILER & MACHINE ROOM — *South wing*

**Role:** Physical labour, tool gating, the sub‑level entrance, the door crank. The "dirty hands" room.

**Architecture:** 11 × 9 m, 5.0 m ceiling, exposed steel roof trusses, painted brick, a riveted horizontal **Lancashire boiler** (4.5 m long, 1.8 m diameter) on a brick plinth, a coal bunker, a feedwater pump, a 3‑cylinder diesel generator set on a steel bed, an overhead gantry with a chain hoist, a workbench, a parts rack, and a **floor hatch** (1.2 × 1.2, bolted, 4 wing nuts) into the sub‑level. Standing water on the floor, 2–6 cm, with real reflections. Pipes everywhere — 40+ runs, lagged, dripping.

**Props (64):** 4 valve wheels (V1–V4, each with a different turn count and resistance); 3 pressure gauges (boiler, line, header) with needles; a placard with target pressures; coal pile + shovel + scuttle; **toolbox** (pipe wrench, wire hook, oil can, spare fuses/grease); workbench with vise and 12 tools; chain hoist (operable, lifts a 200 kg crate — physics); gantry trolley; parts rack with 40 labelled bins; 2 oil drums; rag pile; a bucket; a dead radio; 3 work lamps; a wall phone; a first‑aid box; a lunch tin with a note; the **crank handle** hanging on a peg (rusted — needs the oil can); 6 gauges; the hatch; a hand pump.

**Puzzle — Steam pressure (sequence + feedback):**
- Placard: *"START ORDER — BYPASS, FEED, FIRE, LINE."*
- **V3 (bypass)** open 3 turns → **hand pump** 12 strokes (visible on the feed gauge) → **V1 (feed)** open → **V2 (fire)** open → wait for the boiler gauge to climb to 60 psi (about 8 s of real animation: gauge sweeps, pipes tick and bang, steam vents) → **V4 (line)** open slowly (each turn vents steam; too fast trips the relief valve).
- Wrong order → the relief valve **screams**, a steam plume fills the room (volumetric, 2 s, heavy), the gauges drop, and you must close everything and restart. Safe, loud, memorable — not a fail state.
- Success → the furnace door swings open showing a glowing coal bed (**the best light source in the game** — a flickering 1400 K point light + emissive + smoke), revealing the **Channel C token** and the **oil can**.

**The crank handle** is the blast door's manual drive. It's rusted solid; pour **oil** on the gear, work it (a few cranks of resistance), and it comes free. This is *the* tactile moment of the game — heavy, squealing, then smooth.

**The hatch** → sub‑level. Four wing nuts (each needs a half‑turn with the pipe wrench — no bare‑hand cheat), then the hatch lifts with a groan and a cold updraft. Below: darkness, dripping, and a **ladder**.

**Lighting:**
| Fixture | Type | Temp | Intensity |
|---|---|---|---|
| 3 industrial fluorescents | Rect area (baked) | 4200 K | 1800 lm, one flickering (dynamic, 0.15 s stutter) |
| Furnace (after puzzle) | Point, flickering | 1400 K | 4000 lm, animated noise |
| Work lamp on bench | Point | 2900 K | 250 lm |
| Grate to outside | Spot, volumetric | 6500 K | 500 lm — god ray through dust and steam |
| Water bounce | Baked | — | caustic‑ish moving reflection (cheap: 1 animated normal map) |

This is the highest‑contrast room: cold fluorescent overheads, warm furnace, blue‑grey daylight shaft. Steam + dust motes. **This room proves the volumetric budget.**

**Hints:**
1. "The placard has an order. The valves are numbered. The pump counts."
2. "Bypass first — or the feed just hisses. Twelve strokes, then feed, then fire, then watch the gauge to 60 before the line."
3. "V3 → 12 pump strokes → V1 → V2 → wait for 60 psi → V4 slowly (a quarter turn a second)."

**Audio:** machine room reverb is short and metallic (RT60 1.1 s) with flutter echo; water drips with per‑drop pitch variation; steam hiss; pipe bangs; the generator's idle thrum; the hoist chain.

---

### 5.7 SUB‑LEVEL DRAINAGE TUNNEL — *Below machine room*

**Role:** Darkness, claustrophobia, the tool/lore cache, the crawlspace shortcut.

**Architecture:** A 1.6 m wide barrel‑vaulted concrete tunnel, 2.2 m high, running ~40 m in an L, with a 15 m side branch. Standing water 5 cm, silt, 6 pipe runs overhead, cable trays, a junction box, 3 caged lamps (2 dead, 1 flickering). The crawlspace (1.1 × 0.9) at the west end into the darkroom's back wall (blocked by a loose board).

**Props (26):** a **dead technician's satchel** (torch, batteries, a letter, the darkroom negative, the cage padlock key); a rusted tool chest with the **bolt cutters**; 3 valve access panels; a submerged crate (physics); rats (ambient, non‑interactive, 3 instances, flee from light); old signage; a **junction box** with 6 unlabelled breakers; 8 pipes with valves; a floor sump with a pump; a broken ladder.

**Lighting:** Nearly none. **The flashlight becomes the whole game.** Flashlight = SpotLight 2600 K, 35° cone, 1024 shadow map, PCSS, with a subtle hand‑held sway and a battery‑driven falloff. Water reflects it directly. Dust in the beam. Volumetric cone (cheap: 12‑step raymarch in a small volume, or a cone mesh with a fresnel shader — pick the mesh, cheaper).

**Puzzle — Junction box (mini):** 6 breakers, 2 live (labeled on the satchel's card). Restoring the tunnel lamp reveals a **wall map etched into the concrete** showing the crawlspace route and, scratched into the plaster, the words *"HE NEVER LEFT"* + a 4th‑wall‑breaking jagged arrow to the satchel. Pure atmosphere + route knowledge.

**Audio:** the most important audio in the game. Dripping, distant pipe knocks, water underfoot, your own breathing, and a low 40 Hz rumble. Silence is used deliberately here — when the player stops moving, the ambience thins out, which is *worse*.

---

### 5.8 DARKROOM & PHOTO LAB — *West wing*

**Role:** The tactile set piece. Red light. The fourth channel.

**Architecture:** 7 × 6 m, 3.0 m ceiling. Glazed white tile to 1.8 m, painted above (peeling). A sloped floor to a central drain. A long stainless sink (2.4 m) with 3 developing trays, a print washer, and a hanging wire with 7 pegs. An enlarger on a bench with a bellows and a red filter. A drying cabinet. Shelves of chemical bottles. A blackout curtain to the corridor (light‑tight, weighted). A **crawlspace board** in the back wall (loose — the tunnel shortcut). An icebox (contains a fuse).

**Props (41):** 3 trays (developer / stop / fixer — each with liquid and a distinct sheen); enlarger (lamp, lens, focus, bellows, negative carrier); 4 tongs; a timer clock with a big sweep hand; 12 chemical bottles with hand‑written labels; 7 hanging prints (readable when inspected — some are story, some are deliberately blown‑out); a **box of blank photo paper** (12 sheets); a light‑proof negative bag; the **negative** from the tunnel; a film clip; a squeegee; a UV lamp (for invisible ink, later); the icebox; a stool; a wall calendar (April 1979); a "KNOCK FIRST" sign.

**Puzzle — Develop the negative:**
1. Safelight only. Turn on the enlarger → **the room must go dark except the red safelight** (enforce it: white light would fog the paper — the game can even fog it if you try, teaching the rule by consequence).
2. Clip the negative into the enlarger carrier, focus, set exposure, place a sheet of paper, expose (4 s, red filter up).
3. **Develop:** slide the paper into tray 1, rock the tray (hold and drag — the image emerges as a real progressive texture reveal), 12 s. **Too long = black, too short = blank.** Then stop bath (3 s), then fixer (10 s), then hang on the wire.
4. The print shows a photograph of the rotunda's compass rose with **four symbols chalked onto it** and a date stamp `17·04·79`. The symbols confirm/override the memo — and one symbol is **hand‑corrected**, which is the *actual* mapping (a deliberate story beat: the memo is stale).

This is the best "physical satisfaction" moment in the game. The image literally develops on the paper under your hands.

**Deliverables:** Channel D token, the corrected symbol mapping, and the date `1704` as a possible red‑herring for the final dial.

**Lighting:**
| Fixture | Type | Temp | Intensity |
|---|---|---|---|
| Safelight | Point, deep red (620 nm) | 1900 K‑ish | 45 lm |
| Enlarger lamp | Spot, tight cone | 3000 K | 200 lm, only when on |
| Corridor leak under curtain | Rect (baked) | 2700 K | thin warm strip |
| Drain reflection | Baked | — | subtle |

The safelight is the hardest lighting problem in the project: a **single saturated red source** in a small room with high‑albedo white tile. Must not clip to magenta. Requires a dedicated 3‑channel lightmap bake with a red‑weighted white balance, and a small chromatic adaptation in the tonemapper (partial, not full — keep it red). Test against a real darkroom photograph.

**Hints:**
1. "The negative is the point. The enlarger is the machine."
2. "Clip it, focus it, expose it, then three trays — developer, stop, fixer. Twelve, three, ten."
3. "Developer 12 s with a gentle rock, stop 3 s, fixer 10 s, then hang it up and look at the symbols."

---

### 5.9 THE BLAST DOOR — *Finale (Rotunda NE)*

**Architecture:** A 1.9 × 2.6 m steel door, 42 cm thick, 8 radial dogging bolts, a cast gear box on the right, a 4‑digit dial, four solenoid lamps in a row, a spine of conduit, and a rubber gasket with a thin blade of **cold night light** underneath from frame one.

**Final sequence (three stages, each with its own sound):**

**Stage 1 — Power the solenoids.** All 4 channels patched correctly. Lamps go amber → green one at a time as each is verified. A deep hum rises.

**Stage 2 — Mechanical unlock.** Insert the **crank handle** into the gear box; crank 8 full turns. Each turn: a dogging bolt retracts with a *clunk* and a puff of rust dust, the crank fights you more on turns 4–6 (resistance animation + creak), then frees. After turn 8 the door shifts 4 mm and the blade of light widens.

**Stage 3 — The dial.** A 4‑digit mechanical combination dial (drag‑rotate with detents). The digits come from the four channel tokens, ordered by the dome teletype (`A‑C‑D‑B`). Enter, pull the latch. 

**The opening:** the door swings with real weight, fog pours in, cold air pushes dust across the floor, the outside HDRI (night, sodium lamp, wet asphalt, a stairwell up) blows out the exposure, the audio drops to wind and distant traffic, the camera does a slow push forward and up. Fade to a title card. **No jump scare. The release is the point.**

**Fail state:** wrong code = a solenoid buzz and a 2 s lockout. No punishment.

---

## 6. Progression & Dependency Graph

```
WAKE (sealed)
   │
   ├─▶ Explore rotunda → find notice board, floor plan, dead phone
   │
   ├─▶ [TOOL] first-aid box → screwdriver
   │
   ├─▶ ELECTRICAL CAGE ── needs 1 padlock solution
   │        │
   │        ├─ 4 fuses hidden in 4 wings  ──────────────┐
   │        │  (10A machine · 15A records ·            │
   │        │   20A darkroom · 5A anechoic)            │
   │        ▼                                          │
   │     POWER RESTORED ────────────────────────────▶ all lights + patchboard live
   │
   ├─▶ RECORDS ── roster + catalog + adding machine ─▶ SAFE
   │        │                                          │
   │        ├── SYMBOL MEMO (A⌖ B▲ C≋ D✦) ────────────┤ enables patchboard
   │        ├── PUNCHED TAPE → Channel A              │
   │        ├── PADLOCK KEY (alt. cage route)         │
   │        └── stuck capsule → microfilm → STAR CHART┘
   │
   ├─▶ ANECHOIC ── fork case + chart + generator ─▶ Channel B
   │
   ├─▶ BOILER ── valve sequence + pump ─▶ Channel C + OIL CAN + crank oiled
   │        └── hatch (pipe wrench) ─▶ SUB-LEVEL
   │                 ├── SATCHEL: torch, NEGATIVE, cage key
   │                 └── BOLT CUTTERS (alt. cage route)
   │                 └── crawlspace ─▶ DARKROOM (shortcut)
   │
   ├─▶ DARKROOM ── negative + enlarger + 3 trays ─▶ Channel D
   │                                          └── CORRECTED SYMBOL MAP
   │
   ├─▶ [2 channels] DOME opens ── 4 pins + star chart ─▶ CODE ORDER (A-C-D-B)
   │                                                    + teletype warning
   │
   └─▶ BLAST DOOR ── 4 cords + crank + 4-digit dial ─▶ OUT
```

**Branching & optional content:**
- Two routes into the electrical cage (bolt cutters *or* the satchel key *or* the records key — three).
- Two routes for the tube capsule (wire hook *or* air pressure).
- Two routes to the darkroom (corridor *or* crawlspace — the crawlspace is far shorter but pitch dark).
- Wing order is free after power. A player can do all four in any sequence; the dome opens at 2.
- Optional discoveries: 9 story documents, the technician's letter, scratched wall text, the dead radio (plays static + one ghost transmission if you find the antenna crank in the dome).

**Estimated play time:** 35–55 min first run, ~18 min speedrun. Hint usage tracked; a "no-hint" completion is its own ending flourish.

---

## 7. Interaction System

### 7.1 Verbs

| Verb | Input | Feel requirements |
|---|---|---|
| **Look** | mouse | 63° FOV, 0.12 s smoothing, tiny sway, head bob on walk |
| **Walk** | WASD | 1.55 m/s, sprint 2.6 (costs nothing), crouch 0.9, no jump |
| **Interact** | E / click | Raycast 2.2 m, 8 px tolerance, contextual reticle |
| **Grab / hold** | hold E | Hand IK reaches, object attaches to hand, weight affects sway |
| **Rotate / turn** | drag | Angular drag with inertia; 40 detents on dials; resistance curves |
| **Slide / pull** | drag along axis | Constrained 1D; drawer stop at end; rattle |
| **Push / throw** | click (held object) | Rapier impulse, mass‑scaled |
| **Crank** | hold + circular drag | Torque ramps; sound pitch follows speed |
| **Knob / valve** | drag rotate | Multi‑turn (valves: 3–6 turns), ticks, end stops |
| **Insert** | E on socket w/ item | Snap animation, click |
| **Inspect** | E on document | Pickup → full‑screen view, 0.9 m eye distance, tilt to catch light |
| **Read** | inspect | Documents are real textures, legible at 1440p |
| **Listen** | passive | Positional audio, 3 cues maximum at once |
| **Flashlight** | F | Toggle, 2600 K, sway, battery meter (slow drain, rechargeable at bench) |
| **Hint** | H | Opens diegetic notebook, 3 tiers |
| **Note** | Tab | Notebook: discovered codes, symbols, story, hint tier state |

### 7.2 Interaction quality rules

- **Every** hoverable object gets: a soft rim highlight (fresnel on the depth buffer, not an outline — outlines look like a game), a cursor change, and a *sound* on hover (a very quiet tick). 
- Grab has a 0.18 s hand‑IK reach; never an instant snap.
- Every actuation produces: motion + sound + a secondary particle (dust, rust, steam, wood dust) + a micro‑camera shake (0.4 px).
- No prompt text for the obvious. Only ambiguous objects get a verb label ("Turn", "Lift", "Plug in").

---

## 8. Inventory

A diegetic **canvas satchel** (Tab). Max 8 items, shown as 3D icons rendered from the real meshes (no flat sprites). Items are physical and carried in the hand; the satchel is only for storage.

Item list (17): flashlight, screwdriver, pipe wrench, putty knife, wire hook, oil can, bolt cutters, crank handle, fuse ×4 (10/15/20/5), decoy fuse ×2, negative, photo paper, punched tape, bakelite key, padlock key, 4 channel tokens, microfilm reel, letter.

Items are **contextual** — held items change the reticle and enable verbs. A wrench held near a wing nut says "Loosen". No item is ever used from a menu.

---

## 9. Hint System

**Diegetic:** a cloth‑bound station notebook in your pocket (Tab/H). It records: symbols found, codes, story fragments, and a hand‑drawn map that fills in as you explore.

**Tiered:** per puzzle, three escalating hints (§5, each room). 
- Tier 1 unlocks after **4 minutes** stuck (no progress flags on that puzzle) or immediately on request.
- Tier 2 after 3 more minutes or on request.
- Tier 3 (the answer) after 3 more minutes or on request, and it always arrives as a *physical* nudge, not a text dump: the notebook sketches the mechanism, and the relevant object glows faintly for 8 s once you're in the room.
- **Never** interrupt. Never modal. Never a timer that punishes.
- Stats: hints used, time, items found, documents read.

**Anti‑frustration:** every puzzle has a *resettable* state and a visible "what changed" cue. If the player has held the right item next to the right socket for 10 s without acting, a subtle glint appears.

---

## 10. Audio Design

| Element | Approach |
|---|---|
| Room tone | Per‑zone loop, 3 layers (low rumble / mid air / high detail), crossfaded at doors |
| Reverb | Convolution, unique IR per zone: rotunda 2.4 s, records 0.9 s, anechoic **0.15 s**, machine 1.1 s metallic flutter, darkroom 0.5 s tile, tunnel 3.0 s drip‑heavy, dome 4.5 s |
| Footsteps | 6 surface types × 4 variations, randomised pitch ±4%, distance‑correct |
| Foley | Every interactable has a custom one‑shot. ~220 sounds |
| Machinery | Looping, pitch‑modulated by state (pump speed, generator load, furnace roar) |
| Music | **None** for 90% of play. One 40 s cue at the power restoration, one at the dome, one at the door. Restraint = tension |
| Voice | One recorded technician tape (40 s), diegetic, band‑limited to 1962 tape response |
| Silence | Used deliberately in the anechoic chamber and the tunnel |

Output: Web Audio graph with a master compressor/limiter, −16 LUFS, and a positional panner for every source.

---

## 11. Asset Manifest & Download Sources

All sources **CC0 or equivalent**. Downloaded at build time into `assets/raw/`, processed into `assets/built/` (KTX2 + meshopt). A `manifest.json` records URL, licence, and hash for every file.

### 11.1 HDRIs & IBL (Poly Haven, CC0)
- `https://polyhaven.com/hdris/indoor` — pick 6: a concrete basement/tunnel, an industrial hall, a small utility room, a night exterior (for the door), an overcast sky (dome), a tungsten interior. Resolve exact slugs via `https://api.polyhaven.com/assets?t=hdris`.
- Used for: specular IBL on metals/glass, and as the *reference* for each room's baked bounce colour.

### 11.2 PBR textures (Poly Haven + ambientCG, CC0)
- ambientCG resolved via `https://ambientcg.com/api/v2/full_json?type=Material&q=<term>`.
- Required sets (2K/4K, PNG → KTX2): concrete (cast, board‑formed), painted plaster, painted brick, glazed subway tile, terrazzo, linoleum, oak strip, steel plate, rusted steel, galvanised steel, cast iron, brass, copper, bakelite, rubber, leather, canvas, aged paper, cardboard, foam, glass, dust, water normal.

### 11.3 Models (Poly Haven models, CC0; Sketchfab CC0 filter)
- Fallback: procedural/kitbashed geometry for anything not available, which is most props. Priority downloads: chairs, crates, buckets, oil drums, valve wheels, gauges, tools (wrench, screwdriver, hammer, bolt cutters), telephones (rotary), typewriter, filing cabinet, desk lamp, fire extinguisher, bottles, books, ladder, chain.
- `https://polyhaven.com/models` and `https://sketchfab.com/3d-models?features=downloadable&licenses=322a749bcfa841b29dff1e8a1bb74b0b` (CC0 filter).

### 11.4 Reference photography (for material/lighting matching)
- Darkroom: search "1960s darkroom safelight" on Wikimedia Commons.
- Machine room: "Lancashire boiler", "industrial boiler room" — Wikimedia Commons.
- Bunker: "cold war bunker interior", "York Cold War Bunker".
- Each room gets a **reference board** in `refs/` and the lighting pass is graded against it, not against taste.

### 11.5 Audio (Freesound, CC0 filter)
- `https://freesound.org/search/?q=<term>&license=Creative+Commons+0`
- Terms: door hinge, drawer wood, metal clunk, valve wheel, steam vent, water drip, fluorescent hum, ballast strike, paper rustle, typewriter, adding machine, safe tumbler, chain hoist, furnace roar, wind through slit, teletype, tape hiss, rat squeak.

### 11.6 Star field (NASA / Gaia, public domain)
- `https://svs.gsfc.nasa.gov/` for a real star catalogue subset rendered to points.

---

## 12. Build Architecture

```
EscapeRoom/
├─ plan.md
├─ index.html
├─ vite.config.ts
├─ public/
│  └─ assets/{textures,hdri,models,audio,lightmaps}/
├─ src/
│  ├─ main.ts                 # boot, loop, mode switches
│  ├─ core/
│  │  ├─ Renderer.ts          # WebGL2, AgX, post chain, dynamic res
│  │  ├─ Loop.ts              # fixed-step physics, variable render
│  │  ├─ Assets.ts            # KTX2/meshopt loader, zone streaming
│  │  ├─ Input.ts             # pointer lock, rebindable
│  │  └─ Save.ts
│  ├─ world/
│  │  ├─ zones/{rotunda,records,dome,anechoic,machine,tunnel,darkroom}.ts
│  │  ├─ layout.ts            # room rects, door transforms, connectivity
│  │  ├─ Materials.ts         # the 28 material library
│  │  └─ Lighting.ts          # light rigs + baked lightmap binding
│  ├─ interact/
│  │  ├─ Interactable.ts      # base: hover, prompts, verbs
│  │  ├─ types/{Drawer,Door,Valve,Dial,Knob,Cord,Insert,Crank,Button}.ts
│  │  └─ Highlight.ts
│  ├─ puzzles/
│  │  ├─ StateMachine.ts      # flags, dependencies, events
│  │  ├─ power.ts  cipher.ts  resonance.ts  steam.ts  photo.ts  dome.ts  door.ts
│  ├─ player/
│  │  ├─ Controller.ts        # walk, crouch, bob, collision capsule
│  │  ├─ Hands.ts             # IK arms + grab
│  │  └─ Flashlight.ts
│  ├─ audio/
│  │  ├─ Engine.ts            # graph, buses, convolvers
│  │  └─ Zones.ts             # per-room reverb + beds
│  ├─ fx/
│  │  ├─ Dust.ts  Steam.ts  VolumetricShaft.ts  Particles.ts
│  ├─ ui/
│  │  ├─ Reticle.ts  Notebook.ts  Inspect.ts  Inventory.ts  Options.ts
│  └─ shaders/
│     ├─ gtao.glsl  bloom.glsl  agx.glsl  grain.glsl  volumetric.glsl
└─ tools/
   ├─ bake/                   # Blender scripts: lightmap + AO bake
   └─ fetch-assets.ts         # manifest → download → KTX2
```

Remote/pipeline notes: the lightmap bake runs in Blender headless (`blender -b -P tools/bake/bake_zone.py`) against the same geometry exported from `world/` — the geometry is authored **once** in TypeScript-friendly JSON so meshes and bakes never diverge.

---

## 13. Iteration Plan — Six Passes

The brief says *iterate multiple times*. Each pass has a **hard gate**; the build does not advance until the gate is met. Every pass ends with a captured screenshot set graded against the room's reference photograph.

### Pass 0 — Greybox & Systems (2 days)
- All 10 zones blocked out at correct dimensions, correct connectivity, correct ceiling heights.
- Full walkable, first‑person controller, flashlight, physics, doors, 3 test interactables.
- **Gate:** can walk the whole loop in < 90 s, no clipping, 144 FPS uncapped.

### Pass 1 — Materials & Architecture (3 days)
- 28 materials in, UV'd, KTX2; skirting, cornices, conduit, pipes, door frames, drains.
- No flat colour anywhere.
- **Gate:** 10 screenshots that pass "is that a photo?" at a glance from a stranger.

### Pass 2 — Lighting & Bake (3 days)
- Light rigs per §5, Cycles bake (GI + AO + shadows) into lightmaps, IBL probes, volumetrics, dust.
- **Gate:** reference‑photo match per room (colour, contrast, falloff). No black‑crushed shadows, no clipped highlights, no obvious lightmap seams.

### Pass 3 — Dressing & Interaction (4 days)
- All props placed with human scatter, all 180 interactables wired, all 7 puzzles playable end‑to‑end.
- **Gate:** full playthrough start→door in one sitting; every hint tier fires; no dead ends.

### Pass 4 — Performance (2 days)
- Draw call merge, instancing, zone PVS, dynamic resolution, physics sleeping, KTX2 streaming.
- **Gate:** 60 FPS sustained (99th percentile frame ≤ 18 ms) on M1 Air at 1080p, with flashlight on and steam active.

### Pass 5 — Feel & Polish (3 days)
- Hand IK polish, all foley in, reverb per room, camera sway, transitions, the three set pieces (power cascade, resonance, door opening) timed to the millisecond.
- **Gate:** 3 external testers complete it unaided in < 60 min and describe it as "real".

### Pass 6 — Hardening
- Accessibility (sound‑off path, colour‑safe indicators, subtitle/caption track, FOV & sensitivity, no‑hint mode), save/load, browser QA (Chrome/Safari/Firefox), loading screen, title, credits, licence file.

**Iteration rule:** after Pass 5, repeat a *quality loop* — screenshot each room, list the 5 worst photorealism tells, fix them, re‑screenshot. Minimum 3 loops. Archive each loop's images in `refs/pass-N/` so progress is visible.

---

## 14. Acceptance Criteria

- [ ] 60 FPS sustained at 1080p on M1; ≥ 90 FPS on M3.
- [ ] All 10 zones walkable, 0 clip errors, 0 z‑fighting visible at eye level.
- [ ] Every surface textured; 0 untextured/flat‑coloured meshes at eye level.
- [ ] Baked GI present in all zones; no light leaking through walls.
- [ ] 180+ interactables, all with audio + animation + secondary particle.
- [ ] 7 puzzles, 4 wings non‑linear, 2 alternate routes each for 3 gates.
- [ ] 3‑tier hints on every puzzle, all reachable without leaving the room.
- [ ] Full audio: 7 reverb IRs, 220 foley, per‑surface footsteps.
- [ ] Save/resume works; full reset works.
- [ ] No puzzle can soft‑lock; every puzzle resets.
- [ ] Playtime 35–55 min; no-hint viable.
- [ ] End‑to‑end playthrough verified 3× without dev cheats.

---

## 15. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Baked GI + interactable movers conflict | Shadows don't move with drawers/doors | Bake static shell only; interactables use AO decals + a cheap dynamic shadow from the flashlight. Keep movers out of the bake |
| Safelight red ruins tonemapping | Magenta clipping in darkroom | Bake that zone with a red‑weighted WB, partial chromatic adaptation, test against real darkroom photo |
| Anechoic room reads as black void | Looks unfinished | Two hard caged lamps + scope glow + foam normal detail catching light; never fully dark |
| Audio puzzle accessibility | Some players can't solve | Numeric readout + meter + scope; fully solvable muted |
| Texture VRAM blowout | Stutter, crashes | KTX2, 2K default with 4K only for hero surfaces, zone streaming, ≤ 1.4 GB cap |
| Scope creep on interactables | Never ships | Freeze the interactable list at Pass 3 gate; extras go to `backlog.md` |
| 180 interactables = 180 bug surface | Instability | One base class, one state machine, one test harness that actuates every object and asserts state |
| "Photoreal" claim | Subjective | Grade against reference photographs, not opinion; keep `refs/` side‑by‑side |

---

## 16. Open Questions (non‑blocking, will assume defaults)

1. **Body/hands:** full arms visible or hands only? *Default: forearms + hands, IK, no full body (cost + clipping).*
2. **Jump:** none. Real escape rooms don't have jumping, and it breaks physicality. *Default: no jump; crouch only.*
3. **Death/fail:** none. No fail states, only resets. *Default: safe failures.*
4. **Horror:** mild unease only (the tunnel, the tape, the scratched wall). No jumpscares, no enemies. *Default: atmospheric dread, zero threat.*
5. **Save:** single autosave slot + manual reset. *Default: autosave on room entry.*

---

*End of plan. Next action: Pass 0 — scaffold the project, resolve and download the asset manifest, and block out all ten zones.*
