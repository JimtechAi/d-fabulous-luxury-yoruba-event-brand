import React from 'react';
import { Container } from '../components/Container';
import { PageHero } from '../components/PageHero';
import { Button } from '../components/Button';
import { SEO } from '../components/SEO';

export const NotFoundShell: React.FC = () => {
  return (
    <>
      <SEO
        title="Page Not Found | D’Fabulous"
        description="The requested D’Fabulous page could not be found. Return to the homepage or contact the booking office."
        noindex
      />
      <PageHero
        title="Page Not Found"
        subtitle="The page you requested is not available, but the D’Fabulous experience continues here."
        breadcrumbs={[{ label: 'Page Not Found' }]}
      />
      <section className="py-16 sm:py-24 bg-ivory-warm">
        <Container>
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <h2 className="font-display text-4xl text-burgundy-deep">Let us guide you back.</h2>
            <p className="text-charcoal-soft leading-relaxed">
              Explore the D’Fabulous experience or begin a conversation about your celebration.
            </p>
            <div className="flex flex-wrap justify-center gap-4 pt-2">
              <Button variant="primary" href="/">Return Home</Button>
              <Button variant="secondary" href="/contact">Contact the Booking Office</Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
};