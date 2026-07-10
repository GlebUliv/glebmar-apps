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

  // ─── Ribbon Config ────────────────────────────────────────
  // Cube width = 2 * CUBE_HALF = 1.1
  var CUBE_WIDTH = 2 * CUBE_HALF;

  var RIBBON_PRIMARY = {
    radiusA: 1.85 * CUBE_WIDTH,       // major radius
    radiusB: 0.82 * 1.85 * CUBE_WIDTH, // minor radius (0.82 of major)
    width: 0.24,                       // ribbon width (normalized)
    thickness: 0.13,                   // ribbon thickness
    inclX: -18 * Math.PI / 180,
    inclY: 13 * Math.PI / 180,
    inclZ: -10 * Math.PI / 180,
    baseSpeed: 2 * Math.PI / 90,       // 90s per traversal
    opacity: 0.92,
    highlightOpacity: 0.50,
    highlightFraction: 0.04
  };

  var RIBBON_SECONDARY = {
    radiusA: 1.30 * CUBE_WIDTH,
    radiusB: 0.75 * 1.30 * CUBE_WIDTH,
    width: 0.15,
    thickness: 0.08,
    inclX: 5 * Math.PI / 180,
    inclY: -8 * Math.PI / 180,
    inclZ: 18 * Math.PI / 180,
    baseSpeed: 2 * Math.PI / 115,      // 115s per traversal
    opacity: 0.78,
    highlightOpacity: 0.40,
    highlightFraction: 0.05
  };

  var RIBBON_COUNTS = {
    desktop: { primary: 24000, secondary: 11000 },
    tablet:  { primary: 14000, secondary: 6500 },
    mobile:  { primary: 8000,  secondary: 3500 }
  };

  // ─── Colors ───────────────────────────────────────────────
  var COLOR_NAVY       = [0.118, 0.161, 0.231];
  var COLOR_GREEN      = [0.220, 0.631, 0.412];
  var COLOR_PALE_GREEN = [0.655, 0.890, 0.761];
  var COLOR_SOFT_WHITE = [0.969, 1.000, 0.980];

  // ─── State ────────────────────────────────────────────────
  var renderer, scene, camera;
  var cubeGroup;
  var ribbonObjects = [];
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
  var uScrollProgress = { value: 0 };
  var uEntranceProgress = { value: 0 };

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

  function eulerToMat3(x, y, z) {
    var e = new THREE.Euler(x, y, z, 'XYZ');
    var m = new THREE.Matrix4().makeRotationFromEuler(e);
    return new THREE.Matrix3().setFromMatrix4(m);
  }

  // Weighted theta sampling for density variation
  // Creates 3 denser sectors and 1 thinner gap
  function sampleDenseTheta(seedOffset) {
    var theta;
    var attempts = 0;
    while (attempts < 20) {
      theta = Math.random() * Math.PI * 2;
      // Density function: 3 peaks at ~0, ~2.1, ~4.2; gap at ~3.5
      var density = 0.45
        + 0.30 * Math.cos(theta * 1.5 + (seedOffset || 0))
        + 0.15 * Math.cos(theta * 3.0 + (seedOffset || 0) + 0.7);
      density = Math.max(0.1, density);
      if (Math.random() < density) return theta;
      attempts++;
    }
    return theta;
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

    scene.add(cubeGroup);
  }

  // ─── Ribbon Shaders ───────────────────────────────────────
  var ribbonVertexShader = [
    "attribute float aTheta;",
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
    "uniform float uRadiusA;",
    "uniform float uRadiusB;",
    "uniform mat3 uRotation;",
    "varying vec3 vColor;",
    "varying float vBrightness;",
    "void main() {",
    "  float theta = aTheta + (uReduceMotion > 0.5 ? 0.0 : uTime * aSpeed);",
    "  float ct = cos(theta);",
    "  float st = sin(theta);",
    "  vec3 centerLocal = vec3(uRadiusA * ct, uRadiusB * st, 0.0);",
    "  vec3 normalLocal = normalize(vec3(uRadiusB * ct, uRadiusA * st, 0.0));",
    "  vec3 binormalLocal = vec3(0.0, 0.0, 1.0);",
    "  vec3 center = uRotation * centerLocal;",
    "  vec3 normal = uRotation * normalLocal;",
    "  vec3 binormal = uRotation * binormalLocal;",
    "  vec3 worldPos = center + normal * aWidthOffset + binormal * aThicknessOffset;",
    "  worldPos *= mix(0.75, 1.0, uEntrance);",
    "  worldPos += normalize(worldPos + vec3(0.001)) * uScrollProgress * 0.4;",
    "  vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);",
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
    "  float distToCenter = length(mvPosition.xy);",
    "  float clarityRadius = 0.65;",
    "  float clarityFactor = smoothstep(clarityRadius, clarityRadius * 1.9, distToCenter);",
    "  float frontWeight = smoothstep(-0.15, 0.35, zDiff);",
    "  float densityMod = 0.75 + 0.15 * sin(theta * 1.5) + 0.10 * cos(theta * 2.5 + 0.7);",
    "  float shimmer = uReduceMotion > 0.5 ? 0.0 : sin(uTime * 0.5 + aPhase) * 0.06;",
    "  vColor = aColorMix;",
    "  vBrightness = aBrightness * densityMod * (1.0 + shimmer);",
    "  vBrightness *= mix(1.0, mix(0.15, 1.0, clarityFactor), frontWeight);",
    "  float depth = -mvPosition.z;",
    "  float depthFactor = smoothstep(3.0, 7.5, depth);",
    "  gl_PointSize = max(1.0, aSize * uPointScale * (1.0 - depthFactor * 0.25) / depth);",
    "  gl_Position = projectionMatrix * mvPosition;",
    "}"
  ].join("\n");

  var ribbonFragmentShader = [
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

  var ribbonHighlightFragmentShader = [
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

  // ─── Ribbon Particle Generation ───────────────────────────
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

  function generateRibbonParticles(count, config, isPrimary, densitySeed) {
    var particles = [];
    var highlightCount = Math.floor(count * config.highlightFraction);
    var mainCount = count - highlightCount;
    var colorPicker = isPrimary ? pickPrimaryColor : pickSecondaryColor;
    var sizeBase = isPrimary ? 0.7 : 0.5;
    var sizeRange = isPrimary ? 1.0 : 0.7;
    var brightnessBase = isPrimary ? 0.80 : 0.70;
    var brightnessRange = isPrimary ? 0.20 : 0.20;
    var halfWidth = config.width * 0.5;
    var halfThickness = config.thickness * 0.5;

    for (var i = 0; i < mainCount; i++) {
      var theta = sampleDenseTheta(densitySeed);
      var c = colorPicker();
      particles.push({
        theta: theta,
        widthOffset: (Math.random() * 2 - 1) * halfWidth * Math.pow(Math.random(), 0.7),
        thicknessOffset: (Math.random() * 2 - 1) * halfThickness,
        phase: Math.random() * Math.PI * 2,
        speed: config.baseSpeed * (0.96 + Math.random() * 0.08),
        size: sizeBase + Math.random() * sizeRange,
        brightness: brightnessBase + Math.random() * brightnessRange,
        color: c,
        densityBias: 0.5 + 0.3 * Math.cos(theta * 1.5),
        isHighlight: false
      });
    }

    for (var j = 0; j < highlightCount; j++) {
      var thetaH = sampleDenseTheta(densitySeed + 1.5);
      var cH = pickHighlightColor();
      particles.push({
        theta: thetaH,
        widthOffset: (Math.random() * 2 - 1) * halfWidth * 0.6,
        thicknessOffset: (Math.random() * 2 - 1) * halfThickness * 0.5,
        phase: Math.random() * Math.PI * 2,
        speed: config.baseSpeed * (0.96 + Math.random() * 0.08),
        size: 0.6 + Math.random() * 0.8,
        brightness: 0.75 + Math.random() * 0.25,
        color: cH,
        densityBias: 0.7,
        isHighlight: true
      });
    }

    return particles;
  }

  // ─── Ribbon System Creation ───────────────────────────────
  function fillRibbonGeometry(geo, particles, rotationMat3) {
    var n = particles.length;
    var pos = new Float32Array(n * 3);
    var aTheta = new Float32Array(n);
    var aWidthOffset = new Float32Array(n);
    var aThicknessOffset = new Float32Array(n);
    var aPhase = new Float32Array(n);
    var aSpeed = new Float32Array(n);
    var aSize = new Float32Array(n);
    var aBrightness = new Float32Array(n);
    var aColorMix = new Float32Array(n * 3);
    var aDensityBias = new Float32Array(n);

    var e = rotationMat3.elements;
    for (var i = 0; i < n; i++) {
      var p = particles[i];
      // Compute initial position (t=0) for the position attribute
      var theta0 = p.theta;
      var ct = Math.cos(theta0), st = Math.sin(theta0);
      var cx = 0, cy = 0, cz = 0;
      // We don't have radiusA/radiusB here, so use a placeholder
      // The actual position is computed in the shader
      pos[i * 3] = 0; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = 0;
      aTheta[i] = p.theta;
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
    geo.setAttribute("aTheta", new THREE.BufferAttribute(aTheta, 1));
    geo.setAttribute("aWidthOffset", new THREE.BufferAttribute(aWidthOffset, 1));
    geo.setAttribute("aThicknessOffset", new THREE.BufferAttribute(aThicknessOffset, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(aPhase, 1));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(aSpeed, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(aSize, 1));
    geo.setAttribute("aBrightness", new THREE.BufferAttribute(aBrightness, 1));
    geo.setAttribute("aColorMix", new THREE.BufferAttribute(aColorMix, 3));
    geo.setAttribute("aDensityBias", new THREE.BufferAttribute(aDensityBias, 1));
  }

  function createRibbonSystem(config, count, isPrimary, densitySeed) {
    var rotationMat3 = eulerToMat3(config.inclX, config.inclY, config.inclZ);
    var cubeViewZ = -camera.position.z; // cube center in view space

    var particles = generateRibbonParticles(count, config, isPrimary, densitySeed);
    var mainParts = particles.filter(function (p) { return !p.isHighlight; });
    var highlightParts = particles.filter(function (p) { return p.isHighlight; });

    var sharedUniforms = {
      uTime: uTime,
      uPointScale: uScaleGlobal,
      uReduceMotion: uReduceMotion,
      uScrollProgress: uScrollProgress,
      uEntrance: uEntranceProgress,
      uCubeZ: { value: cubeViewZ },
      uRadiusA: { value: config.radiusA },
      uRadiusB: { value: config.radiusB },
      uRotation: { value: rotationMat3 }
    };

    function makeMaterial(cullMode, opacity, isHighlight) {
      var mat = new THREE.ShaderMaterial({
        uniforms: Object.assign({}, sharedUniforms, {
          uCullMode: { value: cullMode },
          uOpacity: { value: opacity }
        }),
        vertexShader: ribbonVertexShader,
        fragmentShader: isHighlight ? ribbonHighlightFragmentShader : ribbonFragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: isHighlight ? THREE.AdditiveBlending : THREE.NormalBlending
      });
      return mat;
    }

    function makePoints(parts, cullMode, opacity, isHighlight, renderOrder) {
      var geo = new THREE.BufferGeometry();
      fillRibbonGeometry(geo, parts, rotationMat3);
      var mat = makeMaterial(cullMode, opacity, isHighlight);
      var pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      pts.renderOrder = renderOrder;
      scene.add(pts);
      ribbonObjects.push(pts);
      return pts;
    }

    // Back particles: renderOrder -1 (behind cube)
    // Front particles: renderOrder 1 (in front of cube)
    makePoints(mainParts, 0.0, config.opacity, false, -1);       // back main
    makePoints(mainParts, 1.0, config.opacity, false, 1);        // front main
    makePoints(highlightParts, 0.0, config.highlightOpacity, true, -1); // back highlight
    makePoints(highlightParts, 1.0, config.highlightOpacity, true, 1);  // front highlight
  }

  // ─── Init ─────────────────────────────────────────────────
  function init() {
    var device = getDevice();
    var cubeCounts = CUBE_COUNTS[device];
    var ribbonCounts = RIBBON_COUNTS[device];

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
    createRibbonSystem(RIBBON_PRIMARY, ribbonCounts.primary, true, 0.0);
    createRibbonSystem(RIBBON_SECONDARY, ribbonCounts.secondary, false, 1.8);

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

    scrollProgress += (targetScrollProgress - scrollProgress) * scrollK;
    entranceProgress += (targetEntranceProgress - entranceProgress) * entranceK;

    if (!reduceMotion) {
      pointerSmoothX += (pointerTargetX - pointerSmoothX) * 0.06;
      pointerSmoothY += (pointerTargetY - pointerSmoothY) * 0.06;
    }

    // ── Cube (GPU-only, locked) ──
    uTime.value = timeSeconds;
    if (cubeGroup) {
      if (!reduceMotion) {
        cubeGroup.rotation.y = CUBE_INIT_ROT_Y + time * CUBE_ROT_Y;
        cubeGroup.rotation.x = CUBE_INIT_ROT_X + Math.sin(time * CUBE_DRIFT_X_FREQ) * CUBE_DRIFT_X_AMP;
      }
      var cubeScale = 0.92 + entranceProgress * 0.08;
      cubeGroup.scale.setScalar(cubeScale);
    }

    // ── Ribbons (GPU-only, no JS position updates) ──
    uScrollProgress.value = scrollProgress;
    uEntranceProgress.value = entranceProgress;

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
