/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense } from 'react';
import { RouterProvider, useRouter } from './lib/router';
import { AppLayout } from './layouts/AppLayout';
import { Container } from './components/Container';
import { AdminRouteGuard } from './components/AdminRouteGuard';

interface AppErrorBoundaryState {
  hasError: boolean;
}

class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[D’Fabulous App] Unhandled render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-ivory-warm px-6 py-24 text-center text-burgundy-deep" role="alert">
          <Container className="mx-auto max-w-xl">
            <h1 className="font-display text-3xl">This page needs to be refreshed</h1>
            <p className="mt-4 text-charcoal-soft/80">An unexpected error interrupted the experience. Please reload the page and try again.</p>
            <button
              type="button"
              className="mt-8 border border-burgundy-deep bg-burgundy-deep px-6 py-3 font-semibold text-ivory-warm"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          </Container>
        </main>
      );
    }

    return this.props.children;
  }
}

const HomeShell = lazy(() => import('./pages/HomeShell').then((module) => ({ default: module.HomeShell })));
const ServicesCatalogShell = lazy(() => import('./pages/ServicesCatalogShell').then((module) => ({ default: module.ServicesCatalogShell })));
const GalleryShell = lazy(() => import('./pages/GalleryShell').then((module) => ({ default: module.GalleryShell })));
const BookShell = lazy(() => import('./pages/BookShell').then((module) => ({ default: module.BookShell })));
const ContactShell = lazy(() => import('./pages/ContactShell').then((module) => ({ default: module.ContactShell })));
const AboutShell = lazy(() => import('./pages/AboutShell').then((module) => ({ default: module.AboutShell })));
const ExperienceShell = lazy(() => import('./pages/ExperienceShell').then((module) => ({ default: module.ExperienceShell })));
const TestimonialsShell = lazy(() => import('./pages/TestimonialsShell').then((module) => ({ default: module.TestimonialsShell })));
const FaqShell = lazy(() => import('./pages/FaqShell').then((module) => ({ default: module.FaqShell })));
const GenericPageShell = lazy(() => import('./pages/GenericPageShell').then((module) => ({ default: module.GenericPageShell })));
const NotFoundShell = lazy(() => import('./pages/NotFoundShell').then((module) => ({ default: module.NotFoundShell })));
const AdminLoginShell = lazy(() => import('./pages/AdminLoginShell').then((module) => ({ default: module.AdminLoginShell })));
const AdminDashboardShell = lazy(() => import('./pages/AdminDashboardShell').then((module) => ({ default: module.AdminDashboardShell })));
const AdminBookingsShell = lazy(() => import('./pages/AdminBookingsShell').then((module) => ({ default: module.AdminBookingsShell })));
const AdminPaymentsShell = lazy(() => import('./pages/AdminPaymentsShell').then((module) => ({ default: module.AdminPaymentsShell })));
const AdminCalendarShell = lazy(() => import('./pages/AdminCalendarShell').then((module) => ({ default: module.AdminCalendarShell })));
const AdminEnquiriesShell = lazy(() => import('./pages/AdminEnquiriesShell').then((module) => ({ default: module.AdminEnquiriesShell })));
const AdminCustomersShell = lazy(() => import('./pages/AdminCustomersShell').then((module) => ({ default: module.AdminCustomersShell })));
const AdminServicesShell = lazy(() => import('./pages/AdminServicesShell').then((module) => ({ default: module.AdminServicesShell })));
const AdminSettingsShell = lazy(() => import('./pages/AdminSettingsShell').then((module) => ({ default: module.AdminSettingsShell })));
const AdminSectionShell = lazy(() => import('./pages/AdminSectionShell').then((module) => ({ default: module.AdminSectionShell })));
const AdminResetPasswordShell = lazy(() => import('./pages/AdminResetPasswordShell').then((module) => ({ default: module.AdminResetPasswordShell })));

const RouteLoading: React.FC = () => (
  <section className="flex min-h-[50vh] items-center justify-center bg-ivory-warm px-6 py-24">
    <Container className="text-center">
      <p className="font-display text-2xl text-burgundy-deep" role="status">Preparing your D’Fabulous experience...</p>
    </Container>
  </section>
);

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
      case '/gallery/videos':
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
      case '/services/destination-events':
      case '/destination-events':
      case '/privacy':
      case '/cookies':
      case '/terms':
      case '/booking-terms':
      case '/accessibility':
        return <GenericPageShell path={currentPath} />;
      default:
        return <NotFoundShell />;
    }
  };

  if (currentPath === '/admin/login') {
    return <Suspense fallback={<RouteLoading />}><AdminLoginShell /></Suspense>;
  }

  if (currentPath === '/admin/reset-password') {
    return <Suspense fallback={<RouteLoading />}><AdminResetPasswordShell /></Suspense>;
  }

  if (currentPath.startsWith('/admin')) {
    let adminContent: React.ReactNode = <AdminDashboardShell />;

    if (currentPath === '/admin/bookings') {
      adminContent = <AdminBookingsShell />;
    } else if (currentPath === '/admin/payments') {
      adminContent = <AdminPaymentsShell />;
    } else if (currentPath === '/admin/calendar') {
      adminContent = <AdminCalendarShell />;
    } else if (currentPath === '/admin/enquiries') {
      adminContent = <AdminEnquiriesShell />;
    } else if (currentPath === '/admin/customers') {
      adminContent = <AdminCustomersShell />;
    } else if (currentPath === '/admin/services') {
      adminContent = <AdminServicesShell />;
    } else if (currentPath === '/admin/settings') {
      adminContent = <AdminSettingsShell />;
    }

    return <Suspense fallback={<RouteLoading />}><AdminRouteGuard>{adminContent}</AdminRouteGuard></Suspense>;
  }

  return <AppLayout><Suspense fallback={<RouteLoading />}>{renderRoute()}</Suspense></AppLayout>;
};

export default function App() {
  return (
    <AppErrorBoundary>
      <RouterProvider>
        <AppContent />
      </RouterProvider>
    </AppErrorBoundary>
  );
}
