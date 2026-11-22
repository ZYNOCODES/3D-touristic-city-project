# Vellmare Bay — Interactive Real-Estate Experience

A photoreal, interactive promotion app for a (fictional) coastal rainforest development, built with
**React + Vite + TypeScript + three.js / @react-three/fiber**, plus an automated **Blender (`bpy`) asset
pipeline** that downloads CC0 assets from Poly Haven, builds the architecture, exports Draco-compressed
`.glb` files and renders photoreal Cycles stills for the property dossier.

Flow: **aerial masterplan → availability overlay → unit card → X-ray apartment cutaway → cinematic
fly-in → interior walkthrough → property dossier (gallery, floorplan, facts, specs, advisor, map)**.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

The repo ships with generated assets in `public/` (models, HDRIs, textures, renders). If they are missing,
the app still runs: every model, texture and HDRI has a procedural fallback.

### Regenerating the assets (Blender 4.2+, tested on 5.3)

```bash
npm run blender                       # full pipeline (fetch, people, architecture, interiors, vegetation, gallery)
node scripts/blender.mjs villa        # one or more individual steps
node scripts/blender.mjs masterplan   # full-site .blend + aerial Cycles render (slow)
npm run assets                        # download Poly Haven assets only
```

Or call Blender directly:

```bash
blender -b --factory-startup --python blender/run_all.py -- villa interior gallery
```

Set `BLENDER_PATH` if Blender is not found automatically. Environment options:
`OFFLINE=1` (skip downloads → procedural materials), `TEX_RES=2k`, `HDRI_RES=4k`.

Useful URL parameters for reviews: `?shot=pool&t=0.62` jumps straight to a camera shot
(`masterplan, villas, residence, pool, court, playground, lounge, beach`) at a time of day
(`0.3` day, `0.62` golden hour, `0.92` night).

---

## Repository layout

```
blender/                     Blender pipeline (all scripts runnable with `blender -b --python`)
  config.py                  paths + the CC0 asset manifest (Poly Haven ids)
  fetch_assets.py            cached downloader (stdlib only), detects the sun in each HDRI
  bl_util.py                 web↔Blender coordinates, bevelled primitives, PBR materials, GLB export
  heightfield.py             Python port of the terrain function (parity-checked)
  villa.py                   villa prototype            → public/models/villa.glb
  residence.py               terraced apartment block   → public/models/residence.glb
  amenities.py               pool, lounge, court, playground, beach club, garden + props
  interior.py                villa interior + terrace with Poly Haven furniture/plants
  render_gallery.py          Cycles stills              → public/renders/*.jpg
  build_masterplan.py        whole site in one .blend + aerial render
  run_all.py                 orchestrator (each step isolated; failures fall back)
scripts/
  gen-layout.mjs             generates src/data/layout.json (villas, roads, pads, amenities)
  check-heightfield.mjs      verifies TS and Python terrain produce identical heights
  blender.mjs                finds Blender and runs the pipeline
src/
  data/                      ← swap these for a real project
    layout.json              site plan shared by web + Blender
    project.ts               brand, camera shots, time presets, location & POIs, advisor
    units.ts                 villas & apartments: type, status, price, areas
    floorplans.ts specs.ts amenityProps.ts
  lib/                       heightfield, asset manifest loaders, site mask
  scene/
    Experience.tsx           <Canvas>, loading gate, composition
    env/                     time-of-day model + HDRI-blended sky / PMREM env / sun & shadows
    masterplan/              terrain, ocean, roads, vegetation (LOD), villas, residence block, amenities, pins
    people/                  procedural skinned humans + behaviours (walk, swim, lounge, basketball, swings, slide…)
    interior/                interior placement, hotspot rig, markers
    camera/                  spline flight rig + motion data
    materials/               PBR library, animated water
    geo/                     procedural architecture fallbacks, instancing + tint/hover patches
    post/                    N8AO, bloom, speed blur, grade, ACES
  ui/                        HUD, dock, unit card, interior HUD, property sheet, floorplan, map
```

## Photoreal asset system (phase 3)

| Area | What it is now | Source / generator |
|---|---|---|
| **Residence** | Contemporary Mediterranean apartment building: two wings with a stepped skyline, alternating cantilevered terraces (thick white slab edges, timber soffits with downlights, frameless glass balustrades, planters with cascading greenery), travertine blade walls between units, recessed full-height glazing with dark aluminium frames and sheer curtains, double-height glass lobby under a cantilevered canopy, timber-finned core tower, roof gardens / pergolas / rooftop pools, landscaped forecourt with drop-off loop, reflecting pools, sculpture, benches, bollards, boundary walls and the garage ramp. | `blender/residence.py` → `residence.glb` + `src/data/generated/residence.json` (apartment cells drive inventory, availability overlay, X-ray cutaway and apartment interiors) |
| **People** | 18 rigged Microsoft Rocketbox avatars (adults + children, 6.7–9.2 k polys, 81-bone rigs, real skin/clothing textures) animated by 21 motion-capture clips (walks, strolls, idles, phone calls, drinking, talking, seated idles, crouching) through `AnimationMixer`; walk speed synced to each clip's measured root speed. | `blender/fetch_people.py`, `blender/build_people.py` → `public/models/people/` · `src/scene/people/RealPeople.tsx` |
| **Vegetation** | ~19.7 k plants of 16 species: scanned Poly Haven olives (3), pines (3), broadleaf and ornamental trees + procedural cypresses (real fir-twig texture), date palms (modelled leaflets), clipped shrubs, pampas grass and lavender — each baked into a 24-view impostor atlas and drawn as camera-facing instanced cards that cross-fade views, light with the time of day and cast correct shadows. | `blender/build_vegetation.py` → `public/models/vegetation/` · `src/scene/vegetation/` |
| **Villa interior** | The real inside of the villa shell: stone feature walls, lime stucco, terracotta, timber beams, stone fireplace, steel glazing, oak/travertine kitchen, woven chairs, linen sofa, Wayfair fabric armchairs, floating oak stair, upstairs master suite with cloth-draped bed and stone bathroom, furnished pool terrace. | `blender/interior_villa.py` → `villa_interior.glb/.json` |
| **Apartment interior** | Different plan, palette and furniture: glazed front bedroom behind a framed glass partition, open living/dining to the bay, walnut + marble kitchen with island, marble bathroom, walk-in wardrobe, entry hall, herringbone oak, linear ceiling lights, Wayfair velvet sofa & silk pouf, leather lounge chair, balcony set. The building is cut open around the real cell so neighbouring terraces stay visible. | `blender/interior_apartment.py` → `apartment_interior.glb/.json` |
| **Furniture** | Library of detailed pieces: soft-bodied sofas, woven chairs, cloth-simulated duvets, kitchens with appliances, bathrooms, pendants, teak loungers, parasols … | `blender/furniture.py` |

### Spatial validation

* **Interiors** — `blender/validate.py` checks every furniture assembly for room containment, pairwise
  intersections (with semantic exceptions: chairs under tables, stools at islands, rugs), grounding
  and decor-on-support; fixable problems are corrected automatically and the report is stored in
  `public/models/*_interior.json`.
* **Site** — `npm run validate:site` runs the browser's planting plan in Node and checks plants against
  building / hardscape footprints (`src/lib/footprints.ts`), paths, terrain contact, trunk spacing and
  villa podium overlaps → `docs/qa/site-validation.json`. The plan itself rejects invalid placements.

### Visual QA & licences

* `blender/preview.py` renders any GLB from arbitrary cameras (EEVEE) for close-up inspection.
* In dev, `__qa.view(eye, target)` + `__qa.capture(name)` save browser screenshots to `docs/qa/after/web/`.
* `npm run assets:manifest` writes `docs/ASSETS.md` + `public/asset-credits.json` (source, author, licence,
  modifications, path for every third-party asset). All are CC0, CC-BY 4.0 or MIT.

## How it works

**Shared site plan.** `layout.json` positions every villa, road, terrace pad and amenity. The terrain is a
deterministic function (`src/lib/heightfield.ts`, ported to `blender/heightfield.py`; run
`node scripts/check-heightfield.mjs` to confirm parity), so Blender and the browser agree to the millimetre.

**Lighting.** The time-of-day scrubber drives sun elevation/azimuth, colour, fog, exposure and a blend of
three Poly Haven HDRIs (day / golden / night). The fetcher detects each HDRI's sun direction so the sky is
rotated to match the directional light; the blended sky is re-baked into a PMREM environment as it changes.
Shadows follow the area of interest with texel snapping. Night switches on emissive windows, lamps, pool
glow and point lights.

**Architecture.** Villas are one Blender prototype instanced ~80× (one draw call per material) with
per-instance availability tint and hover glow injected into the PBR shaders. The residence block supports an
X-ray cutaway: building fragments inside the selected apartment's volume are discarded and a furnished, lit
diorama is revealed inside a glowing frame.

**Interior.** The interior is placed *in the world* at the selected unit (its exterior shell is hidden), so
the view through the glass is the live masterplan, ocean and time of day, with real sun patches indoors.

**Performance.** Vegetation is chunked for frustum culling with distance LOD (detailed, shadow-casting crowns
near the camera; 60-triangle crowns beyond). Models are Draco-compressed, interior textures WebP.

## Swapping in real project data

1. Edit `scripts/gen-layout.mjs` (or `src/data/layout.json` directly) for plots and roads.
2. Replace `units.ts` with your inventory (status / price / areas) — the overlay colours follow automatically.
3. Replace `floorplans.ts`, `specs.ts`, `project.ts` (shots, location, POIs, advisor).
4. Replace the Blender builders (or drop in your own `villa.glb`/`interior.glb` using the same material names:
   `plaster, roof, glass, wood, deck, stone, frame, water, glow, …`; other materials are kept as authored).
5. Wire the inquiry form in `src/ui/PropertySheet.tsx` to your CRM.

## Credits & licences

HDRIs, textures and furniture/plant models: **Poly Haven, CC0**. Map tiles: © OpenStreetMap contributors,
© CARTO (use your own tile provider in production). All brand names, people and data are fictional.
