/**
 * ServiceCard Component
 * Reusable card for core and specialist Yoruba event services with editorial media frame.
 */

import React from 'react';
import { ServiceDefinition } from '../types';
import { Button } from './Button';
import { getResponsiveImageProps } from '../lib/media';
import { Sparkles, Crown, HeartHandshake, Mic, Calendar, Gift, Star } from 'lucide-react';

interface ServiceCardProps {
  service: ServiceDefinition;
  className?: string;
}

// Icon mapper for service card headers
const getServiceIcon = (id: string) => {
  switch (id) {
    case 'alaga-iduro':
      case 'alaga-ijoko':
      return <Crown className="w-5 h-5 text-gold-luxury" />;
    case 'wedding-mc':
      return <Mic className="w-5 h-5 text-gold-luxury" />;
    case 'engagement-coordination':
      return <Calendar className="w-5 h-5 text-gold-luxury" />;
    case 'private-events':
      return <HeartHandshake className="w-5 h-5 text-gold-luxury" />;
    case 'eru-iyawo':
      return <Gift className="w-5 h-5 text-gold-luxury" />;
    case 'brand-influencing':
      return <Star className="w-5 h-5 text-gold-luxury" />;
    default:
      return <Sparkles className="w-5 h-5 text-gold-luxury" />;
  }
};

export const ServiceCard: React.FC<ServiceCardProps> = ({ service, className = '' }) => {
  const serviceImageMap: Record<string, { src: string; alt: string }> = {
    'alaga-iduro': { src: '/images/services/alaga-iduro.webp', alt: 'D’Fabulous leading a Nigerian groom family ceremonial presentation' },
    'alaga-ijoko': { src: '/images/services/alaga-ijoko.webp.jpeg', alt: 'D’Fabulous hosting a Yoruba traditional engagement with family blessing rituals' },
    'wedding-mc': { src: '/images/services/wedding-mc.webp.jpeg', alt: 'D’Fabulous as a luxury wedding master of ceremonies speaking to guests from the stage' },
    'engagement-coordination': { src: '/images/services/engagement-coordination.webp.jpeg', alt: 'D’Fabulous coordinating a traditional Yoruba engagement ceremony with elegant cultural flow' },
    'private-events': { src: '/images/services/private-events.webp.jpeg', alt: 'D’Fabulous hosting a private luxury event with refined ceremonial presence' },
    'eru-iyawo': { src: '/images/services/eru-iyawo.webp.jpeg', alt: 'Traditional Yoruba dowry presentation styled with elegance and cultural significance' },
    'brand-influencing': { src: '/images/services/brand-influencing.webp.jpeg', alt: 'D’Fabulous representing a luxury cultural brand partnership in a polished editorial setting' },
    'destination-events': { src: '/images/services/destination-events.webp.jpeg', alt: 'D’Fabulous hosting a destination celebration by the coast at sunset' },
  };

  const serviceImage = serviceImageMap[service.id];

  return (
    <article className={`group relative bg-ivory-warm border border-burgundy-deep/15 hover:border-gold-luxury/70 p-6 sm:p-8 transition-all duration-500 hover:shadow-xl flex flex-col justify-between ${className}`}>
      {/* Top Subtle Gold Corner Accent */}
      <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-gold-luxury/0 group-hover:border-gold-luxury/60 transition-all duration-500 pointer-events-none" />

      <div>
        {/* Editorial Media Frame Area */}
        <div className="relative w-full h-52 mb-6 bg-burgundy-dark/95 border border-gold-luxury/20 overflow-hidden flex flex-col items-center justify-center p-4 text-center group-hover:border-gold-luxury/40 transition-colors">
          {serviceImage ? (
            <>
              <img
                src={serviceImage.src}
                {...getResponsiveImageProps(serviceImage.src, '(max-width: 768px) 100vw, 33vw')}
                alt={serviceImage.alt}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10" aria-hidden="true" />
              <div className="relative z-10 w-10 h-10 rounded-full bg-burgundy-deep/80 border border-gold-luxury/40 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                {getServiceIcon(service.id)}
              </div>
              <span className="relative z-10 font-display text-sm tracking-wider text-champagne-soft font-normal uppercase">
                {service.yorubaName || service.title}
              </span>
              <span className="relative z-10 text-[9px] font-sans text-gold-luxury/80 tracking-widest uppercase mt-0.5">
                {service.category === 'core' ? 'Ceremonial Core' : service.category === 'specialist' ? 'Specialist Hosting' : 'Brand Role'}
              </span>
            </>
          ) : (
            <>
              <div className="absolute inset-0 cultural-pattern-subtle opacity-20 pointer-events-none" />
              <div className="w-10 h-10 rounded-full bg-burgundy-deep/80 border border-gold-luxury/40 flex items-center justify-center mb-2 z-10 group-hover:scale-110 transition-transform duration-300">
                {getServiceIcon(service.id)}
              </div>
              <span className="font-display text-sm tracking-wider text-champagne-soft z-10 font-normal uppercase">
                {service.yorubaName || service.title}
              </span>
              <span className="text-[9px] font-sans text-gold-luxury/80 tracking-widest uppercase mt-0.5 z-10">
                {service.category === 'core' ? 'Ceremonial Core' : service.category === 'specialist' ? 'Specialist Hosting' : 'Brand Role'}
              </span>
            </>
          )}
        </div>

        {/* Category & Badge */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-gold-luxury bg-burgundy-dark px-2.5 py-1">
            {service.category === 'core' ? 'Core Service' : service.category === 'specialist' ? 'Specialist Role' : 'Brand Partner'}
          </span>
          {service.yorubaName && (
            <span className="text-xs font-serif italic text-burgundy-deep/80">
              Yoruba Protocol
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-display text-2xl sm:text-3xl font-normal text-black-rich mb-3 group-hover:text-burgundy-deep transition-colors duration-300">
          {service.title}
        </h3>

        {/* Description */}
        <p className="text-xs sm:text-sm text-charcoal-soft/85 font-sans leading-relaxed font-light mb-6">
          {service.shortDescription}
        </p>
      </div>

      {/* CTA Link Button */}
      <div className="pt-4 border-t border-burgundy-deep/10 flex items-center justify-between">
        <Button
          variant="text"
          href={service.slug}
          icon={<span className="text-lg">→</span>}
          iconPosition="right"
        >
          EXPLORE SERVICE
        </Button>
      </div>
    </article>
  );
};

