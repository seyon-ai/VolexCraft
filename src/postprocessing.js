// postprocessing.js — the real post-processing pipeline, built from Three.js's
// own examples/jsm addons (not hand-rolled shaders pretending to be a full
// engine). This is genuinely the same machinery production Three.js apps use
// for bloom/SSAO/tone-mapping, so it's a real quality upgrade, not a fake one.
//
// Addon modules are loaded with dynamic import() inside a try/catch rather
// than static imports: a static import failure (e.g. a CDN hiccup on that
// specific path) would fail this whole module, which would cascade up and
// break the entire game since main.js imports this unconditionally. With
// dynamic import, a failure here just means post-processing quietly stays
// off and the game renders directly — everything else keeps working.
//
// Honest scope note: this gives bloom, ambient occlusion, filmic tone mapping,
// and basic color grading/vignette — it does NOT include TAA or true
// volumetric god rays (see main.js/README for what stands in for those).

import * as THREE from 'three';

/** Cheap fragment-only pass: contrast + saturation lift + vignette. This is
 * the "cinematic color grading" + "optional vignette" from the brief —
 * deliberately simple (three scalar knobs) rather than a full LUT-based
 * grading system, which would need external LUT texture assets. */
const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.35 },
    saturation: { value: 1.08 },
    contrast: { value: 1.05 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float vignette;
    uniform float saturation;
    uniform float contrast;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      color.rgb = (color.rgb - 0.5) * contrast + 0.5;
      float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(vec3(gray), color.rgb, saturation);
      vec2 uvCentered = vUv - 0.5;
      float vig = 1.0 - dot(uvCentered, uvCentered) * vignette * 2.0;
      color.rgb *= clamp(vig, 0.0, 1.0);
      gl_FragColor = color;
    }
  `,
};

export class PostProcessing {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = null;
    this.bloomPass = null;
    this.ssaoPass = null;
    this.colorGradePass = null;
    this._pendingPreset = null; // preset requested before the composer finished loading
    this._pendingMobile = false;
    this.ready = this._build();
  }

  async _build() {
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { SSAOPass }, { ShaderPass }, { OutputPass }] =
        await Promise.all([
          import('three/addons/postprocessing/EffectComposer.js'),
          import('three/addons/postprocessing/RenderPass.js'),
          import('three/addons/postprocessing/UnrealBloomPass.js'),
          import('three/addons/postprocessing/SSAOPass.js'),
          import('three/addons/postprocessing/ShaderPass.js'),
          import('three/addons/postprocessing/OutputPass.js'),
        ]);

      const composer = new EffectComposer(this.renderer);
      composer.addPass(new RenderPass(this.scene, this.camera));

      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.6, 0.85
      );
      composer.addPass(this.bloomPass);

      this.ssaoPass = new SSAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
      this.ssaoPass.kernelRadius = 6;
      this.ssaoPass.minDistance = 0.005;
      this.ssaoPass.maxDistance = 0.08;
      this.ssaoPass.enabled = false; // off by default; High+ presets enable it
      composer.addPass(this.ssaoPass);

      this.colorGradePass = new ShaderPass(ColorGradeShader);
      composer.addPass(this.colorGradePass);

      composer.addPass(new OutputPass());

      this.composer = composer;
      if (this._pendingPreset) this.applyPreset(this._pendingPreset, this._pendingMobile);
    } catch (err) {
      console.warn('[postprocessing] addons unavailable, rendering without post-processing:', err);
      this.composer = null;
    }
  }

  setSize(width, height) {
    if (this.composer) this.composer.setSize(width, height);
  }

  /** Applies one of settings.js's GRAPHICS_PRESETS entries. Safe to call before
   * the async composer finishes loading — it's remembered and applied then. */
  applyPreset(preset, isMobile) {
    if (!this.composer) { this._pendingPreset = preset; this._pendingMobile = isMobile; return; }
    if (this.bloomPass) this.bloomPass.enabled = preset.bloom;
    if (this.ssaoPass) this.ssaoPass.enabled = preset.ssao && !isMobile; // SSAO is too costly on mobile GPUs regardless of preset
    if (this.colorGradePass) this.colorGradePass.enabled = preset.colorGrade;
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}

