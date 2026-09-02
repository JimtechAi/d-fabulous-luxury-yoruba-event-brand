import React from 'react';
import { Container } from '../components/Container';
import { PageHero } from '../components/PageHero';
import { SEO } from '../components/SEO';

const legalBasisRows = [
  ['Responding to enquiries', 'Answering questions sent through the website, email or WhatsApp.', 'Legitimate interests; consent where required by law.'],
  ['Managing bookings and services', 'Checking availability, preparing quotations and delivering the requested event service.', 'Contract or steps requested before entering into a contract.'],
  ['Processing payments', 'Recording deposits, balances, invoices and transactions connected with a booking.', 'Contract; legal obligation.'],
  ['Maintaining business records', 'Keeping booking references, correspondence and service history accurate and usable.', 'Legitimate interests; legal obligation.'],
  ['Security and misuse prevention', 'Protecting the website, booking process and business from fraud, abuse or unauthorised activity.', 'Legitimate interests; legal obligation.'],
  ['Legal matters', 'Establishing, exercising or defending legal claims and responding to lawful requests.', 'Legitimate interests; legal obligation.'],
  ['Improving the website and services', 'Understanding requests and improving our service where this can be done lawfully.', 'Legitimate interests; consent where required.'],
];

const sectionHeadingClass = 'font-display text-2xl font-normal text-burgundy-deep sm:text-3xl';
const paragraphClass = 'leading-relaxed text-charcoal-soft/85';

export const PrivacyPolicyShell: React.FC = () => (
  <>
    <SEO
      title="Privacy Policy | D’Fabulous"
      description="How DFABULOUSS ENT LTD, trading as D’Fabulous Luxury Yoruba Events, handles personal information."
    />

    <PageHero
      title="Privacy Policy"
      subtitle="A clear account of how D’Fabulous Events handles personal information."
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Privacy Policy' }]}
    />

    <main className="bg-ivory-warm py-16 text-charcoal-soft sm:py-24">
      <Container>
        <article className="mx-auto max-w-4xl space-y-12">
          <header className="border-b border-burgundy-deep/15 pb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-dark">Last updated: 2 September 2026</p>
            <p className="mt-5 max-w-3xl text-lg leading-relaxed text-charcoal-soft/90">
              This Privacy Policy explains how DFABULOUSS ENT LTD, trading as D’Fabulous Luxury Yoruba Events and also referred to as D’Fabulous Events, handles personal information when providing luxury Yoruba and cultural event planning, coordination, hosting and related services.
            </p>
          </header>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>1. Who We Are</h2>
            <p className={paragraphClass}>The organisation responsible for the personal information described in this policy is:</p>
            <address className="border-l-2 border-gold-luxury pl-5 not-italic leading-relaxed text-burgundy-deep">
              <strong>DFABULOUSS ENT LTD</strong><br />
              7 Bell Yard<br />
              London WC2A 2JR<br />
              United Kingdom<br />
              Company number: 12638479<br />
              Email: <a className="underline underline-offset-4" href="mailto:fabulousevents@hotmail.com">fabulousevents@hotmail.com</a>
            </address>
            <p className={paragraphClass}>We take privacy seriously and aim to collect and use information fairly, transparently and only as needed for our business and legal responsibilities.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>2. Scope of This Privacy Policy</h2>
            <p className={paragraphClass}>This policy applies to website visitors, people who contact us, booking enquirers, customers, event clients, people who communicate with us through WhatsApp or email, people who submit website forms, people making or enquiring about payments, and people otherwise interacting with the website.</p>
          </section>

          <section className="space-y-5">
            <h2 className={sectionHeadingClass}>3. Information We Collect</h2>
            <p className={paragraphClass}>Depending on how you interact with us, we may collect:</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                ['Identity and contact', 'Full name, email address, WhatsApp contact details and other contact details you choose to provide.'],
                ['Event information', 'Event date, location, guest numbers, event type, services requested, requirements, notes and other details you supply.'],
                ['Booking information', 'Booking reference, booking status, booking details, enquiry history and correspondence relating to a booking.'],
                ['Payment information', 'The public booking form does not provide online payment checkout. In the private administration system, D’Fabulous may record deposits, balances, invoices and transactions, including manual records or records associated with Paystack or Flutterwave where those providers are used for a particular payment. We do not state that we store full card numbers, CVV numbers or banking credentials.'],
              ].map(([title, text]) => <li key={title} className="border border-burgundy-deep/15 p-5"><h3 className="font-semibold text-burgundy-deep">{title}</h3><p className="mt-2 text-sm leading-relaxed text-charcoal-soft/80">{text}</p></li>)}
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>4. Information Provided Through WhatsApp</h2>
            <p className={paragraphClass}>If you voluntarily contact D’Fabulous Events through WhatsApp, we may process the information in those communications to respond to enquiries, discuss event requirements, provide quotations, manage bookings, confirm event details, provide support, follow up on enquiries, and discuss payments or booking arrangements.</p>
            <p className={paragraphClass}>WhatsApp is a third-party communication platform. Please also review WhatsApp’s own privacy information and consider what information you choose to send through that service.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>5. Email Communications</h2>
            <p className={paragraphClass}>We use email addresses to respond to enquiries, send booking-related information and confirmations, provide information you request, discuss event arrangements, provide customer service and handle legitimate administrative communications. We do not describe these communications as marketing emails unless that functionality is introduced and the applicable rules are followed.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>6. How We Collect Information</h2>
            <p className={paragraphClass}>Information may be collected through website booking forms, contact forms, booking availability requests, email, WhatsApp, direct customer communications, booking administration, payment and transaction processes, and information you voluntarily supply.</p>
          </section>

          <section className="space-y-5">
            <h2 className={sectionHeadingClass}>7. How We Use Your Information</h2>
            <div className="overflow-x-auto border border-burgundy-deep/15">
              <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                <caption className="sr-only">Purposes, examples and legal bases for using personal information</caption>
                <thead className="bg-burgundy-deep text-left text-xs uppercase tracking-wider text-ivory-warm"><tr><th className="p-4">Purpose</th><th className="p-4">Example</th><th className="p-4">Legal basis</th></tr></thead>
                <tbody>{legalBasisRows.map(([purpose, example, basis]) => <tr key={purpose} className="border-t border-burgundy-deep/15 align-top"><th scope="row" className="p-4 font-semibold text-burgundy-deep">{purpose}</th><td className="p-4 leading-relaxed">{example}</td><td className="p-4 leading-relaxed">{basis}</td></tr>)}</tbody>
              </table>
            </div>
            <p className={paragraphClass}>Where we rely on consent, you may withdraw it at any time. Withdrawal does not affect processing already carried out lawfully before withdrawal.</p>
          </section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>8. Legitimate Interests</h2><p className={paragraphClass}>Where appropriate, we may rely on legitimate interests for reasonable activities such as responding to existing enquiries, managing bookings and records, protecting the website and business, preventing misuse or fraud, handling disputes and improving our services. Before relying on this basis, we consider the purpose and balance our interests against your rights and interests.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>9. Cookies and Similar Technologies</h2><p className={paragraphClass}>The website may use cookies or similar technologies needed for operation, preferences or other permitted purposes. We do not list exact cookies here because technologies may change. A separate <a className="font-medium text-burgundy-rich underline underline-offset-4" href="/cookies">Cookie Policy</a> may provide further information about the cookies actually used.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>10. Sharing Personal Information</h2><p className={paragraphClass}>We may share personal information where necessary with Supabase, which provides the database, API and authentication services used by this application, and Resend, which may receive booking or enquiry email data to send customer or administrative notifications. We may also use payment processors such as Paystack or Flutterwave for a particular payment where applicable, manual payment records, event suppliers or contractors, professional advisers, and legal or regulatory authorities where required. We do not sell personal information to third parties. The public booking form does not itself provide online payment checkout.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>11. International Data Transfers</h2><p className={paragraphClass}>Some service providers or communication platforms may process information outside the United Kingdom. Where this occurs, we will use the safeguards required by applicable data protection law. The safeguard used may depend on the provider, destination and circumstances.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>12. How Long We Keep Information</h2><p className={paragraphClass}>We keep information only for as long as reasonably necessary for the purpose collected, including managing enquiries and bookings, providing services, accounting, tax and other legal obligations, resolving disputes, and establishing or defending legal claims. Different records may be kept for different periods. When information is no longer needed, we will delete it or otherwise dispose of it securely where reasonably practicable.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>13. Data Security</h2><p className={paragraphClass}>We take reasonable technical and organisational measures to protect personal information against unauthorised access, accidental loss, destruction, alteration, unauthorised disclosure and misuse. No method of transmission or storage can be guaranteed completely secure, so we also ask you to take care when choosing what information to send.</p></section>

          <section className="space-y-5"><h2 className={sectionHeadingClass}>14. Your Data Protection Rights</h2><p className={paragraphClass}>Subject to applicable law and exceptions, you may have the right to be informed, access your information, have inaccurate information rectified, request erasure, restrict processing, receive certain information in a portable format, object to processing, and withdraw consent where processing is based on consent. You may also have rights concerning solely automated decision-making and profiling where applicable. These rights are not absolute and legal exceptions may apply.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>15. How to Exercise Your Rights</h2><p className={paragraphClass}>Email <a className="font-medium text-burgundy-rich underline underline-offset-4" href="mailto:fabulousevents@hotmail.com">fabulousevents@hotmail.com</a> with the nature of your request and enough information to help us identify you and the relevant records. We may need to verify your identity before releasing or changing personal information.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>16. Complaints</h2><p className={paragraphClass}>Please contact us first at <a className="font-medium text-burgundy-rich underline underline-offset-4" href="mailto:fabulousevents@hotmail.com">fabulousevents@hotmail.com</a> so we can try to resolve your concern. You also have the right to complain to the relevant data protection supervisory authority. For individuals in the UK, this is the Information Commissioner’s Office (ICO). We do not state that DFABULOUSS ENT LTD is ICO registered. Individuals in the EU or EEA may also complain to the supervisory authority in their country.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>17. Children’s Privacy</h2><p className={paragraphClass}>The website is not intended to knowingly collect personal information from children unless this is necessary and lawful for providing a service.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>18. Third-Party Websites</h2><p className={paragraphClass}>The website may link to third-party websites or services, including WhatsApp and social media platforms. D’Fabulous Events is not responsible for the privacy practices of those third parties. Review their privacy information before using them or submitting information.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>19. Social Media</h2><p className={paragraphClass}>The website may link to or allow interaction with Facebook, Instagram, TikTok and WhatsApp. Those platforms operate independently and may collect information under their own policies when you visit or interact with them.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>20. Automated Decision-Making</h2><p className={paragraphClass}>D’Fabulous Events does not currently use personal data for solely automated decision-making that produces legal or similarly significant effects.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>21. Changes to This Privacy Policy</h2><p className={paragraphClass}>We may update this Privacy Policy from time to time to reflect changes to our services, website, legal requirements or processing activities. The date at the top of this page shows when it was last updated.</p></section>

          <section className="border-t border-burgundy-deep/15 pt-10 space-y-4"><h2 className={sectionHeadingClass}>22. Contact Details</h2><address className="not-italic leading-relaxed text-burgundy-deep"><strong>DFABULOUSS ENT LTD</strong><br />D’Fabulous Luxury Yoruba Events<br /><br />7 Bell Yard<br />London<br />WC2A 2JR<br />United Kingdom<br /><br />Company Registration Number: 12638479<br />Email: <a className="underline underline-offset-4" href="mailto:fabulousevents@hotmail.com">fabulousevents@hotmail.com</a><br />Contact method: Email and WhatsApp</address></section>
        </article>
      </Container>
    </main>
  </>
);