/**
 * HomeShell Component
 * Production-ready Homepage Structure for D’Fabulous Luxury Yoruba Events.
 * Preserves header, navigation, and brand system while structuring all 9 required sections in exact order with premium editorial UI.
 */

import React, { useEffect, useState } from 'react';
import { SEO } from '../components/SEO';
import { Container } from '../components/Container';
import { SectionHeading } from '../components/SectionHeading';
import { Button } from '../components/Button';
import { HeroCarousel } from '../components/HeroCarousel';
import { ServiceCard } from '../components/ServiceCard';
import { GalleryCard } from '../components/GalleryCard';
import { TestimonialCard } from '../components/TestimonialCard';
import { FaqAccordion, FaqItem } from '../components/FaqAccordion';
import { SERVICES_LIST } from '../data/brand';
import { getGalleryItems, getTestimonials, DbGalleryItem, DbTestimonial } from '../lib/db';
import { Award, Globe, ShieldCheck, Crown, Sparkles } from 'lucide-react';

export const HomeShell: React.FC = () => {
  const [dbGallery, setDbGallery] = useState<DbGalleryItem[]>([]);
  const [dbTestimonials, setDbTestimonials] = useState<DbTestimonial[]>([]);

  useEffect(() => {
    getGalleryItems().then((items) => {
      if (items && items.length > 0) setDbGallery(items.slice(0, 6));
    });
    getTestimonials().then((items) => {
      if (items && items.length > 0) setDbTestimonials(items.slice(0, 3));
    });
  }, []);
  return (
    <>
      <SEO
        title="D’Fabulous | Luxury Yoruba Event Host & Cultural Personality"
        description="UK-based luxury event personality and cultural host for Nigerian/Yoruba traditional engagements, weddings, private events, and destination celebrations."
      />

      {/* =========================================================
          SECTION 1: HERO SECTION
          ========================================================= */}
      <HeroCarousel />

      {/* =========================================================
          SECTION 2: INTRODUCTION / BRAND STATEMENT
          ========================================================= */}
      <section className="py-20 sm:py-28 bg-ivory-warm border-b border-burgundy-deep/10">
        <Container>
          <div className="max-w-4xl mx-auto text-center">
            <span className="text-xs font-semibold tracking-[0.25em] text-gold-luxury uppercase block mb-3 font-sans">
              HERITAGE & AUTHORITY
            </span>

            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl text-black-rich font-normal leading-tight mb-6">
              The Gold Standard in Cultural Celebrations
            </h2>

            <p className="text-base sm:text-lg text-charcoal-soft/85 font-sans font-light leading-relaxed mb-12 max-w-3xl mx-auto">
              D’Fabulous brings unmatched poise, Yoruba linguistic fluency, and royal ceremonial authority to luxury traditional engagements and wedding receptions. Grounded in ancestral respect and elevated by contemporary event coordination, every ritual is executed with precision, warmth, and festive splendour.
            </p>

            {/* 3 Brand Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8 border-t border-burgundy-deep/15 text-left">
              <div className="p-6 bg-ivory-warm border border-burgundy-deep/15 hover:border-gold-luxury/50 transition-colors duration-300">
                <Crown className="w-6 h-6 text-gold-luxury mb-4" />
                <h3 className="font-display text-xl font-normal text-black-rich mb-2">
                  Cultural Authenticity
                </h3>
                <p className="text-xs sm:text-sm text-charcoal-soft/80 font-light leading-relaxed">
                  Respecting ancestral protocols with fluent Yoruba oratory, traditional prostration guidance, and authentic family honors.
                </p>
              </div>

              <div className="p-6 bg-ivory-warm border border-burgundy-deep/15 hover:border-gold-luxury/50 transition-colors duration-300">
                <Sparkles className="w-6 h-6 text-gold-luxury mb-4" />
                <h3 className="font-display text-xl font-normal text-black-rich mb-2">
                  Ceremonial Poise
                </h3>
                <p className="text-xs sm:text-sm text-charcoal-soft/80 font-light leading-relaxed">
                  Regal presence, opulent traditional attire presentation, and refined audience command that keeps guests enthralled.
                </p>
              </div>

              <div className="p-6 bg-ivory-warm border border-burgundy-deep/15 hover:border-gold-luxury/50 transition-colors duration-300">
                <ShieldCheck className="w-6 h-6 text-gold-luxury mb-4" />
                <h3 className="font-display text-xl font-normal text-black-rich mb-2">
                  Seamless Coordination
                </h3>
                <p className="text-xs sm:text-sm text-charcoal-soft/80 font-light leading-relaxed">
                  End-to-end timing alignment with wedding planners, caterers, and vendors to ensure an effortless event flow.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* =========================================================
          SECTION 3: SERVICES
          ========================================================= */}
      <section className="py-20 sm:py-28 bg-ivory-warm border-b border-burgundy-deep/10">
        <Container>
          <SectionHeading
            eyebrow="BESPOKE CEREMONIAL OFFERINGS"
            title="Core & Specialist Services"
            description="Tailored ceremonial direction, traditional Yoruba family representation, and high-energy wedding reception hosting."
            align="left"
            className="mb-12"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {SERVICES_LIST.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        </Container>
      </section>

      {/* =========================================================
          SECTION 4: THE D’FABULOUS EXPERIENCE
          ========================================================= */}
      <section className="py-20 sm:py-28 bg-burgundy-dark text-ivory-warm relative overflow-hidden">
        <div className="absolute inset-0 cultural-pattern-subtle opacity-10 pointer-events-none" aria-hidden="true" />

        <Container className="relative z-10">
          <div className="max-w-3xl mb-16">
            <span className="text-xs font-semibold tracking-[0.25em] text-gold-luxury uppercase block mb-3 font-sans">
              THE DISTINCTIVE STANDARD
            </span>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-normal text-ivory-warm leading-tight mb-4">
              What Defines The D’Fabulous Experience
            </h2>
            <p className="text-base sm:text-lg text-champagne-soft/80 font-light leading-relaxed">
              Beyond hosting, D’Fabulous delivers an immersive cultural journey where family honour, joyful celebration, and flawless execution converge.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-burgundy-deep/70 border border-gold-luxury/30 p-8 sm:p-10 hover:border-gold-luxury/60 transition-colors">
              <span className="text-xs font-mono text-gold-luxury uppercase tracking-widest block mb-2">
                01 / PROTOCOL COMMAND
              </span>
              <h3 className="font-display text-2xl text-ivory-warm mb-3 font-normal">
                Cultural Authority & Protocol Mastery
              </h3>
              <p className="text-xs sm:text-sm text-champagne-soft/85 font-light leading-relaxed">
                Flawless navigation of ancestral family introductions, groom family greetings, Oriba ceremonies, and traditional dowry presentations without compromising dignity or timing.
              </p>
            </div>

            <div className="bg-burgundy-deep/70 border border-gold-luxury/30 p-8 sm:p-10 hover:border-gold-luxury/60 transition-colors">
              <span className="text-xs font-mono text-gold-luxury uppercase tracking-widest block mb-2">
                02 / VISUAL ELEGANCE
              </span>
              <h3 className="font-display text-2xl text-ivory-warm mb-3 font-normal">
                Regal Styling & Stage Presence
              </h3>
              <p className="text-xs sm:text-sm text-champagne-soft/85 font-light leading-relaxed">
                Refined personal presentation, immaculate traditional Aso-Oke attire coordination, and a warm, commanding stage presence that honors both families.
              </p>
            </div>

            <div className="bg-burgundy-deep/70 border border-gold-luxury/30 p-8 sm:p-10 hover:border-gold-luxury/60 transition-colors">
              <span className="text-xs font-mono text-gold-luxury uppercase tracking-widest block mb-2">
                03 / CROWD HARMONY
              </span>
              <h3 className="font-display text-2xl text-ivory-warm mb-3 font-normal">
                High-Energy Audience Engagement
              </h3>
              <p className="text-xs sm:text-sm text-champagne-soft/85 font-light leading-relaxed">
                Bridging generational and cultural backgrounds seamlessly—engaging elders with deep respect while keeping young guests energized and celebrating.
              </p>
            </div>

            <div className="bg-burgundy-deep/70 border border-gold-luxury/30 p-8 sm:p-10 hover:border-gold-luxury/60 transition-colors">
              <span className="text-xs font-mono text-gold-luxury uppercase tracking-widest block mb-2">
                04 / TIMELINE PRECISION
              </span>
              <h3 className="font-display text-2xl text-ivory-warm mb-3 font-normal">
                Professional Event Timing
              </h3>
              <p className="text-xs sm:text-sm text-champagne-soft/85 font-light leading-relaxed">
                Meticulous schedule management that respects wedding planners, venue curfews, and vendor transitions without rushing ceremonial moments.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* =========================================================
          SECTION 5: FEATURED EXPERIENCE / GALLERY PREVIEW
          ========================================================= */}
      <section className="py-20 sm:py-28 bg-ivory-warm border-b border-burgundy-deep/10">
        <Container>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <SectionHeading
              eyebrow="CURATED MOMENTS"
              title="Gallery of Celebrations"
              description="Visual highlights capturing the joy, reverence, and vibrant energy of luxury Yoruba traditional engagements and receptions."
              align="left"
            />
            <Button variant="secondary" href="/gallery" className="shrink-0">
              EXPLORE FULL GALLERY
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {dbGallery.map((item) => (
              <GalleryCard
                key={item.id}
                imageSrc={item.image_url}
                altText={item.alt_text || item.title}
                caption={item.caption}
                category="Gallery"
                isPlaceholder={false}
              />
            ))}
          </div>
        </Container>
      </section>

      {/* =========================================================
          SECTION 6: DESTINATION EVENTS
          ========================================================= */}
      <section className="py-20 sm:py-28 bg-burgundy-dark text-ivory-warm relative overflow-hidden border-t border-gold-luxury/20">
        <Container>
          <div className="max-w-4xl mx-auto text-center">
            <Globe className="w-10 h-10 text-gold-luxury mx-auto mb-4" />
            <span className="text-xs font-semibold tracking-[0.25em] text-gold-luxury uppercase block mb-3 font-sans">
              GLOBAL CULTURAL CELEBRATIONS
            </span>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-normal text-ivory-warm leading-tight mb-6">
              Destination Yoruba Events Across Europe & Worldwide
            </h2>
            <p className="text-base sm:text-lg text-champagne-soft/85 font-light leading-relaxed mb-8 max-w-2xl mx-auto">
              For couples celebrating across international borders—from European châteaux to tropical destination resorts—D’Fabulous brings seamless Yoruba ceremonial leadership to any location worldwide. Combining international travel capability with uncompromised cultural authenticity.
            </p>
            <Button variant="primary" size="lg" href="/experience/destination-events">
              DISCOVER DESTINATION SERVICES
            </Button>
          </div>
        </Container>
      </section>

      {/* =========================================================
          SECTION 7: TESTIMONIALS PREVIEW
          ========================================================= */}
      <section className="py-20 sm:py-28 bg-ivory-warm border-b border-burgundy-deep/10">
        <Container>
          <SectionHeading
            eyebrow="CLIENT REFLECTIONS"
            title="Verified Client Testimonials"
            description="Reserved for verified reflections from couples, families, and wedding planners who have experienced D’Fabulous."
            align="left"
            className="mb-12"
          />

          {dbTestimonials.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {dbTestimonials.map((t) => (
                <TestimonialCard
                  key={t.id}
                  quote={t.quote}
                  clientNames={t.client_names}
                  eventType={t.event_type}
                  location={t.location}
                  isPlaceholder={false}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-none border border-burgundy-deep/15 bg-white p-8 sm:p-12 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center border border-gold-luxury/30 bg-ivory-warm text-gold-luxury">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <h3 className="mt-6 font-display text-2xl text-burgundy-deep">Verified client testimonials are being prepared</h3>
              <p className="mt-3 mx-auto max-w-2xl text-sm leading-relaxed text-charcoal-soft/80">
                We currently have no published testimonials to display. This page remains intentionally free of fabricated reviews or placeholder client content.
              </p>
            </div>
          )}
        </Container>
      </section>

      {/* =========================================================
          SECTION 8: AWARDS / CREDIBILITY
          ========================================================= */}
      <section className="py-20 sm:py-28 bg-ivory-warm border-b border-burgundy-deep/10">
        <Container>
          <SectionHeading
            eyebrow="CREDIBILITY & RECOGNITION"
            title="Awards, Honors & Media Features"
            description="Official recognitions and industry honors celebrating excellence in cultural hosting and luxury event direction."
            align="left"
            className="mb-12"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div className="p-8 bg-ivory-warm border border-burgundy-deep/15 text-center flex flex-col items-center justify-center hover:border-gold-luxury/50 transition-colors">
              <Award className="w-10 h-10 text-gold-luxury mb-4" />
              <h3 className="font-display text-xl font-normal text-black-rich mb-2">
                Cultural Host Distinction
              </h3>
              <p className="text-xs text-charcoal-soft/70 font-light uppercase tracking-wider font-mono">
                Client-Verified Recognition
              </p>
            </div>

            <div className="p-8 bg-ivory-warm border border-burgundy-deep/15 text-center flex flex-col items-center justify-center hover:border-gold-luxury/50 transition-colors">
              <Crown className="w-10 h-10 text-gold-luxury mb-4" />
              <h3 className="font-display text-xl font-normal text-black-rich mb-2">
                Traditional Ceremonial Honors
              </h3>
              <p className="text-xs text-charcoal-soft/70 font-light uppercase tracking-wider font-mono">
                Shared Upon Confirmation
              </p>
            </div>

            <div className="p-8 bg-ivory-warm border border-burgundy-deep/15 text-center flex flex-col items-center justify-center hover:border-gold-luxury/50 transition-colors">
              <Sparkles className="w-10 h-10 text-gold-luxury mb-4" />
              <h3 className="font-display text-xl font-medium text-black-rich mb-2">
                Luxury Event Excellence
              </h3>
              <p className="text-xs text-charcoal-soft/70 font-light uppercase tracking-wider font-mono">
                Published with Consent
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* =========================================================
          SECTION 9: FREQUENTLY ASKED QUESTIONS PREVIEW
          ========================================================= */}
      <section className="py-20 sm:py-28 bg-ivory-warm border-b border-burgundy-deep/10">
        <Container>
          <div className="max-w-3xl mx-auto text-center mb-12">
            <span className="text-xs font-semibold tracking-[0.25em] text-gold-luxury uppercase block mb-2 font-sans">
              FREQUENTLY ASKED QUESTIONS
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-normal text-black-rich mb-4">
              Common Ceremonial Enquiries
            </h2>
            <p className="text-charcoal-soft/80 text-sm sm:text-base leading-relaxed">
              Find answers to core questions regarding Yoruba traditional engagements, Alaga hosting, wedding MC direction, and travel logistics.
            </p>
          </div>

          <div className="max-w-4xl mx-auto space-y-8">
            <FaqAccordion
              items={[
                {
                  id: 'q1',
                  question: 'What core services does D’Fabulous provide?',
                  answer: 'D’Fabulous specializes in luxury Yoruba traditional engagement hosting (Alaga Iduro and Alaga Ijoko), high-energy wedding reception Master of Ceremonies (MC), engagement protocol coordination, private milestone event hosting, and Eru Iyawo dowry gift presentation styling.',
                },
                {
                  id: 'q2',
                  question: 'What is the difference between Alaga Iduro and Alaga Ijoko?',
                  answer: 'Alaga Iduro represents the groom’s family (leading prostration protocols, engagement letters, and formal proposal), while Alaga Ijoko represents and hosts on behalf of the bride’s family (receiving the delegation, inspecting dowry gifts, and guiding bridal entrance blessings).',
                },
                {
                  id: 'q3',
                  question: 'Does D’Fabulous travel internationally for destination weddings?',
                  answer: 'Yes. D’Fabulous travels across the UK, Nigeria, mainland Europe, and international destinations for Yoruba traditional engagements and wedding receptions.',
                },
                {
                  id: 'q4',
                  question: 'How far in advance should we book D’Fabulous?',
                  answer: 'Clients are advised to reserve dates 6 to 12 months in advance during peak wedding seasons, though short-notice bookings are welcomed subject to calendar availability.',
                },
              ]}
              defaultOpenId="q1"
            />

            <div className="text-center pt-4">
              <Button variant="outline" href="/faq">
                VIEW ALL FREQUENTLY ASKED QUESTIONS
              </Button>
            </div>
          </div>
        </Container>
      </section>

      {/* =========================================================
          SECTION 10: FINAL BOOKING CTA
          ========================================================= */}
      <section className="py-20 sm:py-28 bg-burgundy-dark text-ivory-warm relative overflow-hidden border-t border-gold-luxury/30">
        <div className="absolute inset-0 cultural-pattern-subtle opacity-10 pointer-events-none" aria-hidden="true" />

        <Container className="relative z-10 text-center max-w-4xl mx-auto">
          <span className="text-xs font-semibold tracking-[0.25em] text-gold-luxury uppercase block mb-3 font-sans">
            BEGIN YOUR CELEBRATION JOURNEY
          </span>

          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal text-ivory-warm leading-tight mb-6">
            Plan Your Celebration With D’Fabulous
          </h2>

          <p className="text-base sm:text-lg text-champagne-soft/90 font-light leading-relaxed max-w-2xl mx-auto mb-10">
            Inquire today regarding date availability, ceremonial packages, and bespoke event hosting for your upcoming Yoruba traditional engagement or wedding reception.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button variant="primary" size="lg" href="/book">
              BOOK D’FABULOUS
            </Button>
            <Button variant="outline-light" size="lg" href="/contact">
              CONTACT CONSULTATIONS
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
};

