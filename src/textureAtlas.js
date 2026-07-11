// textureAtlas.js — builds a single texture atlas at runtime via Canvas2D.
// Avoids any external image dependency, keeping the game a single self-contained
// bundle. Each tile is drawn with light per-pixel noise so blocks don't look flat.

import * as THREE from 'three';

export const ATLAS_COLUMNS = 4;
export const ATLAS_ROWS = 3;
export const TILE_PX = 32;

export const TILE = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  WOOD_SIDE: 6,
  WOOD_TOP: 7,
  LEAVES: 8,
  BEDROCK: 9,
  SNOW_SIDE: 10,
  SNOW_TOP: 11,
};

function speckle(ctx, x, y, size, baseColor, variance) {
  ctx.fillStyle = baseColor;
  ctx.fillRect(x, y, size, size);
  const [r, g, b] = baseColor.match(/\d+/g).map(Number);
  const pixels = ctx.getImageData(x, y, size, size);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const n = (Math.random() - 0.5) * variance;
    pixels.data[i] = Math.min(255, Math.max(0, r + n));
    pixels.data[i + 1] = Math.min(255, Math.max(0, g + n));
    pixels.data[i + 2] = Math.min(255, Math.max(0, b + n));
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, x, y);
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

export function buildTextureAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLUMNS * TILE_PX;
  canvas.height = ATLAS_ROWS * TILE_PX;
  const ctx = canvas.getContext('2d');

  const s = TILE_PX;
  drawTile(ctx, TILE.GRASS_TOP, (c, x, y) => speckle(c, x, y, s, 'rgb(86,158,60)', 22));
  drawTile(ctx, TILE.GRASS_SIDE, (c, x, y) => {
    speckle(c, x, y, s, 'rgb(120,86,52)', 14);
    speckle(c, x, y, s * 0.32, 'rgb(86,158,60)', 20);
  });
  drawTile(ctx, TILE.DIRT, (c, x, y) => speckle(c, x, y, s, 'rgb(120,86,52)', 18));
  drawTile(ctx, TILE.STONE, (c, x, y) => speckle(c, x, y, s, 'rgb(130,130,134)', 20));
  drawTile(ctx, TILE.SAND, (c, x, y) => speckle(c, x, y, s, 'rgb(224,203,142)', 12));
  drawTile(ctx, TILE.WATER, (c, x, y) => speckle(c, x, y, s, 'rgb(55,110,190)', 10));
  drawTile(ctx, TILE.WOOD_SIDE, (c, x, y) => {
    speckle(c, x, y, s, 'rgb(103,72,42)', 10);
    c.strokeStyle = 'rgba(60,40,20,0.5)';
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(x, y + (i + 1) * (s / 4));
      c.lineTo(x + s, y + (i + 1) * (s / 4));
      c.stroke();
    }
  });
  drawTile(ctx, TILE.WOOD_TOP, (c, x, y) => {
    speckle(c, x, y, s, 'rgb(150,112,70)', 10);
    c.strokeStyle = 'rgba(90,60,30,0.6)';
    c.beginPath();
    c.arc(x + s / 2, y + s / 2, s * 0.3, 0, Math.PI * 2);
    c.stroke();
  });
  drawTile(ctx, TILE.LEAVES, (c, x, y) => speckle(c, x, y, s, 'rgb(58,120,45)', 26));
  drawTile(ctx, TILE.BEDROCK, (c, x, y) => speckle(c, x, y, s, 'rgb(40,40,42)', 24));
  drawTile(ctx, TILE.SNOW_SIDE, (c, x, y) => {
    speckle(c, x, y, s, 'rgb(120,86,52)', 12);
    speckle(c, x, y, s * 0.35, 'rgb(235,240,245)', 8);
  });
  drawTile(ctx, TILE.SNOW_TOP, (c, x, y) => speckle(c, x, y, s, 'rgb(238,242,248)', 10));

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
