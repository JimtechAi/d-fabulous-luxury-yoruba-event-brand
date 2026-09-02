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
import { Mail, MessageCircle, MapPin, Send, CheckCircle2, AlertCircle, MessageSquare, Clock, Globe, Facebook, Instagram, Music2 } from 'lucide-react';

const CONTACT_SOCIAL_LINKS = [
  {
    name: 'Facebook',
    href: 'https://www.facebook.com/share/1Gw84T9QFs/',
    label: "D'Fabulous Facebook",
    icon: Facebook,
    className: 'border-[#1877F2] bg-[#1877F2] text-white hover:shadow-[0_0_16px_rgba(24,119,242,0.55)]',
  },
  {
    name: 'TikTok',
    href: 'https://www.tiktok.com/@dfabulousss',
    label: "D'Fabulous TikTok",
    icon: Music2,
    className: 'border-[#25F4EE] bg-black text-white shadow-[3px_0_0_#FE2C55] hover:shadow-[0_0_16px_rgba(37,244,238,0.5),3px_0_0_#FE2C55]',
  },
  {
    name: 'Instagram',
    href: 'https://www.instagram.com/dfabulouss/',
    label: "D'Fabulous Instagram",
    icon: Instagram,
    className: 'border-transparent bg-[linear-gradient(45deg,#FEDA75,#FA7E1E,#D62976,#962FBF,#4F5BD5)] text-white hover:shadow-[0_0_16px_rgba(214,41,118,0.5)]',
  },
] as const;

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

      <section className="py-16 md:py-24 bg-ivory-warm text-burgundy-deep">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            
            {/* Left Column: Official Contact Channels */}
            <div className="lg:col-span-5 space-y-8">
              <div>
                <span className="text-xs font-semibold tracking-[0.25em] text-gold-luxury uppercase block mb-3 font-sans">
                  Global Booking Office
                </span>
                <h2 className="font-display text-3xl sm:text-4xl font-normal text-black-rich">
                  Contact D’Fabulous
                </h2>
                <p className="mt-4 text-charcoal-soft/80 leading-relaxed">
                  WhatsApp us or send us an email. Our team will be happy to assist you.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-4 p-5 bg-ivory-warm border border-burgundy-deep/15 hover:border-gold-luxury/50 transition-colors duration-300">
                  <div className="p-3 bg-burgundy-deep/10 text-burgundy-deep shrink-0">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-burgundy-deep text-sm uppercase tracking-wider">Email</h3>
                    <a href={BRAND_INFO.placeholders.emailUrl} className="block text-sm font-medium text-charcoal-soft mt-1 hover:text-burgundy-deep underline underline-offset-2">Send us an Email</a>
                    <p className="text-xs text-charcoal-soft mt-1">{BRAND_INFO.placeholders.email}</p>
                    <p className="text-xs text-charcoal-soft/60 mt-0.5">Response within 24–48 business hours</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-5 bg-ivory-warm border border-burgundy-deep/15 hover:border-gold-luxury/50 transition-colors duration-300">
                  <div className="p-3 bg-burgundy-deep/10 text-burgundy-deep shrink-0">
                    <MessageCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-burgundy-deep text-sm uppercase tracking-wider">WhatsApp</h3>
                    <a href={BRAND_INFO.placeholders.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-medium text-[#128C7E] mt-1 hover:text-[#075E54] underline underline-offset-2">Chat on WhatsApp</a>
                    <p className="text-xs text-charcoal-soft/60 mt-0.5">Available for scheduled consultations</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-5 bg-ivory-warm border border-burgundy-deep/15 hover:border-gold-luxury/50 transition-colors duration-300">
                  <div className="p-3 bg-burgundy-deep/10 text-burgundy-deep shrink-0">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-burgundy-deep text-sm uppercase tracking-wider">Headquarters & Reach</h3>
                    <p className="text-sm font-medium text-charcoal-soft mt-1">{BRAND_INFO.location}</p>
                    <p className="text-xs text-charcoal-soft/60 mt-0.5">Serving London, Greater UK, Europe & Destination Worldwide</p>
                  </div>
                </div>
              </div>

              <div className="p-6 border border-gold-luxury/30 bg-burgundy-deep text-ivory-warm space-y-4">
                <h4 className="font-display text-lg font-normal text-gold-luxury flex items-center gap-2">
                  <Globe className="w-5 h-5 text-gold-luxury" />
                  Destination Event Inquiries
                </h4>
                <p className="text-sm text-champagne-soft/85 leading-relaxed">
                  Planning an international celebration in Europe, Nigeria, or North America? Please specify your event location and travel dates in the inquiry form.
                </p>
              </div>

              <div className="p-5 bg-ivory-warm border border-burgundy-deep/15">
                <h3 className="font-semibold text-burgundy-deep text-sm uppercase tracking-wider">Follow D’Fabulous</h3>
                <div className="mt-4 flex items-center gap-3">
                  {CONTACT_SOCIAL_LINKS.map(({ name, href, label, icon: Icon }) => (
                    <a
                      key={name}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury focus-visible:ring-offset-2 focus-visible:ring-offset-white ${CONTACT_SOCIAL_LINKS.find((social) => social.name === name)?.className}`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Contact Form */}
            <div className="lg:col-span-7 bg-ivory-warm p-8 sm:p-10 border border-burgundy-deep/15">
              {status === 'success' ? (
                <div className="text-center py-12 space-y-6">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h3 className="font-display text-2xl font-normal text-burgundy-deep">
                    Consultation Request Submitted
                  </h3>
                  <p className="text-charcoal-soft/80 max-w-md mx-auto leading-relaxed">
                    Thank you, <strong className="text-burgundy-deep">{formData.fullName}</strong>. Your message has been received. D’Fabulous team will respond within 24–48 business hours.
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

                  <h3 className="text-xl font-display font-normal text-burgundy-deep border-b border-burgundy-deep/15 pb-3">
                    Send a Direct Message
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
                      <label htmlFor="contact_fullName" className="block text-xs font-semibold uppercase tracking-wider text-burgundy-rich mb-2">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="contact_fullName"
                        aria-invalid={Boolean(errors.fullName)}
                        aria-describedby={errors.fullName ? 'contact_fullName-error' : undefined}
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
                      {errors.fullName && <p id="contact_fullName-error" className="mt-1 text-xs text-red-500">{errors.fullName}</p>}
                    </div>

                    {/* Email */}
                    <div>
                      <label htmlFor="contact_email" className="block text-xs font-semibold uppercase tracking-wider text-burgundy-rich mb-2">
                        Email Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        id="contact_email"
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? 'contact_email-error' : undefined}
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
                      {errors.email && <p id="contact_email-error" className="mt-1 text-xs text-red-500">{errors.email}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Phone */}
                    <div>
                      <label htmlFor="contact_phone" className="block text-xs font-semibold uppercase tracking-wider text-burgundy-rich mb-2">
                        WhatsApp contact number (optional)
                      </label>
                      <input
                        type="tel"
                        id="contact_phone"
                        aria-invalid={Boolean(errors.phone)}
                        aria-describedby={errors.phone ? 'contact_phone-error' : undefined}
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
                      <p className="mt-1 text-xs text-neutral-500">Provide a WhatsApp number if you would like us to contact you on WhatsApp.</p>
                      {errors.phone && <p id="contact_phone-error" className="mt-1 text-xs text-red-500">{errors.phone}</p>}
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
                      aria-invalid={Boolean(errors.message)}
                      aria-describedby={errors.message ? 'contact_message-error' : undefined}
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
                    {errors.message && <p id="contact_message-error" className="mt-1 text-xs text-red-500">{errors.message}</p>}
                  </div>

                  <div className="pt-2">
                    <p className="mb-4 text-xs leading-relaxed text-neutral-500">
                      We use the information you submit to respond to your enquiry and communicate by email or WhatsApp where applicable. Your message is stored in our business system. Read our <a href="/privacy" className="font-medium text-burgundy-rich underline underline-offset-2">Privacy Policy</a>.
                    </p>
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

