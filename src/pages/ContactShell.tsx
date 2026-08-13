/**
 * ContactShell Component
 * Contact directory and consultation inquiry shell with verified brand placeholder details.
 */

import React, { useState } from 'react';
import { Container } from '../components/Container';
import { PageHero } from '../components/PageHero';
import { Button } from '../components/Button';
import { SEO } from '../components/SEO';
import { BRAND_INFO } from '../data/brand';
import { submitMessage } from '../lib/db';
import { Mail, Phone, MapPin, Send, CheckCircle2, AlertCircle, MessageSquare, Clock, Globe } from 'lucide-react';

interface ContactFormData {
  fullName: string;
  email: string;
  phone: string;
  inquiryType: string;
  message: string;
  website_hp: string; // Honeypot
}

interface ContactFormErrors {
  fullName?: string;
  email?: string;
  phone?: string;
  inquiryType?: string;
  message?: string;
}

export const ContactShell: React.FC = () => {
  const [formData, setFormData] = useState<ContactFormData>({
    fullName: '',
    email: '',
    phone: '',
    inquiryType: 'general',
    message: '',
    website_hp: '',
  });

  const [errors, setErrors] = useState<ContactFormErrors>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const validateForm = (): boolean => {
    const newErrors: ContactFormErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Telephone number is required';
    }

    if (!formData.message.trim()) {
      newErrors.message = 'Please provide details about your inquiry';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
      const result = await submitMessage({
        full_name: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        subject: formData.inquiryType ? `Inquiry: ${formData.inquiryType}` : 'General Inquiry',
        message: formData.message,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to submit contact enquiry.');
      }

      setStatus('success');
    } catch (err: unknown) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred during transmission.');
    }
  };

  return (
    <>
      <SEO
        title="Contact & Consultations | D’Fabulous Yoruba Events"
        description="Enquire about date availability, consultation bookings, and bespoke hosting packages for your upcoming celebration."
      />

      <PageHero
        title="Contact & Consultations"
        subtitle="Connect with our booking office to discuss event hosting, traditional Alaga coordination, or international destination arrangements."
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Contact' },
        ]}
      />

      <section className="py-16 md:py-24 bg-ivory-warm text-burgundy-rich">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            
            {/* Left Column: Official Contact Channels */}
            <div className="lg:col-span-5 space-y-8">
              <div>
                <span className="inline-block px-3 py-1 mb-3 text-xs font-semibold tracking-widest text-burgundy-rich uppercase bg-gold-light/20 rounded-full border border-gold-primary/30">
                  Global Booking Office
                </span>
                <h2 className="text-3xl sm:text-4xl font-serif font-bold text-burgundy-rich">
                  Get in Touch
                </h2>
                <p className="mt-4 text-neutral-700 leading-relaxed">
                  Whether planning a traditional Yoruba engagement in London, a high-profile wedding reception, or an international destination celebration, we welcome your enquiry.
                </p>
              </div>

              <div className="space-y-6">
                <div className="flex items-start gap-4 p-5 rounded-xl bg-white border border-gold-primary/20 shadow-sm">
                  <div className="p-3 bg-burgundy-rich/10 text-burgundy-rich rounded-lg shrink-0">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-burgundy-rich text-sm uppercase tracking-wider">Official Email</h3>
                    <p className="text-sm font-medium text-neutral-800 mt-1">{BRAND_INFO.placeholders.email}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Response within 24–48 business hours</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-5 rounded-xl bg-white border border-gold-primary/20 shadow-sm">
                  <div className="p-3 bg-burgundy-rich/10 text-burgundy-rich rounded-lg shrink-0">
                    <Phone className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-burgundy-rich text-sm uppercase tracking-wider">Telephone & WhatsApp</h3>
                    <p className="text-sm font-medium text-neutral-800 mt-1">{BRAND_INFO.placeholders.phone}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Available for scheduled consultations</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-5 rounded-xl bg-white border border-gold-primary/20 shadow-sm">
                  <div className="p-3 bg-burgundy-rich/10 text-burgundy-rich rounded-lg shrink-0">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-burgundy-rich text-sm uppercase tracking-wider">Headquarters & Reach</h3>
                    <p className="text-sm font-medium text-neutral-800 mt-1">{BRAND_INFO.location}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Serving London, Greater UK, Europe & Destination Worldwide</p>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-burgundy-rich text-white space-y-4">
                <h4 className="font-serif font-semibold text-gold-primary text-lg flex items-center gap-2">
                  <Globe className="w-5 h-5 text-gold-primary" />
                  Destination Event Inquiries
                </h4>
                <p className="text-sm text-neutral-200 leading-relaxed">
                  Planning an international celebration in Europe, Nigeria, or North America? Please specify your event location and travel dates in the inquiry form.
                </p>
              </div>
            </div>

            {/* Right Column: Contact Form */}
            <div className="lg:col-span-7 bg-white p-8 sm:p-10 rounded-2xl border border-gold-primary/20 shadow-lg">
              {status === 'success' ? (
                <div className="text-center py-12 space-y-6">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h3 className="text-2xl font-serif font-bold text-burgundy-rich">
                    Consultation Request Submitted
                  </h3>
                  <p className="text-neutral-700 max-w-md mx-auto leading-relaxed">
                    Thank you, <strong className="text-burgundy-rich">{formData.fullName}</strong>. Your message has been received. D’Fabulous team will respond within 24–48 business hours.
                  </p>

                  <div className="pt-4">
                    <Button
                      variant="primary"
                      onClick={() => {
                        setStatus('idle');
                        setFormData({
                          fullName: '',
                          email: '',
                          phone: '',
                          inquiryType: 'general',
                          message: '',
                          website_hp: '',
                        });
                      }}
                    >
                      Send Another Message
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                  {/* Honeypot Field */}
                  <div style={{ display: 'none', visibility: 'hidden' }} aria-hidden="true">
                    <label htmlFor="website_hp_contact">Leave empty</label>
                    <input
                      type="text"
                      id="website_hp_contact"
                      name="website_hp"
                      tabIndex={-1}
                      value={formData.website_hp}
                      onChange={(e) => setFormData({ ...formData, website_hp: e.target.value })}
                      autoComplete="off"
                    />
                  </div>

                  <h3 className="text-xl font-serif font-bold text-burgundy-rich border-b border-neutral-200 pb-3">
                    Send a Direct Message
                  </h3>

                  {status === 'error' && (
                    <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-3 text-sm">
                      <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Full Name */}
                    <div>
                      <label htmlFor="contact_fullName" className="block text-xs font-semibold uppercase tracking-wider text-burgundy-rich mb-2">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="contact_fullName"
                        value={formData.fullName}
                        onChange={(e) => {
                          setFormData({ ...formData, fullName: e.target.value });
                          if (errors.fullName) setErrors({ ...errors, fullName: undefined });
                        }}
                        className={`w-full px-4 py-3 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary ${
                          errors.fullName ? 'border-red-500 bg-red-50/20' : 'border-neutral-300 focus:border-gold-primary'
                        }`}
                        placeholder="Your full name"
                      />
                      {errors.fullName && <p className="mt-1 text-xs text-red-500">{errors.fullName}</p>}
                    </div>

                    {/* Email */}
                    <div>
                      <label htmlFor="contact_email" className="block text-xs font-semibold uppercase tracking-wider text-burgundy-rich mb-2">
                        Email Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        id="contact_email"
                        value={formData.email}
                        onChange={(e) => {
                          setFormData({ ...formData, email: e.target.value });
                          if (errors.email) setErrors({ ...errors, email: undefined });
                        }}
                        className={`w-full px-4 py-3 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary ${
                          errors.email ? 'border-red-500 bg-red-50/20' : 'border-neutral-300 focus:border-gold-primary'
                        }`}
                        placeholder="email@domain.com"
                      />
                      {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Phone */}
                    <div>
                      <label htmlFor="contact_phone" className="block text-xs font-semibold uppercase tracking-wider text-burgundy-rich mb-2">
                        Telephone / WhatsApp <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        id="contact_phone"
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
                      {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
                    </div>

                    {/* Inquiry Type */}
                    <div>
                      <label htmlFor="contact_inquiryType" className="block text-xs font-semibold uppercase tracking-wider text-burgundy-rich mb-2">
                        Nature of Inquiry
                      </label>
                      <select
                        id="contact_inquiryType"
                        value={formData.inquiryType}
                        onChange={(e) => setFormData({ ...formData, inquiryType: e.target.value })}
                        className="w-full px-4 py-3 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-gold-primary"
                      >
                        <option value="general">General Consultation</option>
                        <option value="alaga-hosting">Alaga Iduro / Alaga Ijoko Hosting</option>
                        <option value="wedding-mc">Wedding MC Reception Direction</option>
                        <option value="destination">Destination Event Hosting</option>
                        <option value="brand-partnership">Brand Partnership / Media Inquiry</option>
                      </select>
                    </div>
                  </div>

                  {/* Message */}
                  <div>
                    <label htmlFor="contact_message" className="block text-xs font-semibold uppercase tracking-wider text-burgundy-rich mb-2">
                      Your Message / Celebration Overview <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="contact_message"
                      rows={5}
                      value={formData.message}
                      onChange={(e) => {
                        setFormData({ ...formData, message: e.target.value });
                        if (errors.message) setErrors({ ...errors, message: undefined });
                      }}
                      className={`w-full px-4 py-3 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary ${
                        errors.message ? 'border-red-500 bg-red-50/20' : 'border-neutral-300 focus:border-gold-primary'
                      }`}
                      placeholder="Please share details regarding proposed dates, location, guest expectations, or specific questions..."
                    />
                    {errors.message && <p className="mt-1 text-xs text-red-500">{errors.message}</p>}
                  </div>

                  <div className="pt-2">
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      disabled={status === 'submitting'}
                      className="w-full flex items-center justify-center gap-2"
                    >
                      {status === 'submitting' ? (
                        <span>Transmitting Message...</span>
                      ) : (
                        <>
                          <span>SEND CONSULTATION ENQUIRY</span>
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

