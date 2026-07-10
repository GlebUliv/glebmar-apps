# Renderer Architecture — Core Cube V1

## Scene Role

The Core Cube is the stable visual anchor of the Hero section. It occupies the center of the scene and provides a dense, three-dimensional particle volume that reads instantly as a cube. During Sprint 02, orbit systems are dimmed to near-invisibility so the cube can be evaluated in isolation.

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
| Draw calls | 2 (cube main + core) + 3 (dimmed orbits) | 5 total |

## Reduced-Motion Behavior

When `prefers-reduced-motion: reduce`:
- Cube rotation stops at initial orientation (Y=32°, X=-15°)
- Shader shimmer disabled (`uReduceMotion = 1.0`)
- Orbit animation disabled
- Static cube preserves full density, depth, and visual quality
- Cube remains visible and recognizable

## Development Mode

During Sprint 02, non-cube systems are dimmed:
- Primary Orbit opacity: 7%
- Secondary Orbit opacity: 3%
- Dust opacity: 2%
- Accents: disabled (0%)

This allows the cube to be reviewed in near-isolation.

## Future Architecture (Reserved)

The following systems are architecturally reserved but not implemented in this sprint:
- Final orbit rendering (Sprint 03+)
- Bloom / post-processing (Sprint 04+)
- Pointer interaction on cube (Sprint 05+)
- Signature constellation animation (future)
