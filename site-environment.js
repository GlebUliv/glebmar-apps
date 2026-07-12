import * as THREE from './vendor/three.module.min.js';

(function () {
  "use strict";

  var canvas = document.querySelector(".site-canvas");
  if (!canvas) return;
  if (!window.WebGL2RenderingContext) {
    var fallback = document.createElement("script");
    fallback.src = "hero-signal-cube.js";
    fallback.defer = true;
    document.head.appendChild(fallback);
    return;
  }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ─── Config ───────────────────────────────────────────────
  var DPR_CAP = 2;
  var CUBE_HALF = 0.35;
  var CUBE_ROT_Y = 0.0000546;          // ~115 s per revolution
  var CUBE_INIT_ROT_Y = 32 * Math.PI / 180;
  var CUBE_INIT_ROT_X = -15 * Math.PI / 180;
  var CUBE_DRIFT_X_AMP = 0.02;
  var CUBE_DRIFT_X_FREQ = 0.00003;
  var CUBE_OFFSET_X = 0;
  var CUBE_OFFSET_Y = 0;             // Cube vertical offset
  var BEVEL_WIDTH = CUBE_HALF * 0.12;
  var BEVEL_AMOUNT = CUBE_HALF * 0.05;
  var CORE_RADIUS = CUBE_HALF * 0.22;

  var CUBE_COUNTS = {
    desktop: { surface: 2200, edges: 560, internal: 2620, core: 700 },
    tablet:  { surface: 2200,  edges: 560, internal: 1460, core: 350  },
    mobile:  { surface: 1200,  edges: 360,  internal: 810,  core: 175  }
  };

  // ─── Energy Structure V2 Config ───────────────────────────
  // Cube width = 2 * CUBE_HALF = 1.1
  var CUBE_WIDTH = 2 * CUBE_HALF;

  // Local circulation motion parameters
  var CIRCULATION_CONFIG = {
    driftAmpMin: 0.015,       // min tangential drift amplitude (normalized spline units)
    driftAmpMax: 0.035,       // max tangential drift amplitude
    driftFreqBase: 0.08,      // base drift frequency (Hz)
    driftFreqVar: 0.04,       // ± frequency variation
    circAmpMax: 0.15,         // max cross-section circulation angular amplitude (radians)
    circFreqBase: 0.05,       // base circulation frequency
    circFreqVar: 0.03,        // ± frequency variation
    microTurbAmp: 0.004,      // micro turbulence displacement
    speedVar: 0.08            // ±8% per-particle speed variation
  };

  // Art-directed centerline control points (12 points)
  // Open C-shape: upper-right entry → upper arc behind cube → left transition
  // → lower arc in front of cube → lower-right exit. Both ends on right side.
  // Z: negative = behind cube (farther from camera), positive = in front (closer)
  var ENERGY_STRUCTURE_CONTROL_POINTS = [
    // Open upper-right entrance
    new THREE.Vector3( 2.05,  0.92, -0.18),
    new THREE.Vector3( 1.55,  0.72, -0.24),

    // Upper arc behind the cube
    new THREE.Vector3( 1.00,  0.58, -0.30),
    new THREE.Vector3( 0.45,  0.54, -0.32),
    new THREE.Vector3(-0.08,  0.38, -0.22),

    // Left transition, close to cube depth
    new THREE.Vector3(-0.30,  0.02, -0.04),

    // Lower arc in front of the cube
    new THREE.Vector3(-0.16, -0.38,  0.16),
    new THREE.Vector3( 0.32, -0.56,  0.25),
    new THREE.Vector3( 0.88, -0.54,  0.22),
    new THREE.Vector3( 1.38, -0.32,  0.12),

    // Open lower-right exit
    new THREE.Vector3( 1.78, -0.04,  0.02),
    new THREE.Vector3( 2.16,  0.22, -0.06)
  ];

  var ENERGY_STRUCTURE_CONFIG = {
    baseWidth: 0.115,
    baseThickness: 0.18,
    opacity: 1.0,
    highlightOpacity: 0.65,
    highlightFraction: 0.035,
    flowSpeed: 0.015,         // base particle flow speed along centerline
    speedVariation: 0.03,     // ±3% speed variation
    lutSize: 256              // centerline lookup table resolution
  };

  // Particle counts — Energy Structure only (atmosphere unchanged)
  // Before: desktop 16700, tablet 14000, mobile 8500
  // After:  desktop 20875 (+25%), tablet 16800 (+20%), mobile 9775 (+15%)
  var FIELD_COUNTS = {
  desktop: { energyStructure: 20875, dust: 3100 },
  tablet:  { energyStructure: 16800, dust: 120 },
  mobile:  { energyStructure: 9775,  dust: 60 }
};

  // ─── Colors ───────────────────────────────────────────────
  var COLOR_NAVY       = [0.118, 0.161, 0.231];
  var COLOR_GREEN      = [0.220, 0.631, 0.412];
  var COLOR_PALE_GREEN = [0.655, 0.890, 0.761];
  var COLOR_SOFT_WHITE = [0.969, 1.000, 0.980];

  // ─── Composition Director — Shot Architecture ────────────
  // The cube is a sculpture at CUBE_OFFSET_X on the right side.
  // The camera looks at a point left of origin so the cube sits at ~70% width.
  // Energy mass is centered at origin — diagonal: top-right → cube → bottom-left.
  // Left side preserves negative space for typography.
  var LOOK_OFFSET_X = -0.6;            // Camera lookAt shifted left
  var SHOTS = [
    { // Shot 01 — Arrival (Hero)
      // Close, slightly right, looking left of origin — cube at ~70% width
      camera: { x: 1.0, y: 0.2, z: 4.5, lookX: LOOK_OFFSET_X, lookY: 0, lookZ: 0 },
      cubeVisibility: 1.0,
      energyStructureOpacity: 1.0,
      atmosphereOpacity: 1.0,
      scrollDispersion: 0
    },
    { // Shot 02 — Publisher
      // Shift left and up — field occupies more visual space
      camera: { x: -1.2, y: 0.6, z: 5.0, lookX: LOOK_OFFSET_X, lookY: 0, lookZ: 0 },
      cubeVisibility: 1.0,
      energyStructureOpacity: 1.0,
      atmosphereOpacity: 0.9,
      scrollDispersion: 0.01
    },
    { // Shot 03 — Principles
      // Pull back, move to side — cube becomes secondary, negative space
      camera: { x: -2.2, y: 0.4, z: 5.8, lookX: LOOK_OFFSET_X, lookY: 0, lookZ: 0 },
      cubeVisibility: 0.75,
      energyStructureOpacity: 0.80,
      atmosphereOpacity: 0.75,
      scrollDispersion: 0.03
    },
    { // Shot 04 — Products
      // Move to another side, closer — reconnect with sculpture
      camera: { x: 1.8, y: -0.4, z: 4.8, lookX: LOOK_OFFSET_X, lookY: 0, lookZ: 0 },
      cubeVisibility: 0.90,
      energyStructureOpacity: 0.90,
      atmosphereOpacity: 0.80,
      scrollDispersion: 0.05
    },
    { // Shot 05 — Closing
      // Pull far back, slightly above — cube nearly disappears
      camera: { x: 0.3, y: 1.2, z: 7.5, lookX: LOOK_OFFSET_X, lookY: 0, lookZ: 0 },
      cubeVisibility: 0.30,
      energyStructureOpacity: 0.40,
      atmosphereOpacity: 0.50,
      scrollDispersion: 0.08
    }
  ];

  // Section selectors matching SHOTS order
  var SECTION_SELECTORS = [
    '.hero',
    '.publisher',
    '.principles',
    '.guardian',
    '.footer'
  ];

  // ─── State ────────────────────────────────────────────────
  var renderer, scene, camera;
  var cubeGroup;
  var atmosphereGroup, energyStructureGroup;
  var atmosphereObjects = [];
  var energyStructureObjects = [];
  var atmosphereOpacityRefs = [];     // {uniform, base} for atmosphere layer
  var energyStructureOpacityRefs = []; // {uniform, base} for energy structure layer
  var cubeOpacityRefs = [];           // {uniform, base} for cube visibility
  var animating = false, rafId = null, lastTime = 0;
  var shotProgress = 0, targetShotProgress = 0; // 0..(SHOTS-1), fractional
  var entranceProgress = 0, targetEntranceProgress = 0;
  var cssW = 0, cssH = 0;
  var pointerTargetX = -9999, pointerTargetY = -9999;
  var pointerSmoothX = -9999, pointerSmoothY = -9999;
  var pointerActive = false;
  var qualityScale = 1;
  var frameCount = 0, fpsAccumulator = 0;

  var uTime = { value: 0 };
  var uScaleGlobal = { value: 20 };
  var uReduceMotion = { value: reduceMotion ? 1.0 : 0.0 };
  var uScrollProgress = { value: 0 };
  var uEntranceProgress = { value: 0 };
  var uLightDebug = { value: 0 };    // 1.0 = grayscale lighting debug
  var uMaterialDebug = { value: 0 }; // 1.0 = material color debug
  var uEmissionDebug = { value: 0 }; // 1.0 = emission-only debug
  var uCubeDepthDebug = { value: 0 };    // 1.0 = cube depth debug
  var uCubeMaterialDebug = { value: 0 }; // 1.0 = cube material isolation

  // ─── Helpers ──────────────────────────────────────────────
  function getDevice() {
    var w = window.innerWidth;
    if (w < 480) return "mobile";
    if (w < 768) return "tablet";
    return "desktop";
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t) { return t * t * (3 - 2 * t); }

  function gaussian() {
    var u = 1 - Math.random();
    var v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function eulerToMat3(x, y, z) {
    var e = new THREE.Euler(x, y, z, 'XYZ');
    var m = new THREE.Matrix4().makeRotationFromEuler(e);
    return new THREE.Matrix3().setFromMatrix4(m);
  }

  // ─── Shape Generator — Macro Density Fields ──────────────
  // The renderer builds SHAPES first, then fills them with particles.
  // Each shape defines density(x, y, z) in world space.
  // Particles are importance-sampled from the density field.
  // If particles were removed, the shapes would still be visible.

  // Shape A: Dominant diagonal band — upper-right → cube → lower-left
  var SHAPE_A = {
  centerline: [[2.4 + CUBE_OFFSET_X, 1.2 + CUBE_OFFSET_Y, 0.05], [1.8 + CUBE_OFFSET_X, 0.6 + CUBE_OFFSET_Y, 0.0], [CUBE_OFFSET_X, CUBE_OFFSET_Y, 0.0], [-1.8 + CUBE_OFFSET_X, -0.6 + CUBE_OFFSET_Y, 0.0], [-2.4 + CUBE_OFFSET_X, -1.2 + CUBE_OFFSET_Y, 0.05]],
  width: 0.35, density: 1.0, broken: false, breakPoints: []
};

var SHAPE_B = {
  centerline: [[1.6 + CUBE_OFFSET_X, 0.8 + CUBE_OFFSET_Y, 0.03], [1.2 + CUBE_OFFSET_X, 0.4 + CUBE_OFFSET_Y, 0.0], [CUBE_OFFSET_X, CUBE_OFFSET_Y, 0.0], [-1.2 + CUBE_OFFSET_X, -0.4 + CUBE_OFFSET_Y, 0.0], [-1.6 + CUBE_OFFSET_X, -0.8 + CUBE_OFFSET_Y, 0.03]],
  width: 0.22, density: 0.5, broken: false, breakPoints: []
};

var SHAPE_C = {
  centerline: [[1.0 + CUBE_OFFSET_X, 0.5 + CUBE_OFFSET_Y, 0.02], [0.6 + CUBE_OFFSET_X, 0.2 + CUBE_OFFSET_Y, 0.0], [CUBE_OFFSET_X, CUBE_OFFSET_Y, 0.0], [-0.6 + CUBE_OFFSET_X, -0.2 + CUBE_OFFSET_Y, 0.0], [-1.0 + CUBE_OFFSET_X, -0.5 + CUBE_OFFSET_Y, 0.02]],
  width: 0.15, density: 0.3, broken: false, breakPoints: []
};

  var ALL_SHAPES = [SHAPE_A, SHAPE_B, SHAPE_C];

  function nearestOnSegment(px, py, pz, ax, ay, az, bx, by, bz) {
    var abx = bx - ax, aby = by - ay, abz = bz - az;
    var ab2 = abx * abx + aby * aby + abz * abz;
    if (ab2 < 1e-8) return { dist: Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay) + (pz - az) * (pz - az)), t: 0 };
    var t = ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / ab2;
    t = Math.max(0, Math.min(1, t));
    var dx = px - (ax + t * abx), dy = py - (ay + t * aby), dz = pz - (az + t * abz);
    return { dist: Math.sqrt(dx * dx + dy * dy + dz * dz), t: t };
  }

  function shapeDensityAt(x, y, z, shape) {
    var minDist = Infinity, bestT = 0;
    for (var i = 0; i < shape.centerline.length - 1; i++) {
      var a = shape.centerline[i], b = shape.centerline[i + 1];
      var r = nearestOnSegment(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2]);
      if (r.dist < minDist) {
        minDist = r.dist;
        bestT = (i + r.t) / (shape.centerline.length - 1);
      }
    }
    var d = Math.exp(-(minDist * minDist) / (shape.width * shape.width * 0.6));
    d *= Math.sin(bestT * Math.PI);
    if (shape.broken) {
      for (var j = 0; j < shape.breakPoints.length; j++) {
        if (Math.abs(bestT - shape.breakPoints[j]) < 0.06) d *= 0.15;
      }
    }
    return d * shape.density;
  }

  function totalDensityAt(x, y, z) {
    var d = 0;
    for (var i = 0; i < ALL_SHAPES.length; i++) {
      d += shapeDensityAt(x, y, z, ALL_SHAPES[i]);
    }
    return Math.min(1.0, d);
  }

  // ─── Material System — Material Response Engine ──────────
  // Every particle belongs to exactly one material.
  // Materials define rendering behavior — not geometry.
  // The generator assigns only: position, materialId, flow, layer, seed.
  // Brightness is a rendering result, not a particle property.
  //
  // Material 0 — Energy Core:      cube core, strong emission
  // Material 1 — Energy Stream:    ribbon flow, center vs edge
  // Material 2 — Transition:       sparse/fragmented field
  // Material 3 — Atmospheric Dust: far background, very weak
  // Material 4 — Cube Surface:     sharp, clear, rim-responsive
  // Material 5 — Cube Internal:    soft, calm, muted
  // Material 6 — Energy Accent:    highlights, strong + emissive

  var MAT = {
    ENERGY_CORE:      0,
    ENERGY_STREAM:    1,
    TRANSITION:       2,
    ATMOSPHERIC_DUST: 3,
    CUBE_SURFACE:     4,
    CUBE_INTERNAL:    5,
    ENERGY_ACCENT:    6
  };

  // Material parameters — used by shader for response computation
  // lightResponse:  how strongly light affects brightness
  // emissionWeight:  base emission independent of light
  // rimResponse:     how strongly rim light contributes
  // saturation:      color saturation multiplier
  // sizeResponse:    size multiplier
  // softness:         alpha edge softness (0=hard, 1=very soft)
  // baseOpacity:      material base opacity
  var MATERIAL_PARAMS = [
    { // 0 — Energy Core
      lightResponse: 1.5,  emissionWeight: 0.25, rimResponse: 0.0,
      saturation: 0.8,  sizeResponse: 1.3,  softness: 0.0,  baseOpacity: 0.40
    },
    { // 1 — Energy Stream
      lightResponse: 1.0,  emissionWeight: 0.05, rimResponse: 0.0,
      saturation: 1.0,  sizeResponse: 1.0,  softness: 0.10, baseOpacity: 0.85
    },
    { // 2 — Transition
      lightResponse: 0.6,  emissionWeight: 0.0,  rimResponse: 0.0,
      saturation: 0.7,  sizeResponse: 0.6,  softness: 0.15, baseOpacity: 0.60
    },
    { // 3 — Atmospheric Dust
      lightResponse: 0.2,  emissionWeight: 0.0,  rimResponse: 0.0,
      saturation: 0.5,  sizeResponse: 0.5,  softness: 0.12, baseOpacity: 0.50
    },
    { // 4 — Cube Surface
      lightResponse: 1.2,  emissionWeight: 0.0,  rimResponse: 1.0,
      saturation: 1.0,  sizeResponse: 1.0,  softness: 0.08, baseOpacity: 0.92
    },
    { // 5 — Cube Internal
      lightResponse: 0.5,  emissionWeight: 0.03, rimResponse: 0.0,
      saturation: 0.6,  sizeResponse: 0.7,  softness: 0.15, baseOpacity: 0.80
    },
    { // 6 — Energy Accent
      lightResponse: 1.3,  emissionWeight: 0.15, rimResponse: 0.0,
      saturation: 0.9,  sizeResponse: 1.1,  softness: 0.0,  baseOpacity: 0.70
    }
  ];

  // ─── Light Field — Physical Lighting Engine ──────────────
  // Four-layer lighting system: Key, Fill, Rim, Ambient.
  // Particles do NOT decide their own brightness — they sample this field.
  // Cube particles sample the same field via lightFieldAtCube().
  //
  // Layer 1 — Key Light: upper-right, strongest, illuminates primary band
  // Layer 2 — Fill Light: centered on cube, very soft, reveals internals
  // Layer 3 — Rim Light: from left/behind, separates cube from field, edges only
  // Layer 4 — Ambient Volume: everywhere, very soft, almost invisible
  //
  // Brightness hierarchy target:
  //   5%  very bright (Key core)
  //  15%  bright     (Key medium / Fill core)
  //  35%  medium     (Fill / Rim / transition)
  //  45%  dark       (Ambient only / fragmentation)

  var LIGHT_ZONES = [
    { // Key Light — upper-right end of diagonal band, strongest
      cx: 2.4 + CUBE_OFFSET_X, cy: 1.2 + CUBE_OFFSET_Y, cz: 0.1,
      radius: 2.0,
      intensity: 1.0,
      falloff: 1.2,
      type: "key"
    },
    { // Fill Light — centered on cube, tight, reveals band through cube
      cx: CUBE_OFFSET_X, cy: CUBE_OFFSET_Y, cz: 0,
      radius: 0.6,
      intensity: 0.35,
      falloff: 0.8,
      type: "fill"
    },
    { // Rim Light — lower-left end, separates band from background
      cx: -2.4 + CUBE_OFFSET_X, cy: -1.2 + CUBE_OFFSET_Y, cz: -0.3,
      radius: 1.2,
      intensity: 0.20,
      falloff: 1.0,
      type: "rim"
    },
    { // Ambient Volume — environment, very soft, large radius
      cx: CUBE_OFFSET_X, cy: CUBE_OFFSET_Y, cz: 0,
      radius: 6.0,
      intensity: 0.05,
      falloff: 3.0,
      type: "ambient"
    }
  ];

  function lightFieldAt(x, y, z) {
    var light = 0.02; // baseline darkness
    for (var i = 0; i < LIGHT_ZONES.length; i++) {
      var z_ = LIGHT_ZONES[i];
      var dx = x - z_.cx, dy = y - z_.cy, dz = z - z_.cz;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var contribution = z_.intensity * Math.exp(-(dist * dist) / (z_.radius * z_.falloff));
      light += contribution;
    }
    return Math.min(1.0, light);
  }

  // Cube-specific light sampling — rim light modulated by surfaceType
  // surfaceType: 0=surface, 1=edge, 2=internal, 3=core
  function lightFieldAtCube(x, y, z, surfaceType) {
    // Convert local cube coords to world coords (approximate, ignore rotation)
    var wx = x + CUBE_OFFSET_X;
    var wy = y + CUBE_OFFSET_Y;
    var wz = z;

    var light = 0.02;
    for (var i = 0; i < LIGHT_ZONES.length; i++) {
      var z_ = LIGHT_ZONES[i];
      var dx = wx - z_.cx, dy = wy - z_.cy, dz = wz - z_.cz;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var contribution = z_.intensity * Math.exp(-(dist * dist) / (z_.radius * z_.falloff));

      // Rim light only affects edges and surface — not internal/core
      if (z_.type === "rim") {
        if (surfaceType === 1) contribution *= 1.0;       // edges — full rim
        else if (surfaceType === 0) contribution *= 0.4;  // surface — partial rim
        else contribution *= 0.0;                          // internal/core — no rim
      }

      light += contribution;
    }
    return Math.min(1.0, light);
  }

  // Classify light intensity into hierarchy tiers
  // Returns: 0=dark, 1=medium, 2=bright, 3=very bright
  function lightTier(light) {
    if (light > 0.75) return 3;
    if (light > 0.45) return 2;
    if (light > 0.15) return 1;
    return 0;
  }

  // ─── Energy Structure V2 — Centerline + Moving Frame ──────
  // Shape-first architecture: an art-directed 3D spline centerline
  // defines the macroform. Particles are sampled arc-length-uniformly
  // along this centerline and placed in four cross-section zones.
  // The vertex shader flows particles along the spline with wrap-around.

  var energyCenterline = null;   // THREE.CatmullRomCurve3
  var energyLUT = null;          // { positions, normals, binormals, arcLengths, totalLength }
  var energyTextures = null;     // { pos, normal, binormal } — THREE.DataTexture

  function buildEnergyCenterline() {
    var pts = ENERGY_STRUCTURE_CONTROL_POINTS.map(function (p) { return p.clone(); });
    energyCenterline = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);

    var N = ENERGY_STRUCTURE_CONFIG.lutSize;
    var positions = new Float32Array(N * 4);
    var normals   = new Float32Array(N * 4);
    var binormals = new Float32Array(N * 4);
    var arcLengths = new Float32Array(N);
    var tangents = [];

    // First pass: positions + tangents + arc-length
    var totalLength = 0;
    var prevPos = null;
    for (var i = 0; i < N; i++) {
      var t = i / (N - 1);
      var pos = energyCenterline.getPoint(t);
      var tan = energyCenterline.getTangent(t).normalize();

      if (i > 0) {
        totalLength += pos.distanceTo(prevPos);
      }
      arcLengths[i] = totalLength;

      positions[i * 4]     = pos.x;
      positions[i * 4 + 1] = pos.y;
      positions[i * 4 + 2] = pos.z;
      positions[i * 4 + 3] = t;
      tangents.push(tan);
      prevPos = pos;
    }

    // Second pass: stable frame via parallel transport
    var prevNormal = null;
    for (var i = 0; i < N; i++) {
      var tan = tangents[i];
      var normal, binormal;

      if (i === 0) {
        // Initial frame: pick a stable perpendicular
        var ref = Math.abs(tan.y) < 0.9
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(1, 0, 0);
        binormal = new THREE.Vector3().crossVectors(tan, ref).normalize();
        normal = new THREE.Vector3().crossVectors(binormal, tan).normalize();
      } else {
        // Parallel transport: project previous normal onto plane ⊥ tangent
        normal = prevNormal.clone();
        var dot = normal.dot(tan);
        normal.sub(tan.clone().multiplyScalar(dot)).normalize();
        binormal = new THREE.Vector3().crossVectors(tan, normal).normalize();
      }

      normals[i * 4]     = normal.x;
      normals[i * 4 + 1] = normal.y;
      normals[i * 4 + 2] = normal.z;
      normals[i * 4 + 3] = 0;

      binormals[i * 4]     = binormal.x;
      binormals[i * 4 + 1] = binormal.y;
      binormals[i * 4 + 2] = binormal.z;
      binormals[i * 4 + 3] = 0;

      prevNormal = normal;
    }

    energyLUT = {
      positions: positions,
      normals: normals,
      binormals: binormals,
      arcLengths: arcLengths,
      totalLength: totalLength
    };
  }

  // Convert uniform arc-length parameter u (0..1) to curve parameter t (0..1)
  function arcLengthToCurveT(u) {
    var targetLen = u * energyLUT.totalLength;
    var arc = energyLUT.arcLengths;
    var N = arc.length;

    // Binary search
    var lo = 0, hi = N - 1;
    while (lo < hi - 1) {
      var mid = (lo + hi) >> 1;
      if (arc[mid] < targetLen) lo = mid;
      else hi = mid;
    }
    var segLen = arc[hi] - arc[lo];
    var frac = segLen > 1e-6 ? (targetLen - arc[lo]) / segLen : 0;
    return (lo + frac) / (N - 1);
  }

  // Sample centerline at arc-length parameter u (0..1)
  function sampleCenterline(u) {
    var t = arcLengthToCurveT(u);
    return energyCenterline.getPoint(t);
  }

  // ─── Profile Functions ────────────────────────────────────
  // Open C-shape: upper-right entry → upper arc → left transition → lower arc → lower-right exit
  // Both open ends taper smoothly. Main visual mass in lower arc (front of cube).

  var BASE_W = ENERGY_STRUCTURE_CONFIG.baseWidth;
  var BASE_T = ENERGY_STRUCTURE_CONFIG.baseThickness;

  function widthAt(t) {
    var w = BASE_W;

    // Upper-right entrance: moderately broad
    w *= 1.0 + 0.18 * Math.exp(-Math.pow((t - 0.08) / 0.13, 2));

    // Upper arc: stable main body
    w *= 1.0 + 0.08 * Math.exp(-Math.pow((t - 0.32) / 0.20, 2));

    // Left transition: slightly narrower
    w *= 1.0 - 0.16 * Math.exp(-Math.pow((t - 0.50) / 0.10, 2));

    // Lower arc: strongest visual body
    w *= 1.0 + 0.20 * Math.exp(-Math.pow((t - 0.70) / 0.17, 2));

    // Both open ends taper smoothly
    var startFade = Math.min(1.0, Math.max(0.0, t / 0.10));
    var endFade = Math.min(1.0, Math.max(0.0, (1.0 - t) / 0.10));

    startFade = smoothstep(startFade);
    endFade = smoothstep(endFade);

    w *= 0.62 + 0.38 * startFade;
    w *= 0.62 + 0.38 * endFade;

    return w;
  }

  function thicknessAt(t) {
    var th = BASE_T;

    // Upper arc behind cube: slightly thinner
    th *= 1.0 - 0.12 * Math.exp(-Math.pow((t - 0.32) / 0.20, 2));

    // Left transition: controlled minimum
    th *= 1.0 - 0.18 * Math.exp(-Math.pow((t - 0.50) / 0.10, 2));

    // Lower arc in front: slightly more volume
    th *= 1.0 + 0.14 * Math.exp(-Math.pow((t - 0.70) / 0.17, 2));

    // Taper both open ends
    var startFade = Math.min(1.0, Math.max(0.0, t / 0.12));
    var endFade = Math.min(1.0, Math.max(0.0, (1.0 - t) / 0.12));

    startFade = smoothstep(startFade);
    endFade = smoothstep(endFade);

    th *= 0.70 + 0.30 * startFade;
    th *= 0.70 + 0.30 * endFade;

    return th;
  }

  function densityAt(t) {
    var centerMass = 0.72 + 0.28 * Math.sin(t * Math.PI);

    var startFade = Math.min(1.0, Math.max(0.0, t / 0.10));
    var endFade = Math.min(1.0, Math.max(0.0, (1.0 - t) / 0.10));

    startFade = smoothstep(startFade);
    endFade = smoothstep(endFade);

    return centerMass * (0.45 + 0.55 * startFade) * (0.45 + 0.55 * endFade);
  }

  // ─── Cross-Section Zone Sampling ───────────────────────────
  // Zone 0: Core       — 0 to 0.15 of half-width,  35% of particles
  // Zone 1: Main body  — 0.15 to 0.45,              35%
  // Zone 2: Edge       — 0.45 to 0.75,              20%
  // Zone 3: Fringe     — 0.75 to 1.0,               10%

  var ZONE_FRACTIONS = [0.35, 0.35, 0.20, 0.10];
  var ZONE_RANGES    = [0.15, 0.30, 0.30, 0.25]; // width of each zone band
  var ZONE_STARTS    = [0.0,  0.15, 0.45, 0.75]; // start radius ratio

  function pickZone() {
    var r = Math.random();
    var cum = 0;
    for (var i = 0; i < ZONE_FRACTIONS.length; i++) {
      cum += ZONE_FRACTIONS[i];
      if (r < cum) return i;
    }
    return 0;
  }

  function sampleCrossRadius(zone) {
    var start = ZONE_STARTS[zone];
    var range = ZONE_RANGES[zone];
    if (zone === 0) return start + Math.pow(Math.random(), 1.5) * range;
    if (zone === 3) return start + Math.pow(Math.random(), 0.5) * range;
    return start + Math.random() * range;
  }

  // Zone → material ID mapping
  // Core → ENERGY_STREAM (bright, coherent)
  // Main → ENERGY_STREAM (standard)
  // Edge → TRANSITION (fragmented)
  // Fringe → TRANSITION (dissolving)
  function zoneToMaterialId(zone) {
    return zone < 2 ? MAT.ENERGY_STREAM : MAT.TRANSITION;
  }

  // Zone → size multiplier
  function zoneToSizeMul(zone) {
    return [1.6, 1.0, 0.5, 0.2][zone];
  }

  // Zone → brightness multiplier
  function zoneToBrightMul(zone) {
    return [1.4, 1.0, 0.5, 0.2][zone];
  }

  // ─── GLSL Material Functions (shared by all shaders) ──────
  var glslMaterialResponse = [
    "void materialResponse(float matId, float light, float widthFactor,",
    "  out float diffuse, out float emission, out float sizeMul,",
    "  out float saturation, out float softness) {",
    "  if (matId < 0.5) {",
    "    diffuse = light * 1.2;",
    "    emission = 0.85 + light * 0.35;",
    "    sizeMul = 0.9;  saturation = 0.8;  softness = 0.15;",
    "  } else if (matId < 1.5) {",
    "    float resp = mix(0.4, 1.2, widthFactor);",
    "    diffuse = light * resp + 0.05;",
    "    emission = mix(0.15, 0.75, widthFactor) * (0.4 + light * 0.6);",
    "    sizeMul = mix(0.7, 1.2, widthFactor);",
    "    saturation = 1.0;  softness = 0.10;",
    "  } else if (matId < 2.5) {",
    "    diffuse = light * 0.6;",
    "    emission = 0.02 + light * 0.10;",
    "    sizeMul = 0.6;  saturation = 0.7;  softness = 0.15;",
    "  } else if (matId < 3.5) {",
    "    diffuse = light * 0.2;",
    "    emission = light * 0.03;",
    "    sizeMul = 0.5;  saturation = 0.5;  softness = 0.12;",
    "  } else if (matId < 4.5) {",
    "    diffuse = light * 1.0;",
    "    emission = light * 0.04;",
    "    sizeMul = 0.78;  saturation = 0.9;  softness = 0.10;",
    "  } else if (matId < 5.5) {",
    "    diffuse = light * 0.35;",
    "    emission = light * 0.02;",
    "    sizeMul = 0.55;  saturation = 0.45;  softness = 0.25;",
    "  } else {",
    "    diffuse = light * 1.3;",
    "    emission = 0.75 + light * 0.45;",
    "    sizeMul = 1.1;  saturation = 0.9;  softness = 0.0;",
    "  }",
    "  diffuse = clamp(diffuse, 0.0, 1.0);",
    "}"
  ].join("\n");

  var glslMaterialDebugColor = [
    "vec3 materialDebugColor(float matId) {",
    "  if (matId < 0.5) return vec3(1.0, 0.0, 0.0);",
    "  else if (matId < 1.5) return vec3(0.0, 1.0, 0.0);",
    "  else if (matId < 2.5) return vec3(0.0, 0.0, 1.0);",
    "  else if (matId < 3.5) return vec3(1.0, 1.0, 1.0);",
    "  else if (matId < 4.5) return vec3(1.0, 1.0, 0.0);",
    "  else if (matId < 5.5) return vec3(0.0, 1.0, 1.0);",
    "  else return vec3(1.0, 0.0, 1.0);",
    "}"
  ].join("\n");

  // ─── Cube Shaders ──────────────────────────────────────────
  var cubeVertexShader = [
    glslMaterialResponse,
    "attribute float size;",
    "attribute float brightness;",
    "attribute float phase;",
    "attribute float surfaceType;",
    "attribute float depthBias;",
    "attribute vec3 colorMix;",
    "uniform float uTime;",
    "uniform float uScale;",
    "uniform float uReduceMotion;",
    "varying vec3 vColor;",
    "varying float vDiffuse;",
    "varying float vEmission;",
    "varying float vSaturation;",
    "varying float vSoftness;",
    "varying float vMaterialId;",
    "varying float vDepth;",
    "varying float vOpacity;",
    "void main() {",
    "  vColor = colorMix;",
    "  vMaterialId = surfaceType;",
    "  float matDiffuse, matEmission, matSize, matSat, matSoft;",
    "  materialResponse(surfaceType, brightness, 1.0, matDiffuse, matEmission, matSize, matSat, matSoft);",
    "  float shimmer = uReduceMotion > 0.5 ? 0.0 : sin(uTime * 0.20 + phase) * 0.0025;",
    "  vec3 dir = normalize(position + vec3(0.001, 0.001, 0.001));",
    "  vec3 transformed = position + dir * shimmer;",
    "  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);",
    "  float depth = -mvPosition.z;",
    // Relative depth: 0=front, 1=rear — smooth continuous falloff
    "  float relDepth = smoothstep(3.8, 6.2, depth + depthBias);",
    "  vDepth = relDepth;",
    // Deterministic per-particle variation (stable, no flicker)
    "  float sizeVar = 1.0 + sin(phase * 1.732) * 0.08;",
    "  float opacityVar = 1.0 + sin(phase * 2.137) * 0.06;",
    "  float softnessVar = 1.0 + sin(phase * 1.593) * 0.05;",
    // Depth attenuation — front larger/sharper, rear smaller/softer
    "  float sizeScale = mix(1.0, 0.55, relDepth);",
    "  gl_PointSize = max(1.0, size * uScale * sizeScale * matSize * sizeVar / depth);",
    // Diffuse: front full, rear reduced
    "  vDiffuse = matDiffuse * mix(1.0, 0.35, relDepth);",
    // Emission: gentle depth falloff (core visible through structure)
    "  vEmission = matEmission * mix(1.0, 0.55, relDepth);",
    // Saturation: front full, rear desaturated
    "  vSaturation = matSat * mix(1.0, 0.5, relDepth);",
    // Softness: rear particles softer
    "  vSoftness = clamp(matSoft * softnessVar * mix(1.0, 1.6, relDepth), 0.0, 0.9);",
    // Material-aware opacity
    "  float matOpacity;",
    "  if (surfaceType < 0.5) {",
    "    matOpacity = 0.35 + brightness * 0.25;",
    "  } else if (surfaceType < 4.5) {",
    "    matOpacity = 0.80;",
    "  } else if (surfaceType < 5.5) {",
    "    matOpacity = 0.38;",
    "  } else {",
    "    matOpacity = 1.0;",
    "  }",
    // Depth attenuates opacity — rear fades but doesn't disappear
    "  vOpacity = matOpacity * opacityVar * mix(1.0, 0.45, relDepth);",
    "  gl_Position = projectionMatrix * mvPosition;",
    "}"
  ].join("\n");

  var cubeFragmentShader = [
    glslMaterialDebugColor,
    "varying vec3 vColor;",
    "varying float vDiffuse;",
    "varying float vEmission;",
    "varying float vSaturation;",
    "varying float vSoftness;",
    "varying float vMaterialId;",
    "varying float vDepth;",
    "varying float vOpacity;",
    "uniform float uOpacity;",
    "uniform float uLightDebug;",
    "uniform float uMaterialDebug;",
    "uniform float uEmissionDebug;",
    "uniform float uCubeDepthDebug;",
    "uniform float uCubeMaterialDebug;",
    "vec3 cubeDepthColor(float d) {",
    "  if (d < 0.5) return mix(vec3(1.0, 0.85, 0.6), vec3(0.4, 0.9, 0.5), d * 2.0);",
    "  return mix(vec3(0.4, 0.9, 0.5), vec3(0.25, 0.35, 0.7), (d - 0.5) * 2.0);",
    "}",
    "vec3 cubeMaterialColor(float matId) {",
    "  if (matId < 0.5) return vec3(1.0, 0.3, 0.3);",
    "  else if (matId < 4.5) return vec3(0.9, 0.8, 0.2);",
    "  else if (matId < 5.5) return vec3(0.3, 0.8, 0.9);",
    "  else return vec3(0.9, 0.3, 0.8);",
    "}",
    "void main() {",
    "  vec2 coord = gl_PointCoord - vec2(0.5);",
    "  float dist = length(coord);",
    "  if (dist > 0.5) discard;",
    "  float edge = 0.5 - vSoftness * 0.42;",
    "  float alpha = smoothstep(0.5, edge, dist);",
    "  if (uMaterialDebug > 0.5) {",
    "    gl_FragColor = vec4(materialDebugColor(vMaterialId), alpha);",
    "  } else if (uLightDebug > 0.5) {",
    "    gl_FragColor = vec4(vec3(vDiffuse), alpha);",
    "  } else if (uCubeMaterialDebug > 0.5) {",
    "    gl_FragColor = vec4(cubeMaterialColor(vMaterialId), alpha);",
    "  } else if (uCubeDepthDebug > 0.5) {",
    "    gl_FragColor = vec4(cubeDepthColor(vDepth), alpha);",
    "  } else if (uEmissionDebug > 0.5) {",
    "    gl_FragColor = vec4(vec3(vEmission), alpha);",
    "  } else {",
    "    vec3 satColor = mix(vec3(dot(vColor, vec3(0.299, 0.587, 0.114))), vColor, vSaturation);",
    "    vec3 diffuseColor = satColor * vDiffuse;",
    "    vec3 emissiveColor = mix(vColor, vec3(0.7, 0.95, 0.8), 0.5) * vEmission;",
    "    gl_FragColor = vec4(diffuseColor + emissiveColor, alpha * vOpacity * uOpacity);",
    "  }",
    "}"
  ].join("\n");

  var cubeHighlightFragmentShader = [
    glslMaterialDebugColor,
    "varying vec3 vColor;",
    "varying float vDiffuse;",
    "varying float vEmission;",
    "varying float vSaturation;",
    "varying float vSoftness;",
    "varying float vMaterialId;",
    "varying float vDepth;",
    "varying float vOpacity;",
    "uniform float uOpacity;",
    "uniform float uLightDebug;",
    "uniform float uMaterialDebug;",
    "uniform float uEmissionDebug;",
    "uniform float uCubeDepthDebug;",
    "uniform float uCubeMaterialDebug;",
    "vec3 cubeDepthColor(float d) {",
    "  if (d < 0.5) return mix(vec3(1.0, 0.85, 0.6), vec3(0.4, 0.9, 0.5), d * 2.0);",
    "  return mix(vec3(0.4, 0.9, 0.5), vec3(0.25, 0.35, 0.7), (d - 0.5) * 2.0);",
    "}",
    "vec3 cubeMaterialColor(float matId) {",
    "  if (matId < 0.5) return vec3(1.0, 0.3, 0.3);",
    "  else if (matId < 4.5) return vec3(0.9, 0.8, 0.2);",
    "  else if (matId < 5.5) return vec3(0.3, 0.8, 0.9);",
    "  else return vec3(0.9, 0.3, 0.8);",
    "}",
    "void main() {",
    "  vec2 coord = gl_PointCoord - vec2(0.5);",
    "  float dist = length(coord);",
    "  if (dist > 0.5) discard;",
    "  float edge = 0.5 - vSoftness * 0.5;",
    "  float alpha = smoothstep(0.5, edge, dist);",
    "  if (uMaterialDebug > 0.5) {",
    "    gl_FragColor = vec4(materialDebugColor(vMaterialId), alpha);",
    "  } else if (uLightDebug > 0.5) {",
    "    gl_FragColor = vec4(vec3(vDiffuse), alpha);",
    "  } else if (uCubeMaterialDebug > 0.5) {",
    "    gl_FragColor = vec4(cubeMaterialColor(vMaterialId), alpha);",
    "  } else if (uCubeDepthDebug > 0.5) {",
    "    gl_FragColor = vec4(cubeDepthColor(vDepth), alpha);",
    "  } else if (uEmissionDebug > 0.5) {",
    "    gl_FragColor = vec4(vec3(vEmission), alpha);",
    "  } else {",
    "    vec3 satColor = mix(vec3(dot(vColor, vec3(0.299, 0.587, 0.114))), vColor, vSaturation);",
    "    vec3 diffuseColor = satColor * vDiffuse;",
    "    vec3 emissiveColor = mix(vColor, vec3(0.8, 0.98, 0.9), 0.6) * vEmission;",
    "    gl_FragColor = vec4(diffuseColor + emissiveColor, alpha * vOpacity * uOpacity);",
    "  }",
    "}"
  ].join("\n");

  // ─── Cube Particle Generation (LOCKED — unchanged from V1) ─
  function pickSurfaceColor() {
    var r = Math.random();
    if (r < 0.55) return COLOR_NAVY;
    if (r < 0.90) return COLOR_GREEN;
    return Math.random() < 0.5 ? COLOR_PALE_GREEN : COLOR_SOFT_WHITE;
  }

  function pickEdgeColor() {
    var r = Math.random();
    if (r < 0.50) return COLOR_NAVY;
    if (r < 0.88) return COLOR_GREEN;
    return Math.random() < 0.5 ? COLOR_PALE_GREEN : COLOR_SOFT_WHITE;
  }

  function pickInternalColor() {
    var r = Math.random();
    if (r < 0.60) return COLOR_NAVY;
    if (r < 0.93) return COLOR_GREEN;
    return COLOR_PALE_GREEN;
  }

  function edgeBias() {
    return (Math.random() < 0.5 ? 1 : -1) * Math.pow(Math.random(), 0.55);
  }

  function generateSurfaceParticle() {
    var face = Math.floor(Math.random() * 6);
    var h = CUBE_HALF;
    var noise = h * 0.04;
    var u = h * edgeBias();
    var v = h * edgeBias();
    var w = (Math.random() < 0.5 ? 1 : -1) * h;
    var x, y, z;
    if (face < 2) { x = w; y = u; z = v; }
    else if (face < 4) { x = u; y = w; z = v; }
    else { x = u; y = v; z = w; }

    var maxUV = Math.max(Math.abs(u), Math.abs(v));
    if (maxUV > h - BEVEL_WIDTH) {
      var bf = (maxUV - (h - BEVEL_WIDTH)) / BEVEL_WIDTH;
      var wAbs = Math.abs(w);
      var wSign = w >= 0 ? 1 : -1;
      w = wSign * (wAbs - bf * BEVEL_AMOUNT);
    }

    x += (Math.random() - 0.5) * noise;
    y += (Math.random() - 0.5) * noise;
    z += (Math.random() - 0.5) * noise;

    var c = pickSurfaceColor();
    var sLight = lightFieldAtCube(x, y, z, 0);
    return {
      x: x, y: y, z: z,
      r: c[0], g: c[1], b: c[2],
      size: 1.0 + Math.random() * 1.5,
      light: sLight,
      materialId: MAT.CUBE_SURFACE,
      phase: Math.random() * Math.PI * 2,
      depthBias: (Math.random() - 0.5) * 0.4
    };
  }

  function generateEdgeParticle() {
    var h = CUBE_HALF;
    var noise = h * 0.03;
    var edgeIdx = Math.floor(Math.random() * 12);
    var axis = Math.floor(edgeIdx / 4);
    var sub = edgeIdx % 4;
    var f1 = (sub & 1) ? h : -h;
    var f2 = (sub & 2) ? h : -h;
    var t = (Math.random() < 0.5 ? 1 : -1) * h * Math.pow(Math.random(), 0.4);

    var x, y, z;
    if (axis === 0) { x = t; y = f1; z = f2; }
    else if (axis === 1) { x = f1; y = t; z = f2; }
    else { x = f1; y = f2; z = t; }

    var cornerDist = h - Math.abs(t);
    var bevelW = h * 0.10;
    if (cornerDist < bevelW) {
      var bf = 1 - cornerDist / bevelW;
      var pull = 1 - bf * 0.04;
      if (axis === 0) { y *= pull; z *= pull; }
      else if (axis === 1) { x *= pull; z *= pull; }
      else { x *= pull; y *= pull; }
    }

    x += (Math.random() - 0.5) * noise;
    y += (Math.random() - 0.5) * noise;
    z += (Math.random() - 0.5) * noise;

    var c = pickEdgeColor();
    var eLight = lightFieldAtCube(x, y, z, 1);
    return {
      x: x, y: y, z: z,
      r: c[0], g: c[1], b: c[2],
      size: 0.8 + Math.random() * 1.2,
      light: eLight,
      materialId: MAT.ENERGY_ACCENT,
      phase: Math.random() * Math.PI * 2,
      depthBias: (Math.random() - 0.5) * 0.4
    };
  }

  function generateInternalParticle() {
    var h = CUBE_HALF * 0.85;
    var x = (Math.random() * 2 - 1) * h;
    var y = (Math.random() * 2 - 1) * h;
    var z = (Math.random() * 2 - 1) * h;
    var c = pickInternalColor();
    var iLight = lightFieldAtCube(x, y, z, 2);
    return {
      x: x, y: y, z: z,
      r: c[0], g: c[1], b: c[2],
      size: 0.5 + Math.random() * 0.8,
      light: iLight,
      materialId: MAT.CUBE_INTERNAL,
      phase: Math.random() * Math.PI * 2,
      depthBias: (Math.random() - 0.5) * 0.4
    };
  }

  function generateCoreParticle() {
    var x = gaussian() * CORE_RADIUS;
    var y = gaussian() * CORE_RADIUS;
    var z = gaussian() * CORE_RADIUS;
    var dist = Math.sqrt(x * x + y * y + z * z);
    var centerFactor = 1 - Math.min(1, dist / (CORE_RADIUS * 2));
    var c = Math.random() < 0.70 ? COLOR_PALE_GREEN : COLOR_SOFT_WHITE;
    var coreLight = lightFieldAtCube(x, y, z, 3);
    return {
      x: x, y: y, z: z,
      r: c[0], g: c[1], b: c[2],
      size: 0.4 + Math.random() * 0.6,
      light: coreLight * (0.75 + centerFactor * 0.25),
      materialId: MAT.ENERGY_CORE,
      phase: Math.random() * Math.PI * 2,
      depthBias: (Math.random() - 0.5) * 0.3
    };
  }

  // ─── Cube System Creation (LOCKED — unchanged from V1) ────
  function fillGeometry(geo, particles) {
    var n = particles.length;
    var pos = new Float32Array(n * 3);
    var col = new Float32Array(n * 3);
    var sz = new Float32Array(n);
    var br = new Float32Array(n);
    var ph = new Float32Array(n);
    var st = new Float32Array(n);
    var db = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var p = particles[i];
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 3] = p.r; col[i * 3 + 1] = p.g; col[i * 3 + 2] = p.b;
      sz[i] = p.size; br[i] = p.light; ph[i] = p.phase;
      st[i] = p.materialId; db[i] = p.depthBias;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("colorMix", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(sz, 1));
    geo.setAttribute("brightness", new THREE.BufferAttribute(br, 1));
    geo.setAttribute("phase", new THREE.BufferAttribute(ph, 1));
    geo.setAttribute("surfaceType", new THREE.BufferAttribute(st, 1));
    geo.setAttribute("depthBias", new THREE.BufferAttribute(db, 1));
  }

  function createCubeSystem(counts) {
    cubeGroup = new THREE.Group();
    cubeGroup.rotation.y = CUBE_INIT_ROT_Y;
    cubeGroup.rotation.x = CUBE_INIT_ROT_X;

    var mainParts = [];
    var i;
    for (i = 0; i < counts.surface; i++) mainParts.push(generateSurfaceParticle());
    for (i = 0; i < counts.edges; i++) mainParts.push(generateEdgeParticle());
    for (i = 0; i < counts.internal; i++) mainParts.push(generateInternalParticle());

    var mainGeo = new THREE.BufferGeometry();
    fillGeometry(mainGeo, mainParts);
    var mainMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: uTime, uScale: uScaleGlobal,
        uOpacity: { value: 0.92 }, uReduceMotion: uReduceMotion,
        uLightDebug: uLightDebug, uMaterialDebug: uMaterialDebug,
        uEmissionDebug: uEmissionDebug,
        uCubeDepthDebug: uCubeDepthDebug, uCubeMaterialDebug: uCubeMaterialDebug
      },
      vertexShader: cubeVertexShader,
      fragmentShader: cubeFragmentShader,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.NormalBlending
    });
    var mainPoints = new THREE.Points(mainGeo, mainMat);
    mainPoints.frustumCulled = false;
    mainPoints.renderOrder = 0;
    cubeGroup.add(mainPoints);
    cubeOpacityRefs.push({ uniform: mainMat.uniforms.uOpacity, base: 0.92 });

    var coreParts = [];
    for (i = 0; i < counts.core; i++) coreParts.push(generateCoreParticle());

    var coreGeo = new THREE.BufferGeometry();
    fillGeometry(coreGeo, coreParts);
    var coreMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: uTime, uScale: uScaleGlobal,
        uOpacity: { value: 0.40 }, uReduceMotion: uReduceMotion,
        uLightDebug: uLightDebug, uMaterialDebug: uMaterialDebug,
        uEmissionDebug: uEmissionDebug,
        uCubeDepthDebug: uCubeDepthDebug, uCubeMaterialDebug: uCubeMaterialDebug
      },
      vertexShader: cubeVertexShader,
      fragmentShader: cubeHighlightFragmentShader,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending
    });
    var corePoints = new THREE.Points(coreGeo, coreMat);
    corePoints.frustumCulled = false;
    corePoints.renderOrder = 0;
    cubeGroup.add(corePoints);
    cubeOpacityRefs.push({ uniform: coreMat.uniforms.uOpacity, base: 0.40 });

    scene.add(cubeGroup);
  }

  // ─── Energy Structure V2 Shaders ───────────────────────────
  // Particles oscillate locally around their baseT position on a 3D centerline.
  // No global travel — bounded tangential drift + cross-section circulation.
  // Cross-section offset uses a stable moving frame (normal/binormal).
  var fieldVertexShader = [
    glslMaterialResponse,
    "attribute float aT;",
    "attribute float aCrossR;",
    "attribute float aCrossAngle;",
    "attribute float aSeed;",
    "attribute float aPhase;",
    "attribute vec3 aDrift;",   // dir, amp, freq
    "attribute vec2 aCirc;",     // freq, amp
    "attribute float aSize;",
    "attribute float aBrightness;",
    "attribute vec3 aColorMix;",
    "attribute float aMaterialId;",
    "uniform float uTime;",
    "uniform float uPointScale;",
    "uniform float uReduceMotion;",
    "uniform float uScrollProgress;",
    "uniform float uEntrance;",
    "uniform float uCullMode;",
    "uniform float uCubeZ;",
    "uniform sampler2D uCenterlinePos;",
    "uniform sampler2D uCenterlineNormal;",
    "uniform sampler2D uCenterlineBinormal;",
    "varying vec3 vColor;",
    "varying float vDiffuse;",
    "varying float vEmission;",
    "varying float vSaturation;",
    "varying float vSoftness;",
    "varying float vMaterialId;",
    // Profile functions — must match JS widthAt/thicknessAt
    "float widthAt(float t) {",
    "  float w = 0.115;",
    "  w *= 1.0 + 0.18 * exp(-pow((t - 0.08) / 0.13, 2.0));",
    "  w *= 1.0 + 0.08 * exp(-pow((t - 0.32) / 0.20, 2.0));",
    "  w *= 1.0 - 0.16 * exp(-pow((t - 0.50) / 0.10, 2.0));",
    "  w *= 1.0 + 0.20 * exp(-pow((t - 0.70) / 0.17, 2.0));",
    "  float startFade = clamp(t / 0.10, 0.0, 1.0);",
    "  float endFade = clamp((1.0 - t) / 0.10, 0.0, 1.0);",
    "  startFade = startFade * startFade * (3.0 - 2.0 * startFade);",
    "  endFade = endFade * endFade * (3.0 - 2.0 * endFade);",
    "  w *= 0.62 + 0.38 * startFade;",
    "  w *= 0.62 + 0.38 * endFade;",
    "  return w;",
    "}",
    "float thicknessAt(float t) {",
    "  float th = 0.18;",
    "  th *= 1.0 - 0.12 * exp(-pow((t - 0.32) / 0.20, 2.0));",
    "  th *= 1.0 - 0.18 * exp(-pow((t - 0.50) / 0.10, 2.0));",
    "  th *= 1.0 + 0.14 * exp(-pow((t - 0.70) / 0.17, 2.0));",
    "  float startFade = clamp(t / 0.12, 0.0, 1.0);",
    "  float endFade = clamp((1.0 - t) / 0.12, 0.0, 1.0);",
    "  startFade = startFade * startFade * (3.0 - 2.0 * startFade);",
    "  endFade = endFade * endFade * (3.0 - 2.0 * endFade);",
    "  th *= 0.70 + 0.30 * startFade;",
    "  th *= 0.70 + 0.30 * endFade;",
    "  return th;",
    "}",
    "void main() {",
    "  float flowTime = uReduceMotion > 0.5 ? 0.0 : uTime;",
    // Bounded local circulation — no global travel, no wrapping
    // 1. Tangential drift: bounded sinusoidal around baseT
    "  float drift = aDrift.x * aDrift.y * sin(flowTime * aDrift.z + aPhase);",
    "  float t = aT + drift;",
    // Clamp near open endpoints — no wrapping
    "  t = clamp(t, 0.001, 0.999);",
    // Sample centerline LUT textures
    "  vec2 lutCoord = vec2(t, 0.5);",
    "  vec3 centerlinePos = texture2D(uCenterlinePos, lutCoord).rgb;",
    "  vec3 normal = texture2D(uCenterlineNormal, lutCoord).rgb;",
    "  vec3 binormal = texture2D(uCenterlineBinormal, lutCoord).rgb;",
    // Width/thickness at this point along centerline
    "  float w = widthAt(t);",
    "  float th = thicknessAt(t);",
    // 2. Cross-section circulation: slow angular oscillation around tangent
    "  float circAngle = aCrossAngle + aCirc.y * sin(flowTime * aCirc.x + aPhase * 1.7);",
    "  float cosA = cos(circAngle);",
    "  float sinA = sin(circAngle);",
    "  vec3 worldPos = centerlinePos + normal * (cosA * aCrossR * w) + binormal * (sinA * aCrossR * th);",
    // 3. Micro turbulence: deterministic from seed + phase, no per-frame random
    "  float n1 = sin(flowTime * 0.7 + aSeed * 6.283 + aPhase) * 0.004;",
    "  float n2 = cos(flowTime * 0.5 + aSeed * 4.56 + aPhase * 1.3) * 0.004;",
    "  worldPos += normal * n1 + binormal * n2;",
    // Entrance scale
    "  worldPos *= mix(0.75, 1.0, uEntrance);",
    // Scroll dispersion
    "  worldPos += normalize(worldPos + vec3(0.001)) * uScrollProgress * 0.4;",
    "  vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);",
    // Front/back culling for cube depth integration
    "  float zDiff = mvPosition.z - uCubeZ;",
    "  if (uCullMode < 0.5 && zDiff > 0.0) {",
    "    gl_PointSize = 0.0;",
    "    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);",
    "    return;",
    "  }",
    "  if (uCullMode > 0.5 && zDiff <= 0.0) {",
    "    gl_PointSize = 0.0;",
    "    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);",
    "    return;",
    "  }",
    // Density modulation — fluid-like, not symmetric
    "  float densityShift = flowTime * 0.08;",
    "  float densityMod = 0.65",
    "    + 0.30 * sin(t * 6.283185 * 1.5 + aSeed * 3.0 + densityShift)",
    "    + 0.18 * cos(t * 6.283185 * 2.7 + aSeed * 5.0 + densityShift * 0.7);",
    // Breathing — slow density oscillation
    "  float breath = sin(flowTime * 0.3 + aPhase) * 0.03;",
    "  densityMod += breath;",
    "  densityMod = max(0.2, densityMod);",
    // Zone-based width factor (replaces old aWidthOffset/uHalfWidth)
    "  float widthFactor = 1.0 - aCrossR;",
    "  widthFactor = smoothstep(0.0, 0.4, widthFactor);",
    // Cube emergence — gradual density reduction near center (negative space)
    "  float distToCenter = length(mvPosition.xy);",
    "  float clarityFactor = smoothstep(0.40, 1.1, distToCenter);",
    "  float frontWeight = smoothstep(-0.15, 0.35, zDiff);",
    // Material response — separate diffuse and emission
    "  float matDiffuse, matEmission, matSize, matSat, matSoft;",
    "  materialResponse(aMaterialId, aBrightness, widthFactor, matDiffuse, matEmission, matSize, matSat, matSoft);",
    "  vColor = aColorMix;",
    "  vMaterialId = aMaterialId;",
    "  float clarityMod = mix(1.0, mix(0.20, 1.0, clarityFactor), frontWeight);",
    "  vDiffuse = matDiffuse * densityMod * widthFactor * clarityMod;",
    // Stream emission: center emits more, edges less, density reinforces
    "  vEmission = matEmission * widthFactor * densityMod * clarityMod;",
    "  vSaturation = matSat;",
    "  vSoftness = matSoft;",
    // Depth attenuation
    "  float depth = -mvPosition.z;",
    "  float depthFactor = smoothstep(3.0, 7.5, depth);",
    "  gl_PointSize = max(1.0, aSize * uPointScale * matSize * (1.0 - depthFactor * 0.25) / depth);",
    "  gl_Position = projectionMatrix * mvPosition;",
    "}"
  ].join("\n");

  var fieldFragmentShader = [
    glslMaterialDebugColor,
    "varying vec3 vColor;",
    "varying float vDiffuse;",
    "varying float vEmission;",
    "varying float vSaturation;",
    "varying float vSoftness;",
    "varying float vMaterialId;",
    "uniform float uOpacity;",
    "uniform float uLightDebug;",
    "uniform float uMaterialDebug;",
    "uniform float uEmissionDebug;",
    "void main() {",
    "  vec2 coord = gl_PointCoord - vec2(0.5);",
    "  float dist = length(coord);",
    "  if (dist > 0.5) discard;",
    "  float edge = 0.10 + vSoftness * 0.32;",
    "  float alpha = smoothstep(0.5, edge, dist);",
    "  if (uMaterialDebug > 0.5) {",
    "    gl_FragColor = vec4(materialDebugColor(vMaterialId), alpha);",
    "  } else if (uLightDebug > 0.5) {",
    "    gl_FragColor = vec4(vec3(vDiffuse), alpha);",
    "  } else if (uEmissionDebug > 0.5) {",
    "    gl_FragColor = vec4(vec3(vEmission), alpha);",
    "  } else {",
    "    vec3 satColor = mix(vec3(dot(vColor, vec3(0.299, 0.587, 0.114))), vColor, vSaturation);",
    "    vec3 diffuseColor = satColor * vDiffuse;",
    "    vec3 emissiveColor = mix(vColor, vec3(0.8, 1.0, 0.9), 0.6) * vEmission * 1.3;",
    "    gl_FragColor = vec4(diffuseColor + emissiveColor, alpha * uOpacity);",
    "  }",
    "}"
  ].join("\n");

  var fieldHighlightFragmentShader = [
    glslMaterialDebugColor,
    "varying vec3 vColor;",
    "varying float vDiffuse;",
    "varying float vEmission;",
    "varying float vSaturation;",
    "varying float vSoftness;",
    "varying float vMaterialId;",
    "uniform float uOpacity;",
    "uniform float uLightDebug;",
    "uniform float uMaterialDebug;",
    "uniform float uEmissionDebug;",
    "void main() {",
    "  vec2 coord = gl_PointCoord - vec2(0.5);",
    "  float dist = length(coord);",
    "  if (dist > 0.5) discard;",
    "  float edge = vSoftness * 0.4;",
    "  float alpha = smoothstep(0.5, edge, dist);",
    "  if (uMaterialDebug > 0.5) {",
    "    gl_FragColor = vec4(materialDebugColor(vMaterialId), alpha);",
    "  } else if (uLightDebug > 0.5) {",
    "    gl_FragColor = vec4(vec3(vDiffuse), alpha);",
    "  } else if (uEmissionDebug > 0.5) {",
    "    gl_FragColor = vec4(vec3(vEmission), alpha);",
    "  } else {",
    "    vec3 satColor = mix(vec3(dot(vColor, vec3(0.299, 0.587, 0.114))), vColor, vSaturation);",
    "    vec3 diffuseColor = satColor * vDiffuse;",
    "    vec3 emissiveColor = mix(vColor, vec3(0.9, 1.0, 0.95), 0.8) * vEmission * 1.5;",
    "    gl_FragColor = vec4(diffuseColor + emissiveColor, alpha * uOpacity);",
    "  }",
    "}"
  ].join("\n");

  // ─── Dust Shaders ─────────────────────────────────────────
  var dustVertexShader = [
    glslMaterialResponse,
    "attribute float aSize;",
    "attribute vec3 aColorMix;",
    "attribute float aPhase;",
    "attribute float aBrightness;",
    "attribute float aMaterialId;",
    "uniform float uTime;",
    "uniform float uPointScale;",
    "uniform float uReduceMotion;",
    "uniform float uEntrance;",
    "varying vec3 vColor;",
    "varying float vDiffuse;",
    "varying float vEmission;",
    "varying float vSaturation;",
    "varying float vSoftness;",
    "varying float vMaterialId;",
    "void main() {",
    "  vColor = aColorMix;",
    "  vMaterialId = aMaterialId;",
    "  float matDiffuse, matEmission, matSize, matSat, matSoft;",
    "  materialResponse(aMaterialId, aBrightness, 1.0, matDiffuse, matEmission, matSize, matSat, matSoft);",
    "  float drift = uReduceMotion > 0.5 ? 0.0 : sin(uTime * 0.1 + aPhase) * 0.02;",
    "  vec3 pos = position;",
    "  pos.x += drift;",
    "  pos.y += cos(uTime * 0.08 + aPhase) * 0.02;",
    "  pos *= mix(0.75, 1.0, uEntrance);",
    "  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);",
    "  vDiffuse = matDiffuse;",
    "  vEmission = matEmission;",
    "  vSaturation = matSat;",
    "  vSoftness = matSoft;",
    "  float depth = -mvPosition.z;",
    "  float depthFactor = smoothstep(3.0, 8.0, depth);",
    "  gl_PointSize = max(1.0, aSize * uPointScale * matSize * (1.0 - depthFactor * 0.3) / depth);",
    "  gl_Position = projectionMatrix * mvPosition;",
    "}"
  ].join("\n");

  var dustFragmentShader = [
    glslMaterialDebugColor,
    "varying vec3 vColor;",
    "varying float vDiffuse;",
    "varying float vEmission;",
    "varying float vSaturation;",
    "varying float vSoftness;",
    "varying float vMaterialId;",
    "uniform float uOpacity;",
    "uniform float uLightDebug;",
    "uniform float uMaterialDebug;",
    "uniform float uEmissionDebug;",
    "void main() {",
    "  vec2 coord = gl_PointCoord - vec2(0.5);",
    "  float dist = length(coord);",
    "  if (dist > 0.5) discard;",
    "  float edge = 0.12 + vSoftness * 0.30;",
    "  float alpha = smoothstep(0.5, edge, dist);",
    "  if (uMaterialDebug > 0.5) {",
    "    gl_FragColor = vec4(materialDebugColor(vMaterialId), alpha);",
    "  } else if (uLightDebug > 0.5) {",
    "    gl_FragColor = vec4(vec3(vDiffuse), alpha);",
    "  } else if (uEmissionDebug > 0.5) {",
    "    gl_FragColor = vec4(vec3(vEmission), alpha);",
    "  } else {",
    "    vec3 satColor = mix(vec3(dot(vColor, vec3(0.299, 0.587, 0.114))), vColor, vSaturation);",
    "    vec3 diffuseColor = satColor * vDiffuse;",
    "    vec3 emissiveColor = vColor * vEmission;",
    "    gl_FragColor = vec4(diffuseColor + emissiveColor, alpha * uOpacity);",
    "  }",
    "}"
  ].join("\n");

  // ─── Energy Structure V2 Particle Generation ───────────────
  function pickEnergyColor() {
    var r = Math.random();
    if (r < 0.60) return COLOR_NAVY;
    if (r < 0.90) return COLOR_GREEN;
    return Math.random() < 0.5 ? COLOR_PALE_GREEN : COLOR_SOFT_WHITE;
  }

  function pickHighlightColor() {
    return Math.random() < 0.7 ? COLOR_GREEN : COLOR_PALE_GREEN;
  }

  // Depth layers — preserved from V1 for visual continuity
  var DEPTH_LAYERS = [
    { id: 1, fraction: 0.035, sizeMul: 1.45, brightMul: 1.15 },
    { id: 2, fraction: 0.625, sizeMul: 1.00, brightMul: 1.00 },
    { id: 3, fraction: 0.280, sizeMul: 0.50, brightMul: 0.58 },
    { id: 4, fraction: 0.060, sizeMul: 0.20, brightMul: 0.27 }
  ];

  function pickDepthLayer() {
    var r = Math.random();
    var cum = 0;
    for (var i = 0; i < DEPTH_LAYERS.length; i++) {
      cum += DEPTH_LAYERS[i].fraction;
      if (r < cum) return DEPTH_LAYERS[i];
    }
    return DEPTH_LAYERS[1];
  }

  function generateEnergyParticles(count) {
    var particles = [];
    var highlightCount = Math.floor(count * ENERGY_STRUCTURE_CONFIG.highlightFraction);
    var mainCount = count - highlightCount;
    var cfg = ENERGY_STRUCTURE_CONFIG;

    // Main particles
    for (var i = 0; i < mainCount; i++) {
      var accepted = false;
      var layer = pickDepthLayer();

      for (var attempt = 0; attempt < 30; attempt++) {
        // Arc-length uniform sampling along centerline
        var u = Math.random();
        var zone = pickZone();
        var crossR = sampleCrossRadius(zone);
        var crossAngle = Math.random() * Math.PI * 2;

        // Density acceptance
        var dens = densityAt(u);
        var zoneAccept = [1.0, 0.95, 0.75, 0.40][zone];
        if (Math.random() < dens * zoneAccept) {
          // Sample world position for light field
          var wPos = sampleCenterline(u);
          var light = lightFieldAt(wPos.x, wPos.y, wPos.z);

          // Local circulation: bounded drift + cross-section rotation
          var driftDir = Math.random() < 0.5 ? 1.0 : -1.0;
          var driftAmp = CIRCULATION_CONFIG.driftAmpMin + Math.random() * (CIRCULATION_CONFIG.driftAmpMax - CIRCULATION_CONFIG.driftAmpMin);
          var driftFreq = CIRCULATION_CONFIG.driftFreqBase + (Math.random() * 2 - 1) * CIRCULATION_CONFIG.driftFreqVar;
          var circFreq = CIRCULATION_CONFIG.circFreqBase + (Math.random() * 2 - 1) * CIRCULATION_CONFIG.circFreqVar;
          var circAmp = Math.random() * CIRCULATION_CONFIG.circAmpMax;

          // Color
          var c = pickEnergyColor();
          var tier = lightTier(light);
          var materialId = zoneToMaterialId(zone);
          var sizeMul = zoneToSizeMul(zone);
          var brightMul = zoneToBrightMul(zone);

          // Light tier can upgrade material
          if (tier === 3) { materialId = MAT.ENERGY_STREAM; sizeMul = Math.max(sizeMul, 1.0); }
          else if (tier === 2) { materialId = MAT.ENERGY_STREAM; sizeMul = Math.max(sizeMul, 0.75); }

          var finalSize = (0.5 + dens * 1.2 * sizeMul) * layer.sizeMul;

          particles.push({
            t: u,
            crossR: crossR,
            crossAngle: crossAngle,
            zone: zone,
            seed: Math.random(),
            phase: Math.random() * Math.PI * 2,
            driftDir: driftDir,
            driftAmp: driftAmp,
            driftFreq: driftFreq,
            circFreq: circFreq,
            circAmp: circAmp,
            size: finalSize,
            light: Math.min(1.0, light * brightMul * layer.brightMul),
            materialId: materialId,
            color: c,
            isHighlight: false
          });
          accepted = true;
          break;
        }
      }

      if (!accepted) { i--; continue; }
    }

    // Highlights — only in core/main zones where light is strong
    for (var j = 0; j < highlightCount; j++) {
      var hAccepted = false;
      var hLayer = Math.random() < 0.25 ? DEPTH_LAYERS[0] : DEPTH_LAYERS[1];

      for (var attempt = 0; attempt < 50; attempt++) {
        var hU = Math.random();
        var hZone = Math.random() < 0.7 ? 0 : 1; // Core or main only
        var hCrossR = sampleCrossRadius(hZone);
        var hCrossAngle = Math.random() * Math.PI * 2;

        var hWPos = sampleCenterline(hU);
        var hLight = lightFieldAt(hWPos.x, hWPos.y, hWPos.z);
        var hDens = densityAt(hU);

        if (hLight > 0.65 && hDens > 0.5 && Math.random() < hLight * hDens * 1.4) {
          var hDriftDir = Math.random() < 0.5 ? 1.0 : -1.0;
          var hDriftAmp = CIRCULATION_CONFIG.driftAmpMin + Math.random() * (CIRCULATION_CONFIG.driftAmpMax - CIRCULATION_CONFIG.driftAmpMin);
          var hDriftFreq = CIRCULATION_CONFIG.driftFreqBase + (Math.random() * 2 - 1) * CIRCULATION_CONFIG.driftFreqVar;
          var hCircFreq = CIRCULATION_CONFIG.circFreqBase + (Math.random() * 2 - 1) * CIRCULATION_CONFIG.circFreqVar;
          var hCircAmp = Math.random() * CIRCULATION_CONFIG.circAmpMax;
          var cH = pickHighlightColor();

          particles.push({
            t: hU,
            crossR: hCrossR,
            crossAngle: hCrossAngle,
            zone: hZone,
            seed: Math.random(),
            phase: Math.random() * Math.PI * 2,
            driftDir: hDriftDir,
            driftAmp: hDriftAmp,
            driftFreq: hDriftFreq,
            circFreq: hCircFreq,
            circAmp: hCircAmp,
            size: (0.6 + hLight * 0.7) * hLayer.sizeMul,
            light: Math.min(1.0, hLight * hLayer.brightMul),
            materialId: MAT.ENERGY_ACCENT,
            color: cH,
            isHighlight: true
          });
          hAccepted = true;
          break;
        }
      }
    }

    return particles;
  }

  // ─── Energy Structure V2 System Creation ──────────────────
  function fillEnergyGeometry(geo, particles) {
    var n = particles.length;
    var pos = new Float32Array(n * 3);
    var aT = new Float32Array(n);
    var aCrossR = new Float32Array(n);
    var aCrossAngle = new Float32Array(n);
    var aSeed = new Float32Array(n);
    var aPhase = new Float32Array(n);
    var aDrift = new Float32Array(n * 3);  // dir, amp, freq
    var aCirc = new Float32Array(n * 2);   // freq, amp
    var aSize = new Float32Array(n);
    var aBrightness = new Float32Array(n);
    var aColorMix = new Float32Array(n * 3);
    var aMaterialId = new Float32Array(n);

    for (var i = 0; i < n; i++) {
      var p = particles[i];
      // Set initial position for debugging (actual position computed in shader)
      var wPos = sampleCenterline(p.t);
      pos[i * 3] = wPos.x;
      pos[i * 3 + 1] = wPos.y;
      pos[i * 3 + 2] = wPos.z;
      aT[i] = p.t;
      aCrossR[i] = p.crossR;
      aCrossAngle[i] = p.crossAngle;
      aSeed[i] = p.seed;
      aPhase[i] = p.phase;
      aDrift[i * 3] = p.driftDir;
      aDrift[i * 3 + 1] = p.driftAmp;
      aDrift[i * 3 + 2] = p.driftFreq;
      aCirc[i * 2] = p.circFreq;
      aCirc[i * 2 + 1] = p.circAmp;
      aSize[i] = p.size;
      aBrightness[i] = p.light;
      aColorMix[i * 3] = p.color[0];
      aColorMix[i * 3 + 1] = p.color[1];
      aColorMix[i * 3 + 2] = p.color[2];
      aMaterialId[i] = p.materialId;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
    geo.setAttribute("aCrossR", new THREE.BufferAttribute(aCrossR, 1));
    geo.setAttribute("aCrossAngle", new THREE.BufferAttribute(aCrossAngle, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(aPhase, 1));
    geo.setAttribute("aDrift", new THREE.BufferAttribute(aDrift, 3));
    geo.setAttribute("aCirc", new THREE.BufferAttribute(aCirc, 2));
    geo.setAttribute("aSize", new THREE.BufferAttribute(aSize, 1));
    geo.setAttribute("aBrightness", new THREE.BufferAttribute(aBrightness, 1));
    geo.setAttribute("aColorMix", new THREE.BufferAttribute(aColorMix, 3));
    geo.setAttribute("aMaterialId", new THREE.BufferAttribute(aMaterialId, 1));
  }

  function createCenterlineTextures() {
    var N = ENERGY_STRUCTURE_CONFIG.lutSize;
    var posTex = new THREE.DataTexture(energyLUT.positions, N, 1, THREE.RGBAFormat, THREE.FloatType);
    posTex.minFilter = THREE.LinearFilter;
    posTex.magFilter = THREE.LinearFilter;
    posTex.wrapS = THREE.ClampToEdgeWrapping;
    posTex.wrapT = THREE.ClampToEdgeWrapping;
    posTex.needsUpdate = true;

    var normTex = new THREE.DataTexture(energyLUT.normals, N, 1, THREE.RGBAFormat, THREE.FloatType);
    normTex.minFilter = THREE.LinearFilter;
    normTex.magFilter = THREE.LinearFilter;
    normTex.wrapS = THREE.ClampToEdgeWrapping;
    normTex.wrapT = THREE.ClampToEdgeWrapping;
    normTex.needsUpdate = true;

    var binormTex = new THREE.DataTexture(energyLUT.binormals, N, 1, THREE.RGBAFormat, THREE.FloatType);
    binormTex.minFilter = THREE.LinearFilter;
    binormTex.magFilter = THREE.LinearFilter;
    binormTex.wrapS = THREE.ClampToEdgeWrapping;
    binormTex.wrapT = THREE.ClampToEdgeWrapping;
    binormTex.needsUpdate = true;

    energyTextures = { pos: posTex, normal: normTex, binormal: binormTex };
  }

  function createEnergyStructureSystemV2(count) {
    // Build centerline + LUT + textures
    buildEnergyCenterline();
    createCenterlineTextures();

    var cubeViewZ = -camera.position.z;
    var cfg = ENERGY_STRUCTURE_CONFIG;

    var particles = generateEnergyParticles(count);
    var mainParts = particles.filter(function (p) { return !p.isHighlight; });
    var highlightParts = particles.filter(function (p) { return p.isHighlight; });

    var sharedUniforms = {
      uTime: uTime,
      uPointScale: uScaleGlobal,
      uReduceMotion: uReduceMotion,
      uScrollProgress: uScrollProgress,
      uEntrance: uEntranceProgress,
      uCubeZ: { value: cubeViewZ },
      uCenterlinePos: { value: energyTextures.pos },
      uCenterlineNormal: { value: energyTextures.normal },
      uCenterlineBinormal: { value: energyTextures.binormal }
    };

    function makeMaterial(cullMode, opacity, isHighlight) {
      return new THREE.ShaderMaterial({
        uniforms: Object.assign({}, sharedUniforms, {
          uCullMode: { value: cullMode },
          uOpacity: { value: opacity },
          uLightDebug: uLightDebug, uMaterialDebug: uMaterialDebug,
          uEmissionDebug: uEmissionDebug
        }),
        vertexShader: fieldVertexShader,
        fragmentShader: isHighlight ? fieldHighlightFragmentShader : fieldFragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: isHighlight ? THREE.AdditiveBlending : THREE.NormalBlending
      });
    }

    function makePoints(parts, cullMode, opacity, isHighlight, renderOrder) {
      var geo = new THREE.BufferGeometry();
      fillEnergyGeometry(geo, parts);
      var mat = makeMaterial(cullMode, opacity, isHighlight);
      var pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      pts.renderOrder = renderOrder;
      energyStructureGroup.add(pts);
      energyStructureObjects.push(pts);
      energyStructureOpacityRefs.push({ uniform: mat.uniforms.uOpacity, base: opacity });
    }

    // Back: renderOrder -1 (behind cube)
    // Front: renderOrder 1 (in front of cube)
    makePoints(mainParts, 0.0, cfg.opacity, false, -1);
    makePoints(mainParts, 1.0, cfg.opacity, false, 1);
    makePoints(highlightParts, 0.0, cfg.highlightOpacity * 1.8, true, -1);
    makePoints(highlightParts, 1.0, cfg.highlightOpacity * 1.8, true, 1);
  }

  // ─── Dust System Creation ─────────────────────────────────
  function createDustSystem(count, opacity) {
    var pos = new Float32Array(count * 3);
    var col = new Float32Array(count * 3);
    var sz = new Float32Array(count);
    var ph = new Float32Array(count);
    var br = new Float32Array(count);

    // Dust uses same density field + light field — pushed to far depth (Layer 4)
    for (var i = 0; i < count; i++) {
      var x, y, zOff, density = 0, light = 0;
      var accepted = false;

      for (var attempt = 0; attempt < 20; attempt++) {
        x = (Math.random() - 0.5) * 8.0;
        y = (Math.random() - 0.5) * 5.0;
        // Push dust to far background z
        zOff = 3.5 + Math.random() * 2.5;
        density = totalDensityAt(x, y, 0);
        if (Math.random() < density * 0.5 + 0.05) {
          light = lightFieldAt(x, y, 0);
          accepted = true;
          break;
        }
      }

      if (!accepted) {
        var r = 2.5 + Math.random() * 2.5;
        var theta = Math.random() * Math.PI * 2;
        x = r * Math.cos(theta);
        y = r * 0.5 * Math.sin(theta);
        zOff = 3.5 + Math.random() * 2.5;
        density = 0.05;
        light = lightFieldAt(x, y, 0);
      }

      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = zOff;

      var colorRoll = Math.random();
      var color = colorRoll < 0.65 ? COLOR_NAVY : (colorRoll < 0.90 ? COLOR_GREEN : COLOR_PALE_GREEN);
      col[i * 3] = color[0]; col[i * 3 + 1] = color[1]; col[i * 3 + 2] = color[2];
      sz[i] = 0.08 + light * 0.10;
      ph[i] = Math.random() * Math.PI * 2;
      br[i] = light;
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColorMix", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sz, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
    geo.setAttribute("aBrightness", new THREE.BufferAttribute(br, 1));
    geo.setAttribute("aMaterialId", new THREE.BufferAttribute(new Float32Array(count).fill(MAT.ATMOSPHERIC_DUST), 1));

    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: uTime,
        uPointScale: uScaleGlobal,
        uReduceMotion: uReduceMotion,
        uEntrance: uEntranceProgress,
        uOpacity: { value: opacity },
        uLightDebug: uLightDebug, uMaterialDebug: uMaterialDebug,
        uEmissionDebug: uEmissionDebug
      },
      vertexShader: dustVertexShader,
      fragmentShader: dustFragmentShader,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.NormalBlending
    });

    var pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = -2;
    atmosphereGroup.add(pts);
    atmosphereObjects.push(pts);
    atmosphereOpacityRefs.push({ uniform: mat.uniforms.uOpacity, base: opacity });
  }

  // ─── Layered System Constructors ──────────────────────────
  function createEnergyStructureSystem(count) {
    createEnergyStructureSystemV2(count);
  }

  function createAtmosphereSystem(count) {
    createDustSystem(count, 0.18);
  }

  // ─── Optical Pipeline: HDR + Selective Bloom ──────────────
  // Scene → HDR RT → Bright Extract → Gaussian Blur (multi-pass)
  // → Composite (Bloom + ACES Tone Map) → Screen
  //
  // Bloom uses ONLY emissive contribution (threshold isolates HDR emission).
  // Diffuse lighting does not bloom. Dust never blooms.

  var post = {};
  var BLOOM_THRESHOLD = 0.65;
  var BLOOM_RADIUS = 0.008;
  var BLOOM_INTENSITY = 0.38;
  var BLOOM_PASSES = 4;

  var brightExtractShader = [
    "uniform sampler2D tDiffuse;",
    "uniform float uThreshold;",
    "varying vec2 vUv;",
    "void main() {",
    "  vec3 c = texture2D(tDiffuse, vUv).rgb;",
    "  float l = max(c.r, max(c.g, c.b));",
    "  float contrib = smoothstep(uThreshold, uThreshold + 0.15, l);",
    "  gl_FragColor = vec4(c * contrib, 1.0);",
    "}"
  ].join("\n");

  var blurShader = [
    "uniform sampler2D tDiffuse;",
    "uniform vec2 uDirection;",
    "uniform float uRadius;",
    "varying vec2 vUv;",
    // 9-tap Gaussian — soft, no hard halos
    "float gaussian[5];",
    "void main() {",
    "  gaussian[0] = 0.227027;",
    "  gaussian[1] = 0.1945946;",
    "  gaussian[2] = 0.1216216;",
    "  gaussian[3] = 0.054054;",
    "  gaussian[4] = 0.016216;",
    "  vec3 sum = texture2D(tDiffuse, vUv).rgb * gaussian[0];",
    "  for (int i = 1; i < 5; i++) {",
    "    vec2 offset = uDirection * uRadius * float(i);",
    "    sum += texture2D(tDiffuse, vUv + offset).rgb * gaussian[i];",
    "    sum += texture2D(tDiffuse, vUv - offset).rgb * gaussian[i];",
    "  }",
    "  gl_FragColor = vec4(sum, 1.0);",
    "}"
  ].join("\n");

  var compositeShader = [
    "uniform sampler2D tScene;",
    "uniform sampler2D tBloom;",
    "uniform float uBloomIntensity;",
    "varying vec2 vUv;",
    // ACES filmic tone mapping — preserves white background, no gray wash
    "vec3 acesTonemap(vec3 c) {",
    "  float a = 2.51; float b = 0.03; float m = 2.43;",
    "  float d = 0.59; float e = 0.14;",
    "  return clamp((c * (a * c + b)) / (c * (m * c + d) + e), 0.0, 1.0);",
    "}",
    "void main() {",
    "  vec4 sceneSample = texture2D(tScene, vUv);",
    "  vec3 bloomColor = texture2D(tBloom, vUv).rgb;",
    "  vec3 linear = sceneSample.rgb + bloomColor * uBloomIntensity;",
    "  vec3 tonemapped = acesTonemap(linear);",
    // Preserve scene alpha so transparent canvas shows page background
    "  gl_FragColor = vec4(tonemapped, sceneSample.a);",
    "}"
  ].join("\n");

  var fullscreenVertex = [
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = uv;",
    "  gl_Position = vec4(position, 1.0);",
    "}"
  ].join("\n");

  function initPostProcessing() {
    renderer.autoClear = false;
    var rtW = Math.floor(cssW * Math.min(window.devicePixelRatio || 1, DPR_CAP) * qualityScale);
    var rtH = Math.floor(cssH * Math.min(window.devicePixelRatio || 1, DPR_CAP) * qualityScale);
    var halfW = Math.max(1, Math.floor(rtW / 2));
    var halfH = Math.max(1, Math.floor(rtH / 2));

    // HDR scene target — HalfFloat for HDR emission values
    post.hdrRT = new THREE.WebGLRenderTarget(rtW, rtH, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter
    });

    // Bright extract target (half res)
    post.brightRT = new THREE.WebGLRenderTarget(halfW, halfH, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter
    });

    // Ping-pong blur targets (half res)
    post.blurRTA = new THREE.WebGLRenderTarget(halfW, halfH, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter
    });
    post.blurRTB = new THREE.WebGLRenderTarget(halfW, halfH, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter
    });

    // Fullscreen quad infrastructure
    post.quadGeo = new THREE.PlaneGeometry(2, 2);
    post.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    post.quadScene = new THREE.Scene();

    // Bright extract material
    post.brightMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: BLOOM_THRESHOLD }
      },
      vertexShader: fullscreenVertex,
      fragmentShader: brightExtractShader,
      depthTest: false,
      depthWrite: false
    });

    // Blur materials
    post.blurHMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new THREE.Vector2(1, 0) },
        uRadius: { value: BLOOM_RADIUS }
      },
      vertexShader: fullscreenVertex,
      fragmentShader: blurShader,
      depthTest: false,
      depthWrite: false
    });

    post.blurVMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new THREE.Vector2(0, 1) },
        uRadius: { value: BLOOM_RADIUS }
      },
      vertexShader: fullscreenVertex,
      fragmentShader: blurShader,
      depthTest: false,
      depthWrite: false
    });

    // Composite material
    post.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uBloomIntensity: { value: BLOOM_INTENSITY }
      },
      vertexShader: fullscreenVertex,
      fragmentShader: compositeShader,
      depthTest: false,
      depthWrite: false
    });

    post.quadMesh = new THREE.Mesh(post.quadGeo, post.compositeMat);
    post.quadScene.add(post.quadMesh);
    post.initialized = true;
  }

  function resizePostProcessing() {
    if (!post.initialized) return;
    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP) * qualityScale;
    var rtW = Math.floor(cssW * dpr);
    var rtH = Math.floor(cssH * dpr);
    var halfW = Math.max(1, Math.floor(rtW / 2));
    var halfH = Math.max(1, Math.floor(rtH / 2));
    post.hdrRT.setSize(rtW, rtH);
    post.brightRT.setSize(halfW, halfH);
    post.blurRTA.setSize(halfW, halfH);
    post.blurRTB.setSize(halfW, halfH);
  }

  function renderPipeline() {
    if (!post.initialized) {
      renderer.render(scene, camera);
      return;
    }

    // 1. Render scene to HDR target
    renderer.setRenderTarget(post.hdrRT);
    renderer.clear();
    renderer.render(scene, camera);

    // 2. Bright extract — isolate emissive contribution
    post.quadMesh.material = post.brightMat;
    post.brightMat.uniforms.tDiffuse.value = post.hdrRT.texture;
    renderer.setRenderTarget(post.brightRT);
    renderer.clear();
    renderer.render(post.quadScene, post.orthoCam);

    // 3. Gaussian blur — multi-pass, large soft radius
    // Ping-pong between blurRTA and blurRTB
    post.quadMesh.material = post.blurHMat;
    post.blurHMat.uniforms.tDiffuse.value = post.brightRT.texture;
    renderer.setRenderTarget(post.blurRTA);
    renderer.clear();
    renderer.render(post.quadScene, post.orthoCam);

    var readBlur = post.blurRTA;
    var writeBlur = post.blurRTB;
    for (var i = 0; i < BLOOM_PASSES - 1; i++) {
      // Horizontal blur
      post.quadMesh.material = post.blurHMat;
      post.blurHMat.uniforms.tDiffuse.value = readBlur.texture;
      renderer.setRenderTarget(writeBlur);
      renderer.clear();
      renderer.render(post.quadScene, post.orthoCam);

      // Vertical blur
      post.quadMesh.material = post.blurVMat;
      post.blurVMat.uniforms.tDiffuse.value = writeBlur.texture;
      renderer.setRenderTarget(readBlur);
      renderer.clear();
      renderer.render(post.quadScene, post.orthoCam);
    }

    // Final bloom texture
    var bloomRT = readBlur;

    // 4. Composite — scene + bloom, ACES tone map, output to screen
    post.quadMesh.material = post.compositeMat;
    post.compositeMat.uniforms.tScene.value = post.hdrRT.texture;
    post.compositeMat.uniforms.tBloom.value = bloomRT.texture;
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(post.quadScene, post.orthoCam);
  }

  // ─── Init ─────────────────────────────────────────────────
  function init() {
    var device = getDevice();
    var cubeCounts = CUBE_COUNTS[device];
    var fieldCounts = FIELD_COUNTS[device];

    scene = new THREE.Scene();
    atmosphereGroup = new THREE.Group();
    energyStructureGroup = new THREE.Group();
    scene.add(atmosphereGroup);
    scene.add(energyStructureGroup);

    cssW = window.innerWidth;
    cssH = window.innerHeight;
    var aspect = cssW / cssH || 1;
    camera = new THREE.PerspectiveCamera(32, aspect, 0.1, 100);
    // Initial camera from Shot 01
    var shot0 = SHOTS[0];
    camera.position.set(shot0.camera.x, shot0.camera.y, shot0.camera.z);
    camera.lookAt(shot0.camera.lookX, shot0.camera.lookY, shot0.camera.lookZ);

    renderer = new THREE.WebGLRenderer({
      canvas: canvas, alpha: false, antialias: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
    renderer.setSize(cssW, cssH, false);
    renderer.setClearColor(0xf0f4f3, 1);

    createCubeSystem(cubeCounts);
    createEnergyStructureSystem(fieldCounts.energyStructure);
    createAtmosphereSystem(fieldCounts.dust);

    // Runtime debug toggles for layer isolation
    window.__showAtmosphere = true;
    window.__showEnergyStructure = true;

    // Debug: expose centerline + cross-section data
    window.__energyStructureDebug = function () {
      return {
        controlPoints: ENERGY_STRUCTURE_CONTROL_POINTS.map(function (p) { return p.toArray(); }),
        lutSize: ENERGY_STRUCTURE_CONFIG.lutSize,
        totalLength: energyLUT ? energyLUT.totalLength : null,
        particleCount: energyStructureObjects.reduce(function (s, o) { return s + o.geometry.attributes.position.count; }, 0)
      };
    };

    window.__energyCenterlineDebug = function (segments) {
      segments = segments || 64;
      var pts = [];
      for (var i = 0; i <= segments; i++) {
        var u = i / segments;
        var t = arcLengthToCurveT(u);
        var pos = energyCenterline.getPoint(t);
        pts.push({ u: u, t: t, x: pos.x, y: pos.y, z: pos.z });
      }
      return pts;
    };

    window.__energyCrossSectionDebug = function (t) {
      t = t !== undefined ? t : 0.5;
      var w = widthAt(t);
      var th = thicknessAt(t);
      var dens = densityAt(t);
      var zones = [];
      for (var z = 0; z < 4; z++) {
        zones.push({
          zone: z,
          start: ZONE_STARTS[z],
          range: ZONE_RANGES[z],
          fraction: ZONE_FRACTIONS[z],
          materialId: zoneToMaterialId(z),
          sizeMul: zoneToSizeMul(z),
          brightMul: zoneToBrightMul(z)
        });
      }
      return { t: t, width: w, thickness: th, density: dens, zones: zones };
    };

    // Centerline debug visualization: shows spline + control points
    var centerlineDebugGroup = null;
    window.__centerlineDebug = false;
    window.__showCenterlineDebug = function (on) {
      window.__centerlineDebug = on;
      if (on && !centerlineDebugGroup && energyCenterline) {
        centerlineDebugGroup = new THREE.Group();

        // Draw centerline as a line
        var linePts = [];
        for (var i = 0; i <= 128; i++) {
          var u = i / 128;
          var ct = arcLengthToCurveT(u);
          linePts.push(energyCenterline.getPoint(ct));
        }
        var lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
        var lineMat = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 2 });
        var line = new THREE.Line(lineGeo, lineMat);
        centerlineDebugGroup.add(line);

        // Draw control points as small spheres
        for (var c = 0; c < ENERGY_STRUCTURE_CONTROL_POINTS.length; c++) {
          var cp = ENERGY_STRUCTURE_CONTROL_POINTS[c];
          var sphGeo = new THREE.SphereGeometry(0.04, 8, 8);
          var sphMat = new THREE.MeshBasicMaterial({ color: c === 0 ? 0x00ffff : (c === ENERGY_STRUCTURE_CONTROL_POINTS.length - 1 ? 0xff8800 : 0xff4400) });
          var sph = new THREE.Mesh(sphGeo, sphMat);
          sph.position.copy(cp);
          centerlineDebugGroup.add(sph);
        }

        scene.add(centerlineDebugGroup);
      }
      if (centerlineDebugGroup) centerlineDebugGroup.visible = on;
      // Hide particles + atmosphere when debug is on
      if (on) {
        for (var ei = 0; ei < energyStructureObjects.length; ei++) energyStructureObjects[ei].visible = false;
        for (var ai = 0; ai < atmosphereObjects.length; ai++) atmosphereObjects[ai].visible = false;
      } else {
        for (var ei2 = 0; ei2 < energyStructureObjects.length; ei2++) energyStructureObjects[ei2].visible = true;
        for (var ai2 = 0; ai2 < atmosphereObjects.length; ai2++) atmosphereObjects[ai2].visible = true;
      }
    };

    resize();
    initPostProcessing();
    targetEntranceProgress = 1;
    if (reduceMotion) { entranceProgress = 1; shotProgress = 0; targetShotProgress = 0; }
  }

  // ─── Resize ───────────────────────────────────────────────
  function resize() {
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    if (!renderer) return;
    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP) * qualityScale;
    renderer.setPixelRatio(dpr);
    renderer.setSize(cssW, cssH, false);
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
    uScaleGlobal.value = cssH * 0.040;
    resizePostProcessing();
  }

  // ─── Shot Progress Computation ───────────────────────────
  // Scroll → shot progress → smooth interpolation
  // Never bind camera directly to scroll position.
  function updateScroll() {
    var vh = window.innerHeight;
    var viewCenter = vh / 2 + window.scrollY;

    var centers = [];
    for (var i = 0; i < SECTION_SELECTORS.length; i++) {
      var el = document.querySelector(SECTION_SELECTORS[i]);
      if (el) {
        var rect = el.getBoundingClientRect();
        centers.push(rect.top + window.scrollY + rect.height / 2);
      } else {
        centers.push(0);
      }
    }

    if (viewCenter <= centers[0]) {
      targetShotProgress = 0;
    } else if (viewCenter >= centers[centers.length - 1]) {
      targetShotProgress = SHOTS.length - 1;
    } else {
      for (var i = 0; i < centers.length - 1; i++) {
        if (viewCenter >= centers[i] && viewCenter < centers[i + 1]) {
          var t = (viewCenter - centers[i]) / (centers[i + 1] - centers[i]);
          targetShotProgress = i + t;
          break;
        }
      }
    }
  }

  function onPointerMove(e) {
    if (reduceMotion) return;
    pointerTargetX = e.clientX;
    pointerTargetY = e.clientY;
    if (!pointerActive) { pointerSmoothX = pointerTargetX; pointerSmoothY = pointerTargetY; }
    pointerActive = true;
  }

  function onPointerLeave() { pointerActive = false; }

  function animate(time) {
    if (!animating) return;
    rafId = requestAnimationFrame(animate);

    // Debug modes — precedence: global material > global light > cube material > cube depth > emission > normal
    uLightDebug.value = window.__lightDebug ? 1.0 : 0.0;
    uMaterialDebug.value = window.__materialDebug ? 1.0 : 0.0;
    uEmissionDebug.value = window.__emissionDebug ? 1.0 : 0.0;
    uCubeDepthDebug.value = window.__cubeDepthDebug ? 1.0 : 0.0;
    uCubeMaterialDebug.value = window.__cubeMaterialDebug ? 1.0 : 0.0;
    var cubeDebugActive = (window.__cubeDepthDebug || window.__cubeMaterialDebug) ? true : false;
    if (cubeGroup) cubeGroup.visible = !window.__lightDebug;
    // Hide layers during cube debug; otherwise respect runtime debug toggles
    for (var ai = 0; ai < atmosphereObjects.length; ai++) {
      atmosphereObjects[ai].visible = !cubeDebugActive && window.__showAtmosphere;
    }
    for (var ei = 0; ei < energyStructureObjects.length; ei++) {
      energyStructureObjects[ei].visible = !cubeDebugActive && window.__showEnergyStructure;
    }

    var dt = lastTime ? Math.min(time - lastTime, 33) : 16;
    lastTime = time;
    var dtSeconds = dt * 0.001;
    var timeSeconds = time * 0.001;

    // Adaptive quality
    frameCount++;
    fpsAccumulator += dt;
    if (fpsAccumulator >= 1000) {
      var avgFps = frameCount * 1000 / fpsAccumulator;
      frameCount = 0; fpsAccumulator = 0;
      if (avgFps < 35 && qualityScale > 0.65) {
        qualityScale = Math.max(0.65, qualityScale - 0.15);
        resize();
      } else if (avgFps > 55 && qualityScale < 1) {
        qualityScale = Math.min(1, qualityScale + 0.1);
        resize();
      }
    }

    // Camera has inertia — slower damping than entrance
    var shotK = 1 - Math.exp(-2.8 * dtSeconds); // ~360ms tau — cinematic inertia
    var entranceK = 1 - Math.exp(-1.8 * dtSeconds);

    shotProgress += (targetShotProgress - shotProgress) * shotK;
    entranceProgress += (targetEntranceProgress - entranceProgress) * entranceK;

    if (!reduceMotion) {
      pointerSmoothX += (pointerTargetX - pointerSmoothX) * 0.06;
      pointerSmoothY += (pointerTargetY - pointerSmoothY) * 0.06;
    }

    // ── Static composition override (Hero Master capture) ──
    if (window.__comp) {
      var c = window.__comp;
      camera.position.set(c.camX, c.camY, c.camZ);
      camera.lookAt(c.lookX, c.lookY, c.lookZ);
      uTime.value = c.freezeTime || 0;
      if (cubeGroup) {
        cubeGroup.rotation.y = CUBE_INIT_ROT_Y;
        cubeGroup.rotation.x = CUBE_INIT_ROT_X;
        cubeGroup.scale.setScalar(c.cubeScale);
        cubeGroup.position.set(CUBE_OFFSET_X, CUBE_OFFSET_Y, 0);
      }
      for (var ci = 0; ci < cubeOpacityRefs.length; ci++) {
        cubeOpacityRefs[ci].uniform.value = cubeOpacityRefs[ci].base * c.cubeVisibility;
      }
      var eso = typeof c.energyStructureOpacity !== 'undefined' ? c.energyStructureOpacity : c.fieldOpacity;
      var ao = typeof c.atmosphereOpacity !== 'undefined' ? c.atmosphereOpacity : c.dustOpacity;
      for (var ri = 0; ri < energyStructureOpacityRefs.length; ri++) {
        energyStructureOpacityRefs[ri].uniform.value = energyStructureOpacityRefs[ri].base * eso;
      }
      for (var ri = 0; ri < atmosphereOpacityRefs.length; ri++) {
        atmosphereOpacityRefs[ri].uniform.value = atmosphereOpacityRefs[ri].base * ao;
      }
      uScrollProgress.value = 0;
      uEntranceProgress.value = 1;
      renderPipeline();
      return;
    }

    // ── Composition Director: interpolate between shots ──
    var idx = Math.floor(shotProgress);
    var frac = smoothstep(shotProgress - idx); // eased transition
    var s0 = SHOTS[idx];
    var s1 = SHOTS[Math.min(idx + 1, SHOTS.length - 1)];

    // Camera direction — frames cube at CUBE_OFFSET_X on right side
    camera.position.x = lerp(s0.camera.x, s1.camera.x, frac);
    camera.position.y = lerp(s0.camera.y, s1.camera.y, frac);
    camera.position.z = lerp(s0.camera.z, s1.camera.z, frac);
    camera.lookAt(
      lerp(s0.camera.lookX, s1.camera.lookX, frac),
      lerp(s0.camera.lookY, s1.camera.lookY, frac),
      lerp(s0.camera.lookZ, s1.camera.lookZ, frac)
    );

    // ── Cube: stationary at CUBE_OFFSET_X, rotation only, visibility from shot ──
    uTime.value = timeSeconds;
    if (cubeGroup) {
      if (!reduceMotion) {
        cubeGroup.rotation.y = CUBE_INIT_ROT_Y + time * CUBE_ROT_Y;
        cubeGroup.rotation.x = CUBE_INIT_ROT_X + Math.sin(time * CUBE_DRIFT_X_FREQ) * CUBE_DRIFT_X_AMP;
      }
      // Entrance scale only — no shot-based scale (camera distance creates size variation)
      var entranceScale = 0.92 + entranceProgress * 0.08;
      cubeGroup.scale.setScalar(entranceScale);
      // Cube stays at CUBE_OFFSET_X — right side of composition
      cubeGroup.position.set(CUBE_OFFSET_X, CUBE_OFFSET_Y, 0);
    }

    // ── Cube visibility from shot ──
    var cubeVisibility = lerp(s0.cubeVisibility, s1.cubeVisibility, frac);
    for (var c = 0; c < cubeOpacityRefs.length; c++) {
      cubeOpacityRefs[c].uniform.value = cubeOpacityRefs[c].base * cubeVisibility;
    }

    // ── Energy structure & atmosphere opacity from shot ──
    var energyStructureOpacity = lerp(s0.energyStructureOpacity, s1.energyStructureOpacity, frac);
    var atmosphereOpacity = lerp(s0.atmosphereOpacity, s1.atmosphereOpacity, frac);
    var scrollDispersion = lerp(s0.scrollDispersion, s1.scrollDispersion, frac);
    uScrollProgress.value = scrollDispersion;
    uEntranceProgress.value = entranceProgress;

    for (var i = 0; i < energyStructureOpacityRefs.length; i++) {
      energyStructureOpacityRefs[i].uniform.value = energyStructureOpacityRefs[i].base * energyStructureOpacity;
    }
    for (var i = 0; i < atmosphereOpacityRefs.length; i++) {
      atmosphereOpacityRefs[i].uniform.value = atmosphereOpacityRefs[i].base * atmosphereOpacity;
    }

    renderPipeline();
  }

  // ─── Events ───────────────────────────────────────────────
  function onResize() { resize(); }

  // ─── Start ────────────────────────────────────────────────
  init();
  updateScroll();
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerleave", onPointerLeave);
  window.addEventListener("pointerdown", onPointerMove);
  window.addEventListener("scroll", updateScroll, { passive: true });
  window.addEventListener("resize", onResize);
  animating = true;
  rafId = requestAnimationFrame(animate);
})();
