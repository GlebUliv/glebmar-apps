# Renderer Architecture — Core Cube V1 + Orbit Engine V1

## Scene Role

The Core Cube is the stable visual anchor of the Hero section. It occupies the center of the scene and provides a dense, three-dimensional particle volume that reads instantly as a cube. Two GPU-animated ribbon orbits surround the cube, providing cinematic depth and orbital composition.

## Camera

- **Type**: `THREE.PerspectiveCamera`
- **FOV**: 32 degrees
- **Near**: 0.1
- **Far**: 100
- **Position**: `(0, 0, 5)`
- **Aspect**: updated from canvas dimensions on resize

The perspective camera provides genuine depth foreshortening so front faces appear larger and sharper than back faces.

## Geometry Generation

The cube is a volumetric particle object composed of four distribution layers:

| Layer | Desktop Count | Tablet Count | Mobile Count | Share |
|-------|--------------|-------------|-------------|-------|
| Surface | 10,200 | 5,700 | 3,150 | ~60% |
| Edges/corners | 3,060 | 1,710 | 945 | ~18% |
| Internal volume | 3,740 | 2,090 | 1,155 | ~22% |
| Core | 1,000 | 500 | 250 | ~6% (additive) |
| **Total** | **~18,000** | **~10,000** | **~5,500** | |

### Surface Distribution

- 6 faces, each receiving an equal share of surface particles
- Edge-biased random distribution (`pow(random, 0.55)`) to concentrate density toward face boundaries
- Subtle noise jitter (4% of cube half-size) to avoid flat appearance
- Bevel softening applied near face corners: particles within the bevel width are pulled inward by 5% of cube half-size

### Edge Distribution

- 12 edges sampled directly
- Edge parameter uses `pow(random, 0.4)` for stronger corner concentration
- Corner bevel: particles near edge endpoints are pulled inward by 4% to soften corners
- Edge particles are slightly smaller and brighter than surface particles

### Internal Volume

- Uniform random distribution within 85% of cube half-size
- Lower brightness (0.55–0.85) to create depth contrast
- Smaller particle sizes to read as background density

### Core

- Gaussian distribution centered at origin, radius = 22% of cube half-size
- 70% pale green, 30% soft white
- Additive blending, low opacity (0.40)
- Brightness increases toward center (0.55–0.95)
- Creates internal luminosity without a visible sphere

## Cube Shape

- Half-size: 0.55 (model units)
- Bevel width: 12% of half-size
- Bevel amount: 5% of half-size
- Corners are softly rounded — the cube reads as dimensional, not wireframe or gelatinous

## Shader Design

### Vertex Shader

Per-particle attributes:
- `position` (vec3)
- `colorMix` (vec3)
- `size` (float)
- `brightness` (float)
- `phase` (float)
- `surfaceType` (float)
- `depthBias` (float)

Uniforms:
- `uTime` (float)
- `uScale` (float)
- `uReduceMotion` (float)

Shader logic:
1. Micro-displacement: `sin(uTime * 0.20 + phase) * 0.0025` along normalized position direction
2. Depth factor: `smoothstep(3.5, 6.5, depth + depthBias)` — particles farther from camera are smaller and dimmer
3. Size scaling: `size * uScale * (1 - depthFactor * 0.35) / depth`
4. Brightness attenuation: `brightness * (1 - depthFactor * 0.30)`

### Fragment Shader (main)

- Circular point sprite with `smoothstep(0.5, 0.08, dist)` alpha falloff
- Output: `vec4(vColor * vBrightness, alpha * uOpacity)`
- NormalBlending

### Fragment Shader (core/highlights)

- Softer falloff: `smoothstep(0.5, 0.0, dist)`
- Brightness boost: `vBrightness * 1.3`
- AdditiveBlending

## Blending Strategy

| Layer | Blending | DepthWrite | DepthTest |
|-------|----------|-----------|-----------|
| Main structure (surface + edges + internal) | NormalBlending | false | true |
| Core highlights | AdditiveBlending | false | true |

NormalBlending ensures the cube reads cleanly on the light Hero background without looking dirty. AdditiveBlending on the core subset creates a subtle internal glow that can later feed bloom passes.

## Color System

| Role | RGB | Usage |
|------|-----|-------|
| Navy | `#1E293B` (0.118, 0.161, 0.231) | 50–60% — defines form |
| Green | `#38A169` (0.220, 0.631, 0.412) | 30–40% — defines identity |
| Pale green | `#A7E3C2` (0.655, 0.890, 0.761) | 5–10% — highlights and core |
| Soft white | `#F7FFFA` (0.969, 1.000, 0.980) | <5% — brightest accents |

## Rotation

- **Y rotation**: one revolution per ~115 seconds (`0.0000546 rad/ms`)
- **X drift**: sinusoidal, amplitude 0.02 rad, frequency 0.00003
- **Z rotation**: none
- **Initial orientation**: Y = 32°, X = -15° (three faces visible immediately)

## Motion Constraints

- Maximum shader micro-displacement: 0.0025 model units
- No breathing scale
- No large shape deformation
- Cube geometry remains stable indefinitely
- All cube animation is GPU-side (vertex shader only); no per-frame JS position updates

## Particle Tiers

| Tier | Total Particles | Target Devices |
|------|----------------|----------------|
| HIGH | ~18,000 | Desktop (≥768px) |
| MEDIUM | ~10,000 | Tablet (480–767px) |
| LOW | ~5,500 | Mobile (<480px) |

Quality selection is based on viewport width at initialization. Runtime adaptive quality adjusts pixel ratio based on measured FPS (downscale at <35 FPS, restore at >55 FPS).

## Performance Targets

| Metric | Target | Measured |
|--------|--------|----------|
| Desktop average FPS | 60 | 60.1 |
| Desktop minimum FPS | >45 | — |
| Draw calls | 2 (cube main + core) + 8 (ribbon front/back × 2 systems × 2 materials) | 10 total |

## Reduced-Motion Behavior

When `prefers-reduced-motion: reduce`:
- Cube rotation stops at initial orientation (Y=32°, X=-15°)
- Shader shimmer disabled (`uReduceMotion = 1.0`)
- Ribbon orbital flow stops (`uTime` frozen in shader)
- Both ribbons remain visible as static sculptures
- Static cube preserves full density, depth, and visual quality
- Full composition remains complete — no hidden systems

## Development Mode

Sprint 02 dimmed orbit systems have been replaced with production-quality GPU ribbon orbits (Sprint 03). No dimmed placeholder systems remain.

---

# Orbit Engine V1

## Scene Role

Two independent GPU-animated particle ribbons orbit the Core Cube, creating a cinematic orbital composition with genuine 3D depth. The ribbons pass in front of and behind the cube, with a gradual clarity zone preserving cube readability.

## Primary Ribbon

The dominant orbital structure — a wide, volumetric elliptical band.

| Parameter | Value |
|-----------|-------|
| Major radius | 1.85 × cube width (2.035 model units) |
| Minor radius | 0.82 × major radius (1.669 model units) |
| Ribbon width | 0.24 normalized units |
| Ribbon thickness | 0.13 normalized units |
| Inclination X | -18° |
| Inclination Y | 13° |
| Inclination Z | -10° |
| Traversal time | 90 seconds |
| Opacity (main) | 0.92 |
| Opacity (highlights) | 0.50 |
| Highlight fraction | 4% |

## Secondary Ribbon

A thinner, lighter ribbon at a different inclination — adds complexity without competing with the primary.

| Parameter | Value |
|-----------|-------|
| Major radius | 1.30 × cube width (1.430 model units) |
| Minor radius | 0.75 × major radius (1.073 model units) |
| Ribbon width | 0.15 normalized units |
| Ribbon thickness | 0.08 normalized units |
| Inclination X | 5° |
| Inclination Y | -8° |
| Inclination Z | 18° |
| Traversal time | 115 seconds |
| Opacity (main) | 0.78 |
| Opacity (highlights) | 0.40 |
| Highlight fraction | 5% |

Inclination difference between ribbons exceeds 23° on all axes, ensuring visual distinctness.

## Ribbon Particle Counts

| Tier | Primary Ribbon | Secondary Ribbon | Total Ribbon | Cube Total | Grand Total |
|------|---------------|-----------------|-------------|-----------|-------------|
| HIGH (Desktop) | 24,000 | 11,000 | 35,000 | ~18,000 | ~53,000 |
| MEDIUM (Tablet) | 14,000 | 6,500 | 20,500 | ~10,000 | ~30,500 |
| LOW (Mobile) | 8,000 | 3,500 | 11,500 | ~5,500 | ~17,000 |

## Shader Motion Model

All ribbon motion is GPU-side. No per-frame JavaScript position updates.

### Vertex Shader Attributes

- `aTheta` — initial angle on ellipse
- `aWidthOffset` — offset along ribbon width
- `aThicknessOffset` — offset along ribbon thickness
- `aPhase` — per-particle shimmer phase
- `aSpeed` — per-particle angular speed (0.96–1.04 × base)
- `aSize` — particle base size
- `aBrightness` — particle base brightness
- `aColorMix` — RGB color
- `aDensityBias` — density modulation factor

### Vertex Shader Uniforms

- `uTime` — global time
- `uPointScale` — screen-space size scale
- `uReduceMotion` — disables orbital flow
- `uScrollProgress` — scroll-based dispersion
- `uEntrance` — entrance animation progress
- `uCullMode` — 0 = back particles only, 1 = front particles only
- `uCubeZ` — cube center Z in view space (for depth culling)
- `uRadiusA` — ellipse major radius
- `uRadiusB` — ellipse minor radius
- `uRotation` — 3×3 rotation matrix for inclination

### Motion Logic

```
theta = aTheta + uTime * aSpeed;  // frozen if uReduceMotion

centerLocal = (radiusA * cos(theta), radiusB * sin(theta), 0)
normalLocal = normalize(radiusB * cos(theta), radiusA * sin(theta), 0)
binormalLocal = (0, 0, 1)

center = uRotation * centerLocal
normal = uRotation * normalLocal
binormal = uRotation * binormalLocal

worldPos = center + normal * aWidthOffset + binormal * aThicknessOffset
```

The ribbon shape is an analytic ellipse — it never deforms. Particles flow through it at slightly varied speeds (0.96–1.04×).

## Depth Integration with Cube

Each ribbon is rendered as two passes:

| Pass | Cull Mode | Render Order | Purpose |
|------|-----------|-------------|---------|
| Back | 0 (z > cubeZ culled) | -1 | Behind cube |
| Front | 1 (z ≤ cubeZ culled) | 1 | In front of cube |

The vertex shader compares each particle's view-space Z against `uCubeZ` (cube center). Particles on the wrong side are culled by moving off-screen.

### Cube Clarity Zone

A gradual opacity reduction near the cube center prevents front particles from obscuring cube faces:

```
distToCenter = length(mvPosition.xy)
clarityFactor = smoothstep(0.65, 1.235, distToCenter)
frontWeight = smoothstep(-0.15, 0.35, zDiff)
brightness *= mix(1.0, mix(0.15, 1.0, clarityFactor), frontWeight)
```

This creates a soft fade — no visible empty hole.

## Density Distribution

Theta sampling uses a weighted acceptance-rejection method:

```
density = 0.45 + 0.30 * cos(theta * 1.5) + 0.15 * cos(theta * 3.0 + 0.7)
```

This creates 3 denser sectors and 1 thinner gap. Density variations rotate with the ribbon structure (they are functions of theta, not screen space).

Primary ribbon uses seed offset 0.0; secondary uses 1.8 — producing different density patterns.

## Color Distribution

### Primary Ribbon

| Color | Share |
|-------|-------|
| Navy/slate | 55–65% |
| Guardian Green | 25–35% |
| Pale green/white | 5–10% |

### Secondary Ribbon

| Color | Share |
|-------|-------|
| Navy/slate | 40–50% |
| Guardian Green | 35–45% |
| Pale green/white | 10–15% |

### Highlights (both ribbons)

70% Guardian Green, 30% pale green — additive blending.

## Blending Strategy

| Layer | Blending | DepthWrite | DepthTest |
|-------|----------|-----------|-----------|
| Ribbon main (both) | NormalBlending | false | true |
| Ribbon highlights (both) | AdditiveBlending | false | true |

NormalBlending on the main ribbon ensures clean reading on the light Hero background. AdditiveBlending on the ~4-5% highlight subset creates brighter green points that can later feed bloom passes.

## Cube Adjustments

No cube adjustments were made. The cube system is unchanged from the accepted V1 commit `ccb6462`.

## Responsive Behavior

| Device | Primary | Secondary | Behavior |
|--------|---------|-----------|----------|
| Desktop (≥768px) | 24,000 | 11,000 | Full ribbons, complete depth |
| Tablet (480–767px) | 14,000 | 6,500 | Both ribbons preserved, reduced counts |
| Mobile (<480px) | 8,000 | 3,500 | Primary recognizable, secondary simplified |

## Long-Duration Stability

Validated at T=0, T=60, T=300 seconds. Ribbon geometry remains essentially unchanged — only particle phase positions differ. The analytic ellipse centerline ensures the shape cannot deform over time.

## Performance Results

| Metric | Target | Measured |
|--------|--------|----------|
| Desktop average FPS | 60 | 60.1 |
| Draw calls | 10 | 10 |
| Total particles (desktop) | — | ~53,000 |

## Future Architecture (Reserved)

The following systems are architecturally reserved but not implemented in this sprint:
- Bloom / post-processing (Sprint 04+)
- Final atmospheric dust (Sprint 04+)
- Pointer interaction refinement (Sprint 05+)
- Scroll choreography (Sprint 05+)
- Signature constellation animation (future)
