import * as THREE from './vendor/three.module.min.js';

(function () {
  "use strict";

  var canvas = document.querySelector(".hero__cube-canvas");
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

  var ORBIT_COUNTS = {
    desktop: [2000, 800, 300, 40],
    tablet:  [1200, 500, 200, 28],
    mobile:  [700,  300, 120, 18]
  };

  var ORBIT_OPACITY = { primary: 0.07, secondary: 0.03, dust: 0.02, accents: 0.0 };

  var GALAXY_OUTER = 4.8;
  var POINTER_RADIUS = 130;
  var POINTER_FORCE = 0.09;
  var SPRING = 0.032;
  var DAMPING = 0.94;
  var MAX_DISPERSION = 0.85;

  var STREAM_AMPLITUDE_A = 0.018;
  var STREAM_AMPLITUDE_B = 0.006;
  var STREAM_FREQUENCY_A = 0.095;
  var STREAM_FREQUENCY_B = 0.155;
  var STREAM_ARM_AMPLITUDE = 0.010;
  var STREAM_ARM_FREQUENCY = [0.055, 0.065, 0.075];
  var TRACER_AMPLITUDE = 0.045;
  var TRACER_FREQUENCY = 0.165;

  // ─── Colors ───────────────────────────────────────────────
  var COLOR_NAVY       = [0.118, 0.161, 0.231];
  var COLOR_GREEN      = [0.220, 0.631, 0.412];
  var COLOR_PALE_GREEN = [0.655, 0.890, 0.761];
  var COLOR_SOFT_WHITE = [0.969, 1.000, 0.980];

  // ─── State ────────────────────────────────────────────────
  var renderer, scene, camera;
  var cubeGroup;
  var orbitSystems = [];
  var animating = false, rafId = null, lastTime = 0;
  var scrollProgress = 0, targetScrollProgress = 0;
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

  // ─── Helpers ──────────────────────────────────────────────
  function getDevice() {
    var w = window.innerWidth;
    if (w < 480) return "mobile";
    if (w < 768) return "tablet";
    return "desktop";
  }

  function gaussian() {
    var u = 1 - Math.random();
    var v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function diskTo3D(r, theta, z, tiltX, tiltY) {
    var rNorm = r / GALAXY_OUTER;
    var x = rNorm * Math.cos(theta);
    var y = rNorm * Math.sin(theta) * 0.46;
    var cx = Math.cos(tiltX), sx = Math.sin(tiltX);
    var cy = Math.cos(tiltY), sy = Math.sin(tiltY);
    var y2 = y * cx - z * sx;
    var z2 = y * sx + z * cx;
    var x3 = x * cy + z2 * sy;
    var z3 = -x * sy + z2 * cy;
    return [x3, y2 * 0.95, z3];
  }

  // ─── Cube Shaders ─────────────────────────────────────────
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

  // ─── Cube Particle Generation ─────────────────────────────
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

  // ─── Cube System Creation ─────────────────────────────────
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
    cubeGroup.add(mainPoints);

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
    cubeGroup.add(corePoints);

    scene.add(cubeGroup);
  }

  // ─── Orbit Shaders ────────────────────────────────────────
  var orbitVertexShader = [
    "attribute float size;",
    "attribute vec3 color;",
    "uniform float uScale;",
    "varying vec3 vColor;",
    "void main() {",
    "  vColor = color;",
    "  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);",
    "  gl_PointSize = max(1.0, size * uScale / -mvPosition.z);",
    "  gl_Position = projectionMatrix * mvPosition;",
    "}"
  ].join("\n");

  var orbitFragmentShader = [
    "varying vec3 vColor;",
    "uniform float uOpacity;",
    "void main() {",
    "  vec2 coord = gl_PointCoord - vec2(0.5);",
    "  float dist = length(coord);",
    "  if (dist > 0.5) discard;",
    "  float alpha = smoothstep(0.5, 0.15, dist);",
    "  gl_FragColor = vec4(vColor, alpha * uOpacity);",
    "}"
  ].join("\n");

  // ─── Orbit Particle System ────────────────────────────────
  function OrbitParticleSystem(count, opacity, generator) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.sizes = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.vz = new Float32Array(count);
    this.ox = new Float32Array(count);
    this.oy = new Float32Array(count);
    this.oz = new Float32Array(count);
    this.extras = [];

    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(this.sizes, 1));

    var mat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: opacity }, uScale: uScaleGlobal },
      vertexShader: orbitVertexShader,
      fragmentShader: orbitFragmentShader,
      transparent: true, depthWrite: false,
      blending: THREE.NormalBlending
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    for (var i = 0; i < count; i++) {
      var gen = generator(i, count);
      this.ox[i] = gen.x; this.oy[i] = gen.y; this.oz[i] = gen.z;
      this.positions[i * 3] = gen.x;
      this.positions[i * 3 + 1] = gen.y;
      this.positions[i * 3 + 2] = gen.z;
      this.colors[i * 3] = gen.r;
      this.colors[i * 3 + 1] = gen.g;
      this.colors[i * 3 + 2] = gen.b;
      this.sizes[i] = gen.size;
      this.extras.push(gen.extra || {});
    }
  }

  OrbitParticleSystem.prototype.setNeedsUpdate = function () {
    this.points.geometry.attributes.position.needsUpdate = true;
  };

  // ─── Orbit Generators ─────────────────────────────────────
  function hexToRgb(hex) {
    return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  }
  var C_NAVY = 0x1E293B, C_GREEN = 0x38A169, C_WHITE = 0xFFFFFF;

  function generateOrbitParticle(i, count, params) {
    var arms = 3;
    var arm = i % arms;
    var u = Math.random();
    var rBase = params.inner + (params.outer - params.inner) * (u * u);
    var armAngle = (arm / arms) * Math.PI * 2 + (Math.random() * 2 - 1) * params.armWidths[arm];
    var theta = armAngle + rBase * params.armTwists[arm];
    var band = Math.cos(arms * (theta - rBase * params.armTwists[arm])) * 0.5 + 0.5;
    rBase += (Math.random() - 0.5) * 0.22 * (1 - band * 0.4);
    var zOff = (Math.random() - 0.5) * params.thickness;
    var pt = diskTo3D(rBase, theta, zOff, params.tiltX, params.tiltY);
    var color = Math.random() < 0.24 ? C_GREEN : C_NAVY;
    if (Math.random() < 0.05) color = C_WHITE;
    var rgb = hexToRgb(color);
    return {
      x: pt[0], y: pt[1], z: pt[2],
      r: rgb[0], g: rgb[1], b: rgb[2],
      size: params.sizeBase + Math.random() * params.sizeRange,
      extra: {
        type: params.type, theta: theta, baseR: rBase, z: zOff,
        tiltX: params.tiltX, tiltY: params.tiltY,
        phase: Math.random() * Math.PI * 2, arm: arm,
        tracer: params.tracer || false
      }
    };
  }

  function generateDustParticle(i, count) {
    var r = 0.2 + Math.random() * 6.0;
    var theta = Math.random() * Math.PI * 2;
    var zOff = (Math.random() - 0.5) * 1.2;
    var pt = diskTo3D(r, theta, zOff, -0.22, -0.18);
    var rgb = hexToRgb(Math.random() < 0.25 ? C_GREEN : (Math.random() < 0.4 ? C_WHITE : C_NAVY));
    return {
      x: pt[0], y: pt[1], z: pt[2],
      r: rgb[0], g: rgb[1], b: rgb[2],
      size: 0.3 + Math.random() * 0.5,
      extra: { type: "dust", phase: Math.random() * Math.PI * 2 }
    };
  }

  function getStreamAngularOffset(extra, timeSeconds) {
    var arm = extra.arm || 0;
    var armOffset = Math.sin(timeSeconds * STREAM_ARM_FREQUENCY[arm] + arm * 1.9) * STREAM_ARM_AMPLITUDE;
    var particleOffset = Math.sin(timeSeconds * STREAM_FREQUENCY_A + extra.phase) * STREAM_AMPLITUDE_A
                       + Math.sin(timeSeconds * STREAM_FREQUENCY_B + extra.phase * 1.7) * STREAM_AMPLITUDE_B;
    if (extra.tracer) particleOffset += Math.sin(timeSeconds * TRACER_FREQUENCY + extra.phase) * TRACER_AMPLITUDE;
    return armOffset + particleOffset;
  }

  // ─── Init ─────────────────────────────────────────────────
  function init() {
    var device = getDevice();
    var cubeCounts = CUBE_COUNTS[device];
    var orbitCounts = ORBIT_COUNTS[device];

    scene = new THREE.Scene();

    var aspect = canvas.clientWidth / canvas.clientHeight || 1;
    camera = new THREE.PerspectiveCamera(32, aspect, 0.1, 100);
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({
      canvas: canvas, alpha: true, antialias: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.setClearColor(0x000000, 0);

    createCubeSystem(cubeCounts);

    // Dimmed orbit systems
    orbitSystems.push(new OrbitParticleSystem(orbitCounts[0], ORBIT_OPACITY.primary, function (i, c) {
      return generateOrbitParticle(i, c, {
        inner: 1.8, outer: GALAXY_OUTER,
        armWidths: [0.34, 0.30, 0.26], armTwists: [0.80, 0.85, 0.90],
        thickness: 0.28, tiltX: -0.22, tiltY: -0.18,
        sizeBase: 0.7, sizeRange: 1.2, type: "primary"
      });
    }));
    orbitSystems.push(new OrbitParticleSystem(orbitCounts[1], ORBIT_OPACITY.secondary, function (i, c) {
      return generateOrbitParticle(i, c, {
        inner: 0.9, outer: 3.0,
        armWidths: [0.40, 0.35, 0.30], armTwists: [1.0, 1.1, 1.2],
        thickness: 0.18, tiltX: 0.22, tiltY: 0.15,
        sizeBase: 0.4, sizeRange: 0.8, type: "secondary"
      });
    }));
    orbitSystems.push(new OrbitParticleSystem(orbitCounts[2], ORBIT_OPACITY.dust, generateDustParticle));

    resize();
    targetEntranceProgress = 1;
    if (reduceMotion) { entranceProgress = 1; scrollProgress = 0; targetScrollProgress = 0; }
  }

  // ─── Resize ───────────────────────────────────────────────
  function resize() {
    var rect = canvas.getBoundingClientRect();
    cssW = rect.width; cssH = rect.height;
    if (!renderer) return;
    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP) * qualityScale;
    renderer.setPixelRatio(dpr);
    renderer.setSize(cssW, cssH, false);
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
    uScaleGlobal.value = cssH * 0.040;
  }

  // ─── Animation ────────────────────────────────────────────
  function updateScroll() {
    var hero = canvas.closest(".hero");
    if (!hero) return;
    var rect = hero.getBoundingClientRect();
    var vh = window.innerHeight;
    targetScrollProgress = Math.max(0, Math.min(1, 1 - (rect.bottom / (vh + rect.height))));
  }

  function onPointerMove(e) {
    if (reduceMotion) return;
    var rect = canvas.getBoundingClientRect();
    pointerTargetX = e.clientX - rect.left;
    pointerTargetY = e.clientY - rect.top;
    if (!pointerActive) { pointerSmoothX = pointerTargetX; pointerSmoothY = pointerTargetY; }
    pointerActive = true;
  }

  function onPointerLeave() { pointerActive = false; }

  function projectToScreen(x, y, z) {
    var v = new THREE.Vector3(x, y, z);
    v.project(camera);
    return { x: (v.x * 0.5 + 0.5) * cssW, y: (-v.y * 0.5 + 0.5) * cssH };
  }

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

    var scrollK = 1 - Math.exp(-3.6 * dtSeconds);
    var entranceK = 1 - Math.exp(-1.8 * dtSeconds);
    var springK = 1 - Math.exp(-SPRING * 60 * dtSeconds);
    var damping = Math.exp(-(1 - DAMPING) * 60 * dtSeconds);

    scrollProgress += (targetScrollProgress - scrollProgress) * scrollK;
    entranceProgress += (targetEntranceProgress - entranceProgress) * entranceK;

    if (!reduceMotion) {
      pointerSmoothX += (pointerTargetX - pointerSmoothX) * 0.06;
      pointerSmoothY += (pointerTargetY - pointerSmoothY) * 0.06;
    }

    // ── Cube (GPU-only) ──
    uTime.value = timeSeconds;
    if (cubeGroup) {
      if (!reduceMotion) {
        cubeGroup.rotation.y = CUBE_INIT_ROT_Y + time * CUBE_ROT_Y;
        cubeGroup.rotation.x = CUBE_INIT_ROT_X + Math.sin(time * CUBE_DRIFT_X_FREQ) * CUBE_DRIFT_X_AMP;
      }
      var cubeScale = 0.92 + entranceProgress * 0.08;
      cubeGroup.scale.setScalar(cubeScale);
    }

    // ── Orbits (dimmed, JS-animated) ──
    var dispersion = scrollProgress * MAX_DISPERSION;
    var entranceDisp = (1 - entranceProgress) * 0.25;

    for (var s = 0; s < orbitSystems.length; s++) {
      var sys = orbitSystems[s];
      for (var i = 0; i < sys.count; i++) {
        var ox = sys.ox[i], oy = sys.oy[i], oz = sys.oz[i];
        if (!reduceMotion) {
          var extra = sys.extras[i];
          var theta, r, pt;
          if (extra.type === "primary" || extra.type === "secondary") {
            theta = extra.theta + getStreamAngularOffset(extra, timeSeconds);
            r = extra.baseR;
            pt = diskTo3D(r, theta, extra.z, extra.tiltX, extra.tiltY);
            ox = pt[0]; oy = pt[1]; oz = pt[2];
          } else if (extra.type === "dust") {
            ox += Math.sin(timeSeconds * 0.08 + extra.phase) * 0.02;
            oy += Math.cos(timeSeconds * 0.06 + extra.phase) * 0.02;
          }
        }
        var dispFactor = dispersion + entranceDisp;
        var tx = ox + ox * dispFactor * 0.35;
        var ty = oy + oy * dispFactor * 0.35;
        var tz = oz + oz * dispFactor * 0.35;

        if (pointerActive && !reduceMotion) {
          var sp = projectToScreen(sys.positions[i * 3], sys.positions[i * 3 + 1], sys.positions[i * 3 + 2]);
          var dpx = sp.x - pointerSmoothX;
          var dpy = sp.y - pointerSmoothY;
          var dist = Math.sqrt(dpx * dpx + dpy * dpy);
          if (dist < POINTER_RADIUS && dist > 0.1) {
            var force = (1 - dist / POINTER_RADIUS) * POINTER_FORCE * 0.012;
            sys.vx[i] += (dpx / dist) * force;
            sys.vy[i] += (dpy / dist) * force;
          }
        }

        sys.vx[i] += (tx - sys.positions[i * 3]) * springK;
        sys.vy[i] += (ty - sys.positions[i * 3 + 1]) * springK;
        sys.vz[i] += (tz - sys.positions[i * 3 + 2]) * springK;
        sys.vx[i] *= damping;
        sys.vy[i] *= damping;
        sys.vz[i] *= damping;
        sys.positions[i * 3] += sys.vx[i];
        sys.positions[i * 3 + 1] += sys.vy[i];
        sys.positions[i * 3 + 2] += sys.vz[i];
      }
      sys.setNeedsUpdate();
    }

    renderer.render(scene, camera);
  }

  // ─── Events ───────────────────────────────────────────────
  function onResize() { resize(); }

  var visObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        if (!animating) { animating = true; lastTime = 0; rafId = requestAnimationFrame(animate); }
      } else {
        animating = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
      }
    });
  }, { threshold: 0.01 });

  // ─── Start ────────────────────────────────────────────────
  init();
  updateScroll();
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointerdown", onPointerMove);
  window.addEventListener("scroll", updateScroll, { passive: true });
  window.addEventListener("resize", onResize);
  visObs.observe(canvas.closest(".hero"));
  animating = true;
  rafId = requestAnimationFrame(animate);
})();
