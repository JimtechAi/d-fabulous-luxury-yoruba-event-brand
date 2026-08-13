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
  ogImage = '/images/og-default.jpg',
  ogType = 'website',
}) => {
  useEffect(() => {
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

    // 3. Open Graph Tags
    setMetaTag('property', 'og:title', fullTitle);
    setMetaTag('property', 'og:description', description);
    setMetaTag('property', 'og:type', ogType);
    setMetaTag('property', 'og:image', ogImage);
    setMetaTag('property', 'og:site_name', BRAND_INFO.name);

    if (canonicalUrl || window.location.href) {
      const url = canonicalUrl || window.location.href;
      setMetaTag('property', 'og:url', url);

      let canonicalLink = document.querySelector('link[rel="canonical"]');
      if (!canonicalLink) {
        canonicalLink = document.createElement('link');
        canonicalLink.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalLink);
      }
      canonicalLink.setAttribute('href', url);
    }

    // 4. Schema.org JSON-LD Structured Data
    const schemaData = {
      "@context": "https://schema.org",
      "@type": "EventVenue",
      "name": BRAND_INFO.name,
      "description": BRAND_INFO.positioning,
      "areaServed": "UK and International Destination",
      "knowsLanguage": ["English", "Yoruba"],
      "offers": {
        "@type": "Offer",
        "category": "Luxury Event Host & Cultural Ceremonies"
      }
    };

    let scriptTag = document.querySelector('script[id="json-ld-schema"]');
    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.setAttribute('id', 'json-ld-schema');
      scriptTag.setAttribute('type', 'application/ld+json');
      document.head.appendChild(scriptTag);
    }
    scriptTag.textContent = JSON.stringify(schemaData);

  }, [title, description, canonicalUrl, ogImage, ogType]);

  return null;
};
