/**
 * SectionHeading Component
 * Editorial heading layout with Cormorant Garamond display typography and subtle cultural accents.
 */

import React from 'react';
import { SectionHeadingProps } from '../types';

export const SectionHeading: React.FC<SectionHeadingProps> = ({
  eyebrow,
  title,
  description,
  align = 'left',
  hasCulturalDivider = true,
  titleAs: TitleTag = 'h2',
  className = '',
}) => {
  const alignClasses = {
    left: 'text-left items-start',
    center: 'text-center items-center mx-auto',
    right: 'text-right items-end ml-auto',
  };

  return (
    <div className={`flex flex-col max-w-3xl ${alignClasses[align]} ${className}`}>
      {eyebrow && (
        <span className="text-xs sm:text-sm font-semibold tracking-[0.25em] text-gold-luxury uppercase mb-3 font-sans">
          {eyebrow}
        </span>
      )}

      <TitleTag className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal text-black-rich leading-[1.15] tracking-tight">
        {title}
      </TitleTag>

      {hasCulturalDivider && (
        <div className="w-24 mt-4 mb-5 cultural-divider" aria-hidden="true" />
      )}

      {description && (
        <p className="text-base sm:text-lg text-charcoal-soft/80 font-sans font-light leading-relaxed max-w-2xl">
          {description}
        </p>
      )}
    </div>
  );
};
