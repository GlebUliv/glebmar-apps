(function () {
  "use strict";

  var canvas = document.querySelector(".hero__cube-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- Config ---
  var COUNTS = { desktop: [720, 1300, 180, 35], tablet: [480, 850, 130, 28], mobile: [260, 500, 80, 18] };
  var DPR_CAP = 2;
  var FOV = 4.2;
  var VIEWER_DIST = 5;
  var BREATH = 0.00035; // ~18s cycle
  var CUBE_ROT_RATE = 0.000045; // ~140s per revolution
  var CUBE_TILT_RATE = 0.000012;
  var ARM_SPEEDS = [0.000004, 0.000006, 0.000008]; // rad/ms per arm
  var DRIFT_SPEED = 0.000008; // rad/ms
  var ACCENT_SPEED = 0.000005; // rad/ms
  var POINTER_RADIUS = 130;
  var POINTER_FORCE = 0.09;
  var POINTER_SMOOTH = 0.06;
  var SPRING = 0.032;
  var DAMPING = 0.94;
  var MAX_DISPERSION = 0.85;

  // --- State ---
  var particles = [];
  var dpr = 1, cssW = 0, cssH = 0, scale = 0;
  var pointerTargetX = -9999, pointerTargetY = -9999;
  var pointerSmoothX = -9999, pointerSmoothY = -9999;
  var pointerActive = false;
  var scrollProgress = 0, targetScrollProgress = 0;
  var animating = false, rafId = null, lastTime = 0;
  var entranceProgress = 0, targetEntranceProgress = 0;
  var breathPhase = 0;

  var GROUP = { CUBE: 0, STREAM: 1, DRIFT: 2, ACCENT: 3 };
  var GALAXY_OUTER = 4.8;

  function P(group, ox, oy, oz, size, color, brightness, extra) {
    this.group = group;
    this.ox = ox; this.oy = oy; this.oz = oz;
    this.x = ox; this.y = oy; this.z = oz;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.size = size;
    this.color = color; // 0 navy, 1 green, 2 white
    this.brightness = brightness;
    this.energy = extra && extra.energy;
    this.extra = extra || {};
  }

  // --- 3D helpers ---
  function project(x, y, z, cx, cy, scale) {
    var zv = VIEWER_DIST + z;
    if (zv < 0.1) zv = 0.1;
    var f = FOV / zv;
    return { px: cx + x * f * scale, py: cy + y * f * scale, depth: f };
  }
  function rotate(x, y, z, cy, sy, cx, sx) {
    var rx = x * cy - z * sy;
    var rz = x * sy + z * cy;
    var ry = y * cx - rz * sx;
    rz = y * sx + rz * cx;
    return [rx, ry, rz];
  }
  function diskTo3D(r, theta, z, tiltX, tiltY) {
    var rNorm = r / GALAXY_OUTER;
    var x = rNorm * Math.cos(theta);
    var y = rNorm * Math.sin(theta) * 0.46; // ellipse ratio
    // apply tilt
    var cx = Math.cos(tiltX), sx = Math.sin(tiltX);
    var cy = Math.cos(tiltY), sy = Math.sin(tiltY);
    var y2 = y * cx - z * sx;
    var z2 = y * sx + z * cx;
    var x3 = x * cy + z2 * sy;
    var z3 = -x * sy + z2 * cy;
    return [x3, y2 * 0.95, z3];
  }

  // --- Generators ---
  function generateCube(count, half) {
    var perFace = Math.floor(count * 0.65 / 6);
    var inner = Math.floor(count * 0.35);
    var noise = half * 0.18;
    for (var face = 0; face < 6; face++) {
      for (var i = 0; i < perFace; i++) {
        var u = (Math.random() * 2 - 1) * half;
        var v = (Math.random() * 2 - 1) * half;
        var w = (Math.random() < 0.5 ? 1 : -1) * half;
        var x, y, z;
        if (face < 2) { x = w; y = u; z = v; }
        else if (face < 4) { x = u; y = w; z = v; }
        else { x = u; y = v; z = w; }
        // add noise
        x += (Math.random() - 0.5) * noise;
        y += (Math.random() - 0.5) * noise;
        z += (Math.random() - 0.5) * noise;
        var color = Math.random() < 0.32 ? 1 : 0;
        particles.push(new P(GROUP.CUBE, x, y, z, 0.6 + Math.random() * 0.9, color, 0.45 + Math.random() * 0.35));
      }
    }
    for (var j = 0; j < inner; j++) {
      var u2 = (Math.random() * 2 - 1) * half * 0.75;
      var v2 = (Math.random() * 2 - 1) * half * 0.75;
      var w2 = (Math.random() * 2 - 1) * half * 0.75;
      var color = Math.random() < 0.25 ? 1 : 0;
      particles.push(new P(GROUP.CUBE, u2, v2, w2, 0.45 + Math.random() * 0.75, color, 0.35 + Math.random() * 0.35));
    }
  }

  function generateStream(count) {
    var arms = 3;
    var inner = 1.8;
    var outer = GALAXY_OUTER;
    var armWidths = [0.34, 0.30, 0.26];
    var armTwists = [0.80, 0.85, 0.90];
    var thickness = 0.28;
    var tiltX = -0.22;
    var tiltY = -0.18;
    for (var i = 0; i < count; i++) {
      var arm = i % arms;
      var u = Math.random();
      var rBase = inner + (outer - inner) * (u * u); // more at inner
      var armAngle = (arm / arms) * Math.PI * 2 + (Math.random() * 2 - 1) * armWidths[arm];
      var theta = armAngle + rBase * armTwists[arm];
      // density band
      var band = Math.cos(arms * (theta - rBase * armTwists[arm])) * 0.5 + 0.5;
      rBase += (Math.random() - 0.5) * 0.22 * (1 - band * 0.4);
      var r = rBase;
      var zOff = (Math.random() - 0.5) * thickness;
      var pt = diskTo3D(r, theta, zOff, tiltX, tiltY);
      var color = Math.random() < 0.24 ? 1 : 0;
      if (Math.random() < 0.05) color = 2;
      var size = 0.7 + Math.random() * 1.2;
      var brightness = 0.55 + band * 0.5 + Math.random() * 0.25;
      particles.push(new P(GROUP.STREAM, pt[0], pt[1], pt[2], size, color, brightness, { theta: theta, baseR: r, r: r, z: zOff, tiltX: tiltX, tiltY: tiltY, phase: Math.random() * Math.PI * 2, armSpeed: ARM_SPEEDS[arm] }));
    }
  }

  function generateDrift(count) {
    var tiltX = -0.22, tiltY = -0.18;
    for (var i = 0; i < count; i++) {
      var u = Math.random();
      var r = 4.2 + (Math.random() * 2.4) * (1 + u); // outer drift
      var theta = Math.random() * Math.PI * 2;
      var zOff = (Math.random() - 0.5) * 0.6;
      var pt = diskTo3D(r, theta, zOff, tiltX, tiltY);
      var color = Math.random() < 0.2 ? 1 : 0;
      var size = 0.5 + Math.random() * 0.9;
      var brightness = 0.45 + Math.random() * 0.45;
      particles.push(new P(GROUP.DRIFT, pt[0], pt[1], pt[2], size, color, brightness, { theta: theta, baseR: r, r: r, z: zOff, tiltX: tiltX, tiltY: tiltY, phase: Math.random() * Math.PI * 2, driftSpeed: DRIFT_SPEED }));
    }
  }

  function generateAccents(count) {
    var tiltX = -0.22, tiltY = -0.18;
    for (var i = 0; i < count - 1; i++) {
      var r = 1.8 + Math.random() * 3.2;
      var theta = Math.random() * Math.PI * 2;
      var zOff = (Math.random() - 0.5) * 0.35;
      var pt = diskTo3D(r, theta, zOff, tiltX, tiltY);
      var color = 2;
      var size = 1.1 + Math.random() * 2.0;
      var brightness = 0.85 + Math.random() * 0.15;
      particles.push(new P(GROUP.ACCENT, pt[0], pt[1], pt[2], size, color, brightness, { theta: theta, baseR: r, r: r, z: zOff, tiltX: tiltX, tiltY: tiltY, phase: Math.random() * Math.PI * 2, accentSpeed: ACCENT_SPEED }));
    }
    // Energy point near lower-right orbit
    var er = 3.0, etheta = -0.8; // lower-right
    var ept = diskTo3D(er, etheta, 0, tiltX, tiltY);
    particles.push(new P(GROUP.ACCENT, ept[0], ept[1], ept[2], 3.2, 2, 0.95, { energy: true }));
  }

  function generateAll() {
    particles = [];
    var c = COUNTS[getDevice()];
    generateCube(c[0], 0.30);
    generateStream(c[1]);
    generateDrift(c[2]);
    generateAccents(c[3]);
  }

  function getDevice() {
    var w = window.innerWidth;
    if (w < 480) return "mobile";
    if (w < 768) return "tablet";
    return "desktop";
  }

  // --- Resize ---
  function resize() {
    var rect = canvas.getBoundingClientRect();
    cssW = rect.width; cssH = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.min(cssW, cssH) * 0.54;
  }

  // --- Scroll ---
  function updateScroll() {
    var hero = canvas.closest(".hero");
    if (!hero) return;
    var rect = hero.getBoundingClientRect();
    var vh = window.innerHeight;
    targetScrollProgress = Math.max(0, Math.min(1, 1 - (rect.bottom / (vh + rect.height))));
  }

  // --- Pointer ---
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
    pointerTargetX = pointerSmoothX;
    pointerTargetY = pointerSmoothY;
  }

  // --- Draw helpers ---
  function drawGlow(cx, cy, scale) {
    var r = scale * 2.2;
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, "rgba(56, 161, 105, 0.10)");
    g.addColorStop(0.5, "rgba(56, 161, 105, 0.04)");
    g.addColorStop(1, "rgba(56, 161, 105, 0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

    var g2 = ctx.createRadialGradient(cx + scale * 0.35, cy + scale * 0.25, 0, cx + scale * 0.35, cy + scale * 0.25, scale * 1.4);
    g2.addColorStop(0, "rgba(56, 161, 105, 0.07)");
    g2.addColorStop(1, "rgba(56, 161, 105, 0)");
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(cx + scale * 0.35, cy + scale * 0.25, scale * 1.4, 0, Math.PI * 2); ctx.fill();

    var g3 = ctx.createRadialGradient(cx - scale * 0.25, cy - scale * 0.1, 0, cx - scale * 0.25, cy - scale * 0.1, scale * 1.8);
    g3.addColorStop(0, "rgba(30, 41, 59, 0.035)");
    g3.addColorStop(1, "rgba(30, 41, 59, 0)");
    ctx.fillStyle = g3; ctx.beginPath(); ctx.arc(cx - scale * 0.25, cy - scale * 0.1, scale * 1.8, 0, Math.PI * 2); ctx.fill();
  }

  function drawParticle(px, py, r, color, opacity) {
    if (r < 1.1) {
      ctx.globalAlpha = opacity;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // --- Animation ---
  function animate(time) {
    if (!animating) return;
    rafId = requestAnimationFrame(animate);

    var dt = lastTime ? Math.min(time - lastTime, 33) : 16;
    lastTime = time;

    var dtSeconds = dt * 0.001;
    var scrollK = 1 - Math.exp(-3.6 * dtSeconds);
    var entranceK = 1 - Math.exp(-1.8 * dtSeconds);
    var springK = 1 - Math.exp(-SPRING * 60 * dtSeconds);
    var damping = Math.exp(-(1 - DAMPING) * 60 * dtSeconds);

    scrollProgress += (targetScrollProgress - scrollProgress) * scrollK;
    entranceProgress += (targetEntranceProgress - entranceProgress) * entranceK;

    if (!reduceMotion) {
      breathPhase = time * BREATH;
      pointerSmoothX += (pointerTargetX - pointerSmoothX) * POINTER_SMOOTH;
      pointerSmoothY += (pointerTargetY - pointerSmoothY) * POINTER_SMOOTH;
    }

    ctx.clearRect(0, 0, cssW, cssH);
    var cx = cssW * 0.56, cy = cssH * 0.48;
    drawGlow(cx, cy, scale);

    // No global galaxy rotation; orientation is fixed by diskTo3D tilt.
    var cosY = 1, sinY = 0, cosX = 1, sinX = 0;
    var timeSeconds = time * 0.001;

    var breath = reduceMotion ? 0 : Math.sin(breathPhase) * 0.02;
    var dispersion = scrollProgress * MAX_DISPERSION;
    var entranceDisp = (1 - entranceProgress) * 0.25;
    var cubeDispStart = Math.max(0, (scrollProgress - 0.6) / 0.4);

    var projected = [];

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];

      // Base position
      var ox = p.ox, oy = p.oy, oz = p.oz;

      // Galaxy stream motion: time-based offset from immutable base values
      if (p.group === GROUP.STREAM && p.extra.theta !== undefined) {
        var phase = p.extra.phase || 0;
        var armSpeed = p.extra.armSpeed || ARM_SPEEDS[0];
        var angleOffset = timeSeconds * armSpeed + Math.sin(timeSeconds * 0.12 + phase) * 0.012;
        var radiusOffset = Math.sin(timeSeconds * 0.09 + phase) * 0.006;
        var theta = p.extra.theta + angleOffset;
        var r = Math.max(0.1, p.extra.baseR + radiusOffset);
        var pt = diskTo3D(r, theta, p.extra.z, p.extra.tiltX, p.extra.tiltY);
        ox = pt[0]; oy = pt[1]; oz = pt[2];
      }

      // Drift motion
      if (p.group === GROUP.DRIFT && p.extra.theta !== undefined) {
        var phase = p.extra.phase || 0;
        var angleOffset = timeSeconds * p.extra.driftSpeed + Math.sin(timeSeconds * 0.08 + phase) * 0.015;
        var radiusOffset = Math.sin(timeSeconds * 0.05 + phase) * 0.015;
        var theta = p.extra.theta + angleOffset;
        var r = Math.max(2.0, p.extra.baseR + radiusOffset);
        var pt = diskTo3D(r, theta, p.extra.z, p.extra.tiltX, p.extra.tiltY);
        ox = pt[0]; oy = pt[1]; oz = pt[2];
      }

      // Accent motion (energy point stays fixed)
      if (p.group === GROUP.ACCENT && p.extra.theta !== undefined && !p.energy) {
        var phase = p.extra.phase || 0;
        var angleOffset = timeSeconds * p.extra.accentSpeed + Math.sin(timeSeconds * 0.06 + phase) * 0.01;
        var radiusOffset = Math.sin(timeSeconds * 0.04 + phase) * 0.008;
        var theta = p.extra.theta + angleOffset;
        var r = Math.max(1.0, p.extra.baseR + radiusOffset);
        var pt = diskTo3D(r, theta, p.extra.z, p.extra.tiltX, p.extra.tiltY);
        ox = pt[0]; oy = pt[1]; oz = pt[2];
      }

      // Independent cube rotation (time-based, very slow)
      if (p.group === GROUP.CUBE) {
        var cubeRotY = reduceMotion ? 0 : time * CUBE_ROT_RATE;
        var cubeRotX = reduceMotion ? 0 : time * CUBE_TILT_RATE;
        var ccY = Math.cos(cubeRotY), scY = Math.sin(cubeRotY);
        var ccX = Math.cos(cubeRotX), scX = Math.sin(cubeRotX);
        var rx = ox * ccY - oz * scY;
        var rz = ox * scY + oz * ccY;
        var ry = oy * ccX - rz * scX;
        rz = oy * scX + rz * ccX;
        ox = rx; oy = ry; oz = rz;
      }

      // Breathing
      ox *= (1 + breath); oy *= (1 + breath); oz *= (1 + breath);

      // Dispersion
      var dispFactor = dispersion + entranceDisp;
      if (p.group === GROUP.CUBE) dispFactor = cubeDispStart * 0.5 + entranceDisp;
      var dx = p.ox * dispFactor * 0.35;
      var dy = p.oy * dispFactor * 0.35;
      var dz = p.oz * dispFactor * 0.35;
      var targetX = ox + dx, targetY = oy + dy, targetZ = oz + dz;

      // Spring
      p.vx += (targetX - p.x) * springK;
      p.vy += (targetY - p.y) * springK;
      p.vz += (targetZ - p.z) * springK;

      // Pointer — smooth, local, non-wave influence
      if (pointerActive && !reduceMotion && p.group !== GROUP.CUBE) {
        var rp = rotate(p.x, p.y, p.z, cosY, sinY, cosX, sinX);
        var pr = project(rp[0], rp[1], rp[2], cx, cy, scale);
        var dpx = pr.px - pointerSmoothX;
        var dpy = pr.py - pointerSmoothY;
        var dist = Math.sqrt(dpx * dpx + dpy * dpy);
        if (dist < POINTER_RADIUS && dist > 0.1) {
          var force = (1 - dist / POINTER_RADIUS) * POINTER_FORCE;
          p.vx += (dpx / dist) * force * 0.012;
          p.vy += (dpy / dist) * force * 0.012;
        }
      }

      p.vx *= damping; p.vy *= damping; p.vz *= damping;
      p.x += p.vx; p.y += p.vy; p.z += p.vz;

      var r2 = rotate(p.x, p.y, p.z, cosY, sinY, cosX, sinX);
      var pr2 = project(r2[0], r2[1], r2[2], cx, cy, scale);

      projected.push({
        px: pr2.px, py: pr2.py, depth: pr2.depth,
        size: p.size, color: p.color, brightness: p.brightness,
        z: r2[2], energy: p.energy,
        group: p.group
      });
    }

    projected.sort(function (a, b) { return a.z - b.z; });

    // Draw energy bloom first
    for (var j = 0; j < projected.length; j++) {
      if (projected[j].energy) {
        var e = projected[j];
        var g = ctx.createRadialGradient(e.px, e.py, 0, e.px, e.py, e.size * 10 * e.depth);
        g.addColorStop(0, "rgba(72, 187, 120, 0.35)");
        g.addColorStop(0.5, "rgba(56, 161, 105, 0.12)");
        g.addColorStop(1, "rgba(56, 161, 105, 0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(e.px, e.py, e.size * 10 * e.depth, 0, Math.PI * 2); ctx.fill();
      }
    }

    for (var k = 0; k < projected.length; k++) {
      var pp = projected[k];
      var op = Math.max(0.12, Math.min(1, pp.depth * 0.85)) * pp.brightness * entranceProgress;
      var r = pp.size * pp.depth * 2.2;
      var fadeScroll = 1 - scrollProgress * 0.35 * (pp.group === GROUP.DRIFT ? 1 : 0.5);
      op *= Math.max(0.4, fadeScroll);

      // White highlights on light bg: tiny dark shadow then bright dot
      if (pp.color === 2) {
        ctx.fillStyle = "rgba(30, 41, 59, " + (op * 0.35) + ")";
        ctx.beginPath(); ctx.arc(pp.px, pp.py, r * 1.5, 0, Math.PI * 2); ctx.fill();
      }

      if (pp.color === 0) { ctx.fillStyle = "rgba(30, 41, 59, " + op + ")"; }
      else if (pp.color === 1) { ctx.fillStyle = "rgba(56, 161, 105, " + op + ")"; }
      else { ctx.fillStyle = "rgba(255, 255, 255, " + op + ")"; }

      if (pp.energy) { ctx.fillStyle = "rgba(255, 255, 255, " + (op * 0.95) + ")"; }
      drawParticle(pp.px, pp.py, r, pp.color, op);
    }
  }

  // --- Init & events ---
  var visObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        if (!animating) { animating = true; lastTime = 0; rafId = requestAnimationFrame(animate); }
      } else { animating = false; if (rafId) cancelAnimationFrame(rafId); rafId = null; }
    });
  }, { threshold: 0.01 });

  var resizeTimer = null;
  function onResize() { if (resizeTimer) clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); }

  function init() {
    resize();
    generateAll();
    updateScroll();
    targetEntranceProgress = 1;
    if (reduceMotion) { entranceProgress = 1; scrollProgress = 0; targetScrollProgress = 0; }
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("pointerdown", onPointerMove);
    window.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("resize", onResize);
    visObs.observe(canvas.closest(".hero"));
    animating = true; rafId = requestAnimationFrame(animate);
  }

  if (document.readyState === "complete") init();
  else window.addEventListener("load", init);
})();