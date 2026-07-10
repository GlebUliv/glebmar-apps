# Website Design System

This document defines the visual and interaction design system for the GlebMar Apps public website.

It applies to all static HTML pages and any future pages added to the site.

---

## Typography

- **Font family**: `Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- **Base color**: `#1e293b`
- **Base size**: `1rem` (browser default, 16 px)
- **Base line height**: `1.6`

### Headings

- **H1**:
  - `font-size: clamp(2rem, 7vw, 3.5rem)`
  - `line-height: 1.2`
  - `margin: 0`

- **H2**:
  - `line-height: 1.2`

### Body text

- **Lead paragraph**:
  - `font-size: 1.15rem`
  - `color: #475569`
  - `max-width: 620px`

- **Brand label**:
  - `font-weight: 700`
  - `color: #2f855a`
  - `margin: 0 0 12px`

- **Footer**:
  - `font-size: 0.95rem`
  - `color: #64748b`
  - `margin-top: 56px`

### Links

- `color: #287c55`
- `font-weight: 600`

---

## Colors

| Role | Value | Usage |
|------|-------|-------|
| Primary brand | `#2f855a` | Brand label, primary buttons, links |
| Primary hover | `opacity: 0.9` | Primary button hover state |
| Text primary | `#1e293b` | Body text, headings |
| Text secondary | `#475569` | Lead paragraph |
| Text muted | `#64748b` | Footer text |
| Background | `#f7faf8` | Page background |
| Surface | `#ffffff` | Cards, secondary buttons |
| Border subtle | `#dce8e0` | Card borders |
| Border light | `#cbd5e1` | Secondary button borders |
| Border neutral | `#e2e8f0` | Horizontal rules |
| Table header background | `#eef5f0` | Table header cells |
| Table border | `#dbe4de` | Table row separators |

---

## Spacing

- **Container max width**: `min(760px, calc(100% - 32px))`
- **Container padding**: `64px 0 40px`
- **Card margin top**: `48px`
- **Card padding**: `28px`
- **Buttons container gap**: `12px`
- **Buttons container margin top**: `24px`
- **Footer margin top**: `56px`
- **Horizontal rule margin**: `40px 0`
- **Table margin**: `24px 0`
- **Table cell padding**: `12px`

### Spacing scale

Use the following values as the base scale:

- `12px` — small gaps, table padding
- `20px` — button horizontal padding
- `24px` — vertical spacing between related elements
- `28px` — card padding
- `40px` — section separators
- `48px` — major section spacing
- `56px` — footer spacing
- `64px` — top container padding

---

## Border Radius

- **Card**: `20px`
- **Button**: `12px`

Use `12px` for interactive elements and `20px` for containers and cards.

---

## Shadows

- **Card shadow**: `0 12px 36px rgb(30 41 59 / 7%)`

Use subtle, large-radius shadows for elevation only on cards.

Avoid shadows on text, buttons, or inline elements.

---

## Responsive Rules

- The container width is `min(760px, calc(100% - 32px))`, leaving `16px` of horizontal margin on each side.
- The H1 uses `clamp(2rem, 7vw, 3.5rem)` for fluid scaling.
- Buttons use `flex-wrap: wrap` so they reflow on narrow screens.
- Tables use `width: 100%` and collapse naturally on small screens.

### Breakpoints

The site uses a single fluid approach:

- **Narrow**: below `480px` — horizontal margins reduce to `16px` total.
- **Default**: `480px` to `760px` — content scales with viewport.
- **Wide**: above `760px` — content capped at `760px` and centered.

No complex breakpoints are used.

---

## Button Styles

### Primary button

- `display: inline-block`
- `padding: 12px 20px`
- `border-radius: 12px`
- `background: #2f855a`
- `color: #ffffff`
- `font-weight: 600`
- `text-decoration: none`

### Primary button hover

- `opacity: 0.9`

### Secondary button

- `border: 1px solid #cbd5e1`
- `background: #ffffff`
- `color: #1e293b`

### Button container

- `display: flex`
- `flex-wrap: wrap`
- `gap: 12px`
- `margin-top: 24px`

---

## Card Styles

- `margin-top: 48px`
- `padding: 28px`
- `border: 1px solid #dce8e0`
- `border-radius: 20px`
- `background: #ffffff`
- `box-shadow: 0 12px 36px rgb(30 41 59 / 7%)`

Cards contain product information, feature summaries, or grouped content.

---

## Accessibility Rules

- Use semantic HTML (`main`, `header`, `section`, `footer`, `h1`, `h2`).
- Maintain visible focus states for all interactive elements.
- Ensure keyboard navigation for all links and buttons.
- Use sufficient color contrast:
  - Primary text on background: `#1e293b` on `#f7faf8`
  - White text on primary button: `#ffffff` on `#2f855a`
- Provide `lang` attribute on the `<html>` element.
- Include `meta charset` and `meta viewport`.
- Respect `prefers-reduced-motion` for any future animations.

---

## Animation Principles

- Animations must be subtle and functional, not decorative.
- Prefer CSS transitions for hover states.
- Honor `prefers-reduced-motion: reduce`.
- Keep the site lightweight: no JavaScript animation libraries.

---

## Guardian Signal Galaxy

The Hero visual is a dense, light-background particle galaxy — a compact particle cube at the center of an elliptical spiral stream, with outer drift and bright accents. It communicates protection, depth, and calm technology.

### Purpose

- Create a memorable first impression without flashy effects.
- Provide depth and atmosphere to the Hero section.
- Reinforce the Guardian brand through restrained green accents.

### Particle Groups

| Group | Description | Approximate Share | Purpose |
|-------|-------------|-------------------|---------|
| A | Central particle cube | 15–25% | Recognizable cubic volume, dense point cloud |
| B | Primary spiral stream | 60–70% | Dominant elliptical galaxy structure |
| C | Outer drift particles | 8–12% | Extend the field, add depth |
| D | Light accent particles | 2–4% | Highlights, energy point |

### Particle Palette

- **Navy/slate particles** (`rgba(30, 41, 59, ...)`): structural depth, ~65% of visible particles.
- **Guardian Green particles** (`rgba(56, 161, 105, ...)`): signal accents, ~25%.
- **Pale/white highlights**: (`rgba(255, 255, 255, ...)`): bright accents, ~10%.
- **Ambient glow**: soft radial green halo behind the galaxy, secondary faint navy glow.
- No random rainbow colors. No dense connection lines.

### Particle Counts

| Breakpoint | Cube | Stream | Drift | Accents | Total |
|------------|------|--------|-------|---------|-------|
| Desktop (≥768px) | 720 | 1300 | 180 | 50 | 2250 |
| Tablet (480–767px) | 480 | 850 | 130 | 40 | 1500 |
| Mobile (<480px) | 260 | 500 | 80 | 24 | 864 |

### Hero Canvas Layout

- Hero visual occupies approximately 60% of the Hero width on desktop.
- Copy remains at ~40% of the Hero width on the left.
- The visual element is `position: absolute` with `width: 70%` and `height: 110%`, positioned `inset: -5% -5% -5% auto` so it extends slightly beyond the right viewport edge.
- The canvas is full-bleed within the visual wrapper, has a transparent background, and no border or shadow.
- A CSS `radial-gradient` mask is applied to the canvas to fade the edges into the page background:
  - `ellipse 100% 85% at 56% 48%, #000 0%, #000 60%, rgba(0,0,0,0.8) 72%, transparent 88%`
- An atmospheric bridge behind the canvas (`hero__visual::before`) blends the galaxy with the Hero background using a soft green radial gradient and `blur(28px)`.

### Galaxy Geometry

- Primary stream is an elliptical disk with a 1.65–1.9 width-to-height ratio (ellipse ratio ~0.46).
- Galaxy tilt is approximately -8° to -16° on both X and Y axes (`tiltX: -0.22`, `tiltY: -0.18`).
- Three spiral arms wrap around the central cube.
- Cube width is approximately 22–28% of the galaxy's visible diameter (cube `half` normalized to 0.25).
- Stream particles are denser near the central cube and along the arms.
- A bright energy point sits near the lower-right portion of the orbit.
- Projection scale: `scale = Math.min(cssW, cssH) * 0.54`.
- Projection center: `cx = cssW * 0.56`, `cy = cssH * 0.48`.
- Galaxy outer model radius: `GALAXY_OUTER = 4.8` (model coordinates are normalized by this value to fit the visible canvas).

### Cube Geometry

- Cube is composed of particles, not lines.
- Particles are distributed on the six faces and in several internal layers.
- Edges have controlled variation and slightly softened corners.
- Cube rotates independently from the galaxy stream.

### Motion Timings

- **Galaxy rotation**: ~75 seconds per revolution (`0.00007 rad/ms`).
- **Cube rotation**: ~105 seconds per revolution (`0.00005 rad/ms`).
- **X-axis drift**: slower, sinusoidal modulation.
- **Breathing cycle**: ~15 seconds (`0.00035 rad/ms`), 2% scale amplitude.
- **Entrance duration**: ~2000ms, particles assemble from 25% dispersed state.

### Pointer Behavior

- Pointer influences stream, drift, and accent particles within a 130px radius.
- Cube remains mostly stable.
- Maximum displacement: ~18–34 CSS pixels.
- Damped spring return (`SPRING: 0.032`, `DAMPING: 0.94`).
- No snapping on pointer leave — smooth return.

### Scroll Behavior

- Scroll progress mapped to normalized Hero position.
- Progress 0.0–0.45: outer drift and stream start to open.
- Progress 0.45–0.75: main spiral bands separate and move outward.
- Progress 0.75–1.0: cube begins dissolving.
- Fully reversible — scrolling up reassembles the galaxy.

### Reduced-Motion Behavior

When `prefers-reduced-motion: reduce` is active:

- Idle rotation disabled.
- Pointer repulsion disabled.
- Scroll dispersion disabled.
- Galaxy rendered in stable assembled state.
- Visual remains visible and attractive.

### Performance Constraints

- Single `requestAnimationFrame` loop.
- Paused via `IntersectionObserver` when Hero is off-screen.
- Device pixel ratio capped at 2.
- Geometry cached at initialization — no per-frame random generation.
- Throttled resize handling (150ms debounce).
- Canvas 2D with simple 3D projection — no WebGL, no dependencies.
- Canvas marked `aria-hidden="true"` — purely decorative.
- Progressive enhancement: no-JS fallback renders a static CSS element.
