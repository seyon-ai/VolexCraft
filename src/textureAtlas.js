// textureAtlas.js — builds a single texture atlas at runtime via Canvas2D.
// Avoids any external image dependency, keeping the game a single
// self-contained bundle.
//
// Texture style: each tile is painted on a coarse CELLS x CELLS grid (not
// per-pixel), like Minecraft's own hand-painted textures — this reads as
// "blocky pixel art" instead of the TV-static look you get from true
// per-pixel random noise.

import * as THREE from 'three';

export const ATLAS_COLUMNS = 7;
export const ATLAS_ROWS = 6;
export const TILE_PX = 32;
const CELLS = 8; // meta-pixel grid resolution per tile

export const TILE = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5,
  WOOD_SIDE: 6, WOOD_TOP: 7, LEAVES: 8, BEDROCK: 9, SNOW_SIDE: 10, SNOW_TOP: 11,
  COBBLESTONE: 12, PLANKS: 13, GLASS: 14, GRAVEL: 15, CLAY: 16,
  COAL_ORE: 17, IRON_ORE: 18, GOLD_ORE: 19, DIAMOND_ORE: 20, REDSTONE_ORE: 21, EMERALD_ORE: 22,
  CRAFTING_TOP: 23, CRAFTING_SIDE: 24, FURNACE_FRONT: 25, BRICK: 26, SANDSTONE: 27,
  MOSSY_COBBLESTONE: 28, ICE: 29, PUMPKIN_TOP: 30, PUMPKIN_SIDE: 31,
  CACTUS_SIDE: 32, CACTUS_TOP: 33, TALL_GRASS: 34, FLOWER_RED: 35, FLOWER_YELLOW: 36,
  IRON_BLOCK: 37, GOLD_BLOCK: 38, DIAMOND_BLOCK: 39,
};

/** Deterministic 0..1 pseudo-random value per (cell, tile) so a tile's pattern is stable. */
function cellRandom(cx, cy, salt) {
  let h = (cx * 928371 + cy * 128371 + salt * 57121) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

function paintCells(ctx, x, y, size, salt, colorFn) {
  const cs = size / CELLS;
  for (let cy = 0; cy < CELLS; cy++) {
    for (let cx = 0; cx < CELLS; cx++) {
      ctx.fillStyle = colorFn(cx, cy, cellRandom(cx, cy, salt));
      ctx.fillRect(x + cx * cs - 0.4, y + cy * cs - 0.4, cs + 0.8, cs + 0.8);
    }
  }
}

/** Speckled base of 2-3 palette colors, weighted toward the first (dominant) shade. */
function speckled(palette, weights = null) {
  return (cx, cy, r) => {
    if (!weights) return palette[Math.floor(r * palette.length)];
    let acc = 0;
    for (let i = 0; i < palette.length; i++) {
      acc += weights[i];
      if (r <= acc) return palette[i];
    }
    return palette[palette.length - 1];
  };
}

/** Base speckle + a handful of colored "ore vein" dot clusters scattered on top. */
function orePattern(baseSalt, dotColor, dotDensity = 0.14) {
  const base = speckled(['rgb(132,132,136)', 'rgb(118,118,122)', 'rgb(144,144,148)'], [0.6, 0.25, 0.15]);
  return (cx, cy, r) => {
    const dotRoll = cellRandom(cx, cy, baseSalt + 999);
    if (dotRoll < dotDensity) return dotColor;
    return base(cx, cy, r);
  };
}

function drawTile(ctx, index, painter) {
  const col = index % ATLAS_COLUMNS;
  const row = Math.floor(index / ATLAS_COLUMNS);
  const x = col * TILE_PX;
  const y = row * TILE_PX;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, TILE_PX, TILE_PX);
  ctx.clip();
  painter(ctx, x, y);
  ctx.restore();
}

function gridLines(ctx, x, y, size, cols, rows, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = 1; i < cols; i++) {
    ctx.beginPath(); ctx.moveTo(x + (i / cols) * size, y); ctx.lineTo(x + (i / cols) * size, y + size); ctx.stroke();
  }
  for (let i = 1; i < rows; i++) {
    ctx.beginPath(); ctx.moveTo(x, y + (i / rows) * size); ctx.lineTo(x + size, y + (i / rows) * size); ctx.stroke();
  }
}

export function buildTextureAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLUMNS * TILE_PX;
  canvas.height = ATLAS_ROWS * TILE_PX;
  const ctx = canvas.getContext('2d');
  const s = TILE_PX;

  drawTile(ctx, TILE.GRASS_TOP, (c, x, y) => {
    paintCells(c, x, y, s, 1, speckled(['rgb(84,156,58)', 'rgb(96,168,64)', 'rgb(72,142,48)'], [0.55, 0.3, 0.15]));
  });
  drawTile(ctx, TILE.GRASS_SIDE, (c, x, y) => {
    paintCells(c, x, y, s, 2, speckled(['rgb(118,84,52)', 'rgb(106,74,46)', 'rgb(128,92,58)'], [0.6, 0.25, 0.15]));
    paintCells(c, x, y, s * 0.3, 3, speckled(['rgb(84,156,58)', 'rgb(96,168,64)'], [0.6, 0.4]));
  });
  drawTile(ctx, TILE.DIRT, (c, x, y) => paintCells(c, x, y, s, 4, speckled(['rgb(118,84,52)', 'rgb(106,74,46)', 'rgb(128,94,60)'], [0.55, 0.3, 0.15])));
  drawTile(ctx, TILE.STONE, (c, x, y) => paintCells(c, x, y, s, 5, speckled(['rgb(132,132,136)', 'rgb(118,118,122)', 'rgb(144,144,148)'], [0.6, 0.25, 0.15])));
  drawTile(ctx, TILE.SAND, (c, x, y) => paintCells(c, x, y, s, 6, speckled(['rgb(222,201,140)', 'rgb(232,212,154)', 'rgb(210,188,128)'], [0.6, 0.25, 0.15])));
  drawTile(ctx, TILE.WATER, (c, x, y) => paintCells(c, x, y, s, 7, speckled(['rgb(52,104,182)', 'rgb(62,118,198)', 'rgb(44,92,164)'], [0.6, 0.25, 0.15])));

  drawTile(ctx, TILE.WOOD_SIDE, (c, x, y) => {
    paintCells(c, x, y, s, 8, speckled(['rgb(101,70,41)', 'rgb(90,61,35)'], [0.7, 0.3]));
    c.strokeStyle = 'rgba(55,36,18,0.55)';
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(x, y + (i + 1) * (s / 4)); c.lineTo(x + s, y + (i + 1) * (s / 4)); c.stroke(); }
  });
  drawTile(ctx, TILE.WOOD_TOP, (c, x, y) => {
    paintCells(c, x, y, s, 9, speckled(['rgb(150,112,70)', 'rgb(163,124,80)'], [0.7, 0.3]));
    c.strokeStyle = 'rgba(90,60,30,0.6)';
    for (let r = 4; r >= 1; r--) { c.beginPath(); c.arc(x + s / 2, y + s / 2, r * (s * 0.11), 0, Math.PI * 2); c.stroke(); }
  });
  drawTile(ctx, TILE.LEAVES, (c, x, y) => paintCells(c, x, y, s, 10, speckled(['rgb(54,116,42)', 'rgb(64,128,50)', 'rgb(44,104,34)'], [0.55, 0.3, 0.15])));
  drawTile(ctx, TILE.BEDROCK, (c, x, y) => paintCells(c, x, y, s, 11, speckled(['rgb(40,40,42)', 'rgb(54,54,56)', 'rgb(28,28,30)'], [0.55, 0.25, 0.2])));
  drawTile(ctx, TILE.SNOW_SIDE, (c, x, y) => {
    paintCells(c, x, y, s, 12, speckled(['rgb(118,84,52)', 'rgb(106,74,46)'], [0.7, 0.3]));
    paintCells(c, x, y, s * 0.32, 13, speckled(['rgb(235,240,245)', 'rgb(222,230,238)'], [0.6, 0.4]));
  });
  drawTile(ctx, TILE.SNOW_TOP, (c, x, y) => paintCells(c, x, y, s, 14, speckled(['rgb(238,242,248)', 'rgb(228,234,242)'], [0.7, 0.3])));

  drawTile(ctx, TILE.COBBLESTONE, (c, x, y) => {
    paintCells(c, x, y, s, 15, speckled(['rgb(120,120,124)', 'rgb(104,104,108)', 'rgb(136,136,140)'], [0.5, 0.3, 0.2]));
    gridLines(c, x, y, s, 4, 4, 'rgba(60,60,64,0.5)');
  });
  drawTile(ctx, TILE.PLANKS, (c, x, y) => {
    paintCells(c, x, y, s, 16, speckled(['rgb(176,136,84)', 'rgb(190,148,94)'], [0.65, 0.35]));
    c.strokeStyle = 'rgba(120,88,50,0.5)';
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x, y + (i / 4) * s); c.lineTo(x + s, y + (i / 4) * s); c.stroke(); }
  });
  drawTile(ctx, TILE.GLASS, (c, x, y) => {
    c.fillStyle = 'rgba(200,225,235,0.35)'; c.fillRect(x, y, s, s);
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.strokeRect(x + 1, y + 1, s - 2, s - 2);
  });
  drawTile(ctx, TILE.GRAVEL, (c, x, y) => paintCells(c, x, y, s, 17, speckled(['rgb(126,122,120)', 'rgb(104,100,98)', 'rgb(148,144,140)'], [0.45, 0.3, 0.25])));
  drawTile(ctx, TILE.CLAY, (c, x, y) => paintCells(c, x, y, s, 18, speckled(['rgb(160,164,174)', 'rgb(150,154,164)'], [0.6, 0.4])));

  drawTile(ctx, TILE.COAL_ORE, (c, x, y) => paintCells(c, x, y, s, 19, orePattern(19, 'rgb(28,28,30)', 0.16)));
  drawTile(ctx, TILE.IRON_ORE, (c, x, y) => paintCells(c, x, y, s, 20, orePattern(20, 'rgb(216,178,140)', 0.15)));
  drawTile(ctx, TILE.GOLD_ORE, (c, x, y) => paintCells(c, x, y, s, 21, orePattern(21, 'rgb(244,208,64)', 0.14)));
  drawTile(ctx, TILE.DIAMOND_ORE, (c, x, y) => paintCells(c, x, y, s, 22, orePattern(22, 'rgb(102,224,224)', 0.13)));
  drawTile(ctx, TILE.REDSTONE_ORE, (c, x, y) => paintCells(c, x, y, s, 23, orePattern(23, 'rgb(210,32,32)', 0.15)));
  drawTile(ctx, TILE.EMERALD_ORE, (c, x, y) => paintCells(c, x, y, s, 24, orePattern(24, 'rgb(48,196,110)', 0.13)));

  drawTile(ctx, TILE.CRAFTING_TOP, (c, x, y) => {
    paintCells(c, x, y, s, 25, speckled(['rgb(176,136,84)', 'rgb(190,148,94)'], [0.6, 0.4]));
    gridLines(c, x, y, s, 2, 2, 'rgba(90,60,30,0.55)');
    c.strokeStyle = 'rgba(90,60,30,0.4)'; c.strokeRect(x + s * 0.12, y + s * 0.12, s * 0.76, s * 0.76);
  });
  drawTile(ctx, TILE.CRAFTING_SIDE, (c, x, y) => {
    paintCells(c, x, y, s, 26, speckled(['rgb(150,112,70)', 'rgb(163,124,80)'], [0.65, 0.35]));
    c.fillStyle = 'rgba(70,50,25,0.5)'; c.fillRect(x + s * 0.15, y + s * 0.55, s * 0.3, s * 0.08);
    c.fillRect(x + s * 0.55, y + s * 0.2, s * 0.3, s * 0.08);
  });
  drawTile(ctx, TILE.FURNACE_FRONT, (c, x, y) => {
    paintCells(c, x, y, s, 27, speckled(['rgb(120,120,124)', 'rgb(104,104,108)'], [0.6, 0.4]));
    c.fillStyle = 'rgba(20,18,16,0.85)'; c.fillRect(x + s * 0.28, y + s * 0.32, s * 0.44, s * 0.36);
    c.fillStyle = 'rgba(255,140,40,0.55)'; c.fillRect(x + s * 0.34, y + s * 0.4, s * 0.32, s * 0.2);
  });
  drawTile(ctx, TILE.BRICK, (c, x, y) => {
    c.fillStyle = 'rgb(150,72,52)'; c.fillRect(x, y, s, s);
    c.strokeStyle = 'rgba(200,200,196,0.7)'; c.lineWidth = 1.5;
    for (let row = 0; row < 4; row++) {
      const ry = y + row * (s / 4);
      c.beginPath(); c.moveTo(x, ry); c.lineTo(x + s, ry); c.stroke();
      const offset = row % 2 === 0 ? 0 : (s / 4);
      for (let bx = -offset; bx < s; bx += s / 2) {
        c.beginPath(); c.moveTo(x + bx, ry); c.lineTo(x + bx, ry + s / 4); c.stroke();
      }
    }
  });
  drawTile(ctx, TILE.SANDSTONE, (c, x, y) => {
    paintCells(c, x, y, s, 28, speckled(['rgb(216,198,150)', 'rgb(226,208,160)'], [0.65, 0.35]));
    c.strokeStyle = 'rgba(180,160,110,0.5)';
    for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(x, y + (i / 3) * s); c.lineTo(x + s, y + (i / 3) * s); c.stroke(); }
  });
  drawTile(ctx, TILE.MOSSY_COBBLESTONE, (c, x, y) => {
    paintCells(c, x, y, s, 29, speckled(['rgb(120,120,124)', 'rgb(90,120,80)', 'rgb(104,104,108)'], [0.45, 0.3, 0.25]));
    gridLines(c, x, y, s, 4, 4, 'rgba(60,60,64,0.5)');
  });
  drawTile(ctx, TILE.ICE, (c, x, y) => {
    paintCells(c, x, y, s, 30, speckled(['rgb(176,214,235)', 'rgb(190,224,242)'], [0.6, 0.4]));
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.beginPath(); c.moveTo(x + s * 0.2, y + s * 0.1); c.lineTo(x + s * 0.5, y + s * 0.6); c.stroke();
    c.beginPath(); c.moveTo(x + s * 0.7, y + s * 0.3); c.lineTo(x + s * 0.45, y + s * 0.85); c.stroke();
  });
  drawTile(ctx, TILE.PUMPKIN_TOP, (c, x, y) => {
    paintCells(c, x, y, s, 31, speckled(['rgb(196,120,32)', 'rgb(210,132,40)'], [0.6, 0.4]));
    c.fillStyle = 'rgb(90,120,40)'; c.fillRect(x + s * 0.42, y + s * 0.35, s * 0.16, s * 0.3);
  });
  drawTile(ctx, TILE.PUMPKIN_SIDE, (c, x, y) => {
    paintCells(c, x, y, s, 32, speckled(['rgb(196,120,32)', 'rgb(210,132,40)', 'rgb(178,108,26)'], [0.5, 0.3, 0.2]));
    c.fillStyle = 'rgba(60,36,10,0.8)';
    c.fillRect(x + s * 0.22, y + s * 0.32, s * 0.14, s * 0.14);
    c.fillRect(x + s * 0.64, y + s * 0.32, s * 0.14, s * 0.14);
    c.fillRect(x + s * 0.3, y + s * 0.62, s * 0.4, s * 0.12);
  });
  drawTile(ctx, TILE.CACTUS_SIDE, (c, x, y) => {
    paintCells(c, x, y, s, 33, speckled(['rgb(58,132,66)', 'rgb(68,144,76)'], [0.65, 0.35]));
    c.strokeStyle = 'rgba(230,230,210,0.6)';
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(x + (i + 1) * s / 4, y); c.lineTo(x + (i + 1) * s / 4, y + s * 0.15); c.stroke(); }
  });
  drawTile(ctx, TILE.CACTUS_TOP, (c, x, y) => paintCells(c, x, y, s, 34, speckled(['rgb(58,132,66)', 'rgb(46,116,54)'], [0.6, 0.4])));

  drawTile(ctx, TILE.TALL_GRASS, (c, x, y) => paintCells(c, x, y, s, 35, speckled(['rgb(88,160,60)', 'rgb(70,140,48)', 'rgb(100,172,70)'], [0.5, 0.3, 0.2])));
  drawTile(ctx, TILE.FLOWER_RED, (c, x, y) => {
    paintCells(c, x, y, s, 36, speckled(['rgb(88,160,60)', 'rgb(70,140,48)'], [0.75, 0.25]));
    c.fillStyle = 'rgb(210,52,52)'; c.beginPath(); c.arc(x + s / 2, y + s * 0.4, s * 0.16, 0, Math.PI * 2); c.fill();
  });
  drawTile(ctx, TILE.FLOWER_YELLOW, (c, x, y) => {
    paintCells(c, x, y, s, 37, speckled(['rgb(88,160,60)', 'rgb(70,140,48)'], [0.75, 0.25]));
    c.fillStyle = 'rgb(232,208,48)'; c.beginPath(); c.arc(x + s / 2, y + s * 0.4, s * 0.16, 0, Math.PI * 2); c.fill();
  });

  drawTile(ctx, TILE.IRON_BLOCK, (c, x, y) => paintCells(c, x, y, s, 38, speckled(['rgb(216,214,208)', 'rgb(230,228,222)', 'rgb(200,198,192)'], [0.5, 0.3, 0.2])));
  drawTile(ctx, TILE.GOLD_BLOCK, (c, x, y) => paintCells(c, x, y, s, 39, speckled(['rgb(248,212,72)', 'rgb(255,224,96)', 'rgb(230,196,56)'], [0.5, 0.3, 0.2])));
  drawTile(ctx, TILE.DIAMOND_BLOCK, (c, x, y) => paintCells(c, x, y, s, 40, speckled(['rgb(120,232,232)', 'rgb(150,244,244)', 'rgb(96,212,212)'], [0.5, 0.3, 0.2])));

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** Returns the [u0, v0, u1, v1] UV rect for a tile index (V flipped for canvas->GL). */
export function tileUV(index) {
  const col = index % ATLAS_COLUMNS;
  const row = Math.floor(index / ATLAS_COLUMNS);
  const u0 = col / ATLAS_COLUMNS;
  const u1 = (col + 1) / ATLAS_COLUMNS;
  const v0 = 1 - (row + 1) / ATLAS_ROWS;
  const v1 = 1 - row / ATLAS_ROWS;
  return [u0, v0, u1, v1];
}
