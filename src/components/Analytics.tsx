import { useEffect } from 'react';
import { useRouter } from '../lib/router';

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

// GA4 must never record events for the protected admin area. The gtag
// snippet itself loads globally from index.html (see comment there), but no
// page_view or conversion event is ever dispatched for these paths.
const isAdminPath = (path: string) => path === '/admin' || path.startsWith('/admin/');

// Module-scoped (not component state) so it survives React StrictMode's
// intentional double-invocation of effects in development, guaranteeing a
// single page_view per route even when the component mounts twice.
let lastTrackedPath: string | null = null;

export const Analytics: React.FC = () => {
  const { currentPath } = useRouter();

  // gtag('js', ...) and gtag('config', ...) already ran synchronously in
  // index.html before React mounted. This effect only ever dispatches the
  // per-route page_view event; it never (re)creates the script or config,
  // and it never overwrites window.gtag.
  useEffect(() => {
    if (isAdminPath(currentPath)) return;
    if (lastTrackedPath === currentPath) return;

    const analyticsWindow = window as AnalyticsWindow;
    if (typeof analyticsWindow.gtag !== 'function') return;

    lastTrackedPath = currentPath;
    const path = currentPath;

    // Routes are code-split (React.lazy), so the destination page's SEO
    // component may update document.title well after this effect runs.
    // Wait for that title mutation (bounded by a fallback timeout) before
    // reading it, so GA4 records the correct per-route page_title.
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
