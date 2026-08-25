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
import { CalendarCheck, MessageCircle, Phone } from 'lucide-react';

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
