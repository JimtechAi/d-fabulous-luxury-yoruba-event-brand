/**
 * GalleryShell Component
 * Photo and video gallery grid shell using neutral media slots.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Container } from '../components/Container';
import { PageHero } from '../components/PageHero';
import { GalleryCard } from '../components/GalleryCard';
import { Button } from '../components/Button';
import { SEO } from '../components/SEO';
import { getGalleryItems, getVideoItems, DbGalleryItem, DbVideoItem } from '../lib/db';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface GalleryShellProps {
  type?: 'gallery' | 'videos';
}

const VIDEO_MIME_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  ogg: 'video/ogg',
  mov: 'video/quicktime',
};

function getVideoMimeType(videoUrl: string): string {
  const cleanUrl = videoUrl.split(/[?#]/)[0];
  const extension = cleanUrl.slice(cleanUrl.lastIndexOf('.') + 1).toLowerCase();
  return VIDEO_MIME_TYPES[extension] || 'video/mp4';
}

export const GalleryShell: React.FC<GalleryShellProps> = ({ type = 'gallery' }) => {
  const isVideo = type === 'videos';
  const [dbGallery, setDbGallery] = useState<DbGalleryItem[]>([]);
  const [dbVideos, setDbVideos] = useState<DbVideoItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const loadItems = isVideo ? getVideoItems : getGalleryItems;
    loadItems().then((items) => {
      if (items && items.length > 0) {
        if (isVideo) {
          setDbVideos(items as DbVideoItem[]);
        } else {
          setDbGallery(items as DbGalleryItem[]);
        }
      }
    });
  }, [isVideo]);

  type GalleryDisplayItem = {
    id: string;
    category: string;
    altText: string;
    imageSrc: string;
    caption?: string;
    isPlaceholder: boolean;
    mediaType?: 'image' | 'video';
    videoSrc?: string;
  };

  const galleryItems: GalleryDisplayItem[] = dbGallery.map((item) => ({
    id: item.id,
    category: 'Gallery',
    altText: item.alt_text || item.title,
    caption: item.caption,
    imageSrc: item.image_url,
    isPlaceholder: false,
  }));

  const videoItems: GalleryDisplayItem[] = dbVideos.map((item) => ({
    id: item.id,
    category: 'Videos',
    altText: item.alt_text || item.title,
    caption: item.caption,
    imageSrc: item.poster_url || '',
    isPlaceholder: false,
    mediaType: 'video',
    videoSrc: item.video_url,
  }));

  const items: GalleryDisplayItem[] = isVideo ? videoItems : galleryItems;

  const selectedItem = selectedIndex !== null ? items[selectedIndex] ?? null : null;
  const itemCount = items.length;

  const showPrevious = () => {
    if (itemCount === 0) return;
    setSelectedIndex((current) => (current === null ? null : (current - 1 + itemCount) % itemCount));
  };

  const showNext = () => {
    if (itemCount === 0) return;
    setSelectedIndex((current) => (current === null ? null : (current + 1) % itemCount));
  };

  useEffect(() => {
    if (selectedIndex === null) return;

    // Remember what had focus so it can be restored when the viewer closes.
    lastFocusedElementRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedIndex(null);
        return;
      }
      if (event.key === 'ArrowLeft') showPrevious();
      if (event.key === 'ArrowRight') showNext();

      if (event.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], video, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      lastFocusedElementRef.current?.focus();
    };
  }, [selectedIndex !== null]);

  return (
    <>
      <SEO
        title={isVideo ? "Cinematic Video Highlights | D’Fabulous Yoruba Events" : "Event Gallery | D’Fabulous Luxury Yoruba Events"}
        description={isVideo ? "Watch cinematic highlights from luxury Yoruba celebrations across the UK and internationally." : "Visual highlights capturing the joy, reverence, and vibrant energy of luxury Yoruba celebrations."}
        canonicalUrl={`${window.location.origin}${isVideo ? '/gallery/videos' : '/gallery'}`}
      />

      <PageHero
        title={isVideo ? "Cinematic Event Highlights" : "Gallery of Celebrations"}
        subtitle={isVideo ? "Experience the vibrant energy, articulate Yoruba oratory, and joyful atmosphere captured across live events." : "Curated photography from luxury Yoruba traditional engagements, Alaga ceremonies, and wedding receptions across the UK and internationally."}
        breadcrumbs={[
          { label: 'Home', href: '/' },
          ...(isVideo ? [{ label: 'Gallery', href: '/gallery' }] : []),
          { label: isVideo ? 'Videos' : 'Gallery' },
        ]}
      />

      <section className="py-16 sm:py-24 bg-ivory-warm">
        <Container>
          {/* Media Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {items.map((item, index) => (
              <GalleryCard
                key={item.id}
                imageSrc={item.imageSrc}
                altText={item.altText}
                caption={item.caption}
                category={item.category}
                isPlaceholder={item.isPlaceholder ?? true}
                mediaType={item.mediaType}
                videoSrc={item.videoSrc}
                posterSrc={item.imageSrc}
                onOpen={item.isPlaceholder ? undefined : () => setSelectedIndex(index)}
                priority={index < 3}
              />
            ))}
          </div>

          {selectedItem && (
            <div ref={modalRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black-rich/95 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={selectedItem.altText} onClick={() => setSelectedIndex(null)}>
              <button ref={closeButtonRef} type="button" aria-label="Close media viewer" onClick={() => setSelectedIndex(null)} className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center border border-gold-luxury/60 text-ivory-warm hover:bg-gold-luxury hover:text-black-rich focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
              {itemCount > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous media"
                    onClick={(event) => {
                      event.stopPropagation();
                      showPrevious();
                    }}
                    className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 inline-flex h-11 items-center gap-2 px-3 justify-center border border-gold-luxury/60 text-ivory-warm hover:bg-gold-luxury hover:text-black-rich focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    <span className="hidden sm:inline text-xs font-semibold uppercase tracking-[0.15em]">Previous</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Next media"
                    onClick={(event) => {
                      event.stopPropagation();
                      showNext();
                    }}
                    className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 inline-flex h-11 items-center gap-2 px-3 justify-center border border-gold-luxury/60 text-ivory-warm hover:bg-gold-luxury hover:text-black-rich focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury"
                  >
                    <span className="hidden sm:inline text-xs font-semibold uppercase tracking-[0.15em]">Next</span>
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </>
              )}
              <div className="max-h-full w-full max-w-6xl" onClick={(event) => event.stopPropagation()}>
                {selectedItem.mediaType === 'video' && selectedItem.videoSrc ? (
                  <video key={selectedItem.id} poster={selectedItem.imageSrc} controls playsInline preload="metadata" className="mx-auto max-h-[78vh] w-auto max-w-full">
                    <source src={selectedItem.videoSrc} type={getVideoMimeType(selectedItem.videoSrc)} />
                  </video>
                ) : (
                  <img src={selectedItem.imageSrc} alt={selectedItem.altText} className="mx-auto max-h-[78vh] w-auto max-w-full object-contain" />
                )}
                <p className="mt-4 text-center text-sm text-champagne-soft">
                  {selectedItem.caption || selectedItem.altText}
                  {itemCount > 1 && (
                    <span className="ml-2 text-gold-luxury/80">
                      {isVideo
                        ? `Video ${(selectedIndex ?? 0) + 1} of ${itemCount}`
                        : `(${(selectedIndex ?? 0) + 1} / ${itemCount})`}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* CTA Banner */}
          <div className="mt-16 p-8 sm:p-12 border border-gold-luxury/30 bg-burgundy-deep text-ivory-warm text-center space-y-6">
            <h3 className="font-display text-2xl sm:text-3xl font-normal text-gold-luxury">
              Ready to Plan Your Celebration?
            </h3>
            <p className="text-champagne-soft/85 max-w-2xl mx-auto leading-relaxed">
              Inquire today regarding date availability and ceremonial direction for your upcoming wedding or traditional engagement.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <Button variant="primary" href="/book">
                BOOK D’FABULOUS
              </Button>
              <Button variant="outline-light" href="/contact">
                CONTACT CONSULTATIONS
              </Button>
            </div>
          </div>

        </Container>
      </section>
    </>
  );
};

