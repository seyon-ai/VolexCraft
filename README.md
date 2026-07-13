# VoxelCraft

A browser-based voxel game (Three.js, ES modules, no build step, no backend).

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

- Ore veins are single scattered blocks (depth-weighted probability), not connected clusters.
- Cactus and pumpkin are still full solid cubes (only tall grass got the billboard treatment).
- Mob kills and block breaks grant items straight to your inventory — there's no physical "dropped item on the ground" you walk over to collect.
- Creative mode now has all 26 placeable block types spread across the hotbar + backpack (not just 9), but backpack slots are otherwise fixed/infinite in Creative — you can't rearrange them.
- Furnace/crafting-table smelting and crafting are instant-per-click (rate-limited by needing fuel each time), not a real-time progress bar you can walk away from. The crafting grid in the Inventory screen offers every recipe, not just ones that'd require a table in real Minecraft.
- Clicking a slot in the Inventory screen swaps it with your currently-selected hotbar slot (a simple "quick move") rather than full drag-and-drop.
- Skeletons use a simplified straight-line ranged "shot" rather than a visible arrow projectile.

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


