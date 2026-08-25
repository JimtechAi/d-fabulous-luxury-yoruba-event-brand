import { RESPONSIVE_IMAGE_VARIANTS } from './media-variants';

export function getResponsiveImageProps(src: string, sizes = '100vw') {
  const variants = RESPONSIVE_IMAGE_VARIANTS[src];
  if (!variants?.length) return { sizes };

  return {
    srcSet: variants.map(({ src: variantSrc, width }) => `${variantSrc} ${width}w`).join(', '),
    sizes,
  };
}