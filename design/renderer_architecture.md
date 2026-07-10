# Renderer Architecture — Core Cube V1 + Field Engine V1

## Scene Role

The Hero scene is a living energy field. Two volumetric particle rivers flow through space, their density modulated by fluid-like noise. The Core Cube is not placed inside the field — it emerges from it through negative space. The visitor first perceives energy; only after a moment does the cube become obvious. This is the opposite of "cube surrounded by rings."

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
| Draw calls | 2 (cube main + core) + 8 (field front/back × 2 systems × 2 materials) + 1 (dust) | 11 total |

## Reduced-Motion Behavior

When `prefers-reduced-motion: reduce`:
- Cube rotation stops at initial orientation (Y=32°, X=-15°)
- Shader shimmer disabled (`uReduceMotion = 1.0`)
- Field flow stops (`uTime` frozen in shader) — rivers become static sculptures
- Dust drift stops
- Both fields remain visible as static density distributions
- Static cube preserves full density, depth, and visual quality
- Full composition remains complete — no hidden systems

## Development Mode

Sprint 03A Orbit Engine V1 has been replaced by Sprint 03B Field Engine V1. The orbit ring mental model is retired. No placeholder systems remain.

---

# Field Engine V1

## Scene Role

Two volumetric particle rivers flow through the scene. They are not rings — they are wide, noise-perturbed density bands with organic borders that dissolve naturally. The field breathes and shifts density over time. The cube emerges from the field through negative space: particles become denser near cube faces and sparser near face transitions, allowing the eye to reconstruct the cube.

## Scene Hierarchy

```
Energy Field
  ↓
Primary Density Flow
  ↓
Secondary Density Flow
  ↓
Cube (emerges from field)
  ↓
Atmospheric Dust
```

No Orbit Layer exists. Orbit is an emergent property of the field, not an object.

## Primary Field

The dominant density river — wide, turbulent, organically shaped.

| Parameter | Value |
|-----------|-------|
| Radius range | 1.35–2.55 × cube width (1.485–2.805 model units) |
| Minor/major ratio | 0.82 |
| River width | 0.72 model units |
| River thickness | 0.28 model units |
| Inclination X | -18° |
| Inclination Y | 13° |
| Inclination Z | -10° |
| Flow traversal time | 90 seconds |
| Opacity (main) | 0.82 |
| Opacity (highlights) | 0.45 |
| Highlight fraction | 4% |

## Secondary Field

A different inclination, thinner river — adds complexity without competing with the primary.

| Parameter | Value |
|-----------|-------|
| Radius range | 0.90–1.95 × cube width (0.990–2.145 model units) |
| Minor/major ratio | 0.75 |
| River width | 0.48 model units |
| River thickness | 0.20 model units |
| Inclination X | 5° |
| Inclination Y | -8° |
| Inclination Z | 18° |
| Flow traversal time | 115 seconds |
| Opacity (main) | 0.68 |
| Opacity (highlights) | 0.35 |
| Highlight fraction | 5% |

Inclination difference between fields exceeds 23° on all axes, ensuring visual distinctness.

## Field Particle Counts

| Tier | Primary Field | Secondary Field | Dust | Field Total | Cube Total | Grand Total |
|------|--------------|-----------------|------|-------------|-----------|-------------|
| HIGH (Desktop) | 24,000 | 11,000 | 3,000 | 38,000 | ~18,000 | ~56,000 |
| MEDIUM (Tablet) | 14,000 | 6,500 | 1,500 | 22,000 | ~10,000 | ~32,000 |
| LOW (Mobile) | 8,000 | 3,500 | 800 | 12,300 | ~5,500 | ~17,800 |

## Shader Motion Model

All field motion is GPU-side. No per-frame JavaScript position updates.

### Vertex Shader Attributes

- `aStreamRadius` — per-particle stream line radius (varies within radius range)
- `aStreamPos` — initial position along stream line (0–1, maps to theta)
- `aSeed` — per-particle noise seed (unique organic variation)
- `aWidthOffset` — offset across river width (Gaussian distributed)
- `aThicknessOffset` — offset across river thickness (Gaussian distributed)
- `aPhase` — per-particle breathing phase
- `aSpeed` — per-particle flow speed (0.96–1.04 × base)
- `aSize` — particle base size
- `aBrightness` — particle base brightness
- `aColorMix` — RGB color
- `aDensityBias` — density modulation factor

### Vertex Shader Uniforms

- `uTime` — global time
- `uPointScale` — screen-space size scale
- `uReduceMotion` — disables flow
- `uScrollProgress` — scroll-based dispersion
- `uEntrance` — entrance animation progress
- `uCullMode` — 0 = back particles only, 1 = front particles only
- `uCubeZ` — cube center Z in view space (for depth culling)
- `uRadiusBRatio` — minor/major radius ratio
- `uHalfWidth` — half river width (for border dissolve)
- `uRotation` — 3×3 rotation matrix for inclination

### Motion Logic

```
theta = aStreamPos * 2π + flowTime * aSpeed;  // frozen if uReduceMotion

// Multi-octave noise perturbation — organic, not a perfect ellipse
n1 = sin(theta * 2.3 + aSeed * 2π)
n2 = cos(theta * 1.7 + aSeed * 4.56)
n3 = sin(theta * 3.1 + aSeed * 2.0)
n4 = sin(theta * 5.5 + aSeed * 8.1)
n5 = cos(theta * 7.3 + aSeed * 3.7)

centerLocal = (
  aStreamRadius * cos(theta) + n1 * r * 0.22 + n4 * r * 0.08,
  aStreamRadius * bRatio * sin(theta) + n2 * r * 0.18 + n5 * r * 0.07,
  n3 * r * 0.14 + n4 * r * 0.05
)

center = uRotation * centerLocal
normal = uRotation * normalize(bRatio * cos(theta), sin(theta), 0)
binormal = normalize(cross(center, normal))

worldPos = center + normal * aWidthOffset + binormal * aThicknessOffset
```

The stream line is noise-perturbed at multiple frequencies. The shape is NOT a perfect ellipse — it is an organic, flowing curve that shifts over time. Particles flow along it at slightly varied speeds (0.96–1.04×).

### Density Modulation

Fluid-like density variation, not mathematical symmetry:

```
densityShift = flowTime * 0.08

densityMod = 0.50
  + 0.30 * sin(theta * 1.5 + aSeed * 3.0 + densityShift)
  + 0.18 * cos(theta * 2.7 + aSeed * 5.0 + densityShift * 0.7)

breath = sin(flowTime * 0.3 + aPhase) * 0.06
densityMod += breath
densityMod = max(0.2, densityMod)
```

Density slowly shifts over time — the field breathes and circulates. Local regions of higher density appear and dissolve organically.

### Border Dissolve

Particles at river edges fade naturally:

```
widthFactor = 1.0 - abs(aWidthOffset) / uHalfWidth
widthFactor = smoothstep(0.0, 0.4, widthFactor)
```

This creates soft, dissolved borders — no hard ring edges.

## Cube Emergence

The cube is not isolated from the field. No hole is cut. Instead, front-facing field particles near the cube center gradually reduce brightness, creating negative space:

```
distToCenter = length(mvPosition.xy)
clarityFactor = smoothstep(0.40, 1.1, distToCenter)
frontWeight = smoothstep(-0.15, 0.35, zDiff)
brightness *= mix(1.0, mix(0.20, 1.0, clarityFactor), frontWeight)
```

The eye reconstructs the cube from the surrounding density gradient. The cube appears because the field reveals it.

## Depth Integration with Cube

Each field is rendered as four passes (front/back × main/highlights):

| Pass | Cull Mode | Render Order | Purpose |
|------|-----------|-------------|---------|
| Back main | 0 (z > cubeZ culled) | -1 | Behind cube |
| Back highlights | 0 | -1 | Behind cube, additive |
| Front main | 1 (z ≤ cubeZ culled) | 1 | In front of cube |
| Front highlights | 1 | 1 | In front of cube, additive |

The vertex shader compares each particle's view-space Z against `uCubeZ` (cube center). Particles on the wrong side are culled by moving off-screen.

## Atmospheric Dust

Sparse particles surrounding the entire scene with subtle drift:

- Count: 3,000 (desktop), 1,500 (tablet), 800 (mobile)
- Distribution: annular ring, radius 1.8–5.0, z-spread ±0.75
- Colors: 65% navy, 25% green, 10% pale green
- Brightness: 0.25–0.45 (very dim)
- Drift: sinusoidal x/y oscillation, amplitude 0.02, frequency 0.08–0.10
- Render order: -2 (behind everything)
- NormalBlending, depthTest enabled

## Density Distribution (Theta Sampling)

Theta sampling uses a weighted acceptance-rejection method with organic density variation:

```
density = 0.50
  + 0.22 * cos(theta * 1.5 + seedOffset)
  + 0.12 * cos(theta * 2.8 + seedOffset * 1.7 + 0.5)
  + 0.08 * cos(theta * 4.5 + seedOffset * 2.3 + 1.2)

density = max(0.15, density)
accept if random() < density
```

This creates fluid-like density variation — denser regions, thinner gaps, no mathematical symmetry. Primary field uses seed offset 0.0; secondary uses 1.8.

## Color Distribution

### Primary Field

| Color | Share |
|-------|-------|
| Navy/slate | 55–65% |
| Guardian Green | 25–35% |
| Pale green/white | 5–10% |

### Secondary Field

| Color | Share |
|-------|-------|
| Navy/slate | 40–50% |
| Guardian Green | 35–45% |
| Pale green/white | 10–15% |

### Highlights (both fields)

70% Guardian Green, 30% pale green — additive blending.

## Blending Strategy

| Layer | Blending | DepthWrite | DepthTest |
|-------|----------|-----------|-----------|
| Field main (both) | NormalBlending | false | true |
| Field highlights (both) | AdditiveBlending | false | true |
| Atmospheric dust | NormalBlending | false | true |

NormalBlending on main field particles ensures clean reading on the light Hero background. AdditiveBlending on the ~4-5% highlight subset creates brighter green points. Light is simulated through density — bright areas contain more particles, dark areas fewer.

## Cube Adjustments

No cube adjustments were made. The cube system is unchanged from the accepted V1 commit `ccb6462`.

## Responsive Behavior

| Device | Primary | Secondary | Dust | Behavior |
|--------|---------|-----------|------|----------|
| Desktop (≥768px) | 24,000 | 11,000 | 3,000 | Full fields, complete depth |
| Tablet (480–767px) | 14,000 | 6,500 | 1,500 | Both fields preserved, reduced counts |
| Mobile (<480px) | 8,000 | 3,500 | 800 | Primary recognizable, secondary simplified |

## Long-Duration Stability

Validated at T=0, T=60, T=300 seconds. Field geometry remains stable — only particle phase positions and density modulation shift over time. The noise-perturbed stream line is analytic and cannot deform.

## Performance Results

| Metric | Target | Measured |
|--------|--------|----------|
| Desktop average FPS | 60 | 60.1 |
| Draw calls | 11 | 11 |
| Total particles (desktop) | — | ~56,000 |

## Future Architecture (Reserved)

The following systems are architecturally reserved but not implemented in this sprint:
- Bloom / post-processing (Sprint 04+)
- Pointer interaction refinement (Sprint 05+)
- Scroll choreography (Sprint 05+)
- Signature constellation animation (future)
