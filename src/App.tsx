/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { RouterProvider, useRouter } from './lib/router';
import { AppLayout } from './layouts/AppLayout';
import { HomeShell } from './pages/HomeShell';
import { ServicesCatalogShell } from './pages/ServicesCatalogShell';
import { GalleryShell } from './pages/GalleryShell';
import { BookShell } from './pages/BookShell';
import { ContactShell } from './pages/ContactShell';
import { AboutShell } from './pages/AboutShell';
import { ExperienceShell } from './pages/ExperienceShell';
import { TestimonialsShell } from './pages/TestimonialsShell';
import { FaqShell } from './pages/FaqShell';
import { GenericPageShell } from './pages/GenericPageShell';

const AppContent: React.FC = () => {
  const { currentPath } = useRouter();

  // Route matching logic mapping path strings to components
  const renderRoute = () => {
    switch (currentPath) {
      case '/':
        return <HomeShell />;
      case '/services':
        return <ServicesCatalogShell />;
      case '/about':
        return <AboutShell />;
      case '/experience':
        return <ExperienceShell />;
      case '/gallery':
      case '/experience/gallery':
        return <GalleryShell type="gallery" />;
      case '/videos':
      case '/experience/videos':
        return <GalleryShell type="videos" />;
      case '/contact':
        return <ContactShell />;
      case '/book':
        return <BookShell />;
      case '/testimonials':
      case '/awards':
      case '/experience/testimonials':
        return <TestimonialsShell />;
      case '/faq':
      case '/experience/faq':
        return <FaqShell />;
      case '/services/alaga-iduro':
      case '/services/alaga-ijoko':
      case '/services/wedding-mc':
      case '/services/engagement-coordination':
      case '/services/private-events':
      case '/services/eru-iyawo':
      case '/services/brand-influencing':
      case '/destination-events':
      case '/privacy':
      case '/cookies':
      case '/terms':
      case '/booking-terms':
      case '/accessibility':
        return <GenericPageShell path={currentPath} />;
      default:
        return <GenericPageShell path={currentPath} />;
    }
  };

  return <AppLayout>{renderRoute()}</AppLayout>;
};

export default function App() {
  return (
    <RouterProvider>
      <AppContent />
    </RouterProvider>
  );
}
