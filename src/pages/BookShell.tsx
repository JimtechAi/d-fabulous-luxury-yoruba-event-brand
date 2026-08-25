/**
 * BookShell Component
 * Reservation consultation page for event date availability inquiries and service specifications.
 */

import React, { useEffect, useState } from 'react';
import { Container } from '../components/Container';
import { PageHero } from '../components/PageHero';
import { Button } from '../components/Button';
import { SEO } from '../components/SEO';
import { BRAND_INFO, SERVICES_LIST } from '../data/brand';
import { getEventAvailability, submitBooking } from '../lib/db';
import { Calendar, CheckCircle2, AlertCircle, Send, ShieldCheck, Clock, MapPin, Sparkles } from 'lucide-react';

interface FormData {
  fullName: string;
  email: string;
  phone: string;
  eventDate: string;
  eventLocation: string;
  guestCount: string;
  selectedServices: string[];
  additionalDetails: string;
  website_hp: string; // Honeypot field
}

interface FormErrors {
  fullName?: string;
  email?: string;
  phone?: string;
  eventLocation?: string;
  selectedServices?: string;
}

export const BookShell: React.FC = () => {
  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    email: '',
    phone: '',
    eventDate: '',
    eventLocation: '',
    guestCount: '',
    selectedServices: [],
    additionalDetails: '',
    website_hp: '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [unavailableDates, setUnavailableDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    void getEventAvailability()
      .then((rows) => setUnavailableDates(new Set(
        rows
          .filter((row) => row.available === false || row.reason === 'booked' || row.reason === 'owner_blocked')
          .map((row) => row.event_date.slice(0, 10)),
      )))
      .catch(() => undefined);
  }, []);

  const normalizeDate = (value: string): string => value.slice(0, 10);

  const getDateError = (date: string): string | undefined => {
    if (!date) return undefined;
    return unavailableDates.has(normalizeDate(date)) ? 'This date is unavailable. Please select another date.' : undefined;
  };

  const currentDateError = getDateError(formData.eventDate);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Telephone / WhatsApp number is required';
    }

    const dateError = formData.eventDate ? getDateError(formData.eventDate) : 'Proposed event date is required';

    if (!formData.eventLocation.trim()) {
      newErrors.eventLocation = 'Event city/location is required';
    }

    if (formData.selectedServices.length === 0) {
      newErrors.selectedServices = 'Please select at least one service required';
    }

    setErrors(newErrors);
    return !dateError && Object.keys(newErrors).length === 0;
  };

  const handleServiceToggle = (title: string) => {
    setFormData((prev) => {
      const exists = prev.selectedServices.includes(title);
      const updated = exists
        ? prev.selectedServices.filter((item) => item !== title)
        : [...prev.selectedServices, title];
      return { ...prev, selectedServices: updated };
    });
    if (errors.selectedServices) {
      setErrors((prev) => ({ ...prev, selectedServices: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Honeypot check for spambots
    if (formData.website_hp) {
      setStatus('success');
      return;
    }

    if (!validateForm()) {
      return;
    }

    setStatus('submitting');
    setErrorMessage('');

    try {
      const parsedGuestCount = formData.guestCount ? parseInt(formData.guestCount, 10) : null;
      
      const result = await submitBooking({
        full_name: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        event_date: formData.eventDate,
        event_location: formData.eventLocation,
        services_requested: formData.selectedServices,
        estimated_guest_count: isNaN(parsedGuestCount as number) ? null : parsedGuestCount,
        celebration_details: formData.additionalDetails,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to record booking submission.');
      }

      setStatus('success');
    } catch (err: unknown) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected transmission error occurred.');
    }
  };

  return (
    <>
      <SEO
        title="Reserve Your Event Date | Book D’Fabulous"
        description="Official booking request form for D’Fabulous luxury Yoruba event hosting, Alaga services, and wedding reception direction."
      />

      <PageHero
        title="Reserve Your Celebration Date"
        subtitle="Begin your journey toward an extraordinary ceremonial experience guided by Yoruba cultural authority and refined elegance."
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Reserve Date' },
        ]}
      />

      <section className="py-16 md:py-24 bg-ivory-warm text-burgundy-rich">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            
            {/* Left Column: Guidelines & Assurance */}
            <div className="lg:col-span-5 space-y-8">
              <div>
                <span className="text-xs font-semibold tracking-[0.25em] text-gold-luxury uppercase block mb-3 font-sans">
                  Direct Availability Inquiry
                </span>
                <h2 className="font-display text-3xl sm:text-4xl font-normal text-black-rich">
                  Bespoke Event Reservation
                </h2>
                <p className="mt-4 text-charcoal-soft/80 leading-relaxed">
                  Due to high demand across key wedding seasons in the UK, Europe, and international destinations, date reservations are managed strictly on a first-confirmed basis.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 bg-ivory-warm border border-burgundy-deep/15 hover:border-gold-luxury/50 transition-colors duration-300">
                  <Clock className="w-6 h-6 text-gold-luxury shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-burgundy-deep">24–48 Hour Response Guarantee</h3>
                    <p className="text-sm text-charcoal-soft/70 mt-1">
                      Our team will review your requested date, event location, and ceremonial requirements before confirming availability.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-ivory-warm border border-burgundy-deep/15 hover:border-gold-luxury/50 transition-colors duration-300">
                  <ShieldCheck className="w-6 h-6 text-gold-luxury shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-burgundy-deep">Confidential Consultation</h3>
                    <p className="text-sm text-charcoal-soft/70 mt-1">
                      All celebration specifications and family details are handled with complete discretion and professional care.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-ivory-warm border border-burgundy-deep/15 hover:border-gold-luxury/50 transition-colors duration-300">
                  <Sparkles className="w-6 h-6 text-gold-luxury shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-burgundy-deep">Tailored Cultural Guidance</h3>
                    <p className="text-sm text-charcoal-soft/70 mt-1">
                      Whether you require combined Alaga Iduro and Alaga Ijoko hosting or high-energy reception MC hosting, we structure bespoke packages.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 border border-gold-luxury/30 bg-burgundy-deep text-ivory-warm space-y-3">
                <h4 className="font-display text-lg font-normal text-gold-luxury">Direct Inquiries</h4>
                <p className="text-sm text-champagne-soft/85">
                  Prefer direct communication? You can also reach our booking office via email or phone.
                </p>
                <div className="text-sm pt-2 space-y-1">
                  <p><span className="text-gold-light">Email:</span> {BRAND_INFO.placeholders.email}</p>
                  <p><span className="text-gold-light">Phone:</span> {BRAND_INFO.placeholders.phone}</p>
                </div>
              </div>
            </div>

            {/* Right Column: Form */}
            <div className="lg:col-span-7 bg-white p-8 sm:p-10 rounded-2xl border border-gold-primary/20 shadow-lg">
              {status === 'success' ? (
                <div className="text-center py-12 space-y-6">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h3 className="text-2xl font-serif font-bold text-burgundy-rich">
                    Inquiry Received Successfully
                  </h3>
                  <p className="text-neutral-700 max-w-md mx-auto leading-relaxed">
                    Thank you, <strong className="text-burgundy-rich">{formData.fullName}</strong>. Your event specifications have been recorded. D’Fabulous team will review calendar availability and contact you within 24–48 hours.
                  </p>

                  <div className="pt-4">
                    <Button
                      variant="primary"
                      onClick={() => {
                        setStatus('idle');
                        setErrors({});
                        setErrorMessage('');
                        setFormData({
                          fullName: '',
                          email: '',
                          phone: '',
                          eventDate: '',
                          eventLocation: '',
                          guestCount: '',
                          selectedServices: [],
                          additionalDetails: '',
                          website_hp: '',
                        });
                      }}
                    >
                      Submit Another Inquiry
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                  {/* Honeypot Field */}
                  <div style={{ display: 'none', visibility: 'hidden' }} aria-hidden="true">
                    <label htmlFor="website_hp">Leave this field empty</label>
                    <input
                      type="text"
                      id="website_hp"
                      name="website_hp"
                      tabIndex={-1}
                      value={formData.website_hp}
                      onChange={(e) => setFormData({ ...formData, website_hp: e.target.value })}
                      autoComplete="off"
                    />
                  </div>

                  <h3 className="text-xl font-serif font-bold text-burgundy-rich border-b border-neutral-200 pb-3">
                    Event & Client Details
                  </h3>

                  {status === 'error' && (
                    <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-3 text-sm">
                      <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Full Name */}
                    <div>
                      <label htmlFor="fullName" className="block text-xs font-semibold uppercase tracking-wider text-burgundy-rich mb-2">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="fullName"
                        aria-invalid={Boolean(errors.fullName)}
                        aria-describedby={errors.fullName ? 'fullName-error' : undefined}
                        value={formData.fullName}
                        onChange={(e) => {
                          setFormData({ ...formData, fullName: e.target.value });
                          if (errors.fullName) setErrors({ ...errors, fullName: undefined });
                        }}
                        className={`w-full px-4 py-3 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary ${
                          errors.fullName ? 'border-red-500 bg-red-50/20' : 'border-neutral-300 focus:border-gold-primary'
                        }`}
                        placeholder="e.g. Dr. Olumide Adeleke"
                      />
                      {errors.fullName && <p id="fullName-error" className="mt-1 text-xs text-red-500">{errors.fullName}</p>}
                    </div>

                    {/* Email */}
                    <div>
                      <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-burgundy-rich mb-2">
                        Email Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        id="email"
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? 'email-error' : undefined}
                        value={formData.email}
                        onChange={(e) => {
                          setFormData({ ...formData, email: e.target.value });
                          if (errors.email) setErrors({ ...errors, email: undefined });
                        }}
                        className={`w-full px-4 py-3 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary ${
                          errors.email ? 'border-red-500 bg-red-50/20' : 'border-neutral-300 focus:border-gold-primary'
                        }`}
                        placeholder="name@example.com"
                      />
                      {errors.email && <p id="email-error" className="mt-1 text-xs text-red-500">{errors.email}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Phone */}
                    <div>
                      <label htmlFor="phone" className="block text-xs font-semibold uppercase tracking-wider text-burgundy-rich mb-2">
                        Phone / WhatsApp <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        id="phone"
                        aria-invalid={Boolean(errors.phone)}
                        aria-describedby={errors.phone ? 'phone-error' : undefined}
                        value={formData.phone}
                        onChange={(e) => {
                          setFormData({ ...formData, phone: e.target.value });
                          if (errors.phone) setErrors({ ...errors, phone: undefined });
                        }}
                        className={`w-full px-4 py-3 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary ${
                          errors.phone ? 'border-red-500 bg-red-50/20' : 'border-neutral-300 focus:border-gold-primary'
                        }`}
                        placeholder="+44 7123 456789"
                      />
                      {errors.phone && <p id="phone-error" className="mt-1 text-xs text-red-500">{errors.phone}</p>}
                    </div>

                    {/* Event Date */}
                    <div>
                      <label htmlFor="eventDate" className="block text-xs font-semibold uppercase tracking-wider text-burgundy-rich mb-2">
                        Proposed Event Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        id="eventDate"
                        aria-invalid={Boolean(currentDateError)}
                        value={formData.eventDate}
                        onChange={(e) => {
                          const selectedDate = normalizeDate(e.target.value);
                          setFormData((current) => ({ ...current, eventDate: selectedDate }));
                        }}
                        min={new Date().toISOString().slice(0, 10)}
                        aria-describedby={currentDateError ? 'eventDate-error' : 'eventDate-help'}
                        className={`w-full px-4 py-3 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary ${
                          currentDateError ? 'border-red-500 bg-red-50/20' : 'border-neutral-300 focus:border-gold-primary'
                        }`}
                      />
                      <p id="eventDate-help" className="mt-1 text-xs text-neutral-500">Unavailable dates cannot be selected.</p>
                      {currentDateError && <p id="eventDate-error" className="mt-1 text-xs text-red-500">{currentDateError}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Location */}
                    <div>
                      <label htmlFor="eventLocation" className="block text-xs font-semibold uppercase tracking-wider text-burgundy-rich mb-2">
                        Event Location / City / Venue <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="eventLocation"
                        aria-invalid={Boolean(errors.eventLocation)}
                        aria-describedby={errors.eventLocation ? 'eventLocation-error' : undefined}
                        value={formData.eventLocation}
                        onChange={(e) => {
                          setFormData({ ...formData, eventLocation: e.target.value });
                          if (errors.eventLocation) setErrors({ ...errors, eventLocation: undefined });
                        }}
                        className={`w-full px-4 py-3 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary ${
                          errors.eventLocation ? 'border-red-500 bg-red-50/20' : 'border-neutral-300 focus:border-gold-primary'
                        }`}
                        placeholder="e.g. London, UK / Lagos, Nigeria"
                      />
                      {errors.eventLocation && <p id="eventLocation-error" className="mt-1 text-xs text-red-500">{errors.eventLocation}</p>}
                    </div>

                    {/* Guest Count */}
                    <div>
                      <label htmlFor="guestCount" className="block text-xs font-semibold uppercase tracking-wider text-burgundy-rich mb-2">
                        Estimated Guest Count
                      </label>
                      <select
                        id="guestCount"
                        value={formData.guestCount}
                        onChange={(e) => setFormData({ ...formData, guestCount: e.target.value })}
                        className="w-full px-4 py-3 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-gold-primary"
                      >
                        <option value="">Select range...</option>
                        <option value="under-100">Under 100 Guests</option>
                        <option value="100-250">100 – 250 Guests</option>
                        <option value="250-500">250 – 500 Guests</option>
                        <option value="500-1000">500 – 1,000 Guests</option>
                        <option value="1000+">1,000+ Guests</option>
                      </select>
                    </div>
                  </div>

                  {/* Service Checkboxes */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-burgundy-rich mb-2">
                      Select Required Services <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {SERVICES_LIST.map((service) => {
                        const isChecked = formData.selectedServices.includes(service.title);
                        return (
                          <button
                            type="button"
                            key={service.id}
                            onClick={() => handleServiceToggle(service.title)}
                            className={`flex items-start gap-3 p-3 text-left rounded-lg border text-xs transition-all ${
                              isChecked
                                ? 'bg-gold-light/20 border-gold-primary font-medium text-burgundy-rich'
                                : 'bg-neutral-50 border-neutral-200 text-neutral-700 hover:border-gold-primary/50'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border mt-0.5 flex items-center justify-center shrink-0 ${
                              isChecked ? 'bg-burgundy-rich border-burgundy-rich text-white' : 'border-neutral-400'
                            }`}>
                              {isChecked && <CheckCircle2 className="w-3 h-3" />}
                            </div>
                            <div>
                              <p className="font-semibold text-burgundy-rich">{service.title}</p>
                              <p className="text-[11px] text-neutral-500">{service.yorubaName}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {errors.selectedServices && <p id="selectedServices-error" className="mt-2 text-xs text-red-500">{errors.selectedServices}</p>}
                  </div>

                  {/* Additional Details */}
                  <div>
                    <label htmlFor="additionalDetails" className="block text-xs font-semibold uppercase tracking-wider text-burgundy-rich mb-2">
                      Celebration Details / Special Requirements
                    </label>
                    <textarea
                      id="additionalDetails"
                      rows={4}
                      value={formData.additionalDetails}
                      onChange={(e) => setFormData({ ...formData, additionalDetails: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-gold-primary"
                      placeholder="Share details regarding ceremonial timeline, family heritage elements, dress codes, or specific venue protocols..."
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      disabled={status === 'submitting'}
                      className="w-full flex items-center justify-center gap-2"
                    >
                      {status === 'submitting' ? (
                        <span>Transmitting Inquiry...</span>
                      ) : (
                        <>
                          <span>SUBMIT BOOKING ENQUIRY</span>
                          <Send className="w-4 h-4 ml-1" />
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </div>

          </div>
        </Container>
      </section>
    </>
  );
};

