/**
 * GalleryCard Component
 * Reusable shell for event photography gallery grids with luxury editorial framing.
 */

import React from 'react';
import { Play } from 'lucide-react';
import { Image } from './Image';

interface GalleryCardProps {
  imageSrc?: string;
  altText: string;
  caption?: string;
  category?: string;
  aspectRatio?: '1/1' | '4/3' | '16/9' | '3/4';
  isPlaceholder?: boolean;
  mediaType?: 'image' | 'video';
  videoSrc?: string;
  posterSrc?: string;
  onOpen?: () => void;
  priority?: boolean;
}

export const GalleryCard: React.FC<GalleryCardProps> = ({
  imageSrc = '',
  altText,
  caption,
  category = 'Traditional Engagement',
  aspectRatio = '4/3',
  isPlaceholder = true,
  mediaType = 'image',
  videoSrc,
  posterSrc,
  onOpen,
  priority = false,
}) => {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (onOpen && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      className="group relative overflow-hidden bg-ivory-warm border border-burgundy-deep/15 hover:border-gold-luxury/70 transition-all duration-500 hover:shadow-lg"
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
    >
      {/* Top Corner Gold Frame Line */}
      <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-gold-luxury/0 group-hover:border-gold-luxury/60 transition-all duration-500 z-10 pointer-events-none" />

      {mediaType === 'video' && videoSrc && !isPlaceholder ? (
        <div className="relative aspect-video bg-black-rich overflow-hidden">
          {posterSrc ? (
            <img src={posterSrc} alt={altText} loading={priority ? 'eager' : 'lazy'} decoding={priority ? 'sync' : 'async'} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-charcoal-soft/40" />
          )}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-black-rich/60 border border-gold-luxury/70 group-hover:bg-gold-luxury transition-colors duration-300">
              <Play className="h-6 w-6 text-gold-luxury group-hover:text-black-rich transition-colors duration-300" aria-hidden="true" fill="currentColor" />
            </span>
          </div>
          <span className="pointer-events-none absolute left-3 top-3 bg-black-rich/75 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-gold-luxury">Video</span>
        </div>
      ) : (
        <Image
          src={imageSrc}
          alt={altText}
          aspectRatio={aspectRatio}
          isPlaceholder={isPlaceholder}
          priority={priority}
        />
      )}
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

