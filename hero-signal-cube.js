(function () {
  "use strict";

  var canvas = document.querySelector(".hero__cube-canvas");
  if (!canvas) return;

  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- Configuration ---
  var PARTICLE_COUNTS = {
    desktop: 300,
    tablet: 200,
    mobile: 120,
  };

  var ROTATION_SPEED = 0.00012; // ~55s per revolution
  var DRIFT_SPEED = 0.00006;
  var BREATH_SPEED = 0.0006; // ~10s per breath cycle
  var POINTER_RADIUS = 100;
  var POINTER_FORCE = 0.12;
  var SPRING = 0.045;
  var DAMPING = 0.92;
  var MAX_DISPERSION = 0.7; // 70% max dispersion
  var DPR_CAP = 2;

  // --- State ---
  var particles = [];
  var dpr = 1;
  var cssW = 0;
  var cssH = 0;
  var cubeSize = 0;
  var pointerX = -9999;
  var pointerY = -9999;
  var pointerActive = false;
  var scrollProgress = 0;
  var targetScrollProgress = 0;
  var animating = false;
  var rafId = null;
  var lastTime = 0;
  var entranceProgress = 0;
  var targetEntranceProgress = 0;
  var rotY = 0;
  var rotX = 0;
  var breathPhase = 0;

  // --- Particle ---
  function Particle(ox, oy, oz, dispersionDir, dispersionDist, rotOffset, vertDrift, size, isGreen) {
    this.ox = ox;
    this.oy = oy;
    this.oz = oz;
    this.dx = dispersionDir[0];
    this.dy = dispersionDir[1];
    this.dz = dispersionDir[2];
    this.dispDist = dispersionDist;
    this.rotOffset = rotOffset;
    this.vertDrift = vertDrift;
    this.size = size;
    this.isGreen = isGreen;
    this.x = ox;
    this.y = oy;
    this.z = oz;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.brightness = 0.5 + Math.random() * 0.5;
  }

  // --- Generate rounded cube particle field ---
  function generateParticles(count) {
    particles = [];
    var half = 1.0; // cube half-size in model units
    var cornerRadius = 0.35;
    var placed = 0;
    var attempts = 0;
    var maxAttempts = count * 8;

    while (placed < count && attempts < maxAttempts) {
      attempts++;
      // Random point in cube
      var x = (Math.random() * 2 - 1) * half;
      var y = (Math.random() * 2 - 1) * half;
      var z = (Math.random() * 2 - 1) * half;

      // Push towards rounded cube surface
      var ax = Math.abs(x);
      var ay = Math.abs(y);
      var az = Math.abs(z);
      var maxComp = Math.max(ax, ay, az);

      // If inside the rounded region, push to surface
      if (maxComp < half - cornerRadius) {
        // Interior point — push to nearest face
        if (ax === maxComp) x = (x > 0 ? 1 : -1) * (half - cornerRadius * Math.random());
        else if (ay === maxComp) y = (y > 0 ? 1 : -1) * (half - cornerRadius * Math.random());
        else z = (z > 0 ? 1 : -1) * (half - cornerRadius * Math.random());
      } else {
        // Round the corners
        var nx = x / maxComp;
        var ny = y / maxComp;
        var nz = z / maxComp;
        // Blend towards rounded
        var roundBlend = Math.min(1, (maxComp - (half - cornerRadius)) / cornerRadius);
        if (roundBlend > 0) {
          var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
          if (len > 0) {
            x = x + (nx / len) * roundBlend * cornerRadius * 0.3;
            y = y + (ny / len) * roundBlend * cornerRadius * 0.3;
            z = y + (nz / len) * roundBlend * cornerRadius * 0.3;
            // Clamp
            x = Math.max(-half, Math.min(half, x));
            y = Math.max(-half, Math.min(half, y));
            z = Math.max(-half, Math.min(half, z));
          }
        }
      }

      // Dispersion direction (outward from center)
      var dlen = Math.sqrt(x * x + y * y + z * z);
      var dx, dy, dz;
      if (dlen > 0.001) {
        dx = x / dlen;
        dy = y / dlen;
        dz = z / dlen;
      } else {
        dx = Math.random() * 2 - 1;
        dy = Math.random() * 2 - 1;
        dz = Math.random() * 2 - 1;
        var dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
        dx /= dl; dy /= dl; dz /= dl;
      }

      var dispDist = 0.8 + Math.random() * 1.2;
      var rotOffset = (Math.random() - 0.5) * 0.6;
      var vertDrift = (Math.random() - 0.5) * 0.3;
      var size = 1.2 + Math.random() * 1.8;
      var isGreen = Math.random() < 0.18; // ~18% green particles

      particles.push(new Particle(x, y, z, [dx, dy, dz], dispDist, rotOffset, vertDrift, size, isGreen));
      placed++;
    }
  }

  // --- 3D projection ---
  var FOV = 3.5;
  var viewerDist = 4.5;

  function project(x, y, z, cx, cy, scale) {
    var zAdjusted = viewerDist + z;
    if (zAdjusted < 0.1) zAdjusted = 0.1;
    var f = FOV / zAdjusted;
    return {
      px: cx + x * f * scale,
      py: cy + y * f * scale,
      depth: f,
    };
  }

  // --- Resize ---
  function resize() {
    var rect = canvas.getBoundingClientRect();
    cssW = rect.width;
    cssH = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Cube size relative to canvas
    cubeSize = Math.min(cssW, cssH) * 0.32;

    // Regenerate particles if count should change
    var newCount = getParticleCount();
    if (particles.length !== newCount) {
      generateParticles(newCount);
    }
  }

  function getParticleCount() {
    var w = window.innerWidth;
    if (w < 480) return PARTICLE_COUNTS.mobile;
    if (w < 768) return PARTICLE_COUNTS.tablet;
    return PARTICLE_COUNTS.desktop;
  }

  // --- Scroll progress ---
  function updateScrollProgress() {
    var hero = canvas.closest(".hero");
    if (!hero) return;
    var rect = hero.getBoundingClientRect();
    var vh = window.innerHeight;
    // 0 when hero top is at viewport top, 1 when hero bottom is at viewport top
    var progress = 1 - (rect.bottom / (vh + rect.height));
    targetScrollProgress = Math.max(0, Math.min(1, progress));
  }

  // --- Pointer ---
  function onPointerMove(e) {
    if (reduceMotion) return;
    var rect = canvas.getBoundingClientRect();
    pointerX = e.clientX - rect.left;
    pointerY = e.clientY - rect.top;
    pointerActive = true;
  }

  function onPointerLeave() {
    pointerActive = false;
    pointerX = -9999;
    pointerY = -9999;
  }

  // --- Animation loop ---
  function animate(time) {
    if (!animating) return;
    rafId = requestAnimationFrame(animate);

    var dt = lastTime ? Math.min(time - lastTime, 33) : 16;
    lastTime = time;

    // Smooth scroll progress
    scrollProgress += (targetScrollProgress - scrollProgress) * 0.08;
    // Smooth entrance
    entranceProgress += (targetEntranceProgress - entranceProgress) * 0.04;

    // Update rotation
    if (!reduceMotion) {
      rotY += ROTATION_SPEED * dt;
      rotX += DRIFT_SPEED * dt * Math.sin(time * 0.00008);
      breathPhase += BREATH_SPEED * dt;
    }

    // Clear
    ctx.clearRect(0, 0, cssW, cssH);

    var cx = cssW / 2;
    var cy = cssH / 2;
    var scale = cubeSize;

    // Draw ambient glow
    drawAmbientGlow(cx, cy, scale);

    // Precompute rotation matrix for this frame
    var cosY = Math.cos(rotY);
    var sinY = Math.sin(rotY);
    var cosX = Math.cos(rotX);
    var sinX = Math.sin(rotX);

    // Update and project particles
    var projected = [];
    var breath = reduceMotion ? 0 : Math.sin(breathPhase) * 0.04;

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];

      // Breathing
      var bx = p.ox * (1 + breath);
      var by = p.oy * (1 + breath);
      var bz = p.oz * (1 + breath);

      // Scroll dispersion
      var dispersion = scrollProgress * MAX_DISPERSION;
      var dispX = p.dx * p.dispDist * dispersion;
      var dispY = p.dy * p.dispDist * dispersion + p.vertDrift * dispersion;
      var dispZ = p.dz * p.dispDist * dispersion;

      // Entrance: start slightly dispersed, assemble to 0
      var entranceDisp = (1 - entranceProgress) * 0.3;
      dispX += p.dx * p.dispDist * entranceDisp;
      dispY += p.dy * p.dispDist * entranceDisp;
      dispZ += p.dz * p.dispDist * entranceDisp;

      // Target position (before rotation)
      var targetX = bx + dispX;
      var targetY = by + dispY;
      var targetZ = bz + dispZ;

      // Spring towards target
      p.vx += (targetX - p.x) * SPRING;
      p.vy += (targetY - p.y) * SPRING;
      p.vz += (targetZ - p.z) * SPRING;

      // Pointer repulsion (in screen space, applied in model space approximately)
      if (pointerActive && !reduceMotion) {
        // Project current position to screen
        var rx = p.x * cosY - p.z * sinY;
        var rz = p.x * sinY + p.z * cosY;
        var ry = p.y * cosX - rz * sinX;
        rz = p.y * sinX + rz * cosX;

        var proj = project(rx, ry, rz, cx, cy, scale);
        var dx = proj.px - pointerX;
        var dy = proj.py - pointerY;
        var dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < POINTER_RADIUS && dist > 0.1) {
          var force = (1 - dist / POINTER_RADIUS) * POINTER_FORCE;
          // Push in model space (approximate)
          p.vx += (dx / dist) * force * 0.02;
          p.vy += (dy / dist) * force * 0.02;
        }
      }

      // Damping
      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.vz *= DAMPING;

      p.x += p.vx;
      p.y += p.vy;
      p.z += p.vz;

      // Rotate
      var rx2 = p.x * cosY - p.z * sinY;
      var rz2 = p.x * sinY + p.z * cosY;
      var ry2 = p.y * cosX - rz2 * sinX;
      rz2 = p.y * sinX + rz2 * cosX;

      // Project
      var proj2 = project(rx2, ry2, rz2, cx, cy, scale);
      projected.push({
        px: proj2.px,
        py: proj2.py,
        depth: proj2.depth,
        size: p.size,
        isGreen: p.isGreen,
        brightness: p.brightness,
        z: rz2,
      });
    }

    // Sort by depth (back to front)
    projected.sort(function (a, b) {
      return a.z - b.z;
    });

    // Draw particles
    for (var j = 0; j < projected.length; j++) {
      var pp = projected[j];
      var opacity = Math.max(0.1, Math.min(1, pp.depth * 0.6)) * pp.brightness;
      var radius = pp.size * pp.depth;

      if (pp.isGreen) {
        ctx.fillStyle = "rgba(56, 161, 105, " + (opacity * 0.85) + ")";
      } else {
        ctx.fillStyle = "rgba(30, 41, 59, " + (opacity * 0.6) + ")";
      }

      ctx.beginPath();
      ctx.arc(pp.px, pp.py, Math.max(0.5, radius), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawAmbientGlow(cx, cy, scale) {
    // Primary green glow
    var glowRadius = scale * 2.2;
    var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
    grad.addColorStop(0, "rgba(56, 161, 105, 0.08)");
    grad.addColorStop(0.5, "rgba(56, 161, 105, 0.03)");
    grad.addColorStop(1, "rgba(56, 161, 105, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Secondary faint navy glow
    var glow2Radius = scale * 1.5;
    var grad2 = ctx.createRadialGradient(cx + scale * 0.3, cy - scale * 0.2, 0, cx + scale * 0.3, cy - scale * 0.2, glow2Radius);
    grad2.addColorStop(0, "rgba(30, 41, 59, 0.04)");
    grad2.addColorStop(1, "rgba(30, 41, 59, 0)");
    ctx.fillStyle = grad2;
    ctx.beginPath();
    ctx.arc(cx + scale * 0.3, cy - scale * 0.2, glow2Radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- IntersectionObserver for pause ---
  var visibilityObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        if (!animating) {
          animating = true;
          lastTime = 0;
          rafId = requestAnimationFrame(animate);
        }
      } else {
        animating = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
      }
    });
  }, { threshold: 0.01 });

  // --- Resize observer ---
  var resizeTimer = null;
  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  }

  // --- Init ---
  function init() {
    resize();
    generateParticles(getParticleCount());
    updateScrollProgress();

    // Entrance: start assembling
    targetEntranceProgress = 1;

    // If reduced motion, set everything to final state
    if (reduceMotion) {
      entranceProgress = 1;
      scrollProgress = 0;
      targetScrollProgress = 0;
    }

    // Events
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("pointerdown", onPointerMove);
    window.addEventListener("scroll", updateScrollProgress, { passive: true });
    window.addEventListener("resize", onResize);

    // Start
    visibilityObserver.observe(canvas.closest(".hero"));
    animating = true;
    rafId = requestAnimationFrame(animate);
  }

  // Wait for layout
  if (document.readyState === "complete") {
    init();
  } else {
    window.addEventListener("load", init);
  }
})();
