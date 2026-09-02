import React from 'react';
import { Container } from '../components/Container';
import { PageHero } from '../components/PageHero';
import { SEO } from '../components/SEO';

const sectionHeadingClass = 'font-display text-2xl font-normal text-burgundy-deep sm:text-3xl';
const paragraphClass = 'leading-relaxed text-charcoal-soft/85';

export const TermsOfServiceShell: React.FC = () => (
  <>
    <SEO
      title="Terms of Service | D’Fabulous Luxury Yoruba Events"
      description="Terms governing the D’Fabulous Luxury Yoruba Events website, event enquiries, bookings and related services."
    />

    <PageHero
      title="Terms of Service"
      subtitle="The terms that govern use of the D’Fabulous website and our event services."
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Terms of Service' }]}
    />

    <main className="bg-ivory-warm py-16 text-charcoal-soft sm:py-24">
      <Container>
        <article className="mx-auto max-w-4xl space-y-12">
          <header className="border-b border-burgundy-deep/15 pb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-dark">Last updated: 2 September 2026</p>
            <p className="mt-5 max-w-3xl text-lg leading-relaxed text-charcoal-soft/90">These Terms of Service apply to the D’Fabulous Luxury Yoruba Events website and to services provided by DFABULOUSS ENT LTD, trading as D’Fabulous Luxury Yoruba Events or D’Fabulous Events.</p>
          </header>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>1. Introduction and Acceptance</h2><p className={paragraphClass}>By using this website, submitting an enquiry or asking D’Fabulous to provide services, you agree to follow these Terms where they apply. A specific quotation, booking confirmation, invoice or written agreement may contain additional event terms.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>2. About D’Fabulous</h2><p className={paragraphClass}>DFABULOUSS ENT LTD provides luxury Yoruba and cultural event services, including Alaga Iduro, Alaga Ijoko, wedding MC hosting, engagement coordination, private event hosting, Eru Iyawo presentation, cultural partnerships and destination event support. The exact service, scope and price are agreed for each event.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>3. Event Enquiries and Booking Requests</h2><p className={paragraphClass}>Website forms and other communications help D’Fabulous understand your proposed date, location, guest numbers, selected services and event requirements. An enquiry or booking request is not an acceptance of work and does not guarantee availability, a date or a price.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>4. Booking Confirmation Process</h2><p className={paragraphClass}>D’Fabulous will review the requested services, date, venue and requirements before deciding whether it can accept the booking. A booking becomes confirmed only when D’Fabulous has formally accepted it and the required payment has been received and cleared, as described in the booking documents.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>5. Booking References</h2><p className={paragraphClass}>A confirmed booking may be assigned a unique booking reference. Use that reference when contacting D’Fabulous about payment, cancellation, amendment, refund, rescheduling or other booking matters.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>6. Event Date Reservation and Lock-In</h2><p className={paragraphClass}>A provisional discussion, quotation or unpaid invoice does not lock in a date. Until the required deposit has been received and the booking confirmed, D’Fabulous may continue to accept enquiries or bookings for the same date. Once confirmed, the date is reserved subject to these Terms and the applicable event documents.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>7. Booking Fees and Charges</h2><p className={paragraphClass}>The booking amount is determined by D’Fabulous according to the services, scope, event location, duration, suppliers and requirements agreed with the client. The amount is not fixed at £5,000 or any other universal figure. The total owed is the amount specifically quoted and accepted for the event.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>8. Minimum Deposit</h2><p className={paragraphClass}>D’Fabulous may require a minimum deposit of 30% of the actual agreed booking amount to secure and lock in the event date. A different deposit may apply where agreed in writing. Any amount already paid is credited against the total booking amount.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>9. Deposit Payment and Secured Date</h2><p className={paragraphClass}>The date becomes fully secured only after D’Fabulous has formally accepted the booking and at least the required deposit has been received and cleared, subject to the applicable booking terms. The booking confirmation should state the total agreed amount, amount received, deposit requirement and outstanding balance where applicable.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>10. Remaining Balance</h2><p className={paragraphClass}>The remaining balance must be paid according to the payment schedule communicated to the client and/or shown in the booking confirmation, invoice or written agreement. D’Fabulous will not invent a universal payment deadline where the event documents specify a different schedule.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>11. Payment Methods</h2><p className={paragraphClass}>Available payment methods and instructions will be communicated for the particular booking and may be shown on the relevant invoice or payment request. Clients should use the details supplied by D’Fabulous and retain proof of payment. No payment method is guaranteed unless it has been agreed for the booking.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>12. Late Payments</h2><p className={paragraphClass}>If a payment is late, D’Fabulous may contact the client, pause work, decline an unconfirmed date or take another reasonable step permitted by the agreement and applicable law. D’Fabulous will consider the circumstances and will not use late-payment provisions to remove statutory consumer rights.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>13. Changes to Booking Details</h2><p className={paragraphClass}>Changes to the date, location, duration, guest numbers, programme or other material detail may affect availability, suppliers, price and the delivery plan. D’Fabulous will confirm material changes and any revised charge in writing where reasonably practicable.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>14. Changes to Requested Services</h2><p className={paragraphClass}>A client may ask to add, remove or change services. D’Fabulous will assess whether the change can be accommodated and will communicate any effect on scope, price, suppliers, timing or the balance before the change is treated as agreed.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>15. Client Cancellation</h2><p className={paragraphClass}>Clients should cancel promptly in writing by email or through the official WhatsApp contact displayed on the website. The effect of cancellation depends on timing, work already performed, preparation, services supplied, supplier commitments, non-recoverable costs and applicable law. A deposit is not automatically non-refundable in every circumstance.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>16. D’Fabulous Cancellation Rights</h2><p className={paragraphClass}>D’Fabulous may cancel where it cannot reasonably provide the agreed service, including because of a serious operational issue, supplier failure, venue problem or an event outside its reasonable control. D’Fabulous will notify the client promptly and discuss a suitable replacement, alternative date or fair financial resolution, subject to the agreement and applicable law.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>17. Refund Policy</h2><p className={paragraphClass}>Refunds are assessed against payments made, work performed, preparation, cancellation timing, supplier commitments and non-refundable or non-recoverable costs. Reasonable administration or preparation costs may be considered where legally permissible. Nothing in these Terms creates a blanket “no refunds” rule or limits a right that cannot legally be excluded.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>18. Non-Refundable Deposits</h2><p className={paragraphClass}>A deposit or part of it may be retained where the booking documents permit this and the amount reflects work performed, capacity reserved or genuine costs that cannot reasonably be recovered. This applies only to the extent permitted by law and does not override mandatory consumer rights.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>19. Event Postponement and Rescheduling</h2><p className={paragraphClass}>A client may request a new date, but rescheduling is not automatically guaranteed. It depends on D’Fabulous, supplier and venue availability. A new date may involve changed service costs, travel, venue, supplier or other reasonable additional costs. If no suitable date is available, the cancellation and refund position will be assessed under the booking documents and applicable law.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>20. Force Majeure</h2><p className={paragraphClass}>D’Fabulous is not responsible for delay or non-performance caused by an event beyond its reasonable control that materially prevents performance. This may include extreme weather, natural disasters, serious public emergencies, government restrictions, war, terrorism, civil unrest, major transport disruption and supplier failure outside D’Fabulous’s reasonable control.</p><p className={paragraphClass}>Force majeure does not include ordinary business problems, avoidable staffing issues, poor planning or a failure that could reasonably have been prevented. D’Fabulous will communicate promptly and work towards rescheduling, a suitable alternative or a fair resolution.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>21. Client Responsibilities</h2><p className={paragraphClass}>Clients must provide timely instructions, approvals, access, decisions and information reasonably needed to plan and deliver the event. Clients must also ensure that their guests and representatives behave safely and respectfully and follow reasonable venue and supplier requirements.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>22. Accurate Client Information</h2><p className={paragraphClass}>Information supplied by a client must be accurate, complete and current, including the event date, location, guest numbers, services, access arrangements and special requirements. D’Fabulous is not responsible for consequences caused by inaccurate or late information, subject to any responsibility that cannot legally be excluded.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>23. Venue Access and Requirements</h2><p className={paragraphClass}>The client must arrange suitable venue access, loading, parking, timings, permissions, facilities and working conditions needed for the agreed service. Delayed or restricted access may affect delivery and may create reasonable additional costs where permitted by the booking agreement.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>24. Guest Numbers and Requirements</h2><p className={paragraphClass}>Guest numbers, ceremony format, accessibility needs, timings, cultural requirements and other event details must be communicated as early as possible. Changes may affect staffing, suppliers, equipment, pricing and the suitability of the agreed service.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>25. Permissions and Third-Party Requirements</h2><p className={paragraphClass}>The client is responsible for securing venue permissions, licences, consents and approvals that belong to the client, venue or another supplier. D’Fabulous may assist where agreed but does not assume responsibility for permissions outside its agreed scope.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>26. Suppliers and Subcontractors</h2><p className={paragraphClass}>D’Fabulous may work with independent suppliers, contractors or subcontractors where this is appropriate for the agreed service. Their availability, terms and costs may affect delivery. D’Fabulous will remain responsible for the services it has agreed to provide, subject to the contract and applicable law.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>27. Service Availability</h2><p className={paragraphClass}>Services are subject to date, venue, travel, staffing, supplier and operational availability. Website descriptions are general information; the confirmed scope is the scope set out in the client’s quotation or booking documents.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>28. Photography and Videography</h2><p className={paragraphClass}>Photography or videography may be part of an event or supplied by an independent provider where agreed. D’Fabulous will not use identifiable client images for promotional purposes without an appropriate permission or other lawful basis. Clients should tell D’Fabulous promptly about reasonable privacy or no-photography requirements.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>29. Intellectual Property</h2><p className={paragraphClass}>D’Fabulous retains rights in its brand, original written materials, schedules, concepts, methods, content and other materials it creates, except where rights belong to someone else. The client receives a limited right to use event materials supplied for the agreed event, not to copy, resell or commercially exploit D’Fabulous materials without permission.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>30. Liability Limitations</h2><p className={paragraphClass}>Nothing in these Terms excludes or limits liability for death or personal injury caused by negligence, fraud, fraudulent misrepresentation, breach of a legal right or any other liability that cannot legally be excluded or limited. Subject to that, D’Fabulous is responsible for losses that are reasonably foreseeable and caused by its breach, and does not accept responsibility for losses outside that scope to the extent permitted by law.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>31. Property Damage and Losses</h2><p className={paragraphClass}>Clients are responsible for damage or loss caused by them or their guests to D’Fabulous or supplier property, except where caused by the relevant provider’s negligence or other legal responsibility. D’Fabulous is not responsible for personal belongings left at a venue unless the law requires otherwise.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>32. Personal Injury and Safety</h2><p className={paragraphClass}>Clients must provide a safe venue and tell D’Fabulous about relevant hazards, access needs and safety restrictions. Guests remain responsible for their own reasonable conduct. D’Fabulous will take reasonable care in delivering its services, and nothing in these Terms limits non-excludable liability.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>33. Alcohol, Catering, Venue and Third-Party Responsibilities</h2><p className={paragraphClass}>The client, venue and relevant suppliers remain responsible for alcohol service, catering, food safety, venue operations, security, licences and third-party services outside D’Fabulous’s agreed scope. D’Fabulous does not take responsibility for a third party’s service merely because it helps coordinate event arrangements.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>34. Complaints Procedure</h2><p className={paragraphClass}>Raise a complaint promptly with details of the event, service and concern so D’Fabulous can investigate while records are available. Contact <a className="font-medium text-burgundy-rich underline underline-offset-4" href="mailto:fabulousevents@hotmail.com">fabulousevents@hotmail.com</a> or use the official WhatsApp contact displayed on the website. D’Fabulous will review the matter and discuss a reasonable response.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>35. WhatsApp and Email Communications</h2><p className={paragraphClass}>D’Fabulous primarily communicates with customers through WhatsApp and email. Clients should check that contact details are accurate, keep relevant messages and tell D’Fabulous if an important communication has not arrived. WhatsApp is an independent platform and its own terms and privacy information apply to use of that service.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>36. Electronic Communications and Consent</h2><p className={paragraphClass}>You agree that quotations, confirmations, invoices, notices and other booking communications may be sent electronically where permitted by law. You should retain copies of important communications. Electronic acceptance or payment may evidence agreement, but a mandatory legal formality still applies where required.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>37. Privacy and Personal Data</h2><p className={paragraphClass}>D’Fabulous handles personal information in accordance with its separate <a className="font-medium text-burgundy-rich underline underline-offset-4" href="/privacy">Privacy Policy</a>. That policy explains information collected through booking and contact forms, email, WhatsApp and booking administration. Please avoid sending unnecessary sensitive information through WhatsApp or email.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>38. Website Content and Availability</h2><p className={paragraphClass}>We aim to keep the website useful and accurate, but content may change and the website may occasionally be unavailable, delayed or affected by maintenance, networks or events outside our control. Website content is not a promise that every service, date or image will remain available.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>39. Prohibited or Unlawful Use</h2><p className={paragraphClass}>You must not use the website unlawfully, attempt unauthorised access, interfere with its operation, submit malicious or misleading information, impersonate another person, misuse forms, copy protected content without permission or use the website to harm D’Fabulous or another person.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>40. Governing Law</h2><p className={paragraphClass}>These Terms are governed by the laws of England and Wales, subject to any mandatory consumer protection law that applies to the client.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>41. Jurisdiction</h2><p className={paragraphClass}>Subject to mandatory consumer rights, the courts of England and Wales will have jurisdiction over disputes relating to these Terms. A consumer may also have the right to bring proceedings in the courts available under the law that applies to them.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>42. Consumer Rights</h2><p className={paragraphClass}>Nothing in these Terms removes or limits rights and remedies that UK consumers legally retain, including protections under the Consumer Rights Act 2015 and other applicable consumer legislation. If services are supplied to a customer in another jurisdiction, mandatory local protections may also apply.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>43. Changes to These Terms</h2><p className={paragraphClass}>D’Fabulous may update these website Terms when its services, website or legal requirements change. The updated version will show a new date. A material change to an existing booking will not be imposed through a website update alone where the booking documents or law require agreement.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>44. Severability</h2><p className={paragraphClass}>If a court or competent authority finds part of these Terms unlawful or unenforceable, that part will be adjusted or removed only to the extent necessary. The remaining provisions will continue to operate.</p></section>

          <section className="space-y-4"><h2 className={sectionHeadingClass}>45. Entire Agreement</h2><p className={paragraphClass}>For a particular event, the applicable quotation, booking confirmation, invoice, contract and written amendments together record the agreement between the parties, alongside these website Terms where relevant. No provision overrides a mandatory legal right.</p></section>

          <section className="border-t border-burgundy-deep/15 pt-10 space-y-4"><h2 className={sectionHeadingClass}>46. Contact Information</h2><address className="not-italic leading-relaxed text-burgundy-deep"><strong>DFABULOUSS ENT LTD</strong><br />Trading as D’Fabulous Luxury Yoruba Events / D’Fabulous Events<br />Company Registration No. 12638479<br />VAT registered: No<br /><br />7 Bell Yard<br />London<br />WC2A 2JR<br />United Kingdom<br /><br />Email: <a className="underline underline-offset-4" href="mailto:fabulousevents@hotmail.com">fabulousevents@hotmail.com</a><br />Primary customer communication: WhatsApp and email</address></section>
        </article>
      </Container>
    </main>
  </>
);