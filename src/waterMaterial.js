// waterMaterial.js — one shared ShaderMaterial used by every chunk's water
// mesh (created once in World, not per-chunk) so updating time/sun direction
// each frame is a single uniform write, not one per chunk.
//
// Honest scope note: the "reflection" here is a fresnel-weighted blend
// toward the current sky color, not a real planar reflection of the scene —
// true reflections would need a second render pass per water surface, which
// isn't worth the cost for a voxel game with this much water on screen at
// once. Same for caustics: skipped entirely rather than faked badly.

import * as THREE from 'three';

const vertexShader = `
  uniform float time;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vec3 pos = position;
    vec4 worldPos4 = modelMatrix * vec4(pos, 1.0);
    float wave = sin(worldPos4.x * 0.6 + time * 1.3) * 0.045
               + cos(worldPos4.z * 0.5 + time * 1.1) * 0.045;
    pos.y += wave;
    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D map;
  uniform float time;
  uniform vec3 sunDirection;
  uniform vec3 deepColor;
  uniform vec3 shallowColor;
  uniform vec3 skyColor;
  uniform float opacity;
  uniform float sunIntensity;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vec2 distortedUv = vUv + vec2(
      sin(vWorldPos.z * 0.3 + time * 0.6),
      cos(vWorldPos.x * 0.3 + time * 0.5)
    ) * 0.012;
    vec4 tex = texture2D(map, distortedUv);

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);

    vec3 base = mix(deepColor, shallowColor, 0.4) * tex.rgb * 1.4;
    vec3 withReflectionTint = mix(base, skyColor, fresnel * 0.65);

    float sunGlint = pow(max(dot(reflect(-sunDirection, vNormal), viewDir), 0.0), 60.0);
    withReflectionTint += vec3(1.0, 0.95, 0.8) * sunGlint * sunIntensity;

    gl_FragColor = vec4(withReflectionTint, opacity);
  }
`;

export function createWaterMaterial(atlasTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: atlasTexture },
      time: { value: 0 },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      sunIntensity: { value: 0 },
      deepColor: { value: new THREE.Color(0x0e3a66) },
      shallowColor: { value: new THREE.Color(0x2f7fc1) },
      skyColor: { value: new THREE.Color(0x8fd0f0) },
      opacity: { value: 0.82 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader,
    fragmentShader,
  });
}

/** Cheap non-shader fallback (Low preset). */
export function createSimpleWaterMaterial(atlasTexture) {
  return new THREE.MeshLambertMaterial({ map: atlasTexture, transparent: true, opacity: 0.75, depthWrite: false });
}
