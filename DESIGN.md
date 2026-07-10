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

## Guardian Signal Cube

The Signal Cube is the Hero's interactive visual focal point — a structured particle field forming a rounded cube. It communicates craftsmanship, precision, and calm technology.

### Purpose

- Create a memorable first impression without flashy effects.
- Provide depth and atmosphere to the Hero section.
- Reinforce the Guardian brand through restrained green accents.

### Particle Palette

- **Navy/slate particles** (`rgba(30, 41, 59, ~0.6)`): structural depth, ~82% of particles.
- **Green particles** (`rgba(56, 161, 105, ~0.85)`): signal accents, ~18% of particles.
- **Ambient glow**: soft radial green halo behind the cube, secondary faint navy glow.
- No random rainbow colors. No dense connection lines.

### Particle Counts

| Breakpoint | Particle Count |
|------------|----------------|
| Desktop (≥768px) | 300 |
| Tablet (480–767px) | 200 |
| Mobile (<480px) | 120 |

### Motion Timings

- **Y-axis rotation**: ~55 seconds per revolution (`0.00012 rad/ms`).
- **X-axis drift**: slower, sinusoidal modulation.
- **Breathing cycle**: ~10 seconds (`0.0006 rad/ms`), 4% scale amplitude.
- **Entrance duration**: ~1200ms, particles assemble from slightly dispersed state.

### Pointer Behavior

- Pointer repels particles within a 100px radius.
- Maximum displacement: ~12–36 CSS pixels.
- Damped spring return (`SPRING: 0.045`, `DAMPING: 0.92`).
- No snapping on pointer leave — smooth return.

### Scroll Behavior

- Scroll progress mapped to dispersion (0.0 = assembled, 1.0 = 70% dispersed).
- Particles follow deterministic outward directions assigned at initialization.
- Smooth interpolation with damping (`0.08` lerp factor).
- Fully reversible — scrolling up reassembles the cube.

### Reduced-Motion Behavior

When `prefers-reduced-motion: reduce` is active:

- Idle rotation disabled.
- Pointer repulsion disabled.
- Scroll dispersion disabled.
- Cube rendered in stable assembled state.
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
