# React Bits TechText

Downloaded on 2026-11-13 from the official JS-CSS registry:

- https://reactbits.dev/r/TechText-JS-CSS.json
- https://reactbits.dev/text-animations/tech-text

`src/components/TechText.jsx` and `TechText.css` are exact copies of the registry files. Both dependency lists in the registry are empty. No animation package or CSS framework is required.

`src/components/TechHeading.jsx` adds semantic headings, real text fallback, responsive measurement and visibility/reduced-motion/save-data gating. It uses letter reveal, 600 weight, 15 specks, no intro and no guides. Outlines use `lineStyle="solid"`; dash values are inactive. Font sizes follow responsive CSS. Only the Hero PORTFOLIO heading opts into automatic sweeping after its GSAP entrance; other headings use pointer hover. clickKick and dragging remain disabled. The DOM copy is shown during entrance transforms, then the visual layer is remeasured after settling. Offscreen/hidden/static-mode headings unmount the artwork. The upstream TechText source remains unchanged.

Upstream license: `LICENSE.md` (MIT + Commons Clause). A copy also ships at `/REACT-BITS-LICENSE.txt`.

## Particles

Downloaded from https://reactbits.dev/r/Particles-JS-CSS.json, documented at https://reactbits.dev/backgrounds/particles. The registry JSON preserves the exact upstream source. The runtime `Particles.jsx` now has a documented performance patch: optional maxFps, visibility-aware scheduling and cached resize work. Shaders and CSS are unchanged. Both dependency lists are empty.

`ParticlesBackground.jsx` applies the blue/white attract configuration to About, Work, Approach and Contact. Desktop retains 450 particles; tablet/phone budgets use 300/220 and 30fps. The module downloads near a visible section; offscreen contexts are released. Reduced-motion/save-data visitors see CSS still particles without a GPU context. Pointer events remain transparent to foreground controls. The normal React root avoids StrictMode replay losing the upstream WebGL context during development.

## AeroShards

The Hero originates from https://reactbits.dev/r/AeroShards-JS-CSS.json, documented at https://reactbits.dev/backgrounds/aero-shards. The registry JSON remains the exact source; runtime changes add maxFps, complete offscreen/hidden scheduling suspension, a first-draw onReady callback and cached CSS dimensions. Shaders, materials and render passes remain unchanged. `vgpu@^0.3.1` is installed as 0.3.1. Blue glass/full/plus, 0.7 depth of field, 0.34 vignette, pulse/hold and zero grain remain. Desktop/tablet/phone budgets use 1300/850/600 shards with 60/30/30fps caps. The genuine rendered fallback frame is now served as responsive AVIF/WebP variants; the original is archived in `reference-media/performance-originals`. Reduced-motion/save-data avoids downloading the GPU module. `SiteGrain.jsx` stays outside the Hero.

The browser implementation requires no native Node WebGPU installation scripts; they are disabled in pnpm's allowBuilds policy. VGPU's MIT notice is copied to `/VGPU-LICENSE.txt`.
