/**
 * ServicesCatalogShell Component
 * Service catalog overview page shell listing all core, specialist, and brand services.
 */

import React, { useEffect, useState } from 'react';
import { Container } from '../components/Container';
import { PageHero } from '../components/PageHero';
import { ServiceCard } from '../components/ServiceCard';
import { SectionHeading } from '../components/SectionHeading';
import { Button } from '../components/Button';
import { SEO } from '../components/SEO';
import { SERVICES_LIST } from '../data/brand';
import { getServices } from '../lib/db';
import { ServiceDefinition } from '../types';
import { Crown, Sparkles, Globe } from 'lucide-react';

export const ServicesCatalogShell: React.FC = () => {
  const [services, setServices] = useState<ServiceDefinition[]>(SERVICES_LIST);

  useEffect(() => {
    getServices().then((data) => {
      if (data && data.length > 0) {
        setServices(data);
      }
    });
  }, []);

  const coreServices = services.filter((s) => s.category === 'core');
  const specialistServices = services.filter((s) => s.category === 'specialist');
  const brandServices = services.filter((s) => s.category === 'brand');

  return (
    <>
      <SEO
        title="Bespoke Services | D’Fabulous Luxury Yoruba Events"
        description="Explore core and specialist Yoruba event services, including Alaga Iduro, Alaga Ijoko, Wedding MC, and Traditional Engagement Coordination."
      />

      <PageHero
        title="Bespoke Yoruba Event Services"
        subtitle="End-to-end ceremonial direction, cultural family spokesperson representation, and high-energy wedding reception hosting across the UK and worldwide."
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Services' },
        ]}
      />

      <section className="py-16 sm:py-24 bg-ivory-warm">
        <Container className="space-y-20">
          
          {/* Section 1: Core Alaga & MC Hosting */}
          <div>
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2.5 bg-burgundy-deep text-gold-luxury">
                <Crown className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-semibold tracking-[0.2em] text-gold-luxury uppercase block font-sans">
                  PRIMARY CEREMONIAL ROLES
                </span>
                <h2 className="font-display text-2xl sm:text-3xl font-normal text-black-rich">
                  Core Alaga & Master of Ceremonies
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {coreServices.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          </div>

          {/* Section 2: Specialist Traditional Direction */}
          <div>
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2.5 bg-burgundy-deep text-gold-luxury">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-semibold tracking-[0.2em] text-gold-luxury uppercase block font-sans">
                  SPECIALIST PROTOCOL & STYLING
                </span>
                <h2 className="font-display text-2xl sm:text-3xl font-normal text-black-rich">
                  Traditional Direction & Gift Presentation
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {specialistServices.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          </div>

          {/* Section 3: Brand Partnerships & Cultural Ambassadorship */}
          <div>
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2.5 bg-burgundy-deep text-gold-luxury">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-semibold tracking-[0.2em] text-gold-luxury uppercase block font-sans">
                  CORPORATE & BRAND PARTNERSHIPS
                </span>
                <h2 className="font-display text-2xl sm:text-3xl font-normal text-black-rich">
                  Cultural Ambassadorship
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {brandServices.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          </div>

          {/* Final CTA Banner */}
          <div className="p-8 sm:p-12 border border-gold-luxury/30 bg-burgundy-deep text-ivory-warm text-center space-y-6">
            <h3 className="font-display text-2xl sm:text-3xl font-normal text-gold-luxury">
              Require a Custom Event Hosting Package?
            </h3>
            <p className="text-champagne-soft/85 max-w-2xl mx-auto leading-relaxed">
              We frequently combine Alaga Iduro, Alaga Ijoko, and Reception MC hosting into a unified seamless experience for couples and families.
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

