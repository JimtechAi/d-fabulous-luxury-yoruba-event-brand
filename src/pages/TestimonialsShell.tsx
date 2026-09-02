/**
 * TestimonialsShell Component
 * Dedicated page shell for verified client reflections, testimonials, awards, and credibility marks.
 */

import React, { useEffect, useState } from 'react';
import { Container } from '../components/Container';
import { PageHero } from '../components/PageHero';
import { TestimonialCard } from '../components/TestimonialCard';
import { Button } from '../components/Button';
import { SEO } from '../components/SEO';
import { getTestimonials, DbTestimonial } from '../lib/db';
import { Award, Crown, Sparkles, ShieldCheck, Heart, MessageSquare, CheckCircle2 } from 'lucide-react';

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

  const recognitionItems = [
    {
      icon: Award,
      title: 'Cultural Host Distinction',
      badge: 'Client-Verified Recognition',
      description: 'Recognition for distinguished Yoruba cultural representation and elegant ceremonial leadership in luxury event environments.',
    },
    {
      icon: Crown,
      title: 'Traditional Ceremonial Honors',
      badge: 'Shared Upon Confirmation',
      description: 'Celebration of expertise in ancestral Yoruba marital protocols, family deference, and ceremonial timing.',
    },
    {
      icon: Sparkles,
      title: 'Luxury Event Excellence',
      badge: 'Published with Consent',
      description: 'Acknowledged for seamless event flow, refined presence, and high-energy reception hosting for discerning families.',
    },
  ];

  return (
    <>
      <SEO
        title="Client Testimonials & Credibility | D’Fabulous Yoruba Events"
        description="Explore verified client reflections, traditional ceremonial honors, and trust standards for D’Fabulous luxury Yoruba event hosting."
        canonicalUrl={`${window.location.origin}/testimonials`}
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

      {/* Main Testimonials Section */}
      <section className="py-16 sm:py-24 bg-ivory-warm">
        <Container>
          <div className="max-w-3xl mb-12">
            <span className="text-xs font-semibold tracking-[0.25em] text-gold-luxury uppercase block mb-3 font-sans">
              CLIENT TRUST
            </span>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-normal text-black-rich">
              Verified Client Reflections
            </h2>
            <p className="mt-3 text-charcoal-soft/80 leading-relaxed text-sm sm:text-base">
              To preserve authentic client privacy and complete truthfulness, all reviews below are reserved for verified client submissions following completed events.
            </p>
          </div>

          {testimonials.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
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
          ) : (
            <div className="rounded-none border border-burgundy-deep/15 bg-white p-8 sm:p-12 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center border border-gold-luxury/30 bg-ivory-warm text-gold-luxury">
                <MessageSquare className="h-7 w-7" />
              </div>
              <h3 className="mt-6 font-display text-2xl text-burgundy-deep">Client testimonials will be published here</h3>
              <p className="mt-3 mx-auto max-w-2xl text-sm leading-relaxed text-charcoal-soft/80">
                There are no verified reviews available yet. We do not publish placeholder testimonials or fabricated client feedback.
              </p>
            </div>
          )}
        </Container>
      </section>

      {/* Credibility & Recognition Section */}
      <section className="py-16 sm:py-24 bg-ivory-warm border-y border-burgundy-deep/10">
        <Container>
          <div className="max-w-3xl mb-12 text-center mx-auto space-y-3">
            <span className="text-xs font-semibold tracking-[0.25em] text-gold-luxury uppercase block font-sans">
              HONORS & RECOGNITION
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-normal text-black-rich">
              Ceremonial Excellence & Distinction
            </h2>
            <p className="text-charcoal-soft/80 text-sm sm:text-base leading-relaxed">
              Official recognitions celebrating excellence in traditional Yoruba oratory, wedding hosting, and event direction.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {recognitionItems.map((item, idx) => {
              const IconComp = item.icon;
              return (
                <div
                  key={idx}
                  className="group p-8 bg-ivory-warm border border-burgundy-deep/15 text-center flex flex-col items-center justify-between space-y-4 hover:border-gold-luxury/50 transition-colors duration-300"
                >
                  <div className="p-4 bg-burgundy-deep text-gold-luxury">
                    <IconComp className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-normal text-burgundy-deep">
                      {item.title}
                    </h3>
                    <span className="inline-block mt-2 px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-widest text-gold-luxury bg-burgundy-deep/5 border border-burgundy-deep/15">
                      {item.badge}
                    </span>
                    <p className="mt-3 text-xs text-charcoal-soft/80 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
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
