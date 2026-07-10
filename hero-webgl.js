import * as THREE from './vendor/three.module.min.js';

(function () {
  "use strict";

  var canvas = document.querySelector(".hero__cube-canvas");
  if (!canvas) return;
  if (!window.WebGL2RenderingContext) {
    // Fallback: keep Prototype A loader instead
    return;
  }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- Device counts [cube, primary, secondary, dust, accents] ---
  var COUNTS = {
    desktop: [1400, 2000, 800, 300, 40],
    tablet: [900, 1200, 500, 200, 28],
    mobile: [500, 700, 300, 120, 18]
  };

  // --- Config ---
  var DPR_CAP = 2;
  var CUBE_HALF = 0.30;
  var CUBE_ROT_RATE = 0.000045;
  var CUBE_TILT_RATE = 0.000012;
  var GALAXY_OUTER = 4.8;
  var POINTER_RADIUS = 130;
  var POINTER_FORCE = 0.09;
  var SPRING = 0.032;
  var DAMPING = 0.94;
  var MAX_DISPERSION = 0.85;

  // Bounded tangential oscillation (preserves spiral shape)
  var STREAM_AMPLITUDE_A = 0.018;
  var STREAM_AMPLITUDE_B = 0.006;
  var STREAM_FREQUENCY_A = 0.095;
  var STREAM_FREQUENCY_B = 0.155;
  var STREAM_ARM_AMPLITUDE = 0.010;
  var STREAM_ARM_FREQUENCY = [0.055, 0.065, 0.075];
  var TRACER_AMPLITUDE = 0.045;
  var TRACER_FREQUENCY = 0.165;
  var DRIFT_AMPLITUDE = 0.025;
  var DRIFT_FREQUENCY = 0.075;
  var ACCENT_AMPLITUDE = 0.035;
  var ACCENT_FREQUENCY = 0.115;

  var ACCENT_PULSE_COUNT = 4;
  var ACCENT_PULSE_AMP = 0.35;

  // --- State ---
  var renderer, scene, camera;
  var systems = [];
  var animating = false, rafId = null, lastTime = 0;
  var scrollProgress = 0, targetScrollProgress = 0;
  var entranceProgress = 0, targetEntranceProgress = 0;
  var cssW = 0, cssH = 0;
  var pointerTargetX = -9999, pointerTargetY = -9999;
  var pointerSmoothX = -9999, pointerSmoothY = -9999;
  var pointerActive = false;
  var qualityScale = 1;
  var frameCount = 0;
  var fpsAccumulator = 0;

  // --- 3D helpers ---
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

  function getDevice() {
    var w = window.innerWidth;
    if (w < 480) return "mobile";
    if (w < 768) return "tablet";
    return "desktop";
  }

  // --- Shaders ---
  var vertexShader = [
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

  var fragmentShader = [
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

  var uScaleGlobal = { value: 1.5 };

  function createPointsMaterial(opacity) {
    return new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: opacity }, uScale: uScaleGlobal },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
  }

  // --- Particle System ---
  function ParticleSystem(scene, count, opacity, generator) {
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

    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(this.sizes, 1));

    var material = createPointsMaterial(opacity);
    this.points = new THREE.Points(geometry, material);
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

  ParticleSystem.prototype.setNeedsUpdate = function () {
    this.points.geometry.attributes.position.needsUpdate = true;
  };

  // --- Generators ---
  function hexToRgb(hex) {
    var r = ((hex >> 16) & 255) / 255;
    var g = ((hex >> 8) & 255) / 255;
    var b = (hex & 255) / 255;
    return [r, g, b];
  }
  var COLOR_NAVY = 0x1E293B;
  var COLOR_GREEN = 0x38A169;
  var COLOR_WHITE = 0xFFFFFF;

  function cubeColor(surface) {
    var roll = Math.random();
    if (surface) {
      if (roll < 0.55) return COLOR_NAVY;
      if (roll < 0.90) return COLOR_GREEN;
      return COLOR_WHITE;
    }
    if (roll < 0.60) return COLOR_NAVY;
    if (roll < 0.95) return COLOR_GREEN;
    return COLOR_WHITE;
  }

  function generateCubeParticle(i, count) {
    var perFace = Math.floor(count * 0.80 / 6);
    var innerCount = Math.floor(count * 0.20);
    var noise = CUBE_HALF * 0.12;
    var edgePow = 0.45;
    function edgeBias() {
      return (Math.random() < 0.5 ? 1 : -1) * Math.pow(Math.random(), edgePow);
    }
    var x, y, z;
    var isInner = false;
    if (i < perFace * 6) {
      var face = Math.floor(i / perFace);
      var u = CUBE_HALF * edgeBias();
      var v = CUBE_HALF * edgeBias();
      var w = (Math.random() < 0.5 ? 1 : -1) * CUBE_HALF;
      if (face < 2) { x = w; y = u; z = v; }
      else if (face < 4) { x = u; y = w; z = v; }
      else { x = u; y = v; z = w; }
    } else {
      isInner = true;
      x = (Math.random() * 2 - 1) * CUBE_HALF * 0.75;
      y = (Math.random() * 2 - 1) * CUBE_HALF * 0.75;
      z = (Math.random() * 2 - 1) * CUBE_HALF * 0.75;
    }
    x += (Math.random() - 0.5) * noise;
    y += (Math.random() - 0.5) * noise;
    z += (Math.random() - 0.5) * noise;
    var color = cubeColor(!isInner);
    var rgb = hexToRgb(color);
    return {
      x: x, y: y, z: z,
      r: rgb[0], g: rgb[1], b: rgb[2],
      size: isInner ? 0.5 + Math.random() * 0.85 : 0.7 + Math.random() * 0.95,
      extra: { type: "cube" }
    };
  }

  function generateOrbitParticle(i, count, params) {
    var arms = params.arms || 3;
    var inner = params.inner;
    var outer = params.outer;
    var armWidths = params.armWidths;
    var armTwists = params.armTwists;
    var thickness = params.thickness;
    var tiltX = params.tiltX;
    var tiltY = params.tiltY;
    var arm = i % arms;
    var u = Math.random();
    var rBase = inner + (outer - inner) * (u * u);
    var armAngle = (arm / arms) * Math.PI * 2 + (Math.random() * 2 - 1) * armWidths[arm];
    var theta = armAngle + rBase * armTwists[arm];
    var band = Math.cos(arms * (theta - rBase * armTwists[arm])) * 0.5 + 0.5;
    rBase += (Math.random() - 0.5) * 0.22 * (1 - band * 0.4);
    var zOff = (Math.random() - 0.5) * thickness;
    var pt = diskTo3D(rBase, theta, zOff, tiltX, tiltY);
    var color;
    if (params.accent) {
      color = COLOR_WHITE;
    } else {
      color = Math.random() < 0.24 ? COLOR_GREEN : COLOR_NAVY;
      if (Math.random() < 0.05) color = COLOR_WHITE;
    }
    var rgb = hexToRgb(color);
    return {
      x: pt[0], y: pt[1], z: pt[2],
      r: rgb[0], g: rgb[1], b: rgb[2],
      size: params.sizeBase + Math.random() * params.sizeRange,
      extra: {
        type: params.type,
        theta: theta,
        baseR: rBase,
        z: zOff,
        tiltX: tiltX,
        tiltY: tiltY,
        phase: Math.random() * Math.PI * 2,
        arm: arm,
        tracer: params.tracer || false
      }
    };
  }

  function generateDustParticle(i, count) {
    var tiltX = -0.22, tiltY = -0.18;
    var r = 0.2 + Math.random() * 6.0;
    var theta = Math.random() * Math.PI * 2;
    var zOff = (Math.random() - 0.5) * 1.2;
    var pt = diskTo3D(r, theta, zOff, tiltX, tiltY);
    var rgb = hexToRgb(Math.random() < 0.25 ? COLOR_GREEN : (Math.random() < 0.4 ? COLOR_WHITE : COLOR_NAVY));
    return {
      x: pt[0], y: pt[1], z: pt[2],
      r: rgb[0], g: rgb[1], b: rgb[2],
      size: 0.3 + Math.random() * 0.5,
      extra: { type: "dust", phase: Math.random() * Math.PI * 2 }
    };
  }

  function generateAccentParticle(i, count) {
    var tiltX = -0.22, tiltY = -0.18;
    var r = 1.8 + Math.random() * 3.2;
    var theta = Math.random() * Math.PI * 2;
    var zOff = (Math.random() - 0.5) * 0.35;
    var pt = diskTo3D(r, theta, zOff, tiltX, tiltY);
    var rgb = hexToRgb(COLOR_WHITE);
    var baseSize = 1.1 + Math.random() * 2.0;
    return {
      x: pt[0], y: pt[1], z: pt[2],
      r: rgb[0], g: rgb[1], b: rgb[2],
      size: baseSize,
      extra: {
        type: "accent",
        theta: theta,
        baseR: r,
        z: zOff,
        tiltX: tiltX,
        tiltY: tiltY,
        phase: Math.random() * Math.PI * 2,
        pulse: i < ACCENT_PULSE_COUNT,
        baseSize: baseSize
      }
    };
  }

  // --- Update helpers ---
  function getStreamAngularOffset(extra, timeSeconds) {
    var arm = extra.arm || 0;
    var armOffset = Math.sin(timeSeconds * STREAM_ARM_FREQUENCY[arm] + arm * 1.9) * STREAM_ARM_AMPLITUDE;
    var particleOffset = Math.sin(timeSeconds * STREAM_FREQUENCY_A + extra.phase) * STREAM_AMPLITUDE_A
                       + Math.sin(timeSeconds * STREAM_FREQUENCY_B + extra.phase * 1.7) * STREAM_AMPLITUDE_B;
    if (extra.tracer) {
      particleOffset += Math.sin(timeSeconds * TRACER_FREQUENCY + extra.phase) * TRACER_AMPLITUDE;
    }
    return armOffset + particleOffset;
  }

  // --- Init ---
  function resize() {
    var rect = canvas.getBoundingClientRect();
    cssW = rect.width; cssH = rect.height;
    if (!renderer) return;
    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP) * qualityScale;
    renderer.setPixelRatio(dpr);
    renderer.setSize(cssW, cssH, false);
    var aspect = cssW / cssH;
    camera.left = -aspect;
    camera.right = aspect;
    camera.top = 1;
    camera.bottom = -1;
    camera.updateProjectionMatrix();
    uScaleGlobal.value = Math.min(cssW, cssH) * 0.012;
  }

  function init() {
    var device = getDevice();
    var counts = COUNTS[device];

    scene = new THREE.Scene();

    var aspect = canvas.clientWidth / canvas.clientHeight || 1;
    camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 100);
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.setClearColor(0x000000, 0);
    canvas.style.pointerEvents = "auto";

    // Core Cube
    var cubeSystem = new ParticleSystem(scene, counts[0], 0.85, generateCubeParticle);
    cubeSystem.points.name = "cube";
    systems.push(cubeSystem);

    // Primary Orbit
    var primary = new ParticleSystem(scene, counts[1], 0.65, function (i, count) {
      return generateOrbitParticle(i, count, {
        inner: 1.8, outer: GALAXY_OUTER,
        armWidths: [0.34, 0.30, 0.26],
        armTwists: [0.80, 0.85, 0.90],
        thickness: 0.28,
        tiltX: -0.22, tiltY: -0.18,
        sizeBase: 0.7, sizeRange: 1.2,
        type: "primary"
      });
    });
    systems.push(primary);

    // Secondary Orbit
    var secondary = new ParticleSystem(scene, counts[2], 0.45, function (i, count) {
      return generateOrbitParticle(i, count, {
        inner: 0.9, outer: 3.0,
        armWidths: [0.40, 0.35, 0.30],
        armTwists: [1.0, 1.1, 1.2],
        thickness: 0.18,
        tiltX: 0.22, tiltY: 0.15,
        sizeBase: 0.4, sizeRange: 0.8,
        type: "secondary"
      });
    });
    systems.push(secondary);

    // Dust
    var dust = new ParticleSystem(scene, counts[3], 0.35, generateDustParticle);
    systems.push(dust);

    // Accents
    var accents = new ParticleSystem(scene, counts[4], 0.9, generateAccentParticle);
    systems.push(accents);

    resize();
    targetEntranceProgress = 1;
    if (reduceMotion) { entranceProgress = 1; scrollProgress = 0; targetScrollProgress = 0; }
  }

  // --- Animation ---
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

  function onPointerLeave() {
    pointerActive = false;
  }

  function projectToScreen(x, y, z) {
    var vector = new THREE.Vector3(x, y, z);
    vector.project(camera);
    return {
      x: (vector.x * 0.5 + 0.5) * cssW,
      y: (-vector.y * 0.5 + 0.5) * cssH
    };
  }

  function animate(time) {
    if (!animating) return;
    rafId = requestAnimationFrame(animate);

    var dt = lastTime ? Math.min(time - lastTime, 33) : 16;
    lastTime = time;
    var dtSeconds = dt * 0.001;
    var timeSeconds = time * 0.001;

    // Adaptive quality: monitor FPS
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

    var dispersion = scrollProgress * MAX_DISPERSION;
    var entranceDisp = (1 - entranceProgress) * 0.25;
    var cubeDispStart = Math.max(0, (scrollProgress - 0.6) / 0.4);

    // Cube rotation
    var cubeSystem = systems[0];
    if (cubeSystem) {
      cubeSystem.points.rotation.y = reduceMotion ? 0 : time * CUBE_ROT_RATE;
      cubeSystem.points.rotation.x = reduceMotion ? 0 : time * CUBE_TILT_RATE;
    }

    for (var s = 0; s < systems.length; s++) {
      var sys = systems[s];
      var isCube = sys.points.name === "cube";
      for (var i = 0; i < sys.count; i++) {
        var ox = sys.ox[i];
        var oy = sys.oy[i];
        var oz = sys.oz[i];

        if (!reduceMotion && !isCube) {
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
          } else if (extra.type === "accent") {
            theta = extra.theta + Math.sin(timeSeconds * ACCENT_FREQUENCY + extra.phase) * ACCENT_AMPLITUDE;
            r = extra.baseR;
            pt = diskTo3D(r, theta, extra.z, extra.tiltX, extra.tiltY);
            ox = pt[0]; oy = pt[1]; oz = pt[2];
            if (extra.pulse) {
              sys.sizes[i] = extra.baseSize * (1 + ACCENT_PULSE_AMP * Math.sin(timeSeconds * 0.5 + extra.phase));
              sys.points.geometry.attributes.size.needsUpdate = true;
            }
          }
        }

        // Scroll / entrance dispersion
        var dispFactor = dispersion + entranceDisp;
        if (isCube) dispFactor = cubeDispStart * 0.5 + entranceDisp;
        var tx = ox + ox * dispFactor * 0.35;
        var ty = oy + oy * dispFactor * 0.35;
        var tz = oz + oz * dispFactor * 0.35;

        // Pointer magnetic influence (screen-space)
        if (pointerActive && !reduceMotion && !isCube) {
          var screenPos = projectToScreen(sys.positions[i * 3], sys.positions[i * 3 + 1], sys.positions[i * 3 + 2]);
          var dpx = screenPos.x - pointerSmoothX;
          var dpy = screenPos.y - pointerSmoothY;
          var dist = Math.sqrt(dpx * dpx + dpy * dpy);
          if (dist < POINTER_RADIUS && dist > 0.1) {
            var force = (1 - dist / POINTER_RADIUS) * POINTER_FORCE * 0.012;
            sys.vx[i] += (dpx / dist) * force;
            sys.vy[i] += (dpy / dist) * force;
          }
        }

        // Spring return to target
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

  // --- Events ---
  function onResize() {
    resize();
    // If device category changed, rebuild counts (simple reload for V1)
    // var newDevice = getDevice();
    // if (newDevice !== currentDevice) location.reload();
  }

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

  // --- Start ---
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
