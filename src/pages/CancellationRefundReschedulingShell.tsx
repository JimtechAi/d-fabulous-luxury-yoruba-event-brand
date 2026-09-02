import React from 'react';
import { Container } from '../components/Container';
import { PageHero } from '../components/PageHero';
import { SEO } from '../components/SEO';

const sectionHeadingClass = 'font-display text-2xl font-normal text-burgundy-deep sm:text-3xl';
const paragraphClass = 'leading-relaxed text-charcoal-soft/85';

export const CancellationRefundReschedulingShell: React.FC = () => (
  <>
    <SEO
      title="Cancellation, Refund & Rescheduling Policy | D’Fabulous"
      description="Cancellation, refund and rescheduling terms for DFABULOUSS ENT LTD, trading as D’Fabulous Luxury Yoruba Events."
    />

    <PageHero
      title="Cancellation, Refund & Rescheduling Policy"
      subtitle="Clear arrangements for changing or cancelling your D’Fabulous celebration booking."
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Cancellation, Refund & Rescheduling' }]}
    />

    <main className="bg-ivory-warm py-16 text-charcoal-soft sm:py-24">
      <Container>
        <article className="mx-auto max-w-4xl space-y-12">
          <header className="border-b border-burgundy-deep/15 pb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-dark">Last Updated: 2 September 2026</p>
            <p className="mt-5 max-w-3xl text-lg leading-relaxed text-charcoal-soft/90">
              This policy explains how DFABULOUSS ENT LTD, trading as D’Fabulous Luxury Yoruba Events and also referred to as D’Fabulous Events, handles cancellations, refunds, booking changes and rescheduling for its event services.
            </p>
          </header>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>1. Purpose and Scope</h2>
            <p className={paragraphClass}>This policy applies to services booked through D’Fabulous, including Yoruba ceremonial hosting, Alaga Iduro and Alaga Ijoko services, wedding MC and entertainment services, engagement coordination, event planning and production, décor, venue-related services, supplier-supported services, destination events and other services described in a quotation or booking agreement.</p>
            <p className={paragraphClass}>It should be read with the applicable quotation, invoice, booking confirmation, contract and Booking Terms. This policy does not remove rights that cannot legally be excluded.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>2. Booking Confirmation</h2>
            <p className={paragraphClass}>Submitting an enquiry or completing a booking form does not automatically guarantee an event date, service or price. D’Fabulous will review availability and requirements before accepting a booking.</p>
            <p className={paragraphClass}>A date is considered secured only when D’Fabulous has formally accepted the booking and the required minimum deposit has been received and cleared. Until then, D’Fabulous may continue to accept enquiries or bookings for the same date.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>3. Deposit Requirement</h2>
            <p className={paragraphClass}>D’Fabulous may require a minimum deposit of 30% of the agreed booking amount to secure and lock in an event date. The actual deposit may be different where a different amount has been agreed in writing.</p>
            <p className={paragraphClass}>The total booking amount is the amount specifically quoted and agreed with the client. It is not a fixed amount for every event. A deposit is applied against the agreed booking and does not by itself guarantee services until the booking has been formally confirmed.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>4. Date Lock-In</h2>
            <p className={paragraphClass}>Once the required cleared deposit has been received and D’Fabulous has confirmed the booking, the date will be treated as reserved subject to the applicable agreement. D’Fabulous may then decline or place on hold other enquiries for that date.</p>
            <p className={paragraphClass}>A provisional discussion, quotation or unpaid invoice does not prevent the date being offered to another client.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>5. Client Cancellation</h2>
            <p className={paragraphClass}>A client who needs to cancel should notify D’Fabulous promptly in writing by email or through the official WhatsApp contact displayed on the website. The cancellation date will normally be the date the notice is received.</p>
            <p className={paragraphClass}>The financial effect of a cancellation depends on the timing and circumstances. A cancellation well before the event may leave more of the payment capable of being assessed for refund. A cancellation close to the event may leave less refundable because D’Fabulous may already have reserved time, completed preparation or committed to suppliers. A cancellation after substantial preparation, performance or supplier commitments may result in deductions for work performed and costs that cannot reasonably be recovered.</p>
            <p className={paragraphClass}>A deposit is not automatically non-refundable in every circumstance. Any entitlement will be assessed fairly against this policy, the booking documents, the work performed, supplier costs, timing and applicable UK consumer law.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>6. Refund Assessment</h2>
            <p className={paragraphClass}>When a refund is requested, D’Fabulous will assess, as relevant:</p>
            <ul className="list-disc space-y-2 pl-5 leading-relaxed text-charcoal-soft/85">
              <li>payments already made and the agreed booking amount;</li>
              <li>services, planning, preparation or other work already performed;</li>
              <li>supplier commitments, deposits and services already booked;</li>
              <li>non-refundable or non-recoverable third-party costs;</li>
              <li>how close the cancellation is to the event date; and</li>
              <li>reasonable administrative or preparation costs, where legally permissible.</li>
            </ul>
            <p className={paragraphClass}>D’Fabulous will not use a blanket “no refunds under any circumstances” rule. Any refund decision remains subject to the client’s mandatory statutory rights.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>7. Rescheduling</h2>
            <p className={paragraphClass}>Clients may ask to move an event to a new date. Rescheduling is not automatically guaranteed and is subject to D’Fabulous’s availability, the availability of the relevant suppliers and venue, and the suitability of the new date.</p>
            <p className={paragraphClass}>A change may affect the agreed service scope or price. The client may need to pay reasonable additional costs caused by the change, including supplier, venue, travel, production or administration costs, where those costs are lawful and agreed. If the new date cannot be accommodated, the request may be treated as a cancellation under the applicable booking terms.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>8. Supplier Costs</h2>
            <p className={paragraphClass}>D’Fabulous may coordinate with independent suppliers and third-party service providers for elements such as décor, entertainment, venue services, production, travel or other event requirements. If a supplier has already been booked, paid or committed to the event, that supplier’s cancellation terms and non-recoverable costs may affect the amount refundable.</p>
            <p className={paragraphClass}>D’Fabulous will explain relevant known costs as part of the refund assessment and will not use supplier costs to remove statutory consumer rights.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>9. Non-Refundable Third-Party Costs</h2>
            <p className={paragraphClass}>Some third-party costs may be non-refundable because a supplier has performed work, reserved capacity, purchased materials or applied its own cancellation terms. Those costs may be deducted from a refund where the deduction reflects a genuine cost and is permitted by law. This does not create an automatic right to retain every payment or override applicable consumer protection rights.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>10. Cancellation by D’Fabulous</h2>
            <p className={paragraphClass}>D’Fabulous may need to cancel or become unable to provide a service because of a serious operational issue, supplier failure, venue problem, or circumstance outside reasonable control. D’Fabulous will notify the client as soon as reasonably practicable and discuss available alternatives, such as a suitable replacement, a new date or a refund of amounts not properly due to be retained.</p>
            <p className={paragraphClass}>Where D’Fabulous is at fault, it will not rely on this section to avoid responsibility for a failure that could reasonably have been prevented or remedied. The client retains any remedy available under the agreement or mandatory law.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>11. Force Majeure</h2>
            <p className={paragraphClass}>Force majeure means an event beyond D’Fabulous’s reasonable control that materially prevents or delays performance. This may include extreme weather, natural disaster, serious public emergency, government restriction, war, terrorism, civil unrest, major transport disruption, or supplier failure outside D’Fabulous’s reasonable control.</p>
            <p className={paragraphClass}>It does not include ordinary business problems, avoidable staffing issues, poor planning or a failure that could reasonably have been prevented. If force majeure affects an event, D’Fabulous will communicate promptly and work with the client on a reasonable alternative, including rescheduling where feasible or a fair financial resolution taking account of services performed and irrecoverable costs.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>12. Consumer Rights</h2>
            <p className={paragraphClass}>Nothing in this policy removes or limits a right or remedy that cannot legally be excluded. This includes applicable protections under the Consumer Rights Act 2015 and other UK consumer legislation. The application of any cancellation right can depend on the service, event date, timing and circumstances, so clients should raise their situation promptly.</p>
            <p className={paragraphClass}>If services are supplied to a customer in another jurisdiction, mandatory local consumer protections may also apply. D’Fabulous does not make a blanket claim about every EU or international consumer law.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>13. Event-Specific Terms</h2>
            <p className={paragraphClass}>An individual quotation, booking confirmation, invoice, contract or written agreement may set out specific cancellation, refund, deposit or rescheduling terms for the event. If a specific event document conflicts with this policy, the specific written agreement will generally apply to that booking, subject always to mandatory legal rights and any more protective term agreed with the client.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>14. Refund Requests</h2>
            <p className={paragraphClass}>Send a refund request to <a className="font-medium text-burgundy-rich underline underline-offset-4" href="mailto:fabulousevents@hotmail.com">fabulousevents@hotmail.com</a> or via WhatsApp using the official D’Fabulous WhatsApp contact displayed on the website. Include your full name, booking reference, event date, reason for cancellation and payment details relevant to the booking.</p>
            <p className={paragraphClass}>Please do not send unnecessary sensitive information, such as passwords, full card details or security codes, through WhatsApp. A confirmed booking may have a unique booking reference; use it when discussing cancellation, amendments, refunds or rescheduling.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>15. Refund Timing</h2>
            <p className={paragraphClass}>Once a refund has been approved, D’Fabulous will process it within a reasonable period and in accordance with applicable law. It will normally be sent using the original payment method where reasonably practicable, subject to payment-provider requirements and any event-specific written terms.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>16. Payment Disputes and Chargebacks</h2>
            <p className={paragraphClass}>If you believe a payment, invoice or charge is incorrect, contact D’Fabulous first using the email or official WhatsApp channel so the booking and payment records can be reviewed. This does not prevent a client from exercising a legitimate statutory or payment-provider right.</p>
            <p className={paragraphClass}>D’Fabulous may investigate and challenge fraudulent or abusive payment activity where appropriate and lawful. It will not threaten or penalise a client for raising a genuine concern or using a lawful remedy.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>17. Amendments to Bookings</h2>
            <p className={paragraphClass}>Changing services, guest numbers, event location, date, duration, programme or other booking details may change the total price and the cancellation or rescheduling position. D’Fabulous will confirm material changes and any revised price in writing where reasonably practicable.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>18. Dispute Resolution</h2>
            <p className={paragraphClass}>Clients are encouraged to contact D’Fabulous first so the issue can be reviewed against the booking documents and resolved where possible. Nothing in this process removes a client’s statutory right to pursue legal remedies or complain to an appropriate authority.</p>
          </section>

          <section className="space-y-4">
            <h2 className={sectionHeadingClass}>19. Governing Law</h2>
            <p className={paragraphClass}>This policy is governed by the laws of England and Wales, subject to any mandatory consumer protection laws that apply to the client.</p>
          </section>

          <section className="border-t border-burgundy-deep/15 pt-10 space-y-4">
            <h2 className={sectionHeadingClass}>20. Contact D’Fabulous</h2>
            <address className="not-italic leading-relaxed text-burgundy-deep">
              <strong>DFABULOUSS ENT LTD</strong><br />
              Trading as D’Fabulous Luxury Yoruba Events / D’Fabulous Events<br />
              Company Registration No. 12638479<br /><br />
              VAT registered: No<br /><br />
              7 Bell Yard<br />
              London<br />
              WC2A 2JR<br />
              United Kingdom<br /><br />
              Email: <a className="underline underline-offset-4" href="mailto:fabulousevents@hotmail.com">fabulousevents@hotmail.com</a><br />
              WhatsApp: Use the official WhatsApp contact displayed on the D’Fabulous website.
            </address>
          </section>
        </article>
      </Container>
    </main>
  </>
);