/**
 * DesktopNavigation Component
 * Production-ready luxury desktop navigation with accessible Services and Experience dropdowns.
 * Adheres to WCAG 2.2 AA standards (keyboard navigation, ARIA states, focus management, escape handling).
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NAVIGATION_ITEMS } from '../data/brand';
import { Link, useRouter } from '../lib/router';
import { ChevronDown } from 'lucide-react';

export const DesktopNavigation: React.FC = () => {
  const { currentPath } = useRouter();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | HTMLAnchorElement | null }>({});

  const closeDropdown = useCallback(() => {
    setOpenDropdown(null);
  }, []);

  // Close dropdown on click outside or focus outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        closeDropdown();
      }
    };

    const handleFocusOutside = (event: FocusEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('focusin', handleFocusOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('focusin', handleFocusOutside);
    };
  }, [closeDropdown]);

  // Handle global Escape key press
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openDropdown) {
        const trigger = buttonRefs.current[openDropdown];
        closeDropdown();
        if (trigger) {
          trigger.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openDropdown, closeDropdown]);

  const toggleDropdown = (label: string) => {
    setOpenDropdown((prev) => (prev === label ? null : label));
  };

  const handleMouseEnter = (label: string, hasChildren: boolean) => {
    if (hasChildren) {
      setOpenDropdown(label);
    }
  };

  const handleMouseLeave = () => {
    setOpenDropdown(null);
  };

  return (
    <nav
      ref={navRef}
      aria-label="Main Navigation"
      className="hidden lg:flex items-center gap-8"
    >
      {NAVIGATION_ITEMS.map((item) => {
        const hasChildren = Boolean(item.children && item.children.length > 0);
        const isOpen = openDropdown === item.label;
        const isActive =
          currentPath === item.href ||
          (item.children && item.children.some((c) => c.href === currentPath));
        const dropdownId = `dropdown-${item.label.toLowerCase().replace(/\s+/g, '-')}`;

        if (hasChildren) {
          return (
            <div
              key={item.label}
              className="relative"
              onMouseEnter={() => handleMouseEnter(item.label, true)}
              onMouseLeave={handleMouseLeave}
            >
              <button
                ref={(el) => { buttonRefs.current[item.label] = el; }}
                type="button"
                onClick={() => toggleDropdown(item.label)}
                aria-expanded={isOpen}
                aria-haspopup="true"
                aria-controls={dropdownId}
                className={`flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] font-sans py-2 bg-transparent border-none cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury ${
                  isActive
                    ? 'text-gold-luxury font-semibold'
                    : 'text-ivory-warm/90 hover:text-gold-luxury'
                }`}
              >
                <span>{item.label}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isOpen ? 'rotate-180 text-gold-luxury' : 'text-ivory-warm/60'
                  }`}
                  aria-hidden="true"
                />
              </button>

              {/* Dropdown Menu */}
              {isOpen && (
                <div
                  id={dropdownId}
                  role="menu"
                  aria-label={`${item.label} Submenu`}
                  className="absolute top-full left-0 pt-2 w-72 z-50 animate-in fade-in slide-in-from-top-1 duration-200"
                >
                  <div className="bg-burgundy-dark border border-gold-luxury/30 shadow-2xl p-3 text-ivory-warm">
                    <div className="text-[10px] uppercase font-sans tracking-widest text-gold-luxury/80 pb-2 mb-2 border-b border-gold-luxury/20">
                      {item.label}
                    </div>
                    <ul role="none" className="space-y-1 p-0 m-0 list-none">
                      {item.children?.map((child) => {
                        const isChildActive = currentPath === child.href;
                        return (
                          <li key={child.href} role="none">
                            <Link
                              href={child.href}
                              role="menuitem"
                              onClick={() => closeDropdown()}
                              className={`block p-2.5 text-xs font-sans transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury ${
                                isChildActive
                                  ? 'bg-burgundy-deep text-gold-luxury font-semibold border-l-2 border-gold-luxury pl-3'
                                  : 'text-ivory-warm/90 hover:bg-burgundy-deep/60 hover:text-gold-luxury'
                              }`}
                            >
                              <span className="block font-medium tracking-wider">
                                {child.label}
                              </span>
                              {child.description && (
                                <span className="block text-[11px] text-champagne-soft/70 mt-0.5 font-light line-clamp-1">
                                  {child.description}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          );
        }

        return (
          <Link
            key={item.label}
            href={item.href}
            ariaLabel={item.label}
            className={`text-xs uppercase tracking-[0.18em] font-sans py-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury ${
              isActive
                ? 'text-gold-luxury font-semibold'
                : 'text-ivory-warm/90 hover:text-gold-luxury'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};

