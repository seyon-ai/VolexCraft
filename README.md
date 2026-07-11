# VoxelCraft

A browser-based voxel game (Three.js, ES modules, no build step, no backend).

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
