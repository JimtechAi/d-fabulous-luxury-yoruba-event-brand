import { useEffect, useRef } from 'react';
import { useRouter } from '../lib/router';

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

// GA4 must never load or record events for the protected admin area.
const isAdminPath = (path: string) => path === '/admin' || path.startsWith('/admin/');

export const Analytics: React.FC = () => {
  const { currentPath } = useRouter();
  const gtagReady = useRef(false);
  const lastTrackedPath = useRef<string | null>(null);

  // Loads gtag.js once (on the first non-admin route reached) and records a
  // page_view for every subsequent client-side route change.
  useEffect(() => {
    if (isAdminPath(currentPath)) return;

    const analyticsWindow = window as AnalyticsWindow;

    if (!gtagReady.current) {
      const measurementId = (import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim();
      if (!measurementId || document.querySelector('script[data-dfabulous-ga4]')) return;

      analyticsWindow.dataLayer = analyticsWindow.dataLayer || [];
      analyticsWindow.gtag = (...args: unknown[]) => {
        analyticsWindow.dataLayer?.push(args);
      };

      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      script.dataset.dfabulousGa4 = 'true';
      document.head.appendChild(script);

      analyticsWindow.gtag('js', new Date());
      // send_page_view is disabled here because this is a client-routed SPA:
      // page views are dispatched explicitly below on every route change to
      // avoid duplicates and to include the correct title/path per route.
      analyticsWindow.gtag('config', measurementId, { anonymize_ip: true, send_page_view: false });
      gtagReady.current = true;
    }

    if (lastTrackedPath.current === currentPath) return;
    lastTrackedPath.current = currentPath;

    // Routes are code-split (React.lazy), so the destination page's SEO
    // component may update document.title well after this effect runs.
    // Wait for that title mutation (bounded by a fallback timeout) before
    // reading it, so GA4 records the correct per-route page_title.
    const path = currentPath;
    const titleEl = document.querySelector('title');
    let settled = false;
    let observer: MutationObserver | null = null;

    const dispatchPageView = () => {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      analyticsWindow.gtag?.('event', 'page_view', {
        page_path: path,
        page_location: window.location.href,
        page_title: document.title,
      });
    };

    if (titleEl) {
      observer = new MutationObserver(dispatchPageView);
      observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    }
    const fallbackTimer = window.setTimeout(dispatchPageView, 600);

    return () => {
      window.clearTimeout(fallbackTimer);
      observer?.disconnect();
    };
  }, [currentPath]);

  // Lightweight conversion signals for existing CTAs/forms. No personal data
  // (names, emails, phone numbers, form values) is ever sent.
  useEffect(() => {
    const analyticsWindow = window as AnalyticsWindow;

    const handleConversionClick = (event: MouseEvent) => {
      if (isAdminPath(window.location.pathname)) return;
      const target = event.target instanceof Element ? event.target.closest('a,button') : null;
      if (!target) return;
      const link = target instanceof HTMLAnchorElement ? target : null;
      const href = link?.getAttribute('href') || '';
      const label = target.textContent?.trim().slice(0, 80) || 'unnamed';
      const eventName = href === '/book'
        ? 'booking_cta_click'
        : href === '/contact'
          ? 'contact_cta_click'
          : href.startsWith('https://wa.me/')
            ? 'whatsapp_click'
            : href.startsWith('mailto:')
              ? 'email_click'
              : '';
      if (eventName) analyticsWindow.gtag?.('event', eventName, { link_text: label, link_url: href });
    };

    const handleFormSubmit = () => {
      const path = window.location.pathname;
      if (isAdminPath(path)) return;
      const eventName = path === '/book'
        ? 'booking_form_submit'
        : path === '/contact'
          ? 'contact_form_submit'
          : '';
      if (eventName) analyticsWindow.gtag?.('event', eventName, { page_path: path });
    };

    document.addEventListener('click', handleConversionClick);
    document.addEventListener('submit', handleFormSubmit);
    return () => {
      document.removeEventListener('click', handleConversionClick);
      document.removeEventListener('submit', handleFormSubmit);
    };
  }, []);

  return null;
};
