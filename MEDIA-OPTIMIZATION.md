# Media performance audit

Audit baseline, captured before the new responsive assets were generated:

| Item | Bytes |
| --- | ---: |
| `public/` | 4,826,527 |
| Current five display images | 2,322,845 |
| `public/taste/` | 2,383,861 |
| Unused `public/taste/moments/_demo/` alone | 2,035,532 |
| Existing `dist/` | 5,494,357 |
| Main JS, raw / gzip | 496,471 / 159,977 |
| GSAP chunk, raw / gzip | 123,437 / 48,652 |
| Main CSS, raw / gzip | 46,331 / 10,831 |

The image bytes below are on-disk encoded file sizes. They do not claim a complete page transfer, measured LCP, or a whole-deployment reduction.

## Image changes

`scripts/optimize-media.mjs` uses sharp to create AVIF and WebP variants at 640, 960, 1440 and the smaller of the original width or 1920 pixels. It never enlarges an original. AVIF uses quality 54, effort 6 and 4:4:4; WebP uses quality 80 and effort 5. The script does not change composition or color grade.

The original files are preserved in `reference-media/performance-originals/`. The generator reads that archive, so public copies of the old JPEG/PNG files can be excluded from deployment. No archived originals are overwritten or removed.

| Image | Original bytes | Largest AVIF | Largest WebP | Maximum width |
| --- | ---: | ---: | ---: | ---: |
| About | 288,344 | 96,572 | 153,844 | 1600 |
| Project 01 | 406,839 | 93,513 | 137,708 | 1920 |
| Project 02 | 658,557 | 157,234 | 300,836 | 1600 |
| Project 03 | 182,275 | 51,403 | 73,660 | 1800 |
| Aero fallback | 786,830 | 34,946 | 57,658 | 1920 |
| **Total** | **2,322,845** | **433,668** | **723,706** | |

The largest AVIF set is 81.3% smaller than the original set; the largest WebP set is 68.8% smaller. The hero fallback alone is 95.6% smaller in AVIF. All 40 variants together occupy 2,709,950 bytes: browsers choose one supported format and size per image, rather than downloading the whole set.

## Integration

- `src/components/ResponsiveImage.jsx` keeps image layout ownership on the inner `img`, while its `picture` uses `display: contents`. It supports forwarded refs, class names, alt text and data attributes. AVIF is preferred, then WebP. Its final `img` also uses optimized WebP `src`, `srcSet` and `sizes`, so old image URLs are only manifest keys.
- `src/responsive-media.js` exports `imageSizes`, `getResponsiveImage`, `getImageSrcSet` and `getOptimizedImageUrl`.
- Replace the existing image elements in About, project cards, project dialogs and Hero fallback. Use `layout="about"`, `"half"`, `"full"`, `"dialog"` or `"hero"`; a filtered full-width project should use `full`.
- Below-fold images default to `loading="lazy"` and `decoding="async"`. Hero fallback should use `loading="eager"` and `fetchPriority="high"`. Do not preload it unconditionally when a supported WebGPU renderer will draw the hero instead.
- Set dialog fragment backgrounds to the image's already-loaded `currentSrc` so they reuse the same decoded/cached resource. Referencing the old JPEG or a different WebP size would cause an additional request.

## Validation

The responsive component was bundled and mounted in an isolated, same-origin browser test with the full Chrome binary. All five images loaded at 390×844/DPR 2, 768×1024/DPR 2 and 1440×900/DPR 1. Every request selected an optimized AVIF; there were no requests for original images, no page errors, and every image had nonzero dimensions. The actual AVIF decode of the hero and the detailed architecture image was visually inspected. This validates source selection and component layout; it is not a production full-page performance benchmark.

The isolated five-image selections totaled:

| Test viewport | Encoded selected images |
| --- | ---: |
| 390×844, DPR 2 | 165,774 bytes |
| 768×1024, DPR 2 | 272,528 bytes |
| 1440×900, DPR 1 | 203,419 bytes |

The full per-variant sizes and browser `currentSrc` results are recorded in `reference-media/performance-originals/optimization-report.json`.

## Additional packaging findings

The application does not reference `taste/moments/` or its demo photographs. These can be archived outside `public/` to prevent Vite copying them into every deployment. `taste/motion/` demo files are also not runtime dependencies; the current HTML still references `motion.css`, so that stylesheet must be preserved unless its integration changes.

The existing font is already local, preloaded once, and uses `font-display: swap`; there is no remote Japanese font download to remove. The GSAP chunk is module-preloaded by the existing production HTML, so separating it into a named chunk alone does not defer its first-visit transfer or parse cost. The WebGPU renderer is also an eager dependency in the baseline; its lazy-loading or static-first policy belongs to the renderer integration, not this image change.
