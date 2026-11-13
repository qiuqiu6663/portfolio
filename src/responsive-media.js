import manifest from './media-manifest.json'

export const responsiveImages = manifest

// Width hints describe the existing 1700px container and its two-column grid.
// Callers may override sizes when a filtered card spans the full grid.
export const imageSizes = {
  hero: '100vw',
  full: '(min-width: 1860px) 1700px, (max-width: 740px) 100vw, 91vw',
  half: '(min-width: 1860px) 838px, (max-width: 740px) 100vw, 46vw',
  about: '(min-width: 1860px) 838px, (max-width: 800px) 100vw, 46vw',
  dialog: '(min-width: 1000px) 960px, 100vw',
}

export function getResponsiveImage(source) {
  return manifest[source] || null
}

export function getImageSrcSet(source, format = 'webp') {
  return manifest[source]?.variants[format]?.map(image => `${image.src} ${image.width}w`).join(', ')
}

// CSS fragments may use the same compressed resource instead of downloading
// the original JPEG in addition to the responsive image's selected source.
export function getOptimizedImageUrl(source, width = 1440, format = 'webp') {
  const variants = manifest[source]?.variants[format]
  return variants?.find(image => image.width >= width)?.src || variants?.at(-1)?.src || source
}
