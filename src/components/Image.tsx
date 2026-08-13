/**
 * Reusable Media Image Component
 * Supports aspect ratio framing, position, overlay, captions, and graceful placeholder states.
 */

import React, { useState } from 'react';
import { ImageMediaProps } from '../types';

export const Image: React.FC<ImageMediaProps> = ({
  src,
  alt,
  aspectRatio = '16/9',
  objectPosition = 'object-center',
  overlayOpacity = 0,
  caption,
  className = '',
  priority = false,
  isPlaceholder = false,
}) => {
  const [hasError, setHasError] = useState(false);

  const aspectRatioClasses = {
    '1/1': 'aspect-square',
    '4/3': 'aspect-[4/3]',
    '16/9': 'aspect-video',
    '21/9': 'aspect-[21/9]',
    '3/4': 'aspect-[3/4]',
    auto: '',
  };

  const showPlaceholderFallback = isPlaceholder || hasError || !src;

  return (
    <figure className={`relative overflow-hidden bg-burgundy-dark/10 group ${aspectRatioClasses[aspectRatio]} ${className}`}>
      {showPlaceholderFallback ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-burgundy-dark/20 border border-gold-luxury/20 p-6 text-center">
          <div className="w-10 h-10 mb-2 rounded-full border border-gold-luxury/40 flex items-center justify-center text-gold-luxury font-display text-sm font-semibold">
            DF
          </div>
          <p className="text-xs font-display tracking-widest text-burgundy-deep/90 uppercase">
            D’Fabulous Media Frame
          </p>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          onError={() => setHasError(true)}
          className={`w-full h-full object-cover ${objectPosition} transition-transform duration-700 ease-out group-hover:scale-105`}
        />
      )}

      {/* Optional Editorial Gradient Overlay */}
      {overlayOpacity > 0 && !showPlaceholderFallback && (
        <div
          className="absolute inset-0 bg-gradient-to-t from-black-rich via-black-rich/40 to-transparent pointer-events-none"
          style={{ opacity: overlayOpacity }}
        />
      )}

      {/* Optional Caption */}
      {caption && (
        <figcaption className="p-3 text-xs font-sans text-charcoal-soft/80 italic border-l-2 border-gold-luxury bg-champagne-soft/20 mt-1">
          {caption}
        </figcaption>
      )}
    </figure>
  );
};
