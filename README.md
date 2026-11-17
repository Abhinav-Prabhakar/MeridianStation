<div align="center">

# MERIDIAN

**A photoreal first-person escape room, running in a browser tab at 60 fps.**

<sub>Sealed in 1962. Four wings. One blast door. Nobody has come out of the rotunda since.</sub>

<br />

[![Play now](https://img.shields.io/badge/▶_PLAY_NOW-abhinav--prabhakar.github.io%2FMeridianStation-3fb950?style=for-the-badge&labelColor=0d1117)](https://abhinav-prabhakar.github.io/MeridianStation/)

<br />

![three.js](https://img.shields.io/badge/three.js-r170-000000?style=flat-square&logo=three&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white)
![WebGL2](https://img.shields.io/badge/WebGL-2.0-990000?style=flat-square)
![60 fps](https://img.shields.io/badge/render-60_fps-2ea44f?style=flat-square)
![Cycles baked](https://img.shields.io/badge/lighting-Blender_Cycles_bake-E87D0D?style=flat-square&logo=blender&logoColor=white)
![No engine](https://img.shields.io/badge/engine-none_--_hand_written-8b949e?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![Pages](https://img.shields.io/badge/deploy-GitHub_Pages-181717?style=flat-square&logo=github)

</div>

<img src="docs/shots/corridor.jpg" alt="North corridor, looking toward the Records room" width="100%" />

<div align="center"><sub><i>North corridor — baked bounce, tungsten practicals, no lightmaps, no bake-in of the player.</i></sub></div>

<br />

## The station

<table>
<tr>
<td width="50%"><img src="docs/shots/rotunda.jpg" alt="The Rotunda" /><br /><sub><b>THE ROTUNDA</b> — octagonal hub, 8 faces, one sealed door.</sub></td>
<td width="50%"><img src="docs/shots/records.jpg" alt="Records and Cipher room" /><br /><sub><b>RECORDS & CIPHER</b> — card catalogue, wall safe, stair.</sub></td>
</tr>
<tr>
<td><img src="docs/shots/machine.jpg" alt="Boiler and machine room" /><br /><sub><b>BOILER & MACHINE</b> — four valves, four pressures, one order.</sub></td>
<td><img src="docs/shots/anechoic.jpg" alt="Anechoic chamber" /><br /><sub><b>ANECHOIC CHAMBER</b> — 601.6 Hz and a room that eats sound.</sub></td>
</tr>
<tr>
<td><img src="docs/shots/darkroom.jpg" alt="Darkroom and photo lab" /><br /><sub><b>DARKROOM</b> — developer, stop, fixer. Then turn on the light.</sub></td>
<td><img src="docs/shots/safe.jpg" alt="The wall safe" /><br /><sub><b>THE SAFE</b> — four wheels, four digits, no forgiveness.</sub></td>
</tr>
</table>

<br />

<table>
<tr>
<td align="center" width="25%"><h3>◈</h3><b>Nine rooms</b><br /><sub>rotunda, four wings, a dome, a tunnel</sub></td>
<td align="center" width="25%"><h3>⌘</h3><b>Four tokens</b><br /><sub>the plugs <i>are</i> the code display</sub></td>
<td align="center" width="25%"><h3>⏱</h3><b>60 fps</b><br /><sub>30–160 draw calls, 29–67k tris</sub></td>
<td align="center" width="25%"><h3>?</h3><b>Hints</b><br /><sub>4 stages × 3 tiers, never spoils</sub></td>
</tr>
</table>

<br />

## Controls

| | |
|---|---|
| <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> | walk · <kbd>Shift</kbd> to run · <kbd>Space</kbd> for stairs |
| <kbd>Mouse</kbd> | look — click the frame to lock the pointer |
| <kbd>E</kbd> | interact · **hold** to turn, crank, or pour |
| <kbd>F</kbd> | torch |
| <kbd>Tab</kbd> | notebook, objectives and hints |
| <kbd>Esc</kbd> | release the pointer |

<br />

## What is actually going on

Three.js, yes — but nothing else is off the shelf.

- **Lighting is not faked.** Every zone is baked in Blender 5.3 with Cycles into its own equirect HDR, then used as `scene.environment` and cross-faded as you cross a threshold. Direct lights and shadows still run live on top, so nothing is nailed to the floor.
- **A hand-written post chain.** SSAO → separable blur → bright pass → bloom → ACES → split-tone grade → vignette → chromatic aberration → grain → FXAA. One composite pass. No `postprocessing` package.
- **Materials do the heavy lifting.** Real ambientCG photogrammetry, tinted through a custom shader that also multiplies in world-space grime and a floor-level dirt band. That is why the plaster has water staining and the floor is dark where you walk.
- **Everything is static-batched.** Thousands of props merge into a handful of geometry batches; the anechoic wedges and tunnel rivets are instanced.
- **The puzzles are physical.** Valves have pressure. The safe has wheels. The print is developed in a tray, under a safelight, by hand.

<br />

## The floor plan

```
                          ┌────────────────────────────────────────┐
                          │      RECORDS & CIPHER  (10 × 8)        │
                          │   card catalog · safe · tube station   │
                          │        ╔═══ STAIR ⌃ ═══╗               │
                          │        ║  OBSERVATION  ║  (above)      │
                          └────────╨──────┬────────╨───────────────┘
                                          │ N corridor
   ┌──────────────────┐          ┌────────┴────────┐          ┌───────────────────┐
   │   DARKROOM       │          │                 │          │  ANECHOIC         │
   │   & PHOTO LAB    │          │    ROTUNDA      │          │  CHAMBER          │
   │   (7 × 6)        ═══════════╡   r = 6.0 m     ╞══════════│  (9 × 9)          │
   │  safelight·trays │ W corr.  │  8 faces        │ E corr.  │  wedges·oscillo   │
   └────────┬─────────┘          │  patchboard     │          └───────────────────┘
            │ crawlspace         │  · exit NE ══╗  │
            │                     │  · fuse SW    │  │
   ┌────────┴─────────┐          └────────┬────────┘  │
   │  BOILER &        │                   │ S corridor│
   │  MACHINE ROOM    ═════════════════════╡           │
   │  (11 × 9)        │                   │           ╰──▶  BLAST DOOR
   └────────┬─────────┘                   │               (sealed, NE face)
            │                             │
   ╔════════╧══════════════════════════════════════════════╗
   ║  SUB‑LEVEL DRAINAGE TUNNEL (y = −3.4)  ~40 m of pipe   ║
   ╚═══════════════════════════════════════════════════════╝
```

<br />

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
```

No API keys, no backend, no analytics. Textures and HDRs ship in `public/` (~59 MB of assets, 219 kB of app code gzipped).

<details>
<summary><b>Re-bake the lighting</b> (Blender 5.3 + Cycles)</summary>

```bash
node scripts/receive.mjs &                       # receiver on :8788
open "http://localhost:5173/?bake=1"             # page exports zone probes
blender -b -P scripts/bake.py                    # writes public/bake/*.hdr
```

`BAKE_W=1024 BAKE_H=512 BAKE_SAMPLES=96`. Roughly four minutes for all eleven zones.
</details>

<br />

<div align="center">
<sub>

**Assets** — ambientCG & Poly Haven photogrammetry (CC0), Blender Cycles bakes, everything else author-built.<br />
**Set in** a fictional acoustic-research bunker, 1962. Any resemblance to a real listening station is the point.

</sub>
</div>
