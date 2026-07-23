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
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.2);
    // Reflectivity never drops to zero even head-on, so it reads as a clean
    // glossy surface instead of see-through water at every angle.
    float reflectivity = clamp(0.42 + fresnel * 0.52, 0.0, 0.95);

    vec3 tinted = mix(deepColor, shallowColor, 0.35);
    vec3 base = mix(tinted, tinted * tex.rgb * 1.15, 0.3); // subtle texture, kept from looking muddy
    vec3 skyReflect = skyColor * 1.1;
    vec3 color = mix(base, skyReflect, reflectivity);

    float sunGlint = pow(max(dot(reflect(-sunDirection, vNormal), viewDir), 0.0), 90.0);
    color += vec3(1.0, 0.97, 0.85) * sunGlint * sunIntensity * 1.4;

    gl_FragColor = vec4(color, opacity);
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
      opacity: { value: 0.93 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader,
    fragmentShader,
  });
}

/** Cheap non-shader fallback (Low preset). */
export function createSimpleWaterMaterial(atlasTexture) {
  return new THREE.MeshLambertMaterial({ map: atlasTexture, transparent: true, opacity: 0.88, depthWrite: false });
}
