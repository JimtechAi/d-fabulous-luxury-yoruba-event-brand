/**
 * TestimonialCard Component
 * Reusable card shell for verified client reflections and reviews with editorial styling.
 */

import React from 'react';

interface TestimonialCardProps {
  quote: string;
  clientNames: string;
  eventType: string;
  location?: string;
  isPlaceholder?: boolean;
  className?: string;
}

export const TestimonialCard: React.FC<TestimonialCardProps> = ({
  quote,
  clientNames,
  eventType,
  location,
  isPlaceholder = false,
  className = '',
}) => {
  return (
    <article className={`relative bg-burgundy-dark border border-gold-luxury/30 p-8 sm:p-10 text-ivory-warm flex flex-col justify-between hover:border-gold-luxury/60 transition-colors duration-300 ${className}`}>
      {/* Top Gold Subtle Motif Line */}
      <div className="w-12 h-0.5 bg-gold-luxury/40 mb-6" aria-hidden="true" />

      {/* Decorative Large Quote */}
      <div className="font-display text-4xl sm:text-5xl text-gold-luxury/40 leading-none select-none mb-2 font-normal">
        “
      </div>

      <blockquote className="font-display text-base sm:text-lg font-normal italic leading-relaxed text-champagne-soft mb-8">
        "{quote}"
      </blockquote>

      <div className="pt-4 border-t border-gold-luxury/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <cite className="not-italic font-sans text-xs sm:text-sm font-semibold tracking-wider text-ivory-warm uppercase block">
            {clientNames}
          </cite>
          <span className="text-xs text-champagne-soft/70 font-light block mt-0.5">
            {eventType} {location ? `• ${location}` : ''}
          </span>
        </div>
      </div>
    </article>
  );
};

