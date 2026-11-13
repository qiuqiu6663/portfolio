import { forwardRef } from 'react'
import { getImageSrcSet, getOptimizedImageUrl, getResponsiveImage, imageSizes } from '../responsive-media.js'

// display:contents keeps the existing image geometry, parallax wrapper and
// hover transform ownership intact; all accessibility/data props stay on img.
const ResponsiveImage = forwardRef(function ResponsiveImage({
  src, alt, layout = 'full', sizes, loading = 'lazy', decoding = 'async',
  fetchPriority = 'auto', width, height, ...imageProps
}, ref) {
  const asset = getResponsiveImage(src)
  const sizeHint = sizes || imageSizes[layout] || imageSizes.full
  const image = <img ref={ref} src={asset ? getOptimizedImageUrl(src) : src}
    srcSet={asset ? getImageSrcSet(src, 'webp') : undefined} sizes={asset ? sizeHint : undefined}
    alt={alt} loading={loading} decoding={decoding}
    fetchPriority={fetchPriority} width={width ?? asset?.width} height={height ?? asset?.height}
    {...imageProps} />
  if (!asset) return image
  return <picture style={{ display: 'contents' }}>
    <source type="image/avif" srcSet={getImageSrcSet(src, 'avif')} sizes={sizeHint} />
    <source type="image/webp" srcSet={getImageSrcSet(src, 'webp')} sizes={sizeHint} />
    {image}
  </picture>
})

export default ResponsiveImage
