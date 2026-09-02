/**
 * D'Fabulous Core Brand & Navigation Registry
 * All information is strictly based on verified brand specifications.
 */

import { NavItem, ServiceDefinition } from '../types';

export const BRAND_INFO = {
  name: "D’Fabulous",
  tagline: "Luxury Yoruba Events & Ceremonial Leadership",
  location: "United Kingdom, Europe, Nigeria & Destination Worldwide",
  positioning: "Premium Yoruba ceremonial hosting, traditional Alaga engagement direction, and luxury event services for discerning couples across the UK and international destination celebrations.",
  values: [
    "Cultural Authenticity",
    "Ceremonial Poise",
    "Seamless Coordination",
    "Refined Authority",
    "International Distinction"
  ],
  placeholders: {
    email: "Fabulousevents@hotmail.com",
    address: "London, United Kingdom",
    instagram: "@dfabulousuk",
    youtube: "@dfabulousuk",
    tiktok: "@dfabulousuk",
    bookingFormUrl: "/book",
    emailUrl: "mailto:Fabulousevents@hotmail.com",
    whatsappUrl: "https://wa.me/447878709883",
  }
} as const;

export const SERVICES_LIST: ServiceDefinition[] = [
  {
    id: "alaga-iduro",
    slug: "/services/alaga-iduro",
    title: "Alaga Iduro",
    yorubaName: "Alaga Iduro (Groom's Family Spokesperson)",
    shortDescription: "Articulate spokesperson leading the groom's family delegation during the traditional engagement ceremony with cultural dignity and respectful negotiation.",
    category: "core"
  },
  {
    id: "alaga-ijoko",
    slug: "/services/alaga-ijoko",
    title: "Alaga Ijoko",
    yorubaName: "Alaga Ijoko (Bride's Family Host)",
    shortDescription: "Official custodian and ceremonial host for the bride's family, guiding ancestral rites, dowry proceedings, and family blessings.",
    category: "core"
  },
  {
    id: "wedding-mc",
    slug: "/services/wedding-mc",
    title: "Wedding MC",
    yorubaName: "Master of Ceremonies",
    shortDescription: "Sophisticated, high-energy reception direction blending cultural warmth, crowd engagement, and seamless event flow.",
    category: "core"
  },
  {
    id: "engagement-coordination",
    slug: "/services/engagement-coordination",
    title: "Engagement Coordination",
    yorubaName: "Traditional Protocol Management",
    shortDescription: "Comprehensive timeline structuring and ceremonial floor direction for Yoruba traditional engagements.",
    category: "specialist"
  },
  {
    id: "private-events",
    slug: "/services/private-events",
    title: "Private Events",
    yorubaName: "Milestone Celebrations Host",
    shortDescription: "Regal hosting for milestone birthdays, anniversaries, chieftaincy celebrations, and exclusive private galas.",
    category: "specialist"
  },
  {
    id: "eru-iyawo",
    slug: "/services/eru-iyawo",
    title: "Eru Iyawo / Gift Presentation",
    yorubaName: "Dowry Gift Presentation & Styling",
    shortDescription: "Opulent traditional dowry gift presentation styling and ceremonial unveiling protocols.",
    category: "specialist"
  },
  {
    id: "brand-influencing",
    slug: "/services/brand-influencing",
    title: "Cultural & Luxury Ambassador",
    yorubaName: "Brand Ambassadorship & Cultural Partnerships",
    shortDescription: "High-level cultural representation and luxury brand ambassadorship for prestigious events.",
    category: "brand"
  },
  {
    id: "destination-events",
    slug: "/services/destination-events",
    title: "Destination Yoruba Events",
    yorubaName: "International Destination Ceremonies",
    shortDescription: "Full ceremonial hosting for Yoruba traditional weddings across Europe, North America, and global destinations.",
    category: "specialist"
  }
];

export const NAVIGATION_ITEMS: NavItem[] = [
  {
    label: "About",
    href: "/about"
  },
  {
    label: "Services",
    href: "/services",
    children: [
      { label: "Alaga Iduro", href: "/services/alaga-iduro", description: "Groom's family cultural spokesperson" },
      { label: "Alaga Ijoko", href: "/services/alaga-ijoko", description: "Bride's family ceremonial host" },
      { label: "Wedding MC", href: "/services/wedding-mc", description: "Luxury reception Master of Ceremonies" },
      { label: "Engagement Coordination", href: "/services/engagement-coordination", description: "Yoruba traditional engagement timing & flow" },
      { label: "Private Events", href: "/services/private-events", description: "Milestone galas, anniversaries & private celebrations" },
      { label: "Eru Iyawo", href: "/services/eru-iyawo", description: "Opulent traditional gift packaging styling" },
      { label: "Brand Partnerships", href: "/services/brand-influencing", description: "Cultural & luxury brand ambassadorship" },
      { label: "Destination Events", href: "/services/destination-events", description: "International celebrations across Europe & worldwide" },
    ]
  },
  {
    label: "Experience",
    href: "/experience",
    children: [
      { label: "Gallery", href: "/gallery", description: "High-resolution celebration photography" },
      { label: "Testimonials", href: "/experience/testimonials", description: "Verified client reflections" },
      { label: "Awards", href: "/experience/awards", description: "Official honors and industry recognitions" },
      { label: "Destination Events", href: "/experience/destination-events", description: "International celebrations across Europe & worldwide" },
    ]
  },
  {
    label: "Gallery",
    href: "/gallery",
    children: [
      { label: "Gallery", href: "/gallery", description: "High-resolution celebration photography" },
      { label: "Videos", href: "/gallery/videos", description: "Cinematic event highlights & ceremonial media" },
    ]
  }
];

export const ALL_ROUTES = [
  { path: "/", title: "D’Fabulous | Luxury Yoruba Event Host & Cultural Personality", desc: "UK-based luxury event personality and cultural host for Nigerian/Yoruba traditional engagements, weddings, private events, and destination celebrations." },
  { path: "/about", title: "About D’Fabulous | Luxury Yoruba Event Host & Cultural Personality", desc: "Discover D’Fabulous—where Yoruba heritage, ceremonial authority, and modern luxury unite for bespoke traditional engagements and wedding celebrations." },
  { path: "/services", title: "Bespoke Services | D’Fabulous Luxury Yoruba Events", desc: "Explore core and specialist Yoruba event services, including Alaga Iduro, Alaga Ijoko, Wedding MC, and Traditional Engagement Coordination." },
  { path: "/services/alaga-iduro", title: "Alaga Iduro Services | D’Fabulous Luxury Yoruba Events", desc: "Professional Alaga Iduro spokesperson representing the groom's family with cultural dignity, fluent Yoruba, and respectful ceremonial negotiations." },
  { path: "/services/alaga-ijoko", title: "Alaga Ijoko Host | D’Fabulous Luxury Yoruba Events", desc: "Official Alaga Ijoko ceremonial host for the bride's family, guiding ancestral traditional engagement rites, dowry gift inspection, and bridal unveiling." },
  { path: "/services/wedding-mc", title: "Luxury Wedding MC | D’Fabulous Yoruba Event Host", desc: "Sophisticated, high-energy wedding reception Master of Ceremonies blending cultural warmth, seamless timing, and elegant audience engagement." },
  { path: "/services/engagement-coordination", title: "Engagement Coordination | D’Fabulous Yoruba Events", desc: "Expert ceremonial timeline structuring and floor coordination for Yoruba traditional engagement ceremonies across the UK and internationally." },
  { path: "/services/private-events", title: "Private Event Hosting | D’Fabulous Luxury Yoruba Events", desc: "Regal event direction for milestone birthdays, anniversaries, chieftaincy titles, and exclusive cultural galas." },
  { path: "/services/eru-iyawo", title: "Eru Iyawo Presentation | D’Fabulous Yoruba Events", desc: "Guidance on traditional Yoruba dowry gift presentation, packaging styling, and ceremonial unveiling protocols for engagement ceremonies." },
  { path: "/services/brand-influencing", title: "Cultural Brand Ambassador | D’Fabulous", desc: "Cultural consultancy, host representation, and luxury brand ambassadorship for high-profile African cultural galas and brand showcases." },
  { path: "/services/destination-events", title: "Destination Yoruba Events | D’Fabulous International", desc: "Bespoke Yoruba traditional wedding hosting and ceremonial leadership across Europe, North America, and international destination venues." },
  { path: "/experience", title: "The D’Fabulous Experience | Cultural Authority & Poise", desc: "Learn what defines the D’Fabulous experience: protocol command, visual elegance, audience engagement, and timeline precision." },
  { path: "/gallery", title: "Event Gallery | D’Fabulous Luxury Yoruba Events", desc: "Visual highlights capturing traditional engagement ceremonies, Alaga hosting, dowry presentations, and luxury wedding receptions." },
  { path: "/gallery/videos", title: "Cinematic Highlights | D’Fabulous Yoruba Events", desc: "Watch video highlights of live Alaga Iduro, Alaga Ijoko, and wedding MC hosting at luxury venues across the UK and internationally." },
  { path: "/experience/testimonials", title: "Verified Testimonials | D’Fabulous Client Reflections", desc: "Read verified client reflections from couples, families, and wedding planners who experienced D’Fabulous ceremonial hosting." },
  { path: "/experience/awards", title: "Awards & Recognition | D’Fabulous Cultural Host", desc: "Official recognitions, industry honors, and media features celebrating excellence in Yoruba cultural hosting and event direction." },
  { path: "/experience/destination-events", title: "Destination Events | D’Fabulous International", desc: "Discover how D’Fabulous executes flawless Yoruba traditional engagement ceremonies across Europe and worldwide destinations." },
  { path: "/contact", title: "Contact & Consultations | D’Fabulous Yoruba Events", desc: "Enquire about date availability, consultation bookings, and bespoke hosting packages for your upcoming celebration." },
  { path: "/book", title: "Reserve Your Event Date | Book D’Fabulous", desc: "Official booking request form for D’Fabulous luxury Yoruba event hosting, Alaga services, and wedding reception direction." },
  { path: "/faq", title: "Frequently Asked Questions | D’Fabulous Yoruba Events", desc: "Find answers to common questions regarding Alaga Iduro vs Alaga Ijoko, wedding MC hosting, international travel, and booking workflows." },
  { path: "/privacy", title: "Privacy Policy | D’Fabulous", desc: "Official privacy policy and personal data protection information." },
  { path: "/cookies", title: "Cookie Policy | D’Fabulous", desc: "Information regarding cookie usage and website preferences." },
  { path: "/cancellation-refund-rescheduling", title: "Cancellation, Refund & Rescheduling Policy | D’Fabulous", desc: "Cancellation, refund and rescheduling information for D’Fabulous event bookings." },
  { path: "/terms", title: "Terms of Service | D’Fabulous Luxury Yoruba Events", desc: "Terms governing the D’Fabulous website, event enquiries, bookings and related services." },
  { path: "/booking-terms", title: "Booking Terms & Conditions | D’Fabulous Events", desc: "Booking terms for D’Fabulous event services, including deposits, payment schedules, cancellations and event responsibilities." },
  { path: "/accessibility", title: "Accessibility Statement | D’Fabulous Events", desc: "D’Fabulous Events’ accessibility objectives, known limitations and contact route for reporting accessibility problems." }
] as const;
