/**
 * GalleryCard Component
 * Reusable shell for event photography gallery grids with luxury editorial framing.
 */

import React from 'react';
import { Image } from './Image';

interface GalleryCardProps {
  imageSrc?: string;
  altText: string;
  caption?: string;
  category?: string;
  aspectRatio?: '1/1' | '4/3' | '16/9' | '3/4';
  isPlaceholder?: boolean;
}

export const GalleryCard: React.FC<GalleryCardProps> = ({
  imageSrc = '',
  altText,
  caption,
  category = 'Traditional Engagement',
  aspectRatio = '4/3',
  isPlaceholder = true,
}) => {
  return (
    <div className="group relative overflow-hidden bg-ivory-warm border border-burgundy-deep/15 hover:border-gold-luxury/70 transition-all duration-500 hover:shadow-lg">
      {/* Top Corner Gold Frame Line */}
      <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-gold-luxury/0 group-hover:border-gold-luxury/60 transition-all duration-500 z-10 pointer-events-none" />

      <Image
        src={imageSrc}
        alt={altText}
        aspectRatio={aspectRatio}
        isPlaceholder={isPlaceholder}
      />
      <div className="p-4 sm:p-5 bg-ivory-warm flex items-center justify-between gap-3 border-t border-burgundy-deep/10">
        <div>
          <span className="text-[10px] font-semibold tracking-[0.2em] text-gold-luxury uppercase block mb-1">
            {category}
          </span>
          <p className="font-display text-sm sm:text-base text-black-rich font-normal line-clamp-1 group-hover:text-burgundy-deep transition-colors">
            {altText}
          </p>
        </div>
        {isPlaceholder && (
          <span className="text-[9px] font-mono text-charcoal-soft/60 uppercase tracking-widest whitespace-nowrap bg-burgundy-dark/5 px-2 py-1 border border-burgundy-deep/10">
            Media Slot
          </span>
        )}
      </div>
    </div>
  );
};

