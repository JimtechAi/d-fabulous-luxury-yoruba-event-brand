/**
 * GenericPageShell Component
 * Clean, structured placeholder shell for inner routes, maintaining brand layout standards.
 */

import React from 'react';
import { Container } from '../components/Container';
import { PageHero } from '../components/PageHero';
import { SectionHeading } from '../components/SectionHeading';
import { SEO } from '../components/SEO';
import { Button } from '../components/Button';
import { ALL_ROUTES, BRAND_INFO, SERVICES_LIST } from '../data/brand';
import { Crown, Sparkles, CheckCircle2, Calendar, Mail } from 'lucide-react';

interface GenericPageShellProps {
  path: string;
  sectionBlocks?: {
    title: string;
    description: string;
  }[];
}

export const GenericPageShell: React.FC<GenericPageShellProps> = ({ path }) => {
  const routeMeta = ALL_ROUTES.find((r) => r.path === path) || {
    path,
    title: `${path.split('/').pop()?.toUpperCase() || 'Page'} | D’Fabulous`,
    desc: "D’Fabulous luxury event brand.",
  };

  // Check if this route matches a service
  const serviceDetail = SERVICES_LIST.find((s) => s.slug === path);

  const serviceVideoMap: Record<string, string> = {
    '/services/alaga-iduro': '/assets/services/alaga-iduro/alaga-iduro.webp.mp4',
    '/services/alaga-ijoko': '/assets/services/alaga-ijoko/alaga-ijoko.webp.mp4',
  };

  const serviceVideoSrc = serviceDetail ? serviceVideoMap[path] : undefined;

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
      <SEO title={routeMeta.title} description={routeMeta.desc} />

      <PageHero
        title={serviceDetail ? serviceDetail.title : routeMeta.title.split('|')[0].trim()}
        subtitle={serviceDetail ? serviceDetail.shortDescription : routeMeta.desc}
        breadcrumbs={formatBreadcrumb(path)}
      />

      <section className="py-16 sm:py-24 bg-ivory-warm">
        <Container>
          <div className="max-w-4xl mx-auto space-y-12">
            
            {serviceDetail ? (
              <div className="bg-white p-8 sm:p-12 rounded-2xl border border-gold-primary/20 shadow-md space-y-8">
                <div>
                  <span className="inline-block px-3 py-1 text-xs font-semibold uppercase tracking-widest text-burgundy-rich bg-gold-light/20 rounded-full border border-gold-primary/30 mb-4">
                    {serviceDetail.category.toUpperCase()} SERVICE OFFERING
                  </span>
                  <h2 className="text-3xl font-serif font-bold text-burgundy-rich">
                    {serviceDetail.title}
                  </h2>
                  <p className="mt-4 text-neutral-700 leading-relaxed text-lg">
                    {serviceDetail.shortDescription}
                  </p>
                </div>

                {serviceVideoSrc && (
                  <div className="overflow-hidden rounded-2xl border border-gold-primary/20 bg-black-rich">
                    <video
                      src={serviceVideoSrc}
                      controls
                      playsInline
                      preload="metadata"
                      className="block w-full max-h-[480px] object-cover"
                    />
                  </div>
                )}

                <div className="border-t border-b border-neutral-200 py-6 space-y-4">
                  <h3 className="font-serif font-semibold text-burgundy-rich text-lg flex items-center gap-2">
                    <Crown className="w-5 h-5 text-gold-primary" />
                    Key Ceremonial Deliverables
                  </h3>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-neutral-700">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-gold-dark shrink-0" />
                      Yoruba & English Bilingual Hosting
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-gold-dark shrink-0" />
                      Family Spokesperson Representation
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-gold-dark shrink-0" />
                      Ancestral Protocol Alignment
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-gold-dark shrink-0" />
                      Timeline & Vendor Coordination
                    </li>
                  </ul>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                  <Button variant="primary" href="/book">
                    BOOK THIS SERVICE
                  </Button>
                  <Button variant="outline" href="/contact">
                    REQUEST CONSULTATION
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-white p-8 sm:p-12 rounded-2xl border border-gold-primary/20 shadow-md text-center space-y-6">
                <Crown className="w-12 h-12 text-gold-primary mx-auto" />
                <h2 className="text-3xl font-serif font-bold text-burgundy-rich">
                  {routeMeta.title.split('|')[0].trim()}
                </h2>
                <p className="text-neutral-700 max-w-2xl mx-auto leading-relaxed text-lg">
                  {routeMeta.desc}
                </p>

                <div className="pt-6 border-t border-neutral-200 flex flex-wrap justify-center gap-4">
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

