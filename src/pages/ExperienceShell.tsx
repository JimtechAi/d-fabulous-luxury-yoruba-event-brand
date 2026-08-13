/**
 * ExperienceShell Component
 * Comprehensive cultural expertise, ceremonial protocol, and event experience page.
 */

import React from 'react';
import { Container } from '../components/Container';
import { PageHero } from '../components/PageHero';
import { Button } from '../components/Button';
import { SEO } from '../components/SEO';
import { Crown, Sparkles, Globe, Heart, BookOpen, Music, CheckCircle2, ShieldCheck } from 'lucide-react';

export const ExperienceShell: React.FC = () => {
  const culturalRites = [
    {
      title: 'Formal Introductions & Letter Reading',
      desc: 'Orchestrating the official exchange of proposal and acceptance letters between the groom’s and bride’s families with traditional Yoruba literary flair.',
      icon: BookOpen,
    },
    {
      title: 'Oriba & Prostration Rites',
      desc: 'Guiding the groom, his groomsmen, and delegation in respectful prostration before the bride’s parents and elders as a pledge of honor and humbleness.',
      icon: Crown,
    },
    {
      title: 'Eru Iyawo Dowry Presentation',
      desc: 'Overseeing the symbolic inspection and presentation of the dowry items, ensuring every traditional requirement is met with elegance.',
      icon: Sparkles,
    },
    {
      title: 'Bridal Unveiling & Family Blessing',
      desc: 'Directing the emotional entrance of the veiled bride, her veil removal ceremony, and the solemn ancestral prayers from both lineages.',
      icon: Heart,
    },
  ];

  return (
    <>
      <SEO
        title="Yoruba Cultural Expertise & Ceremonial Experience | D’Fabulous"
        description="Discover the cultural authority, ceremonial protocol expertise, and bilingual Yoruba oratory that D’Fabulous brings to weddings and traditional engagements."
      />

      <PageHero
        title="Yoruba Cultural Expertise & Experience"
        subtitle="Mastery of sacred Yoruba matrimonial protocols, ancestral respect, and vibrant celebration direction for modern couples across the globe."
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Cultural Experience' },
        ]}
      />

      {/* Overview Section */}
      <section className="py-16 sm:py-24 bg-ivory-warm">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            <div className="lg:col-span-7 space-y-6">
              <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest text-burgundy-rich uppercase bg-gold-light/20 rounded-full border border-gold-primary/30">
                CEREMONIAL ARCHITECTURE
              </span>
              <h2 className="text-3xl sm:text-4xl font-serif font-bold text-burgundy-rich leading-tight">
                Authentic Yoruba Traditions Delivered with Modern Elegance
              </h2>
              <p className="text-neutral-700 leading-relaxed text-base sm:text-lg font-sans font-light">
                A traditional Yoruba engagement (<em className="text-burgundy-rich font-medium">Igbeyawo</em>) is far more than a ceremony—it is the sacred union of two families, two ancestral heritage lines, and two communities.
              </p>
              <p className="text-neutral-700 leading-relaxed text-base font-sans font-light">
                D’Fabulous brings decades of cultural fluency, authentic proverb delivery, and seamless event flow to ensure every traditional rite is executed with reverence, joy, and impeccable timing.
              </p>

              <div className="pt-4 flex flex-wrap gap-4">
                <Button variant="primary" href="/book">
                  BOOK D’FABULOUS FOR YOUR EVENT
                </Button>
                <Button variant="outline" href="/services">
                  EXPLORE ALL SERVICES
                </Button>
              </div>
            </div>

            <div className="lg:col-span-5 bg-white p-8 rounded-2xl border border-gold-primary/20 shadow-md space-y-6">
              <div className="flex items-center gap-3 text-burgundy-rich">
                <ShieldCheck className="w-8 h-8 text-gold-primary shrink-0" />
                <h3 className="text-xl font-serif font-bold">Cultural Pillars</h3>
              </div>

              <ul className="space-y-4 text-sm text-neutral-700">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gold-dark shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-burgundy-rich block">Proverbial Mastery:</strong>
                    <span>Use of rich Yoruba proverbs (<em className="text-burgundy-rich">Owe Yoruba</em>) appropriate for marriage blessings.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gold-dark shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-burgundy-rich block">Elders’ Protocol:</strong>
                    <span>Utmost deference to family patriarchs, matriarchs, and community chiefs.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-gold-dark shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-burgundy-rich block">Cross-Cultural Inclusivity:</strong>
                    <span>Seamless English commentary ensuring non-Yoruba guests feel included.</span>
                  </div>
                </li>
              </ul>
            </div>

          </div>
        </Container>
      </section>

      {/* Rites Grid */}
      <section className="py-16 sm:py-24 bg-white border-y border-neutral-200">
        <Container className="space-y-12">
          <div className="max-w-3xl mx-auto text-center space-y-4">
            <span className="text-xs font-semibold tracking-widest text-gold-dark uppercase block">
              SACRED RITES
            </span>
            <h2 className="text-3xl sm:text-4xl font-serif font-bold text-burgundy-rich">
              Core Stages of the Yoruba Engagement
            </h2>
            <p className="text-neutral-600 leading-relaxed text-base">
              D’Fabulous guides each phase of the traditional engagement with structured precision and joyful crowd engagement.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {culturalRites.map((rite, idx) => {
              const IconComponent = rite.icon;
              return (
                <div key={idx} className="p-6 rounded-xl bg-ivory-warm border border-gold-primary/20 space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="p-3 bg-burgundy-rich text-gold-primary rounded-lg w-fit">
                      <IconComponent className="w-6 h-6" />
                    </div>
                    <h3 className="font-serif font-bold text-burgundy-rich text-lg">
                      {rite.title}
                    </h3>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      {rite.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* Destination & Global Reach */}
      <section className="py-16 sm:py-24 bg-burgundy-rich text-white">
        <Container>
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <Globe className="w-12 h-12 text-gold-primary mx-auto" />
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-gold-primary">
              Global Destination Events
            </h2>
            <p className="text-neutral-200 leading-relaxed text-base sm:text-lg">
              Whether hosting in a London luxury hotel, a historic château in France, a coastal venue in Nigeria, or a destination resort in Europe or North America, D’Fabulous provides international event hosting with complete cultural fidelity.
            </p>
            <div className="pt-4 flex flex-wrap justify-center gap-4">
              <Button variant="primary" href="/book">
                INQUIRE FOR DESTINATION EVENT
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
