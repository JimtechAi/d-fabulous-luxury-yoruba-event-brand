/**
 * TestimonialsShell Component
 * Dedicated page shell for verified client reflections, testimonials, awards, and credibility marks.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Container } from '../components/Container';
import { PageHero } from '../components/PageHero';
import { TestimonialCard } from '../components/TestimonialCard';
import { Button } from '../components/Button';
import { SEO } from '../components/SEO';
import { getTestimonials, DbTestimonial } from '../lib/db';
import { ShieldCheck, CheckCircle2, Play } from 'lucide-react';

interface TestimonialItem {
  id: string;
  quote: string;
  clientNames: string;
  eventType: string;
  location?: string;
  isPlaceholder?: boolean;
}

export const TestimonialsShell: React.FC = () => {
  const [dbTestimonials, setDbTestimonials] = useState<DbTestimonial[]>([]);

  useEffect(() => {
    getTestimonials().then((items) => {
      if (items && items.length > 0) {
        setDbTestimonials(items);
      }
    });
  }, []);

  const testimonials: TestimonialItem[] = dbTestimonials.map((t) => ({
    id: t.id,
    quote: t.quote,
    clientNames: t.client_names,
    eventType: t.event_type,
    location: t.location || '',
    isPlaceholder: t.is_placeholder,
  }));

  const testimonialVideos = Array.from({ length: 6 }, (_, index) => ({
    src: `/assets/testimonials/testimonials${index + 1}.webp.mp4`,
    poster: `/assets/testimonials/posters/testimonials${index + 1}.jpg`,
  }));
  const testimonialImages = [
    '/assets/testimonials/testimonials7.webp.jpeg',
    '/assets/testimonials/testimonials8.webp.jpeg',
  ];
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);

  const pauseOtherVideos = (activeVideo: HTMLVideoElement) => {
    videoRefs.current.forEach((video) => {
      if (video && video !== activeVideo) video.pause();
    });
  };

  return (
    <>
      <SEO
        title="Client Testimonials & Credibility | D’Fabulous Yoruba Events"
        description="Explore verified client reflections, traditional ceremonial honors, and trust standards for D’Fabulous luxury Yoruba event hosting."
        canonicalUrl={`${window.location.origin}/experience/testimonials`}
      />

      <PageHero
        title="Client Reflections & Credibility"
        subtitle="Genuine reviews, ceremonial honors, and uncompromised standards of cultural elegance across the UK and worldwide."
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Experience', href: '/experience' },
          { label: 'Testimonials & Credibility' },
        ]}
      />

      {/* Featured testimonial and verified written reflections */}
      <section className="py-12 sm:py-20 bg-ivory-warm">
        <Container>
          <div className="max-w-3xl mb-8">
            <span className="text-xs font-semibold tracking-[0.25em] text-gold-luxury uppercase block mb-3 font-sans">
              CLIENT TESTIMONIALS
            </span>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-normal text-black-rich">
              Real Stories. Lasting Impressions.
            </h2>
            <p className="mt-3 text-charcoal-soft/80 leading-relaxed text-sm sm:text-base">
              Authentic client media from D’Fabulous celebrations, presented with sound and playback under your control.
            </p>
          </div>

          <figure className="group relative mx-auto max-w-5xl overflow-hidden rounded-md border border-burgundy-deep/15 bg-black-rich shadow-lg focus-within:ring-2 focus-within:ring-gold-luxury focus-within:ring-offset-2">
            <div className="relative aspect-video">
              <video
                ref={(video) => { videoRefs.current[0] = video; }}
                className="h-full w-full object-contain"
                controls
                controlsList="nodownload"
                preload="metadata"
                poster={testimonialVideos[0].poster}
                playsInline
                onPlay={(event) => pauseOtherVideos(event.currentTarget)}
                aria-label="Featured client testimonial video"
              >
                <source src={testimonialVideos[0].src} type="video/mp4" />
                Your browser does not support the testimonial video.
              </video>
              <span className="pointer-events-none absolute left-4 top-4 inline-flex items-center gap-2 bg-black-rich/80 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-gold-luxury">
                <Play className="h-3 w-3" aria-hidden="true" />
                Featured client story
              </span>
            </div>
          </figure>

          {testimonials.length > 0 && (
            <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((t) => (
                <TestimonialCard
                  key={t.id}
                  quote={t.quote}
                  clientNames={t.clientNames}
                  eventType={t.eventType}
                  location={t.location}
                  isPlaceholder={false}
                />
              ))}
            </div>
          )}
        </Container>
      </section>

      {/* Real testimonial media */}
      <section className="py-16 sm:py-24 bg-burgundy-dark text-ivory-warm">
        <Container>
          <div className="max-w-3xl mb-12">
            <span className="text-xs font-semibold tracking-[0.25em] text-gold-luxury uppercase block mb-3 font-sans">
              HEARD & SEEN
            </span>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-normal">
              Real Celebration Stories
            </h2>
            <p className="mt-3 text-champagne-soft/85 leading-relaxed text-sm sm:text-base">
              A selection of authentic client media from D’Fabulous celebrations. Sound remains user-controlled, with no forced autoplay.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonialVideos.slice(1).map((video, index) => {
              const videoIndex = index + 1;
              return (
              <figure key={video.src} className="group overflow-hidden rounded-md border border-gold-luxury/20 bg-black-rich focus-within:ring-2 focus-within:ring-gold-luxury focus-within:ring-offset-2">
                <div className="relative aspect-video">
                  <video
                    className="h-full w-full object-contain"
                    controls
                    controlsList="nodownload"
                    preload={index === 0 ? 'metadata' : 'none'}
                    poster={video.poster}
                    playsInline
                    ref={(element) => { videoRefs.current[videoIndex] = element; }}
                    onPlay={(event) => pauseOtherVideos(event.currentTarget)}
                    aria-label={`Client testimonial video ${videoIndex + 1}`}
                  >
                    <source src={video.src} type="video/mp4" />
                    Your browser does not support the testimonial video.
                  </video>
                  <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-2 bg-black-rich/80 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.2em] text-gold-luxury">
                    <Play className="h-3 w-3" aria-hidden="true" />
                    Client story {videoIndex + 1}
                  </div>
                </div>
              </figure>
              );
            })}
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            {testimonialImages.map((src, index) => (
              <figure key={src} className="border border-gold-luxury/20 bg-black-rich overflow-hidden">
                <img
                  src={src}
                  alt={`D’Fabulous client celebration image ${index + 1}`}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[4/3] h-full w-full object-cover"
                />
              </figure>
            ))}
          </div>
        </Container>
      </section>

      {/* Verification & Recognition Section */}
      <section className="py-16 sm:py-24 bg-ivory-warm border-y border-burgundy-deep/10">
        <Container>
          <div className="max-w-3xl mb-12 text-center mx-auto space-y-3">
            <span className="text-xs font-semibold tracking-[0.25em] text-gold-luxury uppercase block font-sans">
              CLIENT INTEGRITY
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-normal text-black-rich">
              Authenticity Before Applause
            </h2>
            <p className="text-charcoal-soft/80 text-sm sm:text-base leading-relaxed">
              Written reviews are published only when they are verified and shared with client consent. Our recognition media is presented on the About page without added claims.
            </p>
          </div>
        </Container>
      </section>

      {/* Verification & Truthfulness Assurance */}
      <section className="py-16 sm:py-20 bg-ivory-warm">
        <Container>
          <div className="max-w-4xl mx-auto p-8 sm:p-12 border border-burgundy-deep/15 bg-ivory-warm flex flex-col sm:flex-row items-start gap-6">
            <div className="p-4 bg-burgundy-deep/10 text-burgundy-deep shrink-0">
              <ShieldCheck className="w-10 h-10" />
            </div>
            <div className="space-y-3">
              <h3 className="font-display text-2xl font-normal text-burgundy-deep">
                Our Commitment to Uncompromised Truthfulness
              </h3>
              <p className="text-charcoal-soft/80 text-sm leading-relaxed">
                In strict accordance with D’Fabulous brand integrity, we never publish fabricated testimonials, artificial star ratings, or unverified awards. Every client review published on this platform is independently verified and collected directly with client consent.
              </p>
              <div className="pt-2 flex items-center gap-2 text-xs font-semibold text-burgundy-deep">
                <CheckCircle2 className="w-4 h-4 text-gold-luxury shrink-0" />
                <span>Verified Client Feedback Protocol Active</span>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Final Booking CTA */}
      <section className="py-16 bg-burgundy-dark text-ivory-warm">
        <Container>
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h2 className="font-display text-3xl sm:text-4xl font-normal text-ivory-warm">
              Experience the D’Fabulous Distinction
            </h2>
            <p className="text-champagne-soft/85 leading-relaxed text-base">
              Secure ceremonial guidance, Alaga hosting, or wedding reception direction for your upcoming celebration.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <Button variant="primary" href="/book">
                RESERVE YOUR EVENT DATE
              </Button>
              <Button variant="outline-light" href="/contact">
                CONTACT CONSULTATION OFFICE
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
};
