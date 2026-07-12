# VoxelCraft

A browser-based voxel game (Three.js, ES modules, no build step, no backend).

## What's new in V2

**Bug fixes**
- Mouse/touch look sensitivity recalibrated — the slider minimum is now genuinely slow (a stray ×60 multiplier on mobile look was the main culprit).
- Auto-step: walking into a single-block ledge now steps up onto it automatically instead of stopping dead.
- Mobile break/place merged into one circular action button: tap to place, hold to break (rate-capped so holding doesn't tunnel instantly).
- Hotbar clicks were wired up (previously the click handler existed but was never connected).
- Mobile joystick is now "floating" with a much larger invisible hit-zone (left ~60% of the screen) — it appears wherever you actually touch down instead of one small fixed circle.
- Block textures redrawn with a coarse "meta-pixel" style closer to Minecraft's own look, instead of per-pixel static.

**New features**
- Visible sun/moon sprites and a fading night starfield.
- 34 block types (up from 10): cobblestone, planks, glass, gravel, clay, sandstone, mossy cobblestone, bricks, ice, pumpkin, cactus, flowers/tall grass, and ore blocks (coal, iron, gold, diamond, redstone, emerald) generated in depth-appropriate underground bands.
- Crafting table and furnace: interact (right-click / tap-place) with either to open a recipe-list panel. Furnace smelting consumes one fuel item (wood, planks, or coal) per craft.
- Tools and weapons: wood/stone/iron/diamond pickaxes (higher-tier ore requires a matching pickaxe) and swords (more damage per tier).
- Basic mobs: cows and pigs wander passively by day; zombies, skeletons, and creepers spawn at night and chase/attack the player (creepers explode on approach). Killing a mob grants its drop directly to your inventory.

**Known simplifications (given scope)** — worth knowing about, not necessarily bugs:
- Ore veins are single scattered blocks (depth-weighted probability), not connected clusters.
- Tall grass/flowers/cactus are full solid-looking cubes rather than cross-plane billboards (the engine's mesher only does full cubes).
- Mob kills and block breaks grant items straight to your inventory — there's no physical "dropped item on the ground" you walk over to collect.
- Creative mode's hotbar is a fixed set of 9 common blocks, not a full scrollable palette of all 34.
- Furnace smelting is instant-per-click (rate-limited by needing fuel each time), not a real-time progress bar you can walk away from.
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

