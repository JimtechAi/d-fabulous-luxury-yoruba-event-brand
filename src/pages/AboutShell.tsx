/**
 * AboutShell Component
 * Comprehensive brand story, heritage, cultural authority, and ceremonial philosophy.
 */

import React from 'react';
import { Container } from '../components/Container';
import { getResponsiveImageProps } from '../lib/media';
import { PageHero } from '../components/PageHero';
import { Button } from '../components/Button';
import { SEO } from '../components/SEO';
import { BRAND_INFO } from '../data/brand';
import { Crown, Sparkles, ShieldCheck, Globe, Heart, Clock, Award, Users } from 'lucide-react';

export const AboutShell: React.FC = () => {
  return (
    <>
      <SEO
        title="About D’Fabulous | Luxury Yoruba Event Hosting & Heritage"
        description="Learn about D’Fabulous heritage, ceremonial authority, and bespoke Yoruba engagement and wedding hosting across the UK, Europe, and destination celebrations worldwide."
      />

      <PageHero
        title="Heritage & Ceremonial Authority"
        subtitle="The gold standard in luxury Yoruba traditional engagements, cultural spokesperson leadership, and high-energy wedding reception direction."
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'About Us' },
        ]}
      />

      {/* Main Narrative Section */}
      <section className="py-16 sm:py-24 bg-ivory-warm">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            
            {/* Left Column: Brand Story */}
            <div className="lg:col-span-7 space-y-6">
              <span className="text-xs font-semibold tracking-[0.25em] text-gold-luxury uppercase block font-sans">
                THE D’FABULOUS HERITAGE
              </span>
              <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-normal text-black-rich leading-tight">
                Meet Precious Adams
              </h2>
              <p className="text-charcoal-soft/85 leading-relaxed text-base sm:text-lg font-sans font-light">
                The person behind D’Fabulous Luxury Yoruba Events.
              </p>
              <h3 className="font-display text-xl sm:text-2xl font-normal text-burgundy-deep leading-snug">
                Honouring Yoruba Heritage with Modern Poise & Precision
              </h3>
              <p className="text-charcoal-soft/85 leading-relaxed text-base sm:text-lg font-sans font-light">
                D’Fabulous represents the pinnacle of Yoruba ceremonial hosting. We preserve the sacred dignity of traditional Yoruba engagements—the <em className="text-burgundy-deep font-medium">Igbeyawo</em>—while elevating event direction with contemporary poise, structured timeline management, and regal stage presence.
              </p>
              <p className="text-charcoal-soft/80 leading-relaxed text-base font-sans font-light">
                Grounded in deep respect for family elders, ancestral protocols, and Yoruba linguistic artistry, D’Fabulous serves as a trusted bridge between families, generations, and cultures during milestone marital celebrations across the United Kingdom, Europe, Nigeria, and worldwide destination venues.
              </p>

              <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-ivory-warm border border-burgundy-deep/15 hover:border-gold-luxury/50 transition-colors duration-300 flex items-start gap-3">
                  <div className="p-2 bg-burgundy-deep/10 text-burgundy-deep shrink-0">
                    <Crown className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-display text-base font-normal text-burgundy-deep">Bilingual Oratory</h4>
                    <p className="text-xs text-charcoal-soft/80 mt-1">Fluent Yoruba proverbs & polished English hosting</p>
                  </div>
                </div>

                <div className="p-4 bg-ivory-warm border border-burgundy-deep/15 hover:border-gold-luxury/50 transition-colors duration-300 flex items-start gap-3">
                  <div className="p-2 bg-burgundy-deep/10 text-burgundy-deep shrink-0">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-display text-base font-normal text-burgundy-deep">Global Capability</h4>
                    <p className="text-xs text-charcoal-soft/80 mt-1">UK headquarters with worldwide destination experience</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Portrait + Values Highlight Card */}
            <div className="lg:col-span-5 space-y-6">
              <div className="overflow-hidden border border-burgundy-deep/15 bg-ivory-warm">
                <div className="relative aspect-[4/5] bg-burgundy-dark/10">
                  <img
                    src="/assets/about/about.webp.jpeg"
                    {...getResponsiveImageProps('/assets/about/about.webp.jpeg', '(max-width: 1024px) 100vw, 42vw')}
                    alt="Precious Adams, the person behind D’Fabulous Luxury Yoruba Events"
                    loading="eager"
                    decoding="sync"
                    fetchPriority="high"
                    className="h-full w-full object-cover object-top"
                  />
                </div>
              </div>

              <div className="bg-burgundy-deep text-ivory-warm p-8 sm:p-10 border border-gold-luxury/30 space-y-6">
                <h3 className="font-display text-2xl font-normal text-ivory-warm">
                  Our Core Pillars
                </h3>
                <p className="text-champagne-soft/90 text-sm leading-relaxed">
                  Every event guided by D’Fabulous is anchored by five unyielding commitments:
                </p>

                <ul className="space-y-4 text-sm">
                  {BRAND_INFO.values.map((val, idx) => (
                    <li key={idx} className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-gold-luxury/20 text-gold-luxury flex items-center justify-center font-mono text-xs font-bold shrink-0">
                        {idx + 1}
                      </div>
                      <span className="font-medium text-ivory-warm">{val}</span>
                    </li>
                  ))}
                </ul>

                <div className="pt-4 border-t border-gold-luxury/20">
                  <Button variant="primary" href="/book" className="w-full justify-center">
                    RESERVE YOUR EVENT DATE
                  </Button>
                </div>
              </div>
            </div>

          </div>
        </Container>
      </section>

      {/* Distinction Section: Alaga Iduro vs Alaga Ijoko Mastery */}
      <section className="py-16 sm:py-24 bg-ivory-warm border-y border-burgundy-deep/10">
        <Container className="space-y-12">
          <div className="max-w-3xl mx-auto text-center space-y-4">
            <span className="text-xs font-semibold tracking-[0.25em] text-gold-luxury uppercase block font-sans">
              CEREMONIAL MASTERY
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-normal text-black-rich">
              The Dual Alaga Roles Explained
            </h2>
            <p className="text-charcoal-soft/80 leading-relaxed text-base">
              In traditional Yoruba engagement ceremonies, two distinct spokespersons lead the proceedings to represent both families with respect, humor, and cultural honor.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="p-8 bg-ivory-warm border border-burgundy-deep/15 hover:border-gold-luxury/50 transition-colors duration-300 space-y-4">
              <div className="inline-flex p-3 bg-burgundy-deep text-gold-luxury">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="font-display text-xl sm:text-2xl font-normal text-burgundy-deep">
                Alaga Iduro (Groom’s Representative)
              </h3>
              <p className="text-charcoal-soft/85 text-sm leading-relaxed">
                As Alaga Iduro, D’Fabulous serves as the official spokesperson for the groom’s family. We lead the delegation with respectful greetings (<em className="text-burgundy-deep font-medium">Oriba</em>), articulate the groom’s noble intentions, present formal proposal letters, and guide prostration rituals with humility and dignity.
              </p>
            </div>

            <div className="p-8 bg-ivory-warm border border-burgundy-deep/15 hover:border-gold-luxury/50 transition-colors duration-300 space-y-4">
              <div className="inline-flex p-3 bg-burgundy-deep text-gold-luxury">
                <Crown className="w-6 h-6" />
              </div>
              <h3 className="font-display text-xl sm:text-2xl font-normal text-burgundy-deep">
                Alaga Ijoko (Bride’s Host & Custodian)
              </h3>
              <p className="text-charcoal-soft/85 text-sm leading-relaxed">
                As Alaga Ijoko, D’Fabulous acts as the official custodian and host for the bride’s family. We welcome the groom’s delegation, oversee dowry item inspections (<em className="text-burgundy-deep font-medium">Eru Iyawo</em>), coordinate the bride’s royal entrance, and facilitate ancestral family blessings.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-ivory-warm">
        <Container>
          <div className="p-8 sm:p-12 border border-gold-luxury/30 bg-burgundy-deep text-ivory-warm text-center space-y-6">
            <h3 className="font-display text-2xl sm:text-3xl font-normal text-ivory-warm">
              Begin Your Cultural Celebration Journey
            </h3>
            <p className="text-champagne-soft/90 max-w-2xl mx-auto leading-relaxed">
              Consult with our booking office to discuss your event dates, venue location, and customized Yoruba engagement hosting requirements.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <Button variant="primary" href="/book">
                BOOK CONSULTATION
              </Button>
              <Button variant="outline-light" href="/contact">
                DIRECT CONTACT ENQUIRY
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
};
