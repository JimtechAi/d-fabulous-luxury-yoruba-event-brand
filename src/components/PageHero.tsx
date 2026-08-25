/**
 * PageHero Component
 * Standardized inner page header banner shell with breadcrumbs, display typography, and optional media slot.
 */

import React from 'react';
import { PageHeroProps } from '../types';
import { Container } from './Container';
import { Link } from '../lib/router';

export const PageHero: React.FC<PageHeroProps> = ({
  title,
  subtitle,
  eyebrow,
  breadcrumbs = [],
  mediaSlot,
  align = 'left',
}) => {
  const pageBreadcrumbs = breadcrumbs[0]?.label.toLowerCase() === 'home'
    ? breadcrumbs.slice(1)
    : [{ label: 'Home', href: '/' }, ...breadcrumbs];

  return (
    <div className="relative bg-burgundy-dark text-ivory-warm pt-32 pb-20 sm:pt-40 sm:pb-28 border-b border-gold-luxury/20 overflow-hidden">
      {/* Background Cultural Accent Pattern */}
      <div className="absolute inset-0 cultural-pattern-subtle pointer-events-none" aria-hidden="true" />

      <Container className="relative z-10">
        {/* Breadcrumb Navigation */}
        {pageBreadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-2 text-xs font-sans tracking-widest uppercase text-champagne-soft/70">
              <li>
                <Link href="/" className="hover:text-gold-luxury transition-colors">
                  Home
                </Link>
              </li>
              {pageBreadcrumbs.map((crumb, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <span className="text-gold-luxury/40">/</span>
                  {crumb.href ? (
                    <Link href={crumb.href} className="hover:text-gold-luxury transition-colors">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-gold-luxury font-medium" aria-current="page">
                      {crumb.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}

        {/* Hero Content */}
        <div className={`max-w-3xl ${align === 'center' ? 'mx-auto text-center' : ''}`}>
          {eyebrow && (
            <span className="text-xs sm:text-sm font-semibold tracking-[0.25em] text-gold-luxury uppercase mb-3 block">
              {eyebrow}
            </span>
          )}

          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-normal text-ivory-warm tracking-tight leading-[1.1] mb-6">
            {title}
          </h1>

          <div className={`w-20 h-0.5 bg-gold-luxury/60 mb-6 ${align === 'center' ? 'mx-auto' : ''}`} />

          {subtitle && (
            <p className="text-base sm:text-lg text-champagne-soft/90 font-light leading-relaxed">
              {subtitle}
            </p>
          )}

          {mediaSlot && <div className="mt-8">{mediaSlot}</div>}
        </div>
      </Container>
    </div>
  );
};
