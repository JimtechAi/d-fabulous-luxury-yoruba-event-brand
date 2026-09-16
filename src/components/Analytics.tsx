import { useEffect } from 'react';

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

export const Analytics: React.FC = () => {
  useEffect(() => {
    const measurementId = (import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim();
    if (!measurementId || document.querySelector('script[data-dfabulous-ga4]')) return;

    const analyticsWindow = window as AnalyticsWindow;
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
    analyticsWindow.gtag('config', measurementId, { anonymize_ip: true });

    const handleConversionClick = (event: MouseEvent) => {
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
      script.remove();
    };
  }, []);

  return null;
};
