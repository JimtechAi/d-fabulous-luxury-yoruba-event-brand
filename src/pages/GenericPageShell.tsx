/**
 * GenericPageShell Component
 * Clean, structured placeholder shell for inner routes, maintaining brand layout standards.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Container } from '../components/Container';
import { PageHero } from '../components/PageHero';
import { SEO } from '../components/SEO';
import { Button } from '../components/Button';
import { getResponsiveImageProps } from '../lib/media';
import { ALL_ROUTES, BRAND_INFO, SERVICES_LIST } from '../data/brand';
import { ArrowUpRight, CheckCircle2, Crown } from 'lucide-react';

interface GenericPageShellProps {
  path: string;
  sectionBlocks?: {
    title: string;
    description: string;
  }[];
}

interface ServiceEditorialContent {
  intro: string;
  deliverables: string[];
  images: string[];
  imageAlt: string;
}

const SERVICE_EDITORIAL_CONTENT: Record<string, ServiceEditorialContent> = {
  'alaga-iduro': {
    intro: "As Alaga Iduro, D’Fabulous represents the groom’s family with articulate Yoruba and English ceremonial negotiation, respectful delegation leadership, and a warm command of the engagement floor.",
    deliverables: [
      'Fluent Yoruba and English ceremonial negotiation',
      'Respectful Dobale guidance for the groom and groomsmen',
      'Presentation of official engagement letters and family requests',
      'Harmonious interaction with the Alaga Ijoko',
    ],
    images: ['/assets/services/alaga-iduro/alaga-iduro2.webp', '/assets/services/alaga-iduro/alaga-iduro3.webp', '/assets/services/alaga-iduro/alaga-iduro4.webp'],
    imageAlt: 'D’Fabulous leading a groom family delegation during a Yoruba traditional engagement',
  },
  'alaga-ijoko': {
    intro: 'As Alaga Ijoko, D’Fabulous acts as the bride’s family host and custodian, guiding the groom’s delegation, traditional gift inspection, bridal unveiling, and family blessings with warmth and dignity.',
    deliverables: [
      'Authoritative ceremonial hosting for the bride’s family',
      'Traditional gift inspection and Eru Iyawo unveiling protocols',
      'Emotional and joyful bridal entrance direction',
      'Parental blessings and ancestral family recognition',
    ],
    images: ['/assets/services/alaga-ijoko/alaga-ijoko1.webp', '/assets/services/alaga-ijoko/alaga-ijoko2.webp', '/assets/services/alaga-ijoko/alaga-ijoko3.webp', '/assets/services/alaga-ijoko/alaga-ijoko4.webp'],
    imageAlt: 'D’Fabulous hosting a Yoruba bride family ceremony with cultural elegance',
  },
  'wedding-mc': {
    intro: 'A polished reception host who protects the rhythm of the celebration, coordinates with the event team, and keeps every entrance, toast, and transition feeling effortless.',
    deliverables: [
      'High-energy, sophisticated audience engagement',
      'Coordination with planners, DJs, live bands, and caterers',
      'Bridal party entrances, toast introductions, and cake cutting',
      'Cultural sensitivity for multicultural and international guests',
    ],
    images: ['/assets/services/wedding-mc/wedding-mc1.webp'],
    imageAlt: 'D’Fabulous hosting a luxury wedding reception from the stage',
  },
  'engagement-coordination': {
    intro: 'Traditional engagement protocol coordination keeps ceremonial items, family seating hierarchies, and the event timeline aligned so families can remain present in the moment.',
    deliverables: ['Ceremonial timeline structuring', 'Traditional engagement floor direction', 'Family and vendor flow alignment', 'Respectful handling of key protocol moments'],
    images: ['/assets/services/engagement/engagement1.webp', '/assets/services/engagement/engagement2.webp', '/assets/services/engagement/engagement3.webp'],
    imageAlt: 'Traditional Yoruba engagement ceremony arranged with considered detail',
  },
  'private-events': {
    intro: 'For milestone birthdays, anniversaries, chieftaincy celebrations, and private galas, D’Fabulous brings a regal presence that makes the room feel considered, warm, and beautifully paced.',
    deliverables: ['Elegant event hosting', 'Guest and programme flow direction', 'Warm ceremonial introductions', 'Bespoke support for private celebrations'],
    images: ['/assets/services/private-events/private-events1.webp', '/assets/services/private-events/private-events2.webp', '/assets/services/private-events/private-events3.webp'],
    imageAlt: 'D’Fabulous bringing refined presence to a private celebration',
  },
  'eru-iyawo': {
    intro: 'Eru Iyawo presentation is shaped with visual care and cultural significance, from the arrangement of traditional gifts to the moment they are inspected and unveiled.',
    deliverables: ['Traditional gift wrapping guidance', 'Presentation box arrangement', 'Dowry gift inspection support', 'Ceremonial unveiling protocols'],
    images: ['/assets/services/eru-iyawo/eru-iyawo1.webp', '/assets/services/eru-iyawo/eru-iyawo2.webp', '/assets/services/eru-iyawo/eru-iyawo3.webp'],
    imageAlt: 'Eru Iyawo traditional gift presentation prepared for a Yoruba engagement',
  },
  'brand-influencing': {
    intro: 'D’Fabulous provides cultural consultancy and host representation for high-profile cultural galas, fashion showcases, and luxury brand events that require credible presence and cultural fluency.',
    deliverables: ['Cultural consultancy', 'Host representation', 'Luxury event appearances', 'Culturally considered audience engagement'],
    images: ['/assets/services/cultural-ambassador/cultural-ambassador1.webp', '/assets/services/cultural-ambassador/cultural-ambassador2.webp', '/assets/services/cultural-ambassador/cultural-ambassador3.webp'],
    imageAlt: 'Cultural and luxury brand event representation by D’Fabulous',
  },
  'destination-events': {
    intro: 'For destination weddings across Europe, North America, and internationally, D’Fabulous brings ceremonial leadership and cultural clarity wherever the celebration takes place.',
    deliverables: ['International destination event hosting', 'Yoruba traditional engagement leadership', 'Coordination across multicultural guest groups', 'Culturally faithful ceremony direction'],
    images: ['/images/services/destination-events.webp'],
    imageAlt: 'D’Fabulous leading a destination Yoruba celebration',
  },
};

export const GenericPageShell: React.FC<GenericPageShellProps> = ({ path }) => {
  const routeMeta = ALL_ROUTES.find((r) => r.path === path) || {
    path,
    title: `${path.split('/').pop()?.toUpperCase() || 'Page'} | D’Fabulous`,
    desc: "D’Fabulous luxury event brand.",
  };

  // Check if this route matches a service
  const serviceDetail = SERVICES_LIST.find((s) => s.slug === path);
  const serviceContent = serviceDetail ? SERVICE_EDITORIAL_CONTENT[serviceDetail.id] : undefined;

  const serviceVideoMap: Record<string, string> = {
    '/services/alaga-ijoko': '/videos/video1.mp4',
  };

  const serviceVideoPosterMap: Record<string, string> = {
    '/services/alaga-ijoko': '/images/services/alaga-ijoko.webp',
  };

  const serviceVideoSrc = serviceDetail ? serviceVideoMap[path] : undefined;
  const serviceVideoPoster = serviceDetail ? serviceVideoPosterMap[path] : undefined;
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false);

  useEffect(() => {
    if (!serviceVideoSrc || !videoContainerRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoadVideo(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' },
    );

    observer.observe(videoContainerRef.current);
    return () => observer.disconnect();
  }, [serviceVideoSrc]);

  const formatBreadcrumb = (p: string) => {
    const parts = p.split('/').filter(Boolean);
    if (parts.length === 0) return [{ label: 'Home' }];
    return [
      { label: 'Home', href: '/' },
      ...parts.map((part, index) => {
        const url = '/' + parts.slice(0, index + 1).join('/');
        const label = part.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
        return index === parts.length - 1 ? { label } : { label, href: url };
      }),
    ];
  };

  return (
    <>
      <SEO
        title={routeMeta.title}
        description={routeMeta.desc}
        schemaType={serviceDetail ? 'service' : undefined}
        schemaName={serviceDetail?.title}
        canonicalUrl={path === '/destination-events' ? `${window.location.origin}/services/destination-events` : undefined}
        noindex={path === '/destination-events'}
      />

      <PageHero
        title={serviceDetail ? serviceDetail.title : routeMeta.title.split('|')[0].trim()}
        subtitle={serviceDetail ? serviceDetail.shortDescription : routeMeta.desc}
        breadcrumbs={formatBreadcrumb(path)}
      />

      <section className="py-16 sm:py-24 bg-ivory-warm">
        <Container>
          <div className="max-w-4xl mx-auto space-y-12">
            
            {serviceDetail && serviceContent ? (
              <div className="space-y-16">
                <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-16">
                  <div className="space-y-7 lg:col-span-5">
                    <span className="block text-xs font-semibold uppercase tracking-[0.25em] text-gold-luxury">
                      {serviceDetail.category} service / {serviceDetail.yorubaName}
                    </span>
                    <h2 className="font-display text-4xl font-normal leading-tight text-black-rich sm:text-5xl">
                      {serviceDetail.title}
                    </h2>
                    <p className="text-base leading-relaxed text-charcoal-soft/85 sm:text-lg">
                      {serviceContent.intro}
                    </p>
                    <div className="flex flex-wrap gap-3 pt-2">
                      <Button variant="primary" href="/book" icon={<ArrowUpRight className="h-4 w-4" />} iconPosition="right">
                        CHECK YOUR DATE
                      </Button>
                      <Button variant="outline" href="/contact">DISCUSS YOUR EVENT</Button>
                    </div>
                  </div>
                  <div className="relative lg:col-span-7">
                    <div className="aspect-[4/3] overflow-hidden border border-gold-luxury/30 bg-burgundy-dark">
                      <img src={serviceContent.images[0]} {...getResponsiveImageProps(serviceContent.images[0], '(max-width: 1024px) 100vw, 58vw')} alt={serviceContent.imageAlt} className="h-full w-full object-cover" loading="eager" decoding="sync" fetchPriority="high" />
                    </div>
                    <span className="absolute -bottom-4 right-5 bg-burgundy-dark px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-gold-luxury">D’Fabulous / {serviceDetail.title}</span>
                  </div>
                </div>

                <div className="grid gap-10 border-y border-burgundy-deep/15 py-10 lg:grid-cols-12 lg:gap-16">
                  <div className="lg:col-span-4">
                    <div className="flex items-center gap-3 text-burgundy-deep">
                      <Crown className="h-6 w-6 text-gold-luxury" />
                      <h3 className="font-display text-2xl font-normal">What this includes</h3>
                    </div>
                  </div>
                  <ul className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
                    {serviceContent.deliverables.map((deliverable) => (
                      <li key={deliverable} className="flex items-start gap-3 text-sm leading-relaxed text-charcoal-soft/85">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold-luxury" />
                        {deliverable}
                      </li>
                    ))}
                  </ul>
                </div>

                {serviceVideoSrc && (
                  <div ref={videoContainerRef} className="overflow-hidden border border-gold-luxury/20 bg-black-rich">
                    <video
                      src={shouldLoadVideo ? serviceVideoSrc : undefined}
                      poster={serviceVideoPoster}
                      controls
                      playsInline
                      preload="none"
                      className="block w-full max-h-[480px] object-cover"
                    />
                  </div>
                )}

                {serviceContent.images.length > 1 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {serviceContent.images.slice(1).map((image, index) => (
                      <img key={image} src={image} {...getResponsiveImageProps(image, '(max-width: 640px) 50vw, 25vw')} alt={`${serviceContent.imageAlt}, detail ${index + 2}`} loading="lazy" decoding="async" className="aspect-[4/3] h-full w-full object-cover" />
                    ))}
                  </div>
                )}

                <div className="border border-gold-luxury/30 bg-burgundy-dark px-7 py-10 text-center text-ivory-warm sm:px-12">
                  <p className="mb-3 text-xs uppercase tracking-[0.25em] text-gold-luxury">Begin the conversation</p>
                  <h3 className="font-display text-3xl font-normal sm:text-4xl">Let’s shape the right role for your celebration.</h3>
                  <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-champagne-soft/80">Share your date, venue, and ceremony plans with the booking office to discuss availability and the right D’Fabulous service.</p>
                  <div className="mt-7 flex flex-wrap justify-center gap-3">
                    <Button variant="primary" href="/book">CHECK DATE AVAILABILITY</Button>
                    <Button variant="outline-light" href="/contact">CONTACT THE OFFICE</Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-ivory-warm p-8 sm:p-12 border border-burgundy-deep/15 text-center space-y-6">
                <Crown className="w-12 h-12 text-gold-luxury mx-auto" />
                <h2 className="font-display text-3xl font-normal text-burgundy-deep">
                  {routeMeta.title.split('|')[0].trim()}
                </h2>
                <p className="text-charcoal-soft/80 max-w-2xl mx-auto leading-relaxed text-lg">
                  {routeMeta.desc}
                </p>

                <div className="pt-6 border-t border-burgundy-deep/15 flex flex-wrap justify-center gap-4">
                  <Button variant="primary" href="/book">
                    BOOK D’FABULOUS
                  </Button>
                  <Button variant="outline" href="/contact">
                    CONTACT BOOKING OFFICE
                  </Button>
                </div>
              </div>
            )}

          </div>
        </Container>
      </section>
    </>
  );
};

