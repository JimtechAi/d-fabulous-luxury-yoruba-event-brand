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

  const defaultTestimonials: TestimonialItem[] = [
    {
      id: '1',
      quote: 'Placeholder: Verified Client Reflection for Traditional Engagement hosting in London. Full client review will be displayed upon verification.',
      clientNames: 'Client Reflection Pending Verification',
      eventType: 'Traditional Engagement (Alaga Ijoko)',
      location: 'London, UK',
      isPlaceholder: true,
    },
    {
      id: '2',
      quote: 'Placeholder: Verified Client Reflection for Wedding MC and Reception Direction. Full client review will be displayed upon verification.',
      clientNames: 'Client Reflection Pending Verification',
      eventType: 'Wedding Reception MC',
      location: 'Kent, UK',
      isPlaceholder: true,
    },
    {
      id: '3',
      quote: 'Placeholder: Verified Client Reflection for Destination Yoruba Ceremony hosting. Full client review will be displayed upon verification.',
      clientNames: 'Client Reflection Pending Verification',
      eventType: 'Destination Yoruba Event',
      location: 'Europe Destination',
      isPlaceholder: true,
    },
    {
      id: '4',
      quote: 'Placeholder: Verified Client Reflection for Eru Iyawo Dowry Presentation & Protocol Direction. Full client review will be displayed upon verification.',
      clientNames: 'Client Reflection Pending Verification',
      eventType: 'Eru Iyawo Presentation',
      location: 'Greater London, UK',
      isPlaceholder: true,
    },
    {
      id: '5',
      quote: 'Placeholder: Verified Client Reflection for Dual Alaga Iduro & Alaga Ijoko Coordination. Full client review will be displayed upon verification.',
      clientNames: 'Client Reflection Pending Verification',
      eventType: 'Traditional Engagement Coordination',
      location: 'Manchester, UK',
      isPlaceholder: true,
    },
    {
      id: '6',
      quote: 'Placeholder: Verified Client Reflection for High-Profile Corporate & Private Milestone Hosting. Full client review will be displayed upon verification.',
      clientNames: 'Client Reflection Pending Verification',
      eventType: 'Private Milestone Celebration',
      location: 'London, UK',
      isPlaceholder: true,
    },
  ];

  const testimonials: TestimonialItem[] = dbTestimonials.length > 0
    ? dbTestimonials.map((t) => ({
        id: t.id,
        quote: t.quote,
        clientNames: t.client_names,
        eventType: t.event_type,
        location: t.location || '',
        isPlaceholder: t.is_placeholder,
      }))
    : defaultTestimonials;

  const recognitionItems = [
    {
      icon: Award,
      title: 'Cultural Host Distinction',
      badge: 'Honor Pending Client Verification',
      description: 'Official recognition for distinguished Yoruba cultural representation and bilingual ceremonial leadership.',
    },
    {
      icon: Crown,
      title: 'Traditional Ceremonial Honors',
      badge: 'Honor Pending Client Verification',
      description: 'Acknowledging mastery in ancestral Yoruba marital protocols, elders’ deference, and ceremonial precision.',
    },
    {
      icon: Sparkles,
      title: 'Luxury Event Excellence',
      badge: 'Honor Pending Client Verification',
      description: 'Celebrated for flawless timeline execution, stage presence, and high-energy wedding reception management.',
    },
  ];

  return (
    <>
      <SEO
        title="Client Testimonials & Credibility | D’Fabulous Yoruba Events"
        description="Explore verified client reflections, traditional ceremonial honors, and trust standards for D’Fabulous luxury Yoruba event hosting."
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
            <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest text-burgundy-rich uppercase bg-gold-light/20 rounded-full border border-gold-primary/30 mb-3">
              CLIENT TRUST
            </span>
            <h2 className="text-3xl sm:text-4xl font-serif font-bold text-burgundy-rich">
              Verified Client Reflections
            </h2>
            <p className="mt-3 text-neutral-700 leading-relaxed text-sm sm:text-base">
              To preserve authentic client privacy and complete truthfulness, all reviews below are reserved for verified client submissions following completed events.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {testimonials.map((t) => (
              <TestimonialCard
                key={t.id}
                quote={t.quote}
                clientNames={t.clientNames}
                eventType={t.eventType}
                location={t.location}
                isPlaceholder={t.isPlaceholder ?? true}
              />
            ))}
          </div>
        </Container>
      </section>

      {/* Credibility & Recognition Section */}
      <section className="py-16 sm:py-24 bg-white border-y border-neutral-200">
        <Container>
          <div className="max-w-3xl mb-12 text-center mx-auto space-y-3">
            <span className="text-xs font-semibold tracking-widest text-gold-dark uppercase block">
              HONORS & RECOGNITION
            </span>
            <h2 className="text-3xl sm:text-4xl font-serif font-bold text-burgundy-rich">
              Ceremonial Excellence & Distinction
            </h2>
            <p className="text-neutral-600 text-sm sm:text-base leading-relaxed">
              Official recognitions celebrating excellence in traditional Yoruba oratory, wedding hosting, and event direction.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {recognitionItems.map((item, idx) => {
              const IconComp = item.icon;
              return (
                <div
                  key={idx}
                  className="p-8 rounded-2xl bg-ivory-warm border border-gold-primary/20 text-center flex flex-col items-center justify-between space-y-4 hover:border-gold-primary transition-colors shadow-sm"
                >
                  <div className="p-4 bg-burgundy-rich text-gold-primary rounded-2xl">
                    <IconComp className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-xl text-burgundy-rich">
                      {item.title}
                    </h3>
                    <span className="inline-block mt-2 px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-widest text-gold-dark bg-gold-light/20 rounded border border-gold-primary/30">
                      {item.badge}
                    </span>
                    <p className="mt-3 text-xs text-neutral-600 leading-relaxed">
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
          <div className="max-w-4xl mx-auto p-8 sm:p-12 rounded-2xl bg-white border border-gold-primary/30 shadow-md flex flex-col sm:flex-row items-start gap-6">
            <div className="p-4 bg-burgundy-rich/10 text-burgundy-rich rounded-2xl shrink-0">
              <ShieldCheck className="w-10 h-10" />
            </div>
            <div className="space-y-3">
              <h3 className="font-serif font-bold text-2xl text-burgundy-rich">
                Our Commitment to Uncompromised Truthfulness
              </h3>
              <p className="text-neutral-700 text-sm leading-relaxed">
                In strict accordance with D’Fabulous brand integrity, we never publish fabricated testimonials, artificial star ratings, or unverified awards. Every client review published on this platform is independently verified and collected directly with client consent.
              </p>
              <div className="pt-2 flex items-center gap-2 text-xs font-semibold text-burgundy-rich">
                <CheckCircle2 className="w-4 h-4 text-gold-dark shrink-0" />
                <span>Verified Client Feedback Protocol Active</span>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Final Booking CTA */}
      <section className="py-16 bg-burgundy-rich text-white">
        <Container>
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-gold-primary">
              Experience the D’Fabulous Distinction
            </h2>
            <p className="text-neutral-200 leading-relaxed text-base">
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
