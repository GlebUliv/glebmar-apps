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
  var CUBE_HALF = 0.55;
  var CUBE_ROT_Y = 0.0000546;          // ~115 s per revolution
  var CUBE_INIT_ROT_Y = 32 * Math.PI / 180;
  var CUBE_INIT_ROT_X = -15 * Math.PI / 180;
  var CUBE_DRIFT_X_AMP = 0.02;
  var CUBE_DRIFT_X_FREQ = 0.00003;
  var BEVEL_WIDTH = CUBE_HALF * 0.12;
  var BEVEL_AMOUNT = CUBE_HALF * 0.05;
  var CORE_RADIUS = CUBE_HALF * 0.22;

  var CUBE_COUNTS = {
    desktop: { surface: 10200, edges: 3060, internal: 3740, core: 1000 },
    tablet:  { surface: 5700,  edges: 1710, internal: 2090, core: 500  },
    mobile:  { surface: 3150,  edges: 945,  internal: 1155, core: 250  }
  };

  // ─── Field Config ─────────────────────────────────────────
  // Cube width = 2 * CUBE_HALF = 1.1
  var CUBE_WIDTH = 2 * CUBE_HALF;

  // Primary field: wide flowing river, dominant
  var FIELD_PRIMARY = {
    radiusMin: 1.35 * CUBE_WIDTH,
    radiusMax: 2.55 * CUBE_WIDTH,
    radiusBRatio: 0.82,               // minor/major ratio
    width: 0.72,                       // river width — very wide to dissolve ring appearance
    thickness: 0.28,
    inclX: -18 * Math.PI / 180,
    inclY: 13 * Math.PI / 180,
    inclZ: -10 * Math.PI / 180,
    baseSpeed: 2 * Math.PI / 90,       // 90s per traversal
    opacity: 0.82,
    highlightOpacity: 0.45,
    highlightFraction: 0.04
  };

  // Secondary field: different inclination, thinner, adds complexity
  var FIELD_SECONDARY = {
    radiusMin: 0.90 * CUBE_WIDTH,
    radiusMax: 1.95 * CUBE_WIDTH,
    radiusBRatio: 0.75,
    width: 0.48,
    thickness: 0.20,
    inclX: 5 * Math.PI / 180,
    inclY: -8 * Math.PI / 180,
    inclZ: 18 * Math.PI / 180,
    baseSpeed: 2 * Math.PI / 115,
    opacity: 0.68,
    highlightOpacity: 0.35,
    highlightFraction: 0.05
  };

  var FIELD_COUNTS = {
    desktop: { primary: 24000, secondary: 11000, dust: 3000 },
    tablet:  { primary: 14000, secondary: 6500,  dust: 1500 },
    mobile:  { primary: 8000,  secondary: 3500,  dust: 800  }
  };

  // ─── Colors ───────────────────────────────────────────────
  var COLOR_NAVY       = [0.118, 0.161, 0.231];
  var COLOR_GREEN      = [0.220, 0.631, 0.412];
  var COLOR_PALE_GREEN = [0.655, 0.890, 0.761];
  var COLOR_SOFT_WHITE = [0.969, 1.000, 0.980];

  // ─── Composition Director — Shot Architecture ────────────
  // The cube is a sculpture in world space at origin.
  // The camera moves around it. Each shot is a camera composition.
  // Cube never moves. Camera frames it differently per section.
  var SHOTS = [
    { // Shot 01 — Arrival (Hero)
      // Close, slightly right, looking at cube center
      camera: { x: 1.0, y: 0.2, z: 4.5, lookX: 0, lookY: 0, lookZ: 0 },
      cubeVisibility: 1.0,
      fieldOpacity: 1.0,
      dustOpacity: 1.0,
      scrollDispersion: 0
    },
    { // Shot 02 — Publisher
      // Shift left and up — field occupies more visual space
      camera: { x: -1.2, y: 0.6, z: 5.0, lookX: 0, lookY: 0, lookZ: 0 },
      cubeVisibility: 1.0,
      fieldOpacity: 1.0,
      dustOpacity: 0.9,
      scrollDispersion: 0.02
    },
    { // Shot 03 — Principles
      // Pull back, move to side — cube becomes secondary, negative space
      camera: { x: -2.2, y: 0.4, z: 5.8, lookX: 0, lookY: 0, lookZ: 0 },
      cubeVisibility: 0.75,
      fieldOpacity: 0.80,
      dustOpacity: 0.75,
      scrollDispersion: 0.05
    },
    { // Shot 04 — Products
      // Move to another side, closer — reconnect with sculpture
      camera: { x: 1.8, y: -0.4, z: 4.8, lookX: 0, lookY: 0, lookZ: 0 },
      cubeVisibility: 0.90,
      fieldOpacity: 0.90,
      dustOpacity: 0.80,
      scrollDispersion: 0.08
    },
    { // Shot 05 — Closing
      // Pull far back, slightly above — cube nearly disappears
      camera: { x: 0.3, y: 1.2, z: 7.5, lookX: 0, lookY: 0, lookZ: 0 },
      cubeVisibility: 0.30,
      fieldOpacity: 0.40,
      dustOpacity: 0.50,
      scrollDispersion: 0.12
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
  var fieldObjects = [];
  var materialOpacityRefs = []; // {uniform, base, type} for shot-driven opacity
  var cubeOpacityRefs = [];     // {uniform, base} for cube visibility
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

  // Shape A: Upper-right, large, powerful, continuous
  var SHAPE_A = {
    centerline: [[0.0, 2.5, 0], [1.0, 2.0, 0.1], [2.2, 1.2, 0], [3.5, 0.2, -0.1]],
    width: 1.0,
    density: 1.0,
    broken: false,
    breakPoints: []
  };

  // Shape B: Lower-left, medium, broken
  var SHAPE_B = {
    centerline: [[0.5, -0.5, 0], [-0.5, -1.0, -0.1], [-1.5, -1.3, 0], [-2.8, -0.8, 0.1]],
    width: 0.75,
    density: 0.7,
    broken: true,
    breakPoints: [0.25, 0.55, 0.8]
  };

  // Shape C: Around cube, transition, never closes
  var SHAPE_C = {
    centerline: [[1.3, 0.4, 0], [0.6, -0.4, 0], [-0.3, -0.5, 0], [-1.1, 0.1, 0]],
    width: 0.55,
    density: 0.5,
    broken: false,
    breakPoints: []
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
    var d = Math.exp(-(minDist * minDist) / (shape.width * shape.width));
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

  // ─── Light Field — Continuous Light Hierarchy ────────────
  // The light field controls brightness, opacity, size, and highlight
  // probability for every particle. Particles do NOT decide their own
  // brightness — they sample this field.
  //
  // Zone A: Main highlight — upper-right, highest intensity
  // Zone B: Secondary highlight — near cube, supports cube emergence
  // Zone C: Transition — soft, wide, no sharp falloff
  // Zone D: Dark region — very low intensity, negative space
  //
  // Brightness hierarchy target:
  //   5%  very bright (Zone A core)
  //  15%  bright     (Zone A medium / Zone B core)
  //  35%  medium     (Zone B/C)
  //  45%  dark       (Zone D / fragmentation)

  var LIGHT_ZONES = [
    { // Zone A — main highlight, upper-right
      cx: 2.2, cy: 1.2, cz: 0,
      radius: 2.0,
      intensity: 1.0,
      falloff: 1.6
    },
    { // Zone B — secondary highlight, near cube
      cx: 0.3, cy: -0.1, cz: 0,
      radius: 1.2,
      intensity: 0.65,
      falloff: 1.3
    },
    { // Zone C — transition, soft, wide
      cx: -0.8, cy: -0.8, cz: 0,
      radius: 2.5,
      intensity: 0.35,
      falloff: 2.2
    }
    // Zone D is implicit — everywhere not covered by A/B/C is dark (0.02 baseline)
  ];

  function lightFieldAt(x, y, z) {
    var light = 0.02; // Zone D baseline — near darkness
    for (var i = 0; i < LIGHT_ZONES.length; i++) {
      var z_ = LIGHT_ZONES[i];
      var dx = x - z_.cx, dy = y - z_.cy, dz = z - z_.cz;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var contribution = z_.intensity * Math.exp(-(dist * dist) / (z_.radius * z_.falloff));
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

  // ─── Flow Field — Vector Field for Particle Organization ──
  // Particles follow flow lines, creating coherent streams.
  // The flow field defines direction, curvature, and strength.
  // Particles never choose independent directions — they sample this field.

  // Flow A: Primary energy river — large, continuous, dominant
  var FLOW_A = {
    centerline: [
      [0.3, 2.8, 0], [1.0, 2.3, 0.05], [1.8, 1.7, 0.08],
      [2.5, 0.9, 0.02], [3.0, 0.1, -0.05], [2.7, -0.7, 0]
    ],
    flowWidth: 0.12,
    speedCoherence: 0.02,
    weight: 0.45
  };

  // Flow B: Secondary stream — broken, less intense
  var FLOW_B = {
    centerline: [
      [0.9, -0.5, 0], [0.3, -0.9, -0.05], [-0.5, -1.2, 0],
      [-1.4, -1.3, 0.05], [-2.2, -0.9, 0], [-2.7, -0.3, 0.08]
    ],
    flowWidth: 0.10,
    speedCoherence: 0.03,
    weight: 0.30
  };

  // Flow C: Local circulation around cube — never closes
  var FLOW_C = {
    centerline: [
      [1.5, 0.5, 0], [1.0, 0.1, 0], [0.3, -0.2, 0],
      [-0.5, -0.1, 0], [-1.2, 0.3, 0]
    ],
    flowWidth: 0.08,
    speedCoherence: 0.04,
    weight: 0.25
  };

  var ALL_FLOWS = [FLOW_A, FLOW_B, FLOW_C];

  function sampleFlowPosition(flow) {
    var t = Math.random();
    var segCount = flow.centerline.length - 1;
    var segIdx = Math.min(Math.floor(t * segCount), segCount - 1);
    var segT = t * segCount - segIdx;

    // Smoothstep for organic curvature
    var st = segT * segT * (3 - 2 * segT);

    var a = flow.centerline[segIdx];
    var b = flow.centerline[segIdx + 1];

    var x = a[0] + (b[0] - a[0]) * st;
    var y = a[1] + (b[1] - a[1]) * st;
    var z = a[2] + (b[2] - a[2]) * st;

    // Subtle turbulence — never destroys macro flow
    x += gaussian() * flow.flowWidth;
    y += gaussian() * flow.flowWidth;
    z += gaussian() * flow.flowWidth * 0.5;

    return { x: x, y: y, z: z };
  }

  // Inverse mapping: world position → stream coordinates (theta, radius)
  // This is the reverse of what the shader does: shader computes
  // centerLocal = (radius*cos(theta), radius*bRatio*sin(theta), 0) then rotates.
  // We undo the rotation (transpose) then extract theta and radius.
  function worldToStream(wx, wy, wz, rotMat, bRatio) {
    var el = rotMat.elements;
    var lx = el[0] * wx + el[1] * wy + el[2] * wz;
    var ly = el[3] * wx + el[4] * wy + el[5] * wz;

    var theta = Math.atan2(ly / bRatio, lx);
    if (theta < 0) theta += Math.PI * 2;
    var radius = Math.sqrt(lx * lx + (ly / bRatio) * (ly / bRatio));

    return { theta: theta, radius: radius };
  }

  function pickFlow() {
    var r = Math.random();
    var cumWeight = 0;
    for (var fi = 0; fi < ALL_FLOWS.length; fi++) {
      cumWeight += ALL_FLOWS[fi].weight;
      if (r < cumWeight) return ALL_FLOWS[fi];
    }
    return ALL_FLOWS[0];
  }

  // ─── Cube Shaders (LOCKED — unchanged from V1) ────────────
  var cubeVertexShader = [
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
    "varying float vBrightness;",
    "void main() {",
    "  vColor = colorMix;",
    "  float shimmer = uReduceMotion > 0.5 ? 0.0 : sin(uTime * 0.20 + phase) * 0.0025;",
    "  vec3 dir = normalize(position + vec3(0.001, 0.001, 0.001));",
    "  vec3 transformed = position + dir * shimmer;",
    "  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);",
    "  float depth = -mvPosition.z;",
    "  float depthFactor = smoothstep(3.5, 6.5, depth + depthBias);",
    "  float sizeScale = 1.0 - depthFactor * 0.35;",
    "  gl_PointSize = max(1.0, size * uScale * sizeScale / depth);",
    "  vBrightness = brightness * (1.0 - depthFactor * 0.30);",
    "  gl_Position = projectionMatrix * mvPosition;",
    "}"
  ].join("\n");

  var cubeFragmentShader = [
    "varying vec3 vColor;",
    "varying float vBrightness;",
    "uniform float uOpacity;",
    "void main() {",
    "  vec2 coord = gl_PointCoord - vec2(0.5);",
    "  float dist = length(coord);",
    "  if (dist > 0.5) discard;",
    "  float alpha = smoothstep(0.5, 0.08, dist);",
    "  gl_FragColor = vec4(vColor * vBrightness, alpha * uOpacity);",
    "}"
  ].join("\n");

  var cubeHighlightFragmentShader = [
    "varying vec3 vColor;",
    "varying float vBrightness;",
    "uniform float uOpacity;",
    "void main() {",
    "  vec2 coord = gl_PointCoord - vec2(0.5);",
    "  float dist = length(coord);",
    "  if (dist > 0.5) discard;",
    "  float alpha = smoothstep(0.5, 0.0, dist);",
    "  gl_FragColor = vec4(vColor * vBrightness * 1.3, alpha * uOpacity);",
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
    return {
      x: x, y: y, z: z,
      r: c[0], g: c[1], b: c[2],
      size: 1.0 + Math.random() * 1.5,
      brightness: 0.75 + Math.random() * 0.25,
      phase: Math.random() * Math.PI * 2,
      surfaceType: 0,
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
    return {
      x: x, y: y, z: z,
      r: c[0], g: c[1], b: c[2],
      size: 0.8 + Math.random() * 1.2,
      brightness: 0.85 + Math.random() * 0.15,
      phase: Math.random() * Math.PI * 2,
      surfaceType: 1,
      depthBias: (Math.random() - 0.5) * 0.4
    };
  }

  function generateInternalParticle() {
    var h = CUBE_HALF * 0.85;
    var x = (Math.random() * 2 - 1) * h;
    var y = (Math.random() * 2 - 1) * h;
    var z = (Math.random() * 2 - 1) * h;
    var c = pickInternalColor();
    return {
      x: x, y: y, z: z,
      r: c[0], g: c[1], b: c[2],
      size: 0.5 + Math.random() * 0.8,
      brightness: 0.55 + Math.random() * 0.30,
      phase: Math.random() * Math.PI * 2,
      surfaceType: 2,
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
    return {
      x: x, y: y, z: z,
      r: c[0], g: c[1], b: c[2],
      size: 0.4 + Math.random() * 0.6,
      brightness: 0.55 + centerFactor * 0.40,
      phase: Math.random() * Math.PI * 2,
      surfaceType: 3,
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
      sz[i] = p.size; br[i] = p.brightness; ph[i] = p.phase;
      st[i] = p.surfaceType; db[i] = p.depthBias;
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
        uOpacity: { value: 0.92 }, uReduceMotion: uReduceMotion
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
        uOpacity: { value: 0.40 }, uReduceMotion: uReduceMotion
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

  // ─── Field Shaders ────────────────────────────────────────
  // The field is a volumetric particle river.
  // Particles flow along noise-perturbed stream lines.
  // The field breathes and shifts density over time.
  // The cube emerges through a gradual density gradient near center.
  var fieldVertexShader = [
    "attribute float aStreamRadius;",
    "attribute float aStreamPos;",
    "attribute float aSeed;",
    "attribute float aWidthOffset;",
    "attribute float aThicknessOffset;",
    "attribute float aPhase;",
    "attribute float aSpeed;",
    "attribute float aSize;",
    "attribute float aBrightness;",
    "attribute vec3 aColorMix;",
    "attribute float aDensityBias;",
    "uniform float uTime;",
    "uniform float uPointScale;",
    "uniform float uReduceMotion;",
    "uniform float uScrollProgress;",
    "uniform float uEntrance;",
    "uniform float uCullMode;",
    "uniform float uCubeZ;",
    "uniform float uRadiusBRatio;",
    "uniform float uHalfWidth;",
    "uniform mat3 uRotation;",
    "varying vec3 vColor;",
    "varying float vBrightness;",
    "void main() {",
    "  float flowTime = uReduceMotion > 0.5 ? 0.0 : uTime;",
    "  float theta = aStreamPos * 6.283185 + flowTime * aSpeed;",
    // Noise-perturbed stream line — organic, not a perfect ellipse
    "  float n1 = sin(theta * 2.3 + aSeed * 6.283);",
    "  float n2 = cos(theta * 1.7 + aSeed * 4.56);",
    "  float n3 = sin(theta * 3.1 + aSeed * 2.0);",
    "  float n4 = sin(theta * 5.5 + aSeed * 8.1);",
    "  float n5 = cos(theta * 7.3 + aSeed * 3.7);",
    "  vec3 centerLocal = vec3(",
    "    aStreamRadius * cos(theta) + n1 * aStreamRadius * 0.22 + n4 * aStreamRadius * 0.08,",
    "    aStreamRadius * uRadiusBRatio * sin(theta) + n2 * aStreamRadius * 0.18 + n5 * aStreamRadius * 0.07,",
    "    n3 * aStreamRadius * 0.14 + n4 * aStreamRadius * 0.05",
    "  );",
    "  vec3 center = uRotation * centerLocal;",
    // Normal and binormal for width/thickness offsets
    "  vec3 normalLocal = normalize(vec3(uRadiusBRatio * cos(theta), sin(theta), 0.0));",
    "  vec3 normal = uRotation * normalLocal;",
    "  vec3 binormal = normalize(cross(normalize(center + vec3(0.001)), normal));",
    "  vec3 worldPos = center + normal * aWidthOffset + binormal * aThicknessOffset;",
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
    "  float densityMod = 0.50",
    "    + 0.30 * sin(theta * 1.5 + aSeed * 3.0 + densityShift)",
    "    + 0.18 * cos(theta * 2.7 + aSeed * 5.0 + densityShift * 0.7);",
    // Breathing — slow density oscillation
    "  float breath = sin(flowTime * 0.3 + aPhase) * 0.06;",
    "  densityMod += breath;",
    "  densityMod = max(0.2, densityMod);",
    // Border dissolve — particles at river edges fade naturally
    "  float widthFactor = 1.0 - abs(aWidthOffset) / uHalfWidth;",
    "  widthFactor = smoothstep(0.0, 0.4, widthFactor);",
    // Cube emergence — gradual density reduction near center (negative space)
    "  float distToCenter = length(mvPosition.xy);",
    "  float clarityFactor = smoothstep(0.40, 1.1, distToCenter);",
    "  float frontWeight = smoothstep(-0.15, 0.35, zDiff);",
    "  vColor = aColorMix;",
    "  vBrightness = aBrightness * densityMod * widthFactor;",
    "  vBrightness *= mix(1.0, mix(0.20, 1.0, clarityFactor), frontWeight);",
    // Depth attenuation
    "  float depth = -mvPosition.z;",
    "  float depthFactor = smoothstep(3.0, 7.5, depth);",
    "  gl_PointSize = max(1.0, aSize * uPointScale * (1.0 - depthFactor * 0.25) / depth);",
    "  gl_Position = projectionMatrix * mvPosition;",
    "}"
  ].join("\n");

  var fieldFragmentShader = [
    "varying vec3 vColor;",
    "varying float vBrightness;",
    "uniform float uOpacity;",
    "void main() {",
    "  vec2 coord = gl_PointCoord - vec2(0.5);",
    "  float dist = length(coord);",
    "  if (dist > 0.5) discard;",
    "  float alpha = smoothstep(0.5, 0.10, dist);",
    "  gl_FragColor = vec4(vColor * vBrightness, alpha * uOpacity);",
    "}"
  ].join("\n");

  var fieldHighlightFragmentShader = [
    "varying vec3 vColor;",
    "varying float vBrightness;",
    "uniform float uOpacity;",
    "void main() {",
    "  vec2 coord = gl_PointCoord - vec2(0.5);",
    "  float dist = length(coord);",
    "  if (dist > 0.5) discard;",
    "  float alpha = smoothstep(0.5, 0.0, dist);",
    "  gl_FragColor = vec4(vColor * vBrightness * 1.4, alpha * uOpacity);",
    "}"
  ].join("\n");

  // ─── Dust Shaders ─────────────────────────────────────────
  var dustVertexShader = [
    "attribute float aSize;",
    "attribute vec3 aColorMix;",
    "attribute float aPhase;",
    "attribute float aBrightness;",
    "uniform float uTime;",
    "uniform float uPointScale;",
    "uniform float uReduceMotion;",
    "uniform float uEntrance;",
    "varying vec3 vColor;",
    "varying float vBrightness;",
    "void main() {",
    "  vColor = aColorMix;",
    "  float drift = uReduceMotion > 0.5 ? 0.0 : sin(uTime * 0.1 + aPhase) * 0.02;",
    "  vec3 pos = position;",
    "  pos.x += drift;",
    "  pos.y += cos(uTime * 0.08 + aPhase) * 0.02;",
    "  pos *= mix(0.75, 1.0, uEntrance);",
    "  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);",
    "  vBrightness = aBrightness;",
    "  float depth = -mvPosition.z;",
    "  float depthFactor = smoothstep(3.0, 8.0, depth);",
    "  gl_PointSize = max(1.0, aSize * uPointScale * (1.0 - depthFactor * 0.3) / depth);",
    "  gl_Position = projectionMatrix * mvPosition;",
    "}"
  ].join("\n");

  var dustFragmentShader = [
    "varying vec3 vColor;",
    "varying float vBrightness;",
    "uniform float uOpacity;",
    "void main() {",
    "  vec2 coord = gl_PointCoord - vec2(0.5);",
    "  float dist = length(coord);",
    "  if (dist > 0.5) discard;",
    "  float alpha = smoothstep(0.5, 0.12, dist);",
    "  gl_FragColor = vec4(vColor * vBrightness, alpha * uOpacity);",
    "}"
  ].join("\n");

  // ─── Field Particle Generation ────────────────────────────
  function pickPrimaryColor() {
    var r = Math.random();
    if (r < 0.60) return COLOR_NAVY;
    if (r < 0.90) return COLOR_GREEN;
    return Math.random() < 0.5 ? COLOR_PALE_GREEN : COLOR_SOFT_WHITE;
  }

  function pickSecondaryColor() {
    var r = Math.random();
    if (r < 0.45) return COLOR_NAVY;
    if (r < 0.85) return COLOR_GREEN;
    return Math.random() < 0.5 ? COLOR_PALE_GREEN : COLOR_SOFT_WHITE;
  }

  function pickHighlightColor() {
    return Math.random() < 0.7 ? COLOR_GREEN : COLOR_PALE_GREEN;
  }

  function generateFieldParticles(count, config, isPrimary, densitySeed, rotMat) {
    var particles = [];
    var highlightCount = Math.floor(count * config.highlightFraction);
    var mainCount = count - highlightCount;
    var colorPicker = isPrimary ? pickPrimaryColor : pickSecondaryColor;
    var halfWidth = config.width * 0.5;
    var halfThickness = config.thickness * 0.5;
    var radiusRange = config.radiusMax - config.radiusMin;
    var bRatio = config.radiusBRatio;

    // Flow-based particle generation:
    // 1. Pick a flow line (weighted)
    // 2. Sample position along flow centerline + subtle turbulence
    // 3. Map world position → stream coordinates (theta, radius) for shader
    // 4. Accept based on density field
    // 5. Brightness/size from light field
    // Particles form coherent streams, not scattered dots.
    for (var i = 0; i < mainCount; i++) {
      var theta = 0, streamRadius = 0, density = 0, light = 0;
      var widthOff = 0, thickOff = 0, flowSpeed = 0;
      var accepted = false;

      for (var attempt = 0; attempt < 30; attempt++) {
        var flow = pickFlow();
        var pos = sampleFlowPosition(flow);

        density = totalDensityAt(pos.x, pos.y, pos.z);
        if (Math.random() < density) {
          var stream = worldToStream(pos.x, pos.y, pos.z, rotMat, bRatio);
          theta = stream.theta;
          streamRadius = Math.max(config.radiusMin, Math.min(config.radiusMax, stream.radius));

          // Tight offsets — particles hug the flow centerline
          widthOff = gaussian() * flow.flowWidth;
          thickOff = gaussian() * flow.flowWidth * 0.5;

          // Coherent speed — particles in same flow move together
          flowSpeed = config.baseSpeed * (1.0 - flow.speedCoherence * 0.5 + Math.random() * flow.speedCoherence);

          light = lightFieldAt(pos.x, pos.y, pos.z);
          accepted = true;
          break;
        }
      }

      if (!accepted) {
        // Rejected by density — sparse dust particle in negative space
        theta = Math.random() * Math.PI * 2;
        streamRadius = config.radiusMin + Math.random() * radiusRange;
        widthOff = gaussian() * halfWidth * 0.65;
        thickOff = gaussian() * halfThickness * 0.65;
        density = 0.05;
        light = 0.05;
        flowSpeed = config.baseSpeed * (0.96 + Math.random() * 0.08);
      }

      var c = colorPicker();
      var tier = lightTier(light);
      var brightness, sizeMul;
      if (tier === 3) { brightness = 0.90 + light * 0.10; sizeMul = 1.0; }
      else if (tier === 2) { brightness = 0.55 + light * 0.30; sizeMul = 0.75; }
      else if (tier === 1) { brightness = 0.25 + light * 0.30; sizeMul = 0.5; }
      else { brightness = 0.05 + light * 0.15; sizeMul = 0.3; }

      particles.push({
        streamRadius: streamRadius,
        streamPos: theta / (Math.PI * 2),
        seed: Math.random(),
        widthOffset: widthOff,
        thicknessOffset: thickOff,
        phase: Math.random() * Math.PI * 2,
        speed: flowSpeed,
        size: (isPrimary ? 0.3 : 0.2) + density * (isPrimary ? 0.8 : 0.7) * sizeMul,
        brightness: brightness,
        color: c,
        densityBias: density,
        isHighlight: false
      });
    }

    // Highlights — exist because LIGHT exists along FLOW lines
    for (var j = 0; j < highlightCount; j++) {
      var hTheta = 0, hRadius = 0, hDensity = 0, hLight = 0;
      var hWidth = 0, hThick = 0, hSpeed = 0;
      var hAccepted = false;

      for (var attempt = 0; attempt < 50; attempt++) {
        var hFlow = pickFlow();
        var hPos = sampleFlowPosition(hFlow);

        hDensity = totalDensityAt(hPos.x, hPos.y, hPos.z);
        hLight = lightFieldAt(hPos.x, hPos.y, hPos.z);

        if (hLight > 0.5 && hDensity > 0.3 && Math.random() < hLight * hDensity) {
          var hStream = worldToStream(hPos.x, hPos.y, hPos.z, rotMat, bRatio);
          hTheta = hStream.theta;
          hRadius = Math.max(config.radiusMin, Math.min(config.radiusMax, hStream.radius));
          hWidth = gaussian() * hFlow.flowWidth * 0.5;
          hThick = gaussian() * hFlow.flowWidth * 0.3;
          hSpeed = config.baseSpeed * (1.0 - hFlow.speedCoherence * 0.5 + Math.random() * hFlow.speedCoherence);
          hAccepted = true;
          break;
        }
      }

      if (!hAccepted) continue;

      var cH = pickHighlightColor();
      particles.push({
        streamRadius: hRadius,
        streamPos: hTheta / (Math.PI * 2),
        seed: Math.random(),
        widthOffset: hWidth,
        thicknessOffset: hThick,
        phase: Math.random() * Math.PI * 2,
        speed: hSpeed,
        size: 0.6 + hLight * 0.7,
        brightness: 0.80 + hLight * 0.20,
        color: cH,
        densityBias: hDensity,
        isHighlight: true
      });
    }

    return particles;
  }

  // ─── Field System Creation ────────────────────────────────
  function fillFieldGeometry(geo, particles) {
    var n = particles.length;
    var pos = new Float32Array(n * 3);
    var aStreamRadius = new Float32Array(n);
    var aStreamPos = new Float32Array(n);
    var aSeed = new Float32Array(n);
    var aWidthOffset = new Float32Array(n);
    var aThicknessOffset = new Float32Array(n);
    var aPhase = new Float32Array(n);
    var aSpeed = new Float32Array(n);
    var aSize = new Float32Array(n);
    var aBrightness = new Float32Array(n);
    var aColorMix = new Float32Array(n * 3);
    var aDensityBias = new Float32Array(n);

    for (var i = 0; i < n; i++) {
      var p = particles[i];
      pos[i * 3] = 0; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = 0;
      aStreamRadius[i] = p.streamRadius;
      aStreamPos[i] = p.streamPos;
      aSeed[i] = p.seed;
      aWidthOffset[i] = p.widthOffset;
      aThicknessOffset[i] = p.thicknessOffset;
      aPhase[i] = p.phase;
      aSpeed[i] = p.speed;
      aSize[i] = p.size;
      aBrightness[i] = p.brightness;
      aColorMix[i * 3] = p.color[0];
      aColorMix[i * 3 + 1] = p.color[1];
      aColorMix[i * 3 + 2] = p.color[2];
      aDensityBias[i] = p.densityBias;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aStreamRadius", new THREE.BufferAttribute(aStreamRadius, 1));
    geo.setAttribute("aStreamPos", new THREE.BufferAttribute(aStreamPos, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
    geo.setAttribute("aWidthOffset", new THREE.BufferAttribute(aWidthOffset, 1));
    geo.setAttribute("aThicknessOffset", new THREE.BufferAttribute(aThicknessOffset, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(aPhase, 1));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(aSpeed, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(aSize, 1));
    geo.setAttribute("aBrightness", new THREE.BufferAttribute(aBrightness, 1));
    geo.setAttribute("aColorMix", new THREE.BufferAttribute(aColorMix, 3));
    geo.setAttribute("aDensityBias", new THREE.BufferAttribute(aDensityBias, 1));
  }

  function createFieldSystem(config, count, isPrimary, densitySeed) {
    var rotationMat3 = eulerToMat3(config.inclX, config.inclY, config.inclZ);
    var cubeViewZ = -camera.position.z;

    var particles = generateFieldParticles(count, config, isPrimary, densitySeed, rotationMat3);
    var mainParts = particles.filter(function (p) { return !p.isHighlight; });
    var highlightParts = particles.filter(function (p) { return p.isHighlight; });

    var sharedUniforms = {
      uTime: uTime,
      uPointScale: uScaleGlobal,
      uReduceMotion: uReduceMotion,
      uScrollProgress: uScrollProgress,
      uEntrance: uEntranceProgress,
      uCubeZ: { value: cubeViewZ },
      uRadiusBRatio: { value: config.radiusBRatio },
      uHalfWidth: { value: config.width * 0.5 },
      uRotation: { value: rotationMat3 }
    };

    function makeMaterial(cullMode, opacity, isHighlight) {
      return new THREE.ShaderMaterial({
        uniforms: Object.assign({}, sharedUniforms, {
          uCullMode: { value: cullMode },
          uOpacity: { value: opacity }
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
      fillFieldGeometry(geo, parts);
      var mat = makeMaterial(cullMode, opacity, isHighlight);
      var pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      pts.renderOrder = renderOrder;
      scene.add(pts);
      fieldObjects.push(pts);
      materialOpacityRefs.push({ uniform: mat.uniforms.uOpacity, base: opacity, isDust: false });
    }

    // Back: renderOrder -1 (behind cube)
    // Front: renderOrder 1 (in front of cube)
    makePoints(mainParts, 0.0, config.opacity, false, -1);
    makePoints(mainParts, 1.0, config.opacity, false, 1);
    makePoints(highlightParts, 0.0, config.highlightOpacity, true, -1);
    makePoints(highlightParts, 1.0, config.highlightOpacity, true, 1);
  }

  // ─── Dust System Creation ─────────────────────────────────
  function createDustSystem(count, opacity) {
    var pos = new Float32Array(count * 3);
    var col = new Float32Array(count * 3);
    var sz = new Float32Array(count);
    var ph = new Float32Array(count);
    var br = new Float32Array(count);

    // Dust uses same density field + light field for brightness
    for (var i = 0; i < count; i++) {
      var x, y, zOff, density = 0, light = 0;
      var accepted = false;

      for (var attempt = 0; attempt < 20; attempt++) {
        x = (Math.random() - 0.5) * 8.0;
        y = (Math.random() - 0.5) * 5.0;
        zOff = (Math.random() - 0.5) * 1.5;
        density = totalDensityAt(x, y, zOff);
        if (Math.random() < density * 0.5 + 0.05) {
          light = lightFieldAt(x, y, zOff);
          accepted = true;
          break;
        }
      }

      if (!accepted) {
        var r = 2.5 + Math.random() * 2.5;
        var theta = Math.random() * Math.PI * 2;
        x = r * Math.cos(theta);
        y = r * 0.5 * Math.sin(theta);
        zOff = (Math.random() - 0.5) * 1.5;
        density = 0.05;
        light = lightFieldAt(x, y, zOff);
      }

      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = zOff;

      var colorRoll = Math.random();
      var color = colorRoll < 0.65 ? COLOR_NAVY : (colorRoll < 0.90 ? COLOR_GREEN : COLOR_PALE_GREEN);
      col[i * 3] = color[0]; col[i * 3 + 1] = color[1]; col[i * 3 + 2] = color[2];
      sz[i] = 0.10 + light * 0.15;
      ph[i] = Math.random() * Math.PI * 2;
      br[i] = 0.05 + light * 0.15;
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColorMix", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sz, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
    geo.setAttribute("aBrightness", new THREE.BufferAttribute(br, 1));

    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: uTime,
        uPointScale: uScaleGlobal,
        uReduceMotion: uReduceMotion,
        uEntrance: uEntranceProgress,
        uOpacity: { value: opacity }
      },
      vertexShader: dustVertexShader,
      fragmentShader: dustFragmentShader,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.NormalBlending
    });

    var pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = -2;
    scene.add(pts);
    fieldObjects.push(pts);
    materialOpacityRefs.push({ uniform: mat.uniforms.uOpacity, base: opacity, isDust: true });
  }

  // ─── Init ─────────────────────────────────────────────────
  function init() {
    var device = getDevice();
    var cubeCounts = CUBE_COUNTS[device];
    var fieldCounts = FIELD_COUNTS[device];

    scene = new THREE.Scene();

    cssW = window.innerWidth;
    cssH = window.innerHeight;
    var aspect = cssW / cssH || 1;
    camera = new THREE.PerspectiveCamera(32, aspect, 0.1, 100);
    // Initial camera from Shot 01
    var shot0 = SHOTS[0];
    camera.position.set(shot0.camera.x, shot0.camera.y, shot0.camera.z);
    camera.lookAt(shot0.camera.lookX, shot0.camera.lookY, shot0.camera.lookZ);

    renderer = new THREE.WebGLRenderer({
      canvas: canvas, alpha: true, antialias: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
    renderer.setSize(cssW, cssH, false);
    renderer.setClearColor(0x000000, 0);

    createCubeSystem(cubeCounts);
    createFieldSystem(FIELD_PRIMARY, fieldCounts.primary, true, 0.0);
    createFieldSystem(FIELD_SECONDARY, fieldCounts.secondary, false, 1.8);
    createDustSystem(fieldCounts.dust, 0.18);

    resize();
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
        cubeGroup.position.set(0, 0, 0);
      }
      for (var ci = 0; ci < cubeOpacityRefs.length; ci++) {
        cubeOpacityRefs[ci].uniform.value = cubeOpacityRefs[ci].base * c.cubeVisibility;
      }
      for (var ri = 0; ri < materialOpacityRefs.length; ri++) {
        var cref = materialOpacityRefs[ri];
        var cmult = cref.isDust ? c.dustOpacity : c.fieldOpacity;
        cref.uniform.value = cref.base * cmult;
      }
      uScrollProgress.value = 0;
      uEntranceProgress.value = 1;
      renderer.render(scene, camera);
      return;
    }

    // ── Composition Director: interpolate between shots ──
    var idx = Math.floor(shotProgress);
    var frac = smoothstep(shotProgress - idx); // eased transition
    var s0 = SHOTS[idx];
    var s1 = SHOTS[Math.min(idx + 1, SHOTS.length - 1)];

    // Camera direction — moves around the cube (cube stays at origin)
    camera.position.x = lerp(s0.camera.x, s1.camera.x, frac);
    camera.position.y = lerp(s0.camera.y, s1.camera.y, frac);
    camera.position.z = lerp(s0.camera.z, s1.camera.z, frac);
    camera.lookAt(
      lerp(s0.camera.lookX, s1.camera.lookX, frac),
      lerp(s0.camera.lookY, s1.camera.lookY, frac),
      lerp(s0.camera.lookZ, s1.camera.lookZ, frac)
    );

    // ── Cube: stationary at origin, rotation only, visibility from shot ──
    uTime.value = timeSeconds;
    if (cubeGroup) {
      if (!reduceMotion) {
        cubeGroup.rotation.y = CUBE_INIT_ROT_Y + time * CUBE_ROT_Y;
        cubeGroup.rotation.x = CUBE_INIT_ROT_X + Math.sin(time * CUBE_DRIFT_X_FREQ) * CUBE_DRIFT_X_AMP;
      }
      // Entrance scale only — no shot-based scale (camera distance creates size variation)
      var entranceScale = 0.92 + entranceProgress * 0.08;
      cubeGroup.scale.setScalar(entranceScale);
      // Cube stays at world origin — never moves
      cubeGroup.position.set(0, 0, 0);
    }

    // ── Cube visibility from shot ──
    var cubeVisibility = lerp(s0.cubeVisibility, s1.cubeVisibility, frac);
    for (var c = 0; c < cubeOpacityRefs.length; c++) {
      cubeOpacityRefs[c].uniform.value = cubeOpacityRefs[c].base * cubeVisibility;
    }

    // ── Field & Dust opacity from shot ──
    var fieldOpacity = lerp(s0.fieldOpacity, s1.fieldOpacity, frac);
    var dustOpacity = lerp(s0.dustOpacity, s1.dustOpacity, frac);
    var scrollDispersion = lerp(s0.scrollDispersion, s1.scrollDispersion, frac);
    uScrollProgress.value = scrollDispersion;
    uEntranceProgress.value = entranceProgress;

    for (var i = 0; i < materialOpacityRefs.length; i++) {
      var ref = materialOpacityRefs[i];
      var multiplier = ref.isDust ? dustOpacity : fieldOpacity;
      ref.uniform.value = ref.base * multiplier;
    }

    renderer.render(scene, camera);
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
