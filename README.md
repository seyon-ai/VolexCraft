# VoxelCraft

A browser-based voxel game (Three.js, ES modules, no build step, no backend).

## What's new in V6 (Voltx Craft visual pipeline, part 1)

**Real post-processing pipeline** (`src/postprocessing.js`) — built on Three.js's own `examples/jsm` addons (EffectComposer/RenderPass/UnrealBloomPass/SSAOPass/ShaderPass/OutputPass), not hand-rolled fakes:
- Bloom (UnrealBloomPass)
- SSAO (SSAOPass) — enabled at High preset and up, always off on mobile regardless of preset (too costly for mobile GPUs)
- Filmic tone mapping (`ACESFilmicToneMapping`) + correct color space, via OutputPass
- A lightweight color-grade pass (contrast/saturation/vignette — the brief's "cinematic color grading" and "optional vignette")
- Addon modules load via dynamic `import()` inside a try/catch, specifically so that if the CDN ever fails to serve one of those files, only post-processing degrades (falls back to direct rendering) — it can't take the whole game down with it. Verified this fallback path directly.

**Real water shader** (`src/waterMaterial.js`) — one shared `ShaderMaterial` used by every chunk's water mesh (not one instance per chunk):
- Animated vertex-displaced waves (two overlapping sine waves)
- Fresnel-weighted blend toward the current sky color (a believable fake reflection, not a real one — see below)
- Scrolling UV distortion for shimmer
- A sun-glint highlight that tracks the actual sun direction and fades appropriately at night
- Automatically falls back to a simple flat material at the Low preset

**Graphics presets** — Low/Medium/High/Ultra/Extreme, selectable from the pause menu, each wiring real settings: render distance, shadow map resolution (changed live, no restart needed), bloom/SSAO/color-grade toggles, water shader vs. simple, fog, and pixel ratio cap. Extreme is hidden entirely on mobile, per the brief.

**Adaptive quality** — a rolling FPS average that automatically drops one preset tier if sustained below ~28fps, with a cooldown so it doesn't flip-flop. Only ever downgrades automatically; you can always manually pick a higher preset again. This is the practical stand-in for "dynamic resolution scaling" — see the honesty note below on why true DRS wasn't implemented.

**Honest scope note for this pass** — what's real vs. what's a deliberate simplification:
- *Real:* bloom, SSAO, tone mapping, color grading, the water shader, graphics presets, adaptive quality.
- *Faked reasonably:* water "reflections" are a fresnel color-tint, not a real reflection of the scene (a true one needs a second render pass per water surface — not worth the cost given how much water can be on screen at once in a voxel world).
- *Not implemented, and here's why:* cascaded shadow maps (Three.js doesn't have a drop-in for this; a hand-rolled multi-frustum version is a substantial project on its own and the existing single shadow camera, now with live-adjustable resolution, covers the practical need); true volumetric god rays and clouds (real-time raymarching at a frame budget that also has to run a voxel world and stay smooth on mobile isn't realistic — a later pass can add a cheap screen-space light-shaft fake if wanted); TAA (Three.js's TAA addon is a full accumulation-buffer system that fights with a chunk-streaming voxel world's constantly-changing geometry; a simple sharpen pass could be added instead if motion aliasing bothers you); real-time water caustics (skipped rather than faked badly); PBR normal/roughness/AO maps (would require you to also supply and maintain normal/roughness/AO images per block texture — a real workload increase for a benefit this simple voxel lighting model can't fully show); Web Workers, instanced rendering, and occlusion culling (Three.js already frustum-culls automatically per-mesh, and the chunk streaming + generation throttling from V5 is doing the heavy lifting for "smooth chunk loading" — a Web Worker–based terrain generator is a legitimate future project, not a quick add).

**Still to come:** weather (rain/snow/thunder), drifting cloud billboards, and sky flourishes (shooting stars, faint aurora tint) — continuing next.

## What's new in V5

**The "freeze after playing a while" bug — found and fixed**
The real cause: mob heads use a 6-material array (one per face, for the face-texture system), and the disposal code called `.dispose()` directly on that array. Arrays don't have a `.dispose()` method, so the moment *any* mob died or wandered out of range, this threw — and because it threw *inside* the `.filter()` call that removes dead mobs from the list, the exception aborted that filter entirely, leaving the dead mob in the array. Every subsequent frame hit the exact same crash on the exact same mob, forever. Critically, the crash happened *after* player physics and camera position already updated for that frame but *before* the renderer's `render()` call — so the canvas froze while the joystick (a separate DOM element, unaffected by the crashed render loop) kept responding, and the player's position kept quietly changing in memory without ever being drawn. Exactly the symptom described. Verified with a reproduction test before and after the fix.

**New gameplay systems**
- **Physical dropped items** — blocks and mobs now drop a real, physical item (a small bobbing/spinning cube) you walk over to collect, instead of loot teleporting straight into your inventory. Nearby stacks of the same item merge together, items despawn after 90s if left on the ground.
- **Caves** — real 3D-noise-carved tunnels and caverns (added proper 3D simplex noise, which the engine didn't have before — it only had 2D). Two noise fields combined: a blobby "cavern" field for open pockets and a ridged "worm" field for connecting tunnels.
- **Connected ore veins** — ore placement switched from independent-probability scattered blocks to 3D-noise-threshold clustering, so ore now forms actual connected blobs/veins like a real voxel game, not scattered singles. Thresholds were empirically calibrated against the noise distribution (an earlier pass had ~17% of all stone turning into ore — now tuned to a realistic ~4-5%).
- **Hunger bar** — drains slowly over time (faster while sprinting), fuels passive health regen once reasonably fed, causes slow starvation damage at zero, and blocks sprinting when empty. Eating now restores hunger rather than healing directly, so cooked food matters again instead of being a flat heal button.

**Performance**
- Chunk generation got noticeably heavier from caves + ore veins (going from a pure hash-lookup to real 3D noise sampling). Benchmarked and retuned: single-octave noise instead of 2-octave where it didn't visibly matter, narrowed the Y-range caves get checked in, and dropped the per-frame chunk-generation throttle to 1 (from 2) to keep worst-case frame time in check. Steady-state median frame time while exploring new terrain is ~7ms; occasional worst-case spikes near ~20ms are possible when several heavy chunks line up, which is a minor hitch, not the sustained stutter from before.
- Also fixed a real latent bug found while working on this: `PLACEABLE_BLOCKS` still referenced the two flower block ids removed in V3, which meant Creative mode's inventory fill silently included two broken `undefined` slots.

**Still in progress:** the full "cinematic visuals" pass (bloom, tone mapping, better water, weather, clouds, sky flourishes, graphics presets) from your Voltx Craft brief — that's a large, separate chunk of work and will follow in the next update.

## What's new in V4

**Performance fix (the "stuttering while playing" issue)**
- Found and fixed the real cause: ore/tree placement was calling a seeded-RNG constructor (`mulberry32(seed)()`) for **every candidate stone voxel** — tens of thousands of throwaway function objects allocated per chunk. That's expensive to allocate and expensive to garbage-collect, and it re-ran constantly as you walked into new terrain. Replaced it with a pure-arithmetic hash with zero allocation.
- Also found chunk generation was computing each column's height/biome/tree data **three separate times** (once per generation pass) instead of once and reusing it — now cached.
- Beyond that, chunk *generation* itself (not just the mesh-building step) is now spread across multiple frames instead of generating an entire newly-revealed ring of chunks synchronously the moment you cross a chunk boundary. Benchmarked before/after: worst-case frame time while continuously walking through new terrain dropped from ~29ms (well over the 16.7ms budget for 60fps — a dropped frame every time) to consistently under 16ms.

**Other fixes from this round**
- Tall grass density cut way down (was spawning in ~38% of eligible ground columns — down to ~10%).
- The joystick's touch zone was too large and ate into the center of the screen, making it impossible to tap-aim at mobs there. Shrunk it down to the bottom-left corner only.

**Note on this zip:** it does **not** include the `assets/` folder, so it won't overwrite whatever you've already put there — just keep using your existing `assets/textures/blocks|items|mobs/` folders alongside these updated source files.

## What's new in V3

**Bug fixes**
- Fixed a real bug: the joystick's invisible touch zone was stacked *above* the HUD, so taps meant for the hotbar/inventory button could get swallowed by it. HUD now stacks correctly on top, and the zone is also spatially inset away from the hotbar strip.
- Fixed the "freeze near a skeleton" issue: dying didn't release the mouse pointer lock, so the "You Died" screen appeared but its Respawn button was unclickable — it wasn't a freeze, just a stuck cursor. Death now releases pointer lock (and hides mobile touch controls) immediately.
- Every overlay (crafting, furnace, inventory, pause, death) now explicitly hides the mobile joystick/jump button while open, instead of relying on z-index alone.
- Added a real fullscreen toggle button.

**Real images, with automatic fallback**
- All block textures, hotbar/inventory icons, and mob faces now load from PNG files you can drop into `assets/textures/...` (see the file list below). Anything you haven't added yet just keeps using the built-in procedural look — nothing breaks, and each file upgrades independently the moment it's present.
- Removed the flower blocks (they read as messy full cubes). Tall grass is no longer a solid cube either — it's now a proper cross-plane billboard with a transparent background, like Minecraft's own plant rendering.

**Interaction overhaul**
- Mobile no longer has a fixed break/place button. You aim by touching the screen directly: a quick tap places a block (or eats food, or opens a crafting table/furnace) at that exact point; holding still breaks a block or attacks a mob there. Dragging past a small threshold before that's decided is treated as a camera look instead, so look and aim share one natural gesture.
- Auto-step (the v2 auto-jump) now eases the camera up smoothly instead of snapping.
- You can now eat raw or cooked meat (from cows/pigs) by selecting it and using the place action — heals you, consumes one. Furnace can cook raw meat into a better-healing cooked version.
- A full Inventory screen (`E` on desktop, the backpack-icon button on mobile) with 27 backpack slots in addition to the 9 hotbar slots, plus an embedded crafting grid — so "what happens when the hotbar fills up" now has a real answer, and running out of room shows a toast instead of silently losing the item.
- Mode-toggle shortcut moved from `E` (now Inventory) to `M`.

## Image files you can add

None of these are required — the game already looks reasonable without them, and each one upgrades its tile the moment it's present. Recommended size: **128×128px** for block textures, **64×64px** for item icons and mob faces. PNG, square. `tall_grass.png` should have a transparent background (it's rendered as crossed blades, not a solid cube); everything else can be fully opaque.

**`assets/textures/blocks/`** (block surface textures)
```
grass_top.png       grass_side.png      dirt.png            stone.png
sand.png            water.png           wood_side.png       wood_top.png
leaves.png          bedrock.png         snow_side.png       snow_top.png
cobblestone.png     planks.png          glass.png           gravel.png
clay.png            coal_ore.png        iron_ore.png        gold_ore.png
diamond_ore.png     redstone_ore.png    emerald_ore.png     crafting_table_top.png
crafting_table_side.png                 furnace_front.png   brick.png
sandstone.png       mossy_cobblestone.png                   ice.png
pumpkin_top.png     pumpkin_side.png    cactus_side.png     cactus_top.png
tall_grass.png      iron_block.png      gold_block.png      diamond_block.png
```

**`assets/textures/items/`** (hotbar/inventory icons for tools & materials — not needed for placeable blocks, which reuse the block textures above)
```
stick.png           coal.png            raw_iron.png        iron_ingot.png
raw_gold.png        gold_ingot.png      diamond.png          redstone.png
emerald.png         wood_sword.png      stone_sword.png      iron_sword.png
diamond_sword.png   wood_pickaxe.png    stone_pickaxe.png    iron_pickaxe.png
diamond_pickaxe.png raw_beef.png        raw_porkchop.png     cooked_beef.png
cooked_porkchop.png
```

**`assets/textures/mobs/`** (applied only to the front face of each mob's head — body stays a flat color)
```
cow_face.png        pig_face.png        zombie_face.png      skeleton_face.png
creeper_face.png
```

## Known simplifications (given scope) — worth knowing about, not necessarily bugs

- Cactus and pumpkin are still full solid cubes (only tall grass got the billboard treatment).
- Dropped items are simple flat-colored cubes, not textured to look like the actual block/item.
- Cave entrances never breach the surface directly — caves only carve the deep stone region, so you won't stumble into one just walking around; you have to dig down to find them.
- Creative mode now has all 26 placeable block types spread across the hotbar + backpack (not just 9), but backpack slots are otherwise fixed/infinite in Creative — you can't rearrange them.
- Furnace/crafting-table smelting and crafting are instant-per-click (rate-limited by needing fuel each time), not a real-time progress bar you can walk away from. The crafting grid in the Inventory screen offers every recipe, not just ones that'd require a table in real Minecraft.
- Clicking a slot in the Inventory screen swaps it with your currently-selected hotbar slot (a simple "quick move") rather than full drag-and-drop.
- Skeletons use a simplified straight-line ranged "shot" rather than a visible arrow projectile.
- No hunger *icon depletion animation* or food-poisoning-style mechanics — hunger is a straightforward drain/regen/starve loop.

## Run locally

This uses native ES modules, so it must be served over HTTP (not opened directly as a `file://` URL).

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed local URL in your browser.

## Deploy: GitHub → Vercel

**1. Push this folder to a new GitHub repo**

```bash
cd voxelcraft
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

(Create the empty repo first on github.com, then run the commands above with your repo's URL.)

**2. Import the repo into Vercel**

1. Go to https://vercel.com and sign in (you can sign in with your GitHub account).
2. Click **Add New… → Project**.
3. Select **Import Git Repository** and choose the repo you just pushed.
4. Vercel will detect it as a static site. Use these settings:
   - **Framework Preset:** Other
   - **Build Command:** *(leave empty)*
   - **Output Directory:** `.` (project root)
   - **Install Command:** *(leave empty)*
5. Click **Deploy**.

That's it — Vercel serves static files over HTTP by default, so the ES module imports and the `three` CDN import map both work correctly. Every future `git push` to `main` will auto-deploy.

**Note:** the save system uses `localStorage`, which is per-browser/per-domain — saves won't transfer between your local machine and the deployed URL.


