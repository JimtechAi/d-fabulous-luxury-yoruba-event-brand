/**
 * MobileNavigation Component
 * Accessible mobile overlay menu with ARIA dialog semantics, focus management, focus trap,
 * body scroll lock, Escape key handler, and accordion sub-menus.
 */

import React, { useEffect, useRef, useState } from 'react';
import { NAVIGATION_ITEMS } from '../data/brand';
import { Link, useRouter } from '../lib/router';
import { Button } from './Button';
import { X, ChevronDown } from 'lucide-react';

interface MobileNavigationProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export const MobileNavigation: React.FC<MobileNavigationProps> = ({
  isOpen,
  onClose,
  triggerRef,
}) => {
  const { currentPath } = useRouter();
  const [expandedSection, setExpandedSection] = useState<string | null>('Services');
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus management & Escape key
  useEffect(() => {
    if (!isOpen) return;

    // Focus close button on open
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        triggerRef?.current?.focus();
        return;
      }

      // Focus trap logic
      if (e.key === 'Tab' && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    onClose();
    triggerRef?.current?.focus();
  };

  const toggleSubmenu = (label: string) => {
    setExpandedSection((prev) => (prev === label ? null : label));
  };

  return (
    <div
      className="fixed inset-0 z-50 lg:hidden flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Mobile Navigation Menu"
    >
      {/* Dimmed Overlay Backdrop */}
      <div
        className="fixed inset-0 bg-black-rich/80 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Slide-out Drawer Panel */}
      <div
        ref={drawerRef}
        className="relative w-full max-w-sm bg-burgundy-dark border-l border-gold-luxury/30 h-full overflow-y-auto flex flex-col justify-between p-6 sm:p-8 text-ivory-warm z-10 shadow-2xl"
      >
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-6 border-b border-gold-luxury/20 mb-6">
            <Link
              href="/"
              onClick={handleClose}
              className="group flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury"
              ariaLabel="D’Fabulous Homepage"
            >
              <span className="font-display text-2xl font-semibold tracking-wider text-ivory-warm">
                D’FABULOUS
              </span>
              <span className="text-[9px] font-sans tracking-[0.3em] uppercase text-gold-luxury/90 font-light -mt-1">
                LUXURY YORUBA EVENTS
              </span>
            </Link>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={handleClose}
              className="p-2 text-ivory-warm hover:text-gold-luxury transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury"
              aria-label="Close menu"
            >
              <X className="w-6 h-6" aria-hidden="true" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav aria-label="Mobile Navigation" className="flex flex-col gap-2">
            {NAVIGATION_ITEMS.map((item) => {
              const hasChildren = Boolean(item.children && item.children.length > 0);
              const isExpanded = expandedSection === item.label;
              const isPrimaryActive = currentPath === item.href;

              return (
                <div key={item.label} className="border-b border-burgundy-deep/40 pb-2">
                  <div className="flex items-center justify-between py-1">
                    <Link
                      href={item.href}
                      onClick={handleClose}
                      className={`text-sm uppercase tracking-[0.18em] font-sans py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury ${
                        isPrimaryActive
                          ? 'text-gold-luxury font-semibold'
                          : 'text-ivory-warm hover:text-gold-luxury'
                      }`}
                    >
                      {item.label}
                    </Link>

                    {hasChildren && (
                      <button
                        type="button"
                        onClick={() => toggleSubmenu(item.label)}
                        className="p-2 text-gold-luxury/80 hover:text-gold-luxury focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury"
                        aria-expanded={isExpanded}
                        aria-label={`Toggle ${item.label} sub-menu`}
                      >
                        <ChevronDown
                          className={`w-4 h-4 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180 text-gold-luxury' : ''
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  </div>

                  {/* Sub-menu Accordion */}
                  {hasChildren && isExpanded && (
                    <div className="mt-1 ml-3 border-l border-gold-luxury/30 pl-3 flex flex-col gap-1.5 py-2">
                      {item.children?.map((child) => {
                        const isChildActive = currentPath === child.href;
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={handleClose}
                            className={`text-xs py-1.5 font-sans transition-colors block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury ${
                              isChildActive
                                ? 'text-gold-luxury font-semibold'
                                : 'text-champagne-soft/90 hover:text-gold-luxury'
                            }`}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Footer Action inside Drawer */}
        <div className="pt-6 mt-8 border-t border-gold-luxury/20">
          <Button variant="primary" fullWidth href="/book" onClick={handleClose}>
            BOOK D’FABULOUS
          </Button>
        </div>
      </div>
    </div>
  );
};

