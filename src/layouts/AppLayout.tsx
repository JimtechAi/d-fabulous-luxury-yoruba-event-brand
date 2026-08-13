/**
 * AppLayout Component
 * Standard application shell wrapping header, skip link, main content container, and footer.
 */

import React from 'react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SkipToContent } from '../components/SkipToContent';

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-ivory-warm text-black-rich antialiased selection:bg-gold-luxury selection:text-black-rich font-sans">
      <SkipToContent />
      <Header />
      <main id="main-content" className="flex-grow focus:outline-none" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </div>
  );
};
