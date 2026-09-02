/**
 * FaqShell Component
 * Dedicated Frequently Asked Questions page with full phase 7 content.
 */

import React from 'react';
import { Container } from '../components/Container';
import { PageHero } from '../components/PageHero';
import { FaqAccordion, FaqItem } from '../components/FaqAccordion';
import { Button } from '../components/Button';
import { SEO } from '../components/SEO';
import { HelpCircle, Calendar, Mail, MessageSquare, Crown } from 'lucide-react';

export const FaqShell: React.FC = () => {
  const faqList: FaqItem[] = [
    {
      id: 'q1',
      question: 'What core services does D’Fabulous provide?',
      answer: (
        <p>
          D’Fabulous specializes in luxury Yoruba traditional engagement hosting (Alaga Iduro and Alaga Ijoko), high-energy wedding reception Master of Ceremonies (MC), engagement protocol coordination, private milestone event hosting, and Eru Iyawo dowry gift presentation styling. Services can be booked individually or combined into full-day bespoke packages.
        </p>
      ),
    },
    {
      id: 'q2',
      question: 'What is the difference between Alaga Iduro and Alaga Ijoko?',
      answer: (
        <div className="space-y-2">
          <p>In a Yoruba traditional engagement ceremony (<em>Igbeyawo</em>):</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong className="text-burgundy-rich">Alaga Iduro</strong> represents the <strong>groom’s family</strong>. They lead the groom’s delegation, formally request the bride’s hand in marriage, present official engagement letters, and guide the groom and groomsmen through traditional prostration (<em>Dobale</em>) protocols with respect and dignity.
            </li>
            <li>
              <strong className="text-burgundy-rich">Alaga Ijoko</strong> represents and hosts on behalf of the <strong>bride’s family</strong>. They oversee the overall ceremonial floor, receive the groom’s delegation, inspect and unveil the Eru Iyawo (dowry gifts), and usher in the bride for parental blessings.
            </li>
          </ul>
        </div>
      ),
    },
    {
      id: 'q3',
      question: 'Does D’Fabulous provide Wedding MC services for the reception?',
      answer: (
        <p>
          Yes. D’Fabulous provides high-level Master of Ceremonies (MC) services for wedding receptions. This includes grand entrance hosting, bridal party introductions, speech and toast direction, cake cutting protocols, and keeping guests engaged and energized throughout the night while coordinating closely with wedding planners and vendors.
        </p>
      ),
    },
    {
      id: 'q4',
      question: 'Does D’Fabulous travel internationally for destination weddings?',
      answer: (
        <p>
          Absolutely. D’Fabulous frequently travels across the United Kingdom, Nigeria, mainland Europe, and international destinations across North America and beyond for couples hosting Yoruba traditional engagements or destination wedding receptions.
        </p>
      ),
    },
    {
      id: 'q5',
      question: 'Can D’Fabulous coordinate traditional engagement ceremonies alongside hosting?',
      answer: (
        <p>
          Yes. Engagement Coordination involves structuring the ceremonial sequence, managing family arrival times, overseeing dowry gift placement (Eru Iyawo), and aligning with caterers, musicians, and photographers to ensure the traditional ceremony runs seamlessly on schedule.
        </p>
      ),
    },
    {
      id: 'q6',
      question: 'Can clients combine multiple services for a full-day event?',
      answer: (
        <p>
          Yes. Many couples choose a combined package such as <strong>Alaga Hosting (Iduro or Ijoko) for the morning traditional engagement + Wedding MC for the evening reception</strong>. Combining services ensures seamless cultural continuity, consistent energy, and streamlined vendor communication throughout your wedding day.
        </p>
      ),
    },
    {
      id: 'q7',
      question: 'How far in advance should we book D’Fabulous for our wedding?',
      answer: (
        <p>
          Due to high demand during peak wedding seasons (Spring through Autumn), clients are strongly advised to reserve their event date <strong>6 to 12 months in advance</strong>. However, short-notice enquiries are welcomed subject to calendar availability.
        </p>
      ),
    },
    {
      id: 'q8',
      question: 'How does the consultation and booking workflow operate?',
      answer: (
        <ol className="list-decimal pl-5 space-y-1">
          <li><strong>Initial Inquiry</strong>: Submit your event details via our official <a href="/book" className="text-burgundy-rich font-medium underline">/book</a> form or <a href="/contact" className="text-burgundy-rich font-medium underline">/contact</a> page.</li>
          <li><strong>Date & Service Verification</strong>: D’Fabulous team reviews availability and sends a tailored proposal.</li>
          <li><strong>Consultation</strong>: A dedicated video consultation is scheduled to discuss family protocols, event timings, and cultural preferences.</li>
          <li><strong>Formal Reservation</strong>: Date is locked in upon agreement and receipt of the formal deposit.</li>
        </ol>
      ),
    },
    {
      id: 'q9',
      question: 'How can a client check specific date availability?',
      answer: (
        <p>
          You can instantly check availability by filling out the date request field on the <strong>BOOK D’FABULOUS</strong> form (<a href="/book" className="text-burgundy-rich font-medium underline">/book</a>) or contacting our team directly via email or WhatsApp details listed on our contact page (<a href="/contact" className="text-burgundy-rich font-medium underline">/contact</a>).
        </p>
      ),
    },
    {
      id: 'q10',
      question: 'Does D’Fabulous work with independent wedding planners?',
      answer: (
        <p>
          Yes. D’Fabulous collaborates seamlessly with professional wedding planners, event coordinators, venue managers, caterers, and production teams to ensure strict adherence to event timelines and venue regulations.
        </p>
      ),
    },
    {
      id: 'q11',
      question: 'Can D’Fabulous accommodate multicultural or non-Yoruba guests?',
      answer: (
        <p>
          Highly experienced in multicultural celebrations, D’Fabulous seamlessly bridges language and cultural backgrounds by hosting in polished English alongside fluent Yoruba. Ceremonial rituals are explained thoughtfully so all guests feel included and celebrated.
        </p>
      ),
    },
    {
      id: 'q12',
      question: 'Can D’Fabulous support destination events outside major cities?',
      answer: (
        <p>
          Yes. D’Fabulous supports events at luxury country estates, European châteaux, beachfront resorts, and international destinations. Full travel and accommodation logistics are arranged transparently during the consultation phase.
        </p>
      ),
    },
  ];

  return (
    <>
      <SEO
        title="Frequently Asked Questions | D’Fabulous Yoruba Events"
        description="Find clear answers about D’Fabulous services, Alaga Iduro and Alaga Ijoko hosting, wedding MC direction, destination travel, and booking procedures."
        canonicalUrl={`${window.location.origin}/faq`}
        schemaType="faq"
        schemaItems={[
          { question: 'What core services does D’Fabulous provide?', answer: 'D’Fabulous provides Yoruba traditional engagement hosting, Wedding MC, engagement protocol coordination, private event hosting, and Eru Iyawo presentation styling.' },
          { question: 'What is the difference between Alaga Iduro and Alaga Ijoko?', answer: 'Alaga Iduro represents the groom’s family. Alaga Ijoko represents and hosts on behalf of the bride’s family during the traditional engagement.' },
          { question: 'Does D’Fabulous travel internationally?', answer: 'D’Fabulous provides destination event hosting across the United Kingdom, Nigeria, Europe, North America, and other international destinations.' },
          { question: 'How can a client check date availability?', answer: 'Submit event details through the booking form or contact the team directly by email or WhatsApp.' },
        ]}
      />

      <PageHero
        title="Frequently Asked Questions"
        subtitle="Clear answers regarding Yoruba traditional engagement hosting, wedding MC direction, international travel, and event consultations."
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'FAQ' },
        ]}
      />

      <section className="py-16 sm:py-24 bg-ivory-warm">
        <Container>
          <div className="max-w-4xl mx-auto space-y-12">
            
            {/* Introductory Callout */}
            <div className="bg-ivory-warm p-6 sm:p-8 border border-burgundy-deep/15 flex flex-col sm:flex-row items-center gap-6">
              <div className="p-4 bg-burgundy-deep text-gold-luxury shrink-0">
                <HelpCircle className="w-8 h-8" />
              </div>
              <div>
                <h2 className="font-display text-xl font-normal text-burgundy-deep">
                  Everything You Need to Know Before Booking
                </h2>
                <p className="text-xs sm:text-sm text-charcoal-soft/80 mt-1 leading-relaxed">
                  Browse our core questions below. If you have specific ceremonial requirements or unique family custom questions, our consultation team is ready to assist.
                </p>
              </div>
            </div>

            {/* Accordion Component */}
            <FaqAccordion items={faqList} defaultOpenId="q1" />

            {/* Still Have Questions CTA */}
            <div className="p-8 sm:p-12 border border-gold-luxury/30 bg-burgundy-deep text-ivory-warm text-center space-y-6">
              <h3 className="font-display text-2xl sm:text-3xl font-normal text-gold-luxury">
                Have Additional Ceremonial Questions?
              </h3>
              <p className="text-champagne-soft/85 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
                Contact our booking office directly for custom inquiries, family protocol alignment, or international destination event planning.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
                <Button variant="primary" href="/book">
                  CHECK DATE AVAILABILITY
                </Button>
                <Button variant="outline-light" href="/contact">
                  CONTACT CONSULTATION OFFICE
                </Button>
              </div>
            </div>

          </div>
        </Container>
      </section>
    </>
  );
};
