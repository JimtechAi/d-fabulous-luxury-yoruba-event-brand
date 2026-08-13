/**
 * HeroMediaSlot Component
 * Production-ready cinematic slot that accepts desktop video, mobile video, poster, or fallback image.
 */

import React, { useEffect, useRef, useState } from 'react';
import { HeroMediaSlotProps } from '../types';

export const HeroMediaSlot: React.FC<HeroMediaSlotProps> = ({
  desktopVideoSrc,
  mobileVideoSrc,
  posterImageSrc,
  fallbackImageSrc,
  altText,
  overlayOpacity = 0.45,
  className = '',
  isPlaceholder = true,
}) => {
  const [videoError, setVideoError] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [objectPosition, setObjectPosition] = useState('50% 18%');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const updateObjectPosition = () => {
      if (window.innerWidth < 640) {
        setObjectPosition('50% 24%');
      } else if (window.innerWidth < 1024) {
        setObjectPosition('50% 18%');
      } else {
        setObjectPosition('50% 12%');
      }
    };

    updateObjectPosition();
    window.addEventListener('resize', updateObjectPosition);

    return () => window.removeEventListener('resize', updateObjectPosition);
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = isMuted;
    videoRef.current.volume = isMuted ? 0 : 1;
  }, [isMuted]);

  const hasVideo = (desktopVideoSrc || mobileVideoSrc) && !videoError && !isPlaceholder;

  return (
    <div className={`relative w-full h-full overflow-hidden bg-black-rich ${className}`}>
      {/* Video Stream or Poster Fallback */}
      {hasVideo ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            loop
            muted={isMuted}
            playsInline
            poster={posterImageSrc || fallbackImageSrc}
            onError={() => setVideoError(true)}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectFit: 'cover', objectPosition }}
          >
            {desktopVideoSrc && (
              <source src={desktopVideoSrc} type="video/mp4" media="(min-width: 768px)" />
            )}
            {mobileVideoSrc && (
              <source src={mobileVideoSrc} type="video/mp4" media="(max-width: 767px)" />
            )}
            Your browser does not support video play.
          </video>

          <button
            type="button"
            aria-label={isMuted ? 'Turn sound on' : 'Turn sound off'}
            onClick={() => setIsMuted((current) => !current)}
            className="absolute bottom-4 right-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-gold-luxury/60 bg-black-rich/55 text-base text-ivory-warm shadow-lg shadow-black/30 backdrop-blur-sm transition-all duration-200 hover:border-gold-luxury hover:bg-black-rich/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury focus-visible:ring-offset-2 focus-visible:ring-offset-black-rich"
          >
            <span aria-hidden="true">{isMuted ? '🔇' : '🔊'}</span>
          </button>
        </>
      ) : posterImageSrc || fallbackImageSrc ? (
        <img
          src={posterImageSrc || fallbackImageSrc}
          alt={altText}
          className="absolute inset-0 w-full h-full object-cover object-center filter brightness-95"
        />
      ) : (
        /* Neutral Luxury Hero Placeholder Visual Frame */
        <div className="absolute inset-0 bg-gradient-to-br from-burgundy-dark via-black-rich to-burgundy-deep flex flex-col items-center justify-center p-8 text-center">
          <div className="relative z-10 max-w-md p-6 border border-gold-luxury/30 bg-black-rich/60 backdrop-blur-md">
            <span className="font-display text-2xl text-gold-luxury tracking-widest uppercase block mb-1">
              D’FABULOUS
            </span>
            <span className="text-xs text-champagne-soft/80 font-sans tracking-wider uppercase">
              Cultural Event Host & Ceremonial Leadership
            </span>
          </div>
          <div className="absolute inset-0 cultural-pattern-subtle opacity-20" aria-hidden="true" />
        </div>
      )}

      {/* Luxury Gradient Darkening Overlay */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-black-rich via-black-rich/50 to-black-rich/30 pointer-events-none"
        style={{ opacity: overlayOpacity }}
      />
    </div>
  );
};
