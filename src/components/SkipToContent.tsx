/**
 * Skip to Main Content Link
 * Essential WCAG 2.2 AA accessibility component for keyboard navigation.
 */

import React from 'react';

export const SkipToContent: React.FC = () => {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-6 focus:py-3 focus:bg-gold-luxury focus:text-black-rich focus:font-semibold focus:shadow-2xl focus:outline-none focus:ring-2 focus:ring-black-rich transition-all"
    >
      Skip to main content
    </a>
  );
};
