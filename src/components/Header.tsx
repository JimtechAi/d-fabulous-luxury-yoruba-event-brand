/**
 * Header Component
 * Sticky global header supporting scroll transitions, luxury branding, desktop navigation with dropdowns,
 * mobile menu drawer toggle, and "BOOK D’FABULOUS" CTA.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Container } from './Container';
import { DesktopNavigation } from './DesktopNavigation';
import { MobileNavigation } from './MobileNavigation';
import { Button } from './Button';
import { Link } from '../lib/router';
import { Menu } from 'lucide-react';

export const Header: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
          isScrolled
            ? 'bg-burgundy-dark/95 backdrop-blur-md py-3 shadow-lg border-b border-gold-luxury/30'
            : 'bg-burgundy-dark py-4 border-b border-gold-luxury/20'
        }`}
      >
        <Container className="flex items-center justify-between">
          {/* Brand Logo */}
          <Link
            href="/"
            className="group flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury p-1"
            ariaLabel="D’Fabulous Homepage"
          >
            <img
              src="/assets/brand/logo/dfabulous-logo.web.jpeg"
              alt="D’Fabulous official logo"
              className="h-14 w-auto max-w-[220px] object-contain select-none"
            />
          </Link>

          {/* Desktop Navigation */}
          <DesktopNavigation />

          {/* Header Action Buttons */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:block">
              <Button variant="primary" size="sm" href="/book">
                BOOK D’FABULOUS
              </Button>
            </div>

            {/* Mobile Navigation Trigger */}
            <button
              ref={mobileTriggerRef}
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 text-ivory-warm hover:text-gold-luxury lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury rounded-sm"
              aria-label="Open navigation menu"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-navigation-menu"
            >
              <Menu className="w-6 h-6" aria-hidden="true" />
            </button>
          </div>
        </Container>
      </header>

      {/* Mobile Navigation Overlay */}
      <MobileNavigation
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        triggerRef={mobileTriggerRef}
      />
    </>
  );
};

