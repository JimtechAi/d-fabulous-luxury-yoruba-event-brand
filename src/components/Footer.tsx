/**
 * Footer Component
 * Production-ready luxury footer structure with brand positioning, services, explore navigation,
 * clear contact placeholders, and WCAG compliant legal links.
 */

import React from 'react';
import { Container } from './Container';
import { Link } from '../lib/router';
import { Button } from './Button';
import { BRAND_INFO, SERVICES_LIST } from '../data/brand';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-black-rich text-ivory-warm border-t border-gold-luxury/20 relative pt-16 pb-12 overflow-hidden">
      {/* Background Cultural Pattern Motif */}
      <div className="absolute inset-0 cultural-pattern-subtle opacity-10 pointer-events-none" aria-hidden="true" />

      <Container className="relative z-10">
        {/* Top Booking CTA Section inside Footer */}
        <div className="bg-burgundy-dark border border-gold-luxury/30 p-8 sm:p-12 mb-16 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="max-w-xl text-center md:text-left">
            <span className="text-xs uppercase tracking-[0.25em] text-gold-luxury font-semibold block mb-2 font-sans">
              RESERVE YOUR CELEBRATION
            </span>
            <h3 className="font-display text-2xl sm:text-3xl md:text-4xl text-ivory-warm font-normal leading-tight">
              Elevate Your Ceremony With Cultural Authority & Regal Elegance
            </h3>
          </div>
          <Button variant="primary" size="lg" href="/book" className="whitespace-nowrap">
            BOOK D’FABULOUS
          </Button>
        </div>

        {/* Navigation Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 pb-12 border-b border-gold-luxury/15">
          {/* Col 1: Brand Info */}
          <div>
            <img
              src="/assets/brand/logo/dfabulous-logo.web.jpeg"
              alt="D’Fabulous official logo"
              className="h-20 w-auto object-contain mb-4 select-none"
            />
            <div className="text-[9px] font-sans tracking-[0.25em] uppercase text-gold-luxury mb-4 font-light">
              LUXURY YORUBA EVENTS
            </div>
            <p className="text-xs text-champagne-soft/80 leading-relaxed font-light mb-6">
              {BRAND_INFO.positioning}
            </p>
            <div className="text-[11px] font-mono text-gold-luxury/80 space-y-1">
              <div>📍 UK & International Destination</div>
              <div>💬 Yoruba & English Fluency</div>
            </div>
          </div>

          {/* Col 2: Services */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-luxury mb-4 font-sans">
              Services
            </h4>
            <ul className="space-y-2 text-xs text-champagne-soft/80 font-light p-0 m-0 list-none">
              {SERVICES_LIST.map((service) => (
                <li key={service.id}>
                  <Link href={service.slug} className="hover:text-gold-luxury transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold-luxury">
                    {service.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Explore */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-luxury mb-4 font-sans">
              Explore
            </h4>
            <ul className="space-y-2 text-xs text-champagne-soft/80 font-light p-0 m-0 list-none">
              <li>
                <Link href="/about" className="hover:text-gold-luxury transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold-luxury">
                  About D’Fabulous
                </Link>
              </li>
              <li>
                <Link href="/experience" className="hover:text-gold-luxury transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold-luxury">
                  The Experience
                </Link>
              </li>
              <li>
                <Link href="/experience/gallery" className="hover:text-gold-luxury transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold-luxury">
                  Gallery
                </Link>
              </li>
              <li>
                <Link href="/experience/videos" className="hover:text-gold-luxury transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold-luxury">
                  Cinematic Videos
                </Link>
              </li>
              <li>
                <Link href="/experience/destination-events" className="hover:text-gold-luxury transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold-luxury">
                  Destination Events
                </Link>
              </li>
              <li>
                <Link href="/experience/testimonials" className="hover:text-gold-luxury transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold-luxury">
                  Testimonials
                </Link>
              </li>
              <li>
                <Link href="/experience/awards" className="hover:text-gold-luxury transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold-luxury">
                  Awards & Honors
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Connect & Social Placeholders */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-luxury mb-4 font-sans">
              Connect & Socials
            </h4>
            <div className="space-y-3 text-xs text-champagne-soft/80 font-light">
              <div>
                <span className="block text-[10px] text-gold-luxury/70 uppercase font-sans">Email Enquiries:</span>
                <span className="font-mono text-[11px]">{BRAND_INFO.placeholders.email}</span>
              </div>
              <div>
                <span className="block text-[10px] text-gold-luxury/70 uppercase font-sans">Direct Line:</span>
                <span className="font-mono text-[11px]">{BRAND_INFO.placeholders.phone}</span>
              </div>

              <div className="pt-2">
                <span className="block text-[10px] text-gold-luxury/70 uppercase mb-2 font-sans">Social Channels:</span>
                <div className="flex flex-col gap-1.5 font-sans text-xs text-champagne-soft/80">
                  <span>Instagram: {BRAND_INFO.placeholders.instagram}</span>
                  <span>YouTube: {BRAND_INFO.placeholders.youtube}</span>
                  <span>TikTok: {BRAND_INFO.placeholders.tiktok}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Legal Links & Copyright */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-champagne-soft/60 font-light">
          <div>
            © {new Date().getFullYear()} D’Fabulous Brand. All rights reserved.
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <Link href="/privacy" className="hover:text-gold-luxury transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold-luxury">
              Privacy Policy
            </Link>
            <Link href="/cookies" className="hover:text-gold-luxury transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold-luxury">
              Cookie Policy
            </Link>
            <Link href="/terms" className="hover:text-gold-luxury transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold-luxury">
              Terms of Service
            </Link>
            <Link href="/booking-terms" className="hover:text-gold-luxury transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold-luxury">
              Booking Terms
            </Link>
            <Link href="/accessibility" className="hover:text-gold-luxury transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold-luxury">
              Accessibility
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
};
