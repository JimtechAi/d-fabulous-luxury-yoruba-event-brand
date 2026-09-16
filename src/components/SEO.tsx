/**
 * SEO & Open Graph Metadata Manager
 * Standardized meta tags, canonical links, and structured schema support.
 */

import React, { useEffect } from 'react';
import { PageMetaProps } from '../types';
import { BRAND_INFO } from '../data/brand';

export const SEO: React.FC<PageMetaProps> = ({
  title,
  description,
  canonicalUrl,
  ogImage = '/assets/hero/hero1.webp',
  ogType = 'website',
  schemaType,
  schemaName,
  schemaItems = [],
  noindex = false,
}) => {
  useEffect(() => {
    const configuredSiteUrl = (import.meta.env.VITE_SITE_URL || '').replace(/\/+$/, '');
    const siteUrl = configuredSiteUrl || window.location.origin;

    // 1. Document Title
    const fullTitle = title.includes("D’Fabulous") ? title : `${title} | D’Fabulous`;
    document.title = fullTitle;

    // Helper to update or create meta tag
    const setMetaTag = (attrName: string, attrVal: string, contentVal: string) => {
      let element = document.querySelector(`meta[${attrName}="${attrVal}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attrName, attrVal);
        document.head.appendChild(element);
      }
      element.setAttribute('content', contentVal);
    };

    // 2. Standard Meta Description
    setMetaTag('name', 'description', description);

    // Robots directive: pages such as 404 should not be indexed even though they render normally.
    setMetaTag('name', 'robots', noindex ? 'noindex, follow' : 'index, follow');

    // 3. Open Graph Tags
    setMetaTag('property', 'og:title', fullTitle);
    setMetaTag('property', 'og:description', description);
    setMetaTag('property', 'og:type', ogType);
    setMetaTag('property', 'og:image', ogImage);
    setMetaTag('property', 'og:site_name', BRAND_INFO.name);

    if (canonicalUrl || window.location.href) {
      const canonicalPath = canonicalUrl
        ? new URL(canonicalUrl, window.location.origin).pathname
        : window.location.pathname;
      const url = `${siteUrl}${canonicalPath === '/' ? '' : canonicalPath}`;
      const absoluteOgImage = new URL(ogImage, window.location.origin).href;
      setMetaTag('property', 'og:url', url);
      setMetaTag('property', 'og:image', absoluteOgImage);
      setMetaTag('name', 'twitter:card', 'summary_large_image');
      setMetaTag('name', 'twitter:title', fullTitle);
      setMetaTag('name', 'twitter:description', description);
      setMetaTag('name', 'twitter:image', absoluteOgImage);

      let canonicalLink = document.querySelector('link[rel="canonical"]');
      if (!canonicalLink) {
        canonicalLink = document.createElement('link');
        canonicalLink.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalLink);
      }
      canonicalLink.setAttribute('href', url);

      const verificationToken = (import.meta.env.VITE_GOOGLE_SITE_VERIFICATION || '').trim();
      if (verificationToken) {
        setMetaTag('name', 'google-site-verification', verificationToken);
      }
    }

    // 4. Schema.org JSON-LD Structured Data
    const website = {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      "name": BRAND_INFO.name,
      "url": siteUrl,
      "publisher": { "@id": `${siteUrl}/#organization` },
    };

    const organization = {
      "@type": ["Organization", "ProfessionalService"],
      "@id": `${siteUrl}/#organization`,
      "name": BRAND_INFO.name,
      "description": BRAND_INFO.positioning,
      "url": siteUrl,
      "email": BRAND_INFO.placeholders.email,
      "areaServed": ["United Kingdom", "Europe", "Nigeria", "International destinations"],
      "knowsLanguage": ["English", "Yoruba"],
    };

    const graph: Record<string, unknown>[] = [website, organization];
    if (schemaType === 'service' && schemaName) {
      graph.push({
        "@type": "Service",
        "name": schemaName,
        "provider": { "@id": `${siteUrl}/#organization` },
        "areaServed": organization.areaServed,
      });
    }

    graph.push({
      "@type": "WebPage",
      "@id": `${siteUrl}${window.location.pathname}#webpage`,
      "url": canonicalUrl || `${siteUrl}${window.location.pathname}`,
      "name": fullTitle,
      "description": description,
      "isPartOf": { "@id": `${siteUrl}/#website` },
    });
    if (schemaType === 'faq' && schemaItems.length > 0) {
      graph.push({
        "@type": "FAQPage",
        "mainEntity": schemaItems.map((item) => ({
          "@type": "Question",
          "name": item.question,
          "acceptedAnswer": { "@type": "Answer", "text": item.answer },
        })),
      });
    }

    const schemaData = { "@context": "https://schema.org", "@graph": graph };

    let scriptTag = document.querySelector('script[id="json-ld-schema"]');
    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.setAttribute('id', 'json-ld-schema');
      scriptTag.setAttribute('type', 'application/ld+json');
      document.head.appendChild(scriptTag);
    }
    scriptTag.textContent = JSON.stringify(schemaData);

  }, [title, description, canonicalUrl, ogImage, ogType, schemaType, schemaName, schemaItems, noindex]);

  return null;
};
