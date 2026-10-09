---
name: mmaxr-glass-glow-design-system
description: Apply the MMAXR glass-and-glow visual design language to AR/VR, spatial UI, mobile, and desktop interfaces. Use for atmospheric pink/lilac backgrounds, frosted blur, vivid green assistant sidebars, glowing gradient cards, reflective liquid-glass surfaces, texture, color tokens, and XR readability/performance rules.
---

# MMAXR Glass & Glow Design System

## Purpose

Use this skill to reproduce the MMAXR visual identity across spatial interfaces, desktop web, mobile, AR overlays, and VR panels. The design should feel atmospheric, tactile, soft, dimensional, and modern—without sacrificing legibility or runtime performance.

The visual direction is based on these established reference elements:

1. **Atmospheric dusty-pink/lilac background** with soft, out-of-focus light fields.
2. **Frosted-glass cards** with translucent white/pink surfaces, backdrop blur, thin white rims, and soft shadows.
3. **Signature vivid green sidebar** with a deep emerald base, bright green center, yellow-lime lower glow, faint reflections, and frosted chat/insight cards.
4. **Glowing cards** in emerald/lime, rose-pink, lavender, and pale chartreuse.
5. **Reflective liquid-glass focal objects** with broad white reflections and cool gray/lilac depth.
6. **Subtle texture** from low-opacity grain, faint line patterns, and inset highlights.

The accompanying `mmaxr_glass_design_system.html` file is a visual reference for the effects and components. Keep it as a design-system showcase, not as the app layout.

## Core design principles

- Build atmosphere behind the UI; do not blur text or icons themselves.
- Use translucent fills plus a bright rim and a soft shadow to suggest glass.
- Let saturated color appear to glow from inside the component rather than applying a flat neon fill.
- Use the green sidebar as a signature anchor, not as the background for every component.
- Use pink and lilac to balance the green and establish secondary surfaces.
- Preserve contrast and interaction clarity. Visual effects are subordinate to usability.
- Prefer CSS gradients and restrained overlays before introducing complex shaders.
- For XR, test effects at the actual panel size, viewing distance, display resolution, and lighting conditions.

## Token palette

Use these CSS custom properties as the default starting point:

```css
:root {
  --mmaxr-ink: #29252c;
  --mmaxr-muted: rgba(49, 43, 52, 0.62);
  --mmaxr-dusty-rose: #d5c4cb;
  --mmaxr-lilac: #c8c3d5;
  --mmaxr-rose: #f5c4d3;
  --mmaxr-green-deep: #08791e;
  --mmaxr-green: #20c727;
  --mmaxr-green-bright: #81e52f;
  --mmaxr-lime: #d5eb59;
  --mmaxr-pink-glow: #ff6cae;
  --mmaxr-lavender-glow: #bcb7ff;
  --mmaxr-glass-fill: rgba(255, 247, 250, 0.34);
  --mmaxr-glass-strong: rgba(255, 255, 255, 0.58);
  --mmaxr-glass-rim: rgba(255, 255, 255, 0.72);
  --mmaxr-glass-blur: 22px;
  --mmaxr-shadow: 0 18px 44px rgba(75, 43, 63, 0.16);
}
```

### Color usage

- **Dusty rose / lilac:** broad atmospheric background and ambient surfaces.
- **Frosted white:** glass fill, highlights, and high-contrast content surfaces.
- **Emerald → green → lime:** signature sidebar, primary actions, positive states, and key focal components.
- **Rose-pink:** expressive or favourite states and warm glowing cards.
- **Lavender:** secondary or reflective panels.
- **Lime:** small high-energy highlights and progress accents.
- Do not use every accent at full saturation in the same viewport. A useful starting balance is approximately 60% atmosphere, 30% glass, 10% saturated accent.

## 1. Atmospheric background and blur

Use large radial gradients to create blurred ambient light fields. Apply blur to the background layer, not to the foreground text.

```css
.mmaxr-ambient {
  position: fixed;
  inset: -10%;
  z-index: -1;
  pointer-events: none;
  filter: blur(20px);
  background:
    radial-gradient(ellipse at 76% 13%,
      rgba(255, 240, 226, 0.94), transparent 31%),
    radial-gradient(ellipse at 19% 24%,
      rgba(242, 174, 204, 0.72), transparent 36%),
    radial-gradient(ellipse at 75% 76%,
      rgba(255, 58, 143, 0.38), transparent 34%),
    radial-gradient(ellipse at 24% 82%,
      rgba(122, 238, 71, 0.22), transparent 29%),
    linear-gradient(135deg, #ddd0d2, #c9b8c4 58%, #e4cbd2);
}
```

### Frosted glass surface

```css
.mmaxr-glass {
  background:
    linear-gradient(145deg,
      rgba(255, 255, 255, 0.58),
      rgba(255, 243, 249, 0.18));
  border: 1px solid rgba(255, 255, 255, 0.72);
  box-shadow:
    0 18px 44px rgba(75, 43, 63, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(22px) saturate(145%);
  -webkit-backdrop-filter: blur(22px) saturate(145%);
}
```

**Implementation notes**

- Use `backdrop-filter` to blur the pixels behind a translucent panel.
- A transparent fill without `backdrop-filter` is not a frosted-glass effect.
- Provide a fallback fill when blur is unavailable or disabled.
- Avoid stacking many large backdrop filters, especially in XR and on mobile GPUs.
- Keep small text on a sufficiently opaque surface.

## 2. Signature green sidebar — primary reference

This is one of the most important MMAXR reference elements. The sidebar should look like a luminous green glass slab: dark emerald at the edges, bright green through the middle, and a yellow-lime glow toward the lower edge. Add a subtle white reflection and restrained line texture. Chat bubbles and insight cards inside it should be much more neutral than the green base.

```css
.mmaxr-green-sidebar {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.42);
  border-radius: 28px;
  background:
    radial-gradient(85% 45% at 25% 12%,
      rgba(111, 255, 42, 0.90), transparent 68%),
    radial-gradient(75% 48% at 90% 86%,
      rgba(255, 238, 114, 0.88), transparent 66%),
    linear-gradient(155deg,
      #08791e 0%,
      #20c727 38%,
      #81e52f 68%,
      #d5eb59 100%);
  box-shadow:
    0 17px 35px rgba(36, 133, 35, 0.23),
    inset 0 1px rgba(255, 255, 255, 0.65),
    inset -10px -10px 30px rgba(0, 90, 25, 0.10);
}

.mmaxr-green-sidebar::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  opacity: 0.75;
  background:
    linear-gradient(112deg,
      transparent 15%,
      rgba(255, 255, 255, 0.20) 39%,
      transparent 57%),
    repeating-linear-gradient(168deg,
      transparent 0 53px,
      rgba(255, 255, 255, 0.16) 54px,
      transparent 56px 75px);
}
```

### Content inside the green sidebar

- Use white or near-white primary text.
- Use compact neutral-white speech bubbles with dark ink.
- Use translucent white insight cards with a thin white rim.
- Keep shadows and reflections soft; do not add hard black outlines.
- Avoid small low-contrast white text over the brightest lime region.
- In AR/VR, prefer a more opaque content backing if the real-world background is visually busy.

## 3. Glowing cards — primary reference

A glowing card should combine four layers:

1. **Tinted base:** a gradient with the accent color.
2. **Diffuse inner bloom:** a blurred radial gradient in a pseudo-element.
3. **Glass rim:** a thin white border and inset top highlight.
4. **Ambient shadow:** a soft, low-opacity shadow matching the accent.

```css
.mmaxr-glow-card {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: 24px;
  box-shadow:
    inset 0 1px rgba(255, 255, 255, 0.90),
    0 12px 27px rgba(80, 46, 68, 0.10);
}

.mmaxr-glow-card::before {
  content: "";
  position: absolute;
  z-index: -1;
  inset: -25%;
  filter: blur(18px);
  opacity: 0.85;
  pointer-events: none;
  background: radial-gradient(
    ellipse at 45% 35%,
    #a9ff62,
    transparent 50%
  );
}

.mmaxr-glow-card--green {
  background: linear-gradient(145deg,
    rgba(244,255,233,.88),
    rgba(46,213,47,.68) 45%,
    rgba(7,123,34,.90));
}
.mmaxr-glow-card--pink {
  background: linear-gradient(145deg,
    rgba(255,255,255,.88),
    rgba(255,105,177,.80) 50%,
    rgba(226,47,129,.72));
}
.mmaxr-glow-card--lilac {
  background: linear-gradient(145deg,
    rgba(255,255,255,.90),
    rgba(185,180,255,.78) 52%,
    rgba(139,126,217,.68));
}
.mmaxr-glow-card--lime {
  background: linear-gradient(145deg,
    rgba(255,255,255,.90),
    rgba(225,242,91,.78) 52%,
    rgba(107,199,54,.70));
}
```

Place actual card content in a higher stacking layer so the bloom never washes out labels or icons. For multiple card colors, vary the pseudo-element's radial-gradient hue rather than changing the entire visual recipe.

## 4. Liquid-glass focal object

Use this style for one hero object, orb, or selected spatial surface. It should not be used behind dense text.

```css
.mmaxr-liquid-glass {
  border: 1px solid rgba(255, 255, 255, 0.68);
  background:
    radial-gradient(ellipse at 28% 18%,
      rgba(255,255,255,.94), transparent 18%),
    radial-gradient(ellipse at 72% 28%,
      rgba(255,255,255,.66), transparent 23%),
    linear-gradient(140deg,
      rgba(76,72,91,.84),
      rgba(190,187,204,.76) 45%,
      rgba(68,63,79,.90));
  box-shadow:
    inset 0 2px 7px rgba(255,255,255,.73),
    inset -14px -18px 28px rgba(32,30,46,.22),
    0 20px 40px rgba(73,64,80,.21);
}
```

Add one or two broad curved rim highlights and a subtle inner dashed ring if appropriate. Avoid many sharp highlights, which can look plastic or noisy.

## 5. Texture and light

### Fine grain

Use one shared, low-opacity noise layer for the whole scene. Keep it subtle; the grain should be noticed only when looking closely.

```css
.mmaxr-grain {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.04; /* Increase cautiously, rarely above 0.12 */
  mix-blend-mode: soft-light;
  background-image: url("data:image/svg+xml,...");
}
```

The full HTML reference contains a working inline SVG noise texture. Reuse that data URI if a dependency-free grain layer is required.

### Edge light and depth

- Add a thin white edge to translucent cards.
- Add a restrained `inset 0 1px` white highlight.
- Use a broad accent-tinted outer shadow.
- Use gradient streaks sparingly as reflections.
- Avoid pure black shadows and heavy borders.

## 6. Typography and iconography

- Use a clean system sans-serif stack; no external font is required.
- Headings should be medium/light weight with restrained negative letter spacing.
- Use dark ink on pale glass and white text on dark green.
- Keep labels short and legible.
- Use simple outline icons with consistent stroke weight.
- Do not let texture overlap reduce the apparent sharpness of glyphs.

## 7. AR/VR and spatial UI constraints

Apply the same design language, but tune the effects for the target headset and viewing conditions.

- **Readability first:** use opaque or near-opaque backing behind small text. Blur is decorative, not a contrast guarantee.
- **Stable highlights:** use broad, low-frequency reflections; tiny bright lines and fine grain can shimmer or alias in headsets.
- **Limited blur layers:** nested backdrop filters and large blurred surfaces can be expensive. Profile on target hardware.
- **Conservative bloom:** bright green and pink should not overwhelm nearby content or create visual discomfort.
- **Depth restraint:** avoid rapid pulsing, flicker, aggressive parallax, and frequent depth changes.
- **State clarity:** define default, hover/focus, selected, disabled, and pressed states. Never rely on color alone to communicate state.
- **Comfortable targets:** make interactive elements large enough for the input modality (touch, controller ray, hand tracking, gaze).
- **Reduced effects:** support a reduced-transparency / reduced-motion mode and a lower-effects setting.
- **World background variability:** AR surfaces must remain readable against light and dark real-world backgrounds; use a stronger opaque backing when needed.
- **Contrast test:** validate text in the brightest and darkest parts of the gradient, not only in a screenshot's ideal region.

## 8. Responsive guidance

- Desktop: allow generous negative space and larger atmospheric color fields.
- Mobile: reduce card padding and blur radius; use one column and intentional horizontal rails instead of page overflow.
- AR: keep overlays compact and legible against the environment.
- VR: size panels for the intended viewing distance; do not directly scale a mobile layout into world space.
- Avoid hard-coded full-screen heights for content pages. Let content flow unless the experience is intentionally spatially anchored.

## 9. Accessibility and performance fallback

```css
@media (prefers-reduced-transparency: reduce) {
  .mmaxr-glass {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: rgba(255, 247, 250, 0.94);
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

If the platform does not support `prefers-reduced-transparency`, expose an in-app low-effects preference. In low-power modes, remove backdrop filters first, reduce the number of gradient layers, and use static shadows.

## 10. Implementation checklist

Before calling a MMAXR screen complete, verify:

- [ ] Background has soft dusty-pink/lilac ambient light, not a flat fill.
- [ ] Frosted glass uses translucent fill, a clear rim, and restrained backdrop blur.
- [ ] Signature green sidebar has emerald depth, vivid green center, and lime lower glow.
- [ ] Glowing cards have a tinted base, diffuse bloom, glass rim, and soft shadow.
- [ ] Grain and line texture are subtle and do not muddy text.
- [ ] Foreground content is readable in bright and dark gradient regions.
- [ ] Mobile layouts do not create accidental horizontal page overflow.
- [ ] XR effects are tested on target hardware for readability, shimmer, and performance.
- [ ] Reduced-effects fallback is available.
- [ ] Color is not the only indicator of state.

## Reference file

Use `mmaxr_glass_design_system.html` to inspect the live CSS examples for:
- atmospheric background and backdrop blur;
- the green assistant sidebar;
- green, pink, lilac, and lime glowing cards;
- liquid-glass reflections;
- color tokens and XR-specific guidance.

Do not copy the reference page's showcase layout into a product screen. Extract the relevant tokens and component recipes, then apply them to the current MMAXR information architecture.
