# Phase 3 — Visual validation report

Screenshots: **before** = `docs/qa/before/` (your captures of the previous build) ·
**after (web)** = `docs/qa/after/web/` (captured from the running app with `__qa.capture`) ·
**after (Blender close-ups)** = `docs/qa/after/residence|villa|villa_interior/` · photoreal Cycles gallery = `public/renders/`.

## 1. Initial inspection — what was wrong

| Area | Finding (before) |
|---|---|
| Residence | One long stepped box with flat glass and plaster piers; no entrance, landscape or roofscape (`06_residence_core`, `07_residence_aerial`). |
| People | Capsule/sphere mannequins with procedural limbs (`10_pool`, `12_beach_loungers`). |
| Trees | Sphere-cluster "lollipop" trees, uniform spacing, no species (`13_forest_lollipops`, `11_villas_masterplan`). |
| Villas | White box + green hipped roof; **private pools never visible** (stone deck and solid podium modelled over the basin). |
| Interiors | Villa and apartment used the same room, furniture and materials (`03`/`04` vs villa). |
| Furniture | Box loungers/umbrellas, box chairs and beds. |
| Placement | Trees inside gardens/terraces in front of villas; no checks for furniture collisions, floating objects or decor support. |

## 2. What replaced it

| Area | After | Evidence |
|---|---|---|
| Residence | Two wings with stepped skyline, alternating 2.2 m cantilevered terraces with thick white slab edges, timber soffits + downlights, frameless glass balustrades, planters with trailing greenery, travertine blade walls, recessed full-height glazing with aluminium frames & sheers, timber-finned core tower, double-height glass lobby + canopy, roof gardens / pergolas / rooftop pools, forecourt with drop-off, reflecting pools, sculpture, bollards, boundary walls, garage ramp. | `after/web/01–04`, `after/residence/*` |
| People | 18 Microsoft Rocketbox avatars (MIT; adults & children, 6.7–9.2 k polys, 81-bone rigs) + 21 mocap clips; walk speed foot-locked; bone-rotation retargeting with hip-height scaling (sitting works for adults and children). | `after/web/05, 06, 23`, `03_residence_entrance` |
| Vegetation | 31.9 k plants, 16 species: scanned Poly Haven olives / pines / broadleaf / ornamental + procedural cypresses (scanned fir-twig texture), date palms (modelled leaflets), clipped shrubs (modelled leaves), pampas, lavender → 24-view impostors with shadows. | `after/web/14, 16–18`, `07` |
| Villas | Contemporary Mediterranean: dry-stone podium & stone-clad wing, stucco volumes, travertine bands, flat roof with timber soffit, pergola, planted planters, teak loungers & parasol, **working sunken pool**. | `after/web/15, 16, 18`, `after/villa/villa_exterior.png` |
| Villa interior | Built inside the real villa shell: stone wall, beams, fireplace, terracotta, steel glazing, oak/travertine kitchen, woven dining, linen sofa + Wayfair armchairs, floating stair, upstairs suite with cloth-draped bed & stone bathroom, pool terrace. | `after/web/09–12`, `public/renders/villa_*.jpg` |
| Apartment interior | Different plan/palette/furniture: glazed front bedroom, living/dining to the bay, walnut + marble kitchen island, marble bathroom, wardrobe, hall, herringbone oak, linear lights, Wayfair velvet sofa & silk pouf, leather chair; building cut open around the real cell. | `after/web/19–21`, `public/renders/apt_*.jpg` |

## 3. Spatial validation results

* **Villa interior** — 58 assemblies · 0 overlaps remaining (fireplace pulled back out of the wall, bed nudged into its room, sideboard with bad source scale removed).
* **Apartment interior** — 36 assemblies · 0 remaining (chairs recognised as tuck-under, vase placed on its table, curtains excluded from room containment).
* **Site** (`npm run validate:site`) — 31 858 plants · **0 violations · 0 warnings**; at plan time the rules rejected placements on paths (256), villa podiums (61), pool deck, lounge, playground, and 39 trunks too close to another tree.

## 4. Known limitations (honest)

* **Asset sources**: Sketchfab, BlenderKit and Quixel/Fab require an account or API key, so they could not be downloaded unattended. All third-party assets come from Poly Haven (CC0), Khronos/Wayfair (CC0 / CC-BY 4.0) and Microsoft Rocketbox (MIT) — see `docs/ASSETS.md`.
* **Vehicles** are not shown: no licence-compatible photoreal car was downloadable without an account (the Khronos concept car carries trademarks). The residence has a garage ramp; nothing is faked.
* **Impostor trees** are photographic from ~10 m outward; right next to the camera they are flat cards (no parallax inside the crown).
* **People**: Rocketbox models are realistic but 2010s-era (≈8 k polys); there are no swimming or lying clips, so guests stand waist-deep in the pool and sit on loungers.
* **Gallery backdrops** in the Cycles renders use simple procedural hills.
* **Performance** was not measured on target hardware — the in-app browser pane was hidden during this session (throttled frame rate).
