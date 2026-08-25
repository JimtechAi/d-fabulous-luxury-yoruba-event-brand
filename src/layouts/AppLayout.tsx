/**
 * AppLayout Component
 * Standard application shell wrapping header, skip link, main content container, and footer.
 */

import React from 'react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SkipToContent } from '../components/SkipToContent';
import { Button } from '../components/Button';
import { BRAND_INFO } from '../data/brand';
import { useRouter } from '../lib/router';
import { CalendarCheck, Facebook, Instagram, MessageCircle, Music2, Phone } from 'lucide-react';

const FLOATING_SOCIAL_LINKS = [
  { name: 'Facebook', href: 'https://www.facebook.com/share/1Gw84T9QFs/', icon: Facebook },
  { name: 'TikTok', href: 'https://www.tiktok.com/@dfabulousss', icon: Music2 },
  { name: 'Instagram', href: 'https://www.instagram.com/dfabulouss/', icon: Instagram },
] as const;

// Pages whose primary on-page action already is the booking/contact conversion,
// so the persistent bar would only compete with it rather than help.
const PERSISTENT_CTA_HIDDEN_ROUTES = new Set(['/book', '/contact']);

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentPath } = useRouter();
  const showPersistentCta = !PERSISTENT_CTA_HIDDEN_ROUTES.has(currentPath);

  return (
    <div className="min-h-screen flex flex-col bg-ivory-warm text-black-rich antialiased selection:bg-gold-luxury selection:text-black-rich font-sans">
      <SkipToContent />
      <Header />
      <main id="main-content" className="flex-grow focus:outline-none" tabIndex={-1}>
        {children}
      </main>
      <Footer />
      <div className="fixed right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2 sm:right-5" aria-label="Social media links">
        {FLOATING_SOCIAL_LINKS.map(({ name, href, icon: Icon }) => (
          <a
            key={name}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Visit D’Fabulous on ${name}`}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gold-luxury/60 bg-black-rich/85 text-gold-luxury shadow-lg backdrop-blur-sm transition-colors hover:bg-gold-luxury hover:text-black-rich focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury focus-visible:ring-offset-2 focus-visible:ring-offset-ivory-warm sm:h-11 sm:w-11"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </a>
        ))}
      </div>
      {/* Reserves space so the fixed bar below never overlaps the final footer content on mobile. */}
      {showPersistentCta && <div className="h-16 sm:h-14" aria-hidden="true" />}
      {showPersistentCta && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gold-luxury/30 bg-black-rich/95 px-4 py-3 text-ivory-warm shadow-[0_-8px_24px_rgba(0,0,0,0.18)] backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-center gap-3 sm:justify-between sm:gap-6">
            <p className="hidden text-xs uppercase tracking-[0.2em] text-champagne-soft sm:block">Planning your celebration?</p>
            <div className="flex w-full items-center justify-center gap-2 sm:w-auto sm:gap-3">
              <Button variant="primary" size="sm" href="/book" icon={<CalendarCheck className="h-4 w-4" />}>
                CHECK DATE AVAILABILITY
              </Button>
              <a href={BRAND_INFO.placeholders.whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Message D’Fabulous on WhatsApp" className="inline-flex h-10 w-10 items-center justify-center border border-[#25D366] text-[#25D366] transition-colors hover:bg-[#25D366] hover:text-black-rich focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury">
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
              </a>
              <a href={BRAND_INFO.placeholders.phoneUrl} aria-label={`Call D’Fabulous at ${BRAND_INFO.placeholders.phone}`} className="inline-flex h-10 w-10 items-center justify-center border border-champagne-soft/50 text-champagne-soft transition-colors hover:border-gold-luxury hover:text-gold-luxury focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury">
                <Phone className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
