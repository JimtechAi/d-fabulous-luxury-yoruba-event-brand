/**
 * HeroCarousel Component
 * Premium 3-slide cinematic hero carousel for the D’Fabulous homepage.
 * Autoplay, fade transitions, slow zoom, arrows, pagination, swipe, hover pause, reduced-motion aware.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Container } from './Container';
import { Link } from '../lib/router';

interface HeroSlide {
  image: string;
  alt: string;
  objectPositionDesktop: string;
  objectPositionMobile: string;
  eyebrow: string;
  headline: string;
  supporting: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
}

const SLIDES: HeroSlide[] = [
  {
    image: '/assets/hero/hero1.webp',
    alt: 'D’Fabulous hosting a luxury Yoruba celebration in regal traditional attire',
    objectPositionDesktop: '72% 22%',
    objectPositionMobile: '60% 20%',
    eyebrow: 'WHERE HERITAGE MEETS CELEBRATION',
    headline: 'Creating Unforgettable Celebrations',
    supporting:
      'Luxury entertainment, Yoruba culture and unforgettable experiences brought together with elegance and excellence.',
    primaryLabel: 'EXPLORE OUR SERVICES',
    primaryHref: '/services',
    secondaryLabel: 'VIEW GALLERY',
    secondaryHref: '/gallery',
  },
  {
    image: '/assets/hero/hero2.webp',
    alt: 'D’Fabulous leading a traditional engagement ceremony with guests celebrating',
    objectPositionDesktop: '74% 20%',
    objectPositionMobile: '58% 18%',
    eyebrow: 'YOUR MOMENT. OUR STAGE.',
    headline: 'Every Celebration Deserves To Be Extraordinary',
    supporting:
      'From traditional weddings to grand celebrations, we bring energy, culture and unforgettable moments to every event.',
    primaryLabel: 'BOOK D’FABULOUS',
    primaryHref: '/book',
    secondaryLabel: 'OUR EXPERIENCE',
    secondaryHref: '/experience',
  },
  {
    image: '/assets/hero/hero3.webp',
    alt: 'D’Fabulous in ceremonial gold and burgundy attire at a premium cultural event',
    objectPositionDesktop: '70% 24%',
    objectPositionMobile: '55% 20%',
    eyebrow: 'CELEBRATIONS THAT LIVE FOREVER',
    headline: 'Culture. Elegance. Entertainment.',
    supporting:
      'We create memorable experiences that honour tradition while delivering modern luxury entertainment.',
    primaryLabel: 'DISCOVER D’FABULOUS',
    primaryHref: '/about',
    secondaryLabel: 'CONTACT US',
    secondaryHref: '/contact',
  },
];

const AUTOPLAY_MS = 5000;
const SWIPE_THRESHOLD = 48;

const primaryCtaClasses =
  'inline-flex w-full sm:w-auto items-center justify-center min-h-[52px] px-8 py-4 font-sans text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-black-rich bg-gold-luxury border border-gold-luxury transition-all duration-300 hover:bg-champagne-soft hover:border-champagne-soft hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury focus-visible:ring-offset-2 focus-visible:ring-offset-black-rich';

const secondaryCtaClasses =
  'inline-flex w-full sm:w-auto items-center justify-center min-h-[52px] px-8 py-4 font-sans text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-ivory-warm bg-black-rich/35 border border-gold-luxury/70 backdrop-blur-sm transition-all duration-300 hover:bg-black-rich/60 hover:border-gold-luxury hover:text-gold-luxury hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury focus-visible:ring-offset-2 focus-visible:ring-offset-black-rich';

export const HeroCarousel: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const syncMobile = () => setIsMobile(mobileQuery.matches);
    const syncMotion = () => setPrefersReducedMotion(motionQuery.matches);

    syncMobile();
    syncMotion();
    mobileQuery.addEventListener('change', syncMobile);
    motionQuery.addEventListener('change', syncMotion);

    return () => {
      mobileQuery.removeEventListener('change', syncMobile);
      motionQuery.removeEventListener('change', syncMotion);
    };
  }, []);

  const goTo = useCallback((index: number) => {
    setActiveIndex(((index % SLIDES.length) + SLIDES.length) % SLIDES.length);
  }, []);

  const goNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);
  const goPrev = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);

  // Timer keys off activeIndex so manual navigation restarts the 5s interval.
  useEffect(() => {
    if (isPaused || prefersReducedMotion) return;
    const timer = window.setTimeout(() => goTo(activeIndex + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, isPaused, prefersReducedMotion, goTo]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goNext();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goPrev();
    }
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    touchStartX.current = event.changedTouches[0].clientX;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    if (touchStartX.current === null) return;
    const delta = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    if (delta < 0) goNext();
    else goPrev();
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="D’Fabulous signature celebrations"
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="relative isolate flex h-[700px] items-center overflow-hidden bg-black-rich text-ivory-warm sm:h-[660px] lg:h-[740px]"
    >
      {SLIDES.map((slide, index) => {
        const isActive = index === activeIndex;
        return (
          <div
            key={slide.image}
            aria-hidden={!isActive}
            className={`absolute inset-0 z-0 transition-opacity duration-1000 ease-out ${
              isActive ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <img
              src={slide.image}
              alt={slide.alt}
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding={index === 0 ? 'sync' : 'async'}
              fetchPriority={index === 0 ? 'high' : 'low'}
              draggable={false}
              className={`h-full w-full object-cover ${isActive && !prefersReducedMotion ? 'hero-slide-zoom' : ''}`}
              style={{
                objectPosition: isMobile ? slide.objectPositionMobile : slide.objectPositionDesktop,
              }}
            />
          </div>
        );
      })}

      {/* Cinematic gradient: heaviest behind the copy, lighter over the subject */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-10 bg-gradient-to-t from-black-rich via-black-rich/75 to-black-rich/35 lg:bg-gradient-to-r lg:from-black-rich lg:via-black-rich/65 lg:to-black-rich/15"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 z-10 bg-gradient-to-b from-black-rich/70 via-transparent to-transparent"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 z-10 hidden bg-gradient-to-t from-black-rich/80 via-transparent to-transparent lg:block"
      />

      <Container className="relative z-20 pt-20 pb-28 sm:pb-24">
        <div
          className="max-w-xl lg:max-w-2xl xl:max-w-3xl"
          aria-live="polite"
          aria-atomic="true"
        >
          {SLIDES.map((slide, index) => {
            const isActive = index === activeIndex;
            return (
              <div
                key={slide.headline}
                role="group"
                aria-roledescription="slide"
                aria-label={`Slide ${index + 1} of ${SLIDES.length}`}
                hidden={!isActive}
                className={`transition-all duration-700 ease-out ${
                  isActive ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
                }`}
              >
                <div className="mb-5 h-px w-16 bg-gradient-to-r from-gold-luxury to-transparent sm:w-20" />

                <span className="mb-5 block font-sans text-[0.625rem] font-semibold uppercase tracking-[0.3em] text-gold-luxury sm:text-xs">
                  {slide.eyebrow}
                </span>

                <h1 className="mb-6 font-display text-4xl font-normal leading-[1.08] tracking-tight text-ivory-warm sm:text-5xl md:text-6xl lg:text-[4.25rem]">
                  {slide.headline}
                </h1>

                <p className="mb-9 max-w-2xl font-sans text-base font-light leading-relaxed text-champagne-soft/90 sm:text-lg">
                  {slide.supporting}
                </p>

                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                  <Link href={slide.primaryHref} className={primaryCtaClasses}>
                    {slide.primaryLabel}
                  </Link>
                  <Link href={slide.secondaryHref} className={secondaryCtaClasses}>
                    {slide.secondaryLabel}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </Container>

      {/* Previous / Next controls */}
      <button
        type="button"
        onClick={goPrev}
        aria-label="Previous slide"
        className="absolute bottom-[26px] right-[4.25rem] z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-gold-luxury/60 bg-black-rich/45 text-ivory-warm backdrop-blur-sm transition-all duration-300 hover:border-gold-luxury hover:bg-black-rich/70 hover:text-gold-luxury focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury focus-visible:ring-offset-2 focus-visible:ring-offset-black-rich sm:bottom-[34px] sm:right-[4.75rem] lg:bottom-auto lg:left-8 lg:right-auto lg:top-1/2 lg:h-12 lg:w-12 lg:-translate-y-1/2"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={goNext}
        aria-label="Next slide"
        className="absolute bottom-[26px] right-4 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-gold-luxury/60 bg-black-rich/45 text-ivory-warm backdrop-blur-sm transition-all duration-300 hover:border-gold-luxury hover:bg-black-rich/70 hover:text-gold-luxury focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury focus-visible:ring-offset-2 focus-visible:ring-offset-black-rich sm:bottom-[34px] sm:right-6 lg:bottom-auto lg:right-8 lg:top-1/2 lg:h-12 lg:w-12 lg:-translate-y-1/2"
      >
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Pagination */}
      <div className="absolute inset-x-0 bottom-8 z-30 sm:bottom-10">
        <Container>
          <div className="flex items-center justify-start gap-4">
            <span aria-hidden="true" className="hidden h-px w-12 bg-gold-luxury/40 md:block" />
            <div className="flex items-center gap-3">
              {SLIDES.map((slide, index) => {
                const isActive = index === activeIndex;
                return (
                  <button
                    key={slide.image}
                    type="button"
                    onClick={() => goTo(index)}
                    aria-label={`Go to slide ${index + 1}`}
                    aria-current={isActive}
                    className="group inline-flex h-8 items-center justify-center px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury focus-visible:ring-offset-2 focus-visible:ring-offset-black-rich"
                  >
                    <span
                      className={`block h-1.5 rounded-full transition-all duration-500 ease-out ${
                        isActive
                          ? 'w-10 bg-gold-luxury'
                          : 'w-4 bg-ivory-warm/40 group-hover:bg-ivory-warm/70'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
            <span aria-hidden="true" className="hidden h-px w-12 bg-gold-luxury/40 md:block" />
          </div>
        </Container>
      </div>
    </section>
  );
};
