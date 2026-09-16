/**
 * AwardsShell Component
 * Dedicated recognition page for supplied D'Fabulous award media.
 */

import React from 'react';
import { Award, CheckCircle2 } from 'lucide-react';
import { Container } from '../components/Container';
import { PageHero } from '../components/PageHero';
import { Button } from '../components/Button';
import { SEO } from '../components/SEO';

const awardImages = [
  {
    src: '/assets/award/award-image1.webp.jpeg',
    alt: 'D’Fabulous award recognition image one',
  },
  {
    src: '/assets/award/award-image2.webp.jpeg',
    alt: 'D’Fabulous award recognition image two',
  },
];

export const AwardsShell: React.FC = () => {
  return (
    <>
      <SEO
        title="Awards & Recognition | D’Fabulous Luxury Yoruba Events"
        description="Explore D’Fabulous awards and recognition, celebrating excellence in Yoruba traditional weddings, cultural ceremonies and luxury event experiences."
        canonicalUrl={`${window.location.origin}/experience/awards`}
      />

      <PageHero
        eyebrow="AWARDS & RECOGNITION"
        title="Recognition of Excellence"
        subtitle="A celebration of the trust, excellence and cultural impact behind the D’Fabulous experience."
        compact
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Experience', href: '/experience' },
          { label: 'Awards & Recognition' },
        ]}
      />

      <section className="bg-ivory-warm py-12 sm:py-16 lg:py-20" aria-labelledby="recognition-gallery-heading">
        <Container size="wide">
          <div className="mx-auto mb-8 max-w-3xl text-center lg:mb-10">
            <span className="mb-3 block text-xs font-semibold tracking-[0.25em] text-gold-luxury uppercase font-sans">
              THE ARCHIVE
            </span>
            <h2 id="recognition-gallery-heading" className="font-display text-3xl font-normal text-black-rich sm:text-4xl">
              Awards & Recognition
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-charcoal-soft/80 sm:text-base">
              Original recognition media shared by D’Fabulous, presented with its visual content preserved.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8">
            {awardImages.map((award, index) => (
              <figure key={award.src} className="group overflow-hidden border border-burgundy-deep/15 bg-white shadow-sm transition-shadow duration-300 hover:shadow-lg focus-within:ring-2 focus-within:ring-gold-luxury focus-within:ring-offset-2">
                <a
                  href={award.src}
                  target="_blank"
                  rel="noreferrer"
                  className="block focus:outline-none"
                  aria-label={`Open award recognition image ${index + 1} in a new tab`}
                >
                  <img
                    src={award.src}
                    alt={award.alt}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    decoding={index === 0 ? 'sync' : 'async'}
                    className="aspect-[4/3] h-full w-full object-contain bg-white transition-transform duration-500 group-hover:scale-[1.01]"
                  />
                </a>
              </figure>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-y border-burgundy-deep/10 bg-ivory-warm py-12 sm:py-16 lg:py-20" aria-labelledby="credibility-heading">
        <Container>
          <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-14">
            <div className="lg:col-span-4">
              <div className="inline-flex bg-burgundy-deep p-4 text-gold-luxury" aria-hidden="true">
                <Award className="h-8 w-8" />
              </div>
              <h2 id="credibility-heading" className="mt-6 font-display text-3xl font-normal text-burgundy-deep sm:text-4xl">
                Excellence With Intention
              </h2>
            </div>
            <div className="max-w-3xl space-y-5 text-sm leading-7 text-charcoal-soft/85 sm:text-base lg:col-span-8">
              <p>
                D’Fabulous values excellence, professionalism, cultural authenticity and memorable client experiences in every celebration it supports.
              </p>
              <p>
                These recognition materials are part of the D’Fabulous story. They are presented as supplied, without adding award names, organisations, dates or claims beyond what the original images communicate.
              </p>
              <div className="flex items-start gap-3 text-sm font-medium text-burgundy-deep">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-gold-luxury" aria-hidden="true" />
                <span>Commitment to culturally grounded, carefully directed celebrations.</span>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="bg-burgundy-dark py-12 text-ivory-warm sm:py-16">
        <Container>
          <div className="mx-auto max-w-3xl space-y-6 text-center">
            <h2 className="font-display text-3xl font-normal text-ivory-warm sm:text-4xl">
              Bring D’Fabulous to Your Celebration
            </h2>
            <p className="leading-relaxed text-champagne-soft/85">
              Begin a considered conversation about your Yoruba traditional wedding, cultural ceremony or luxury event experience.
            </p>
            <Button variant="primary" href="/book">
              BOOK D’FABULOUS
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
};
