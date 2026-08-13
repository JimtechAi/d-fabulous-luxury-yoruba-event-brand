# D’FABULOUS LUXURY YORUBA EVENTS — TECHNICAL ARCHITECTURE DOCUMENT
**Phase 8: Technical Planning & Architectural Design**
*JimTech AI Studio Website Development Operating Manual*

---

## 1. PROJECT OVERVIEW
### Technical Objective
The primary technical objective of the D’Fabulous Luxury Yoruba Events web platform is to deliver a ultra-fast, high-converting, accessible, and mobile-optimized Single Page Application (SPA) with serverless form handling and dynamic routing. It communicates regal cultural authority, Yoruba ceremonial expertise, and luxury event hosting standards.

### Business Purpose behind Architecture
1. **Conversion Efficiency**: Seamless navigation between services (`Alaga Iduro`, `Alaga Ijoko`, `Wedding MC`), event galleries, and the booking funnel (`/book`) ensures high inquiry conversion.
2. **Performance & Reliability**: Zero layout shift, sub-second route transitions, and responsive image loading instill immediate confidence for high-net-worth couples, families, and international wedding planners.
3. **Portability & Zero Technical Debt**: Built using clean React 19, TypeScript 5.8, Vite 6, and Tailwind CSS v4, allowing effortless deployment to Cloud Run, Vercel, Netlify, or custom VPS without proprietary lock-in.

---

## 2. CURRENT TECHNOLOGY STACK
The technology stack currently installed and confirmed in the codebase (`package.json`, `vite.config.ts`):

- **Core Framework**: React `^19.0.1` + React DOM `^19.0.1`
- **Build System & Dev Server**: Vite `^6.2.3` with `@vitejs/plugin-react` `^5.0.4`
- **Type System**: TypeScript `~5.8.2` (Strict type checking, `tsc --noEmit` build validation)
- **Styling Engine**: Tailwind CSS `^4.1.14` via `@tailwindcss/vite`
- **Animation Engine**: Motion (formerly Framer Motion) `^12.23.24` for smooth layout transitions and micro-interactions
- **Icon Library**: Lucide React `^0.546.0` (accessible SVG icons)
- **Runtime Environment**: Node.js (v22 LTS runtime compatible), Express `^4.21.2` (available for server-side proxying if needed)
- **Routing Engine**: Custom lightweight React Context Router (`/src/lib/router.tsx`) supporting HTML5 History API (`pushState`, `popstate`), scroll restoration, and zero bundle bloat.

---

## 3. APPLICATION ARCHITECTURE

### Framework & Rendering Strategy
- **Framework**: Client-Side Single Page Application (SPA) with Vite compilation.
- **Rendering Strategy**: Client-Side Rendering (CSR) with pre-rendered static HTML shell in `index.html` for instant page load. Meta tag injection provided dynamically via an `SEO` component.

### Routing Mechanism
- Custom lightweight React router in `/src/lib/router.tsx`.
- Listens to `popstate` events for browser back/forward buttons.
- Handles smooth scrolling to top on route change (`window.scrollTo({ top: 0, behavior: 'smooth' })`).
- Exports `<Link>` component with modifier key support (`metaKey`, `ctrlKey`), external link detection (`http`, `mailto:`, `tel:`), and programmatic navigation (`useRouter().navigate`).

### Component Architecture
- Modular React Functional Components using standard hooks (`useState`, `useEffect`, `useCallback`, `useContext`).
- Strict separation of Layouts (`/src/layouts`), Pages (`/src/pages`), Components (`/src/components`), Data Registries (`/src/data`), and Types (`/src/types`).

### State Management & Data Flow
- **Global Routing State**: Managed via `RouterContext`.
- **Form State**: Local component state (`useState`) with field validation hooks for multi-step booking.
- **Data Flow**: Top-down unidirectional props flow driven by typed data constants in `/src/data/brand.ts`.

### Error Handling & Loading States
- Graceful media fallback states inside `Image.tsx` with error handling (`onError`).
- Form submission loading spinners and state messages (`Transmitting...`, `Success`, `Error`).
- 404 Route Fallback in `App.tsx` pointing to `GenericPageShell`.

### Responsive Strategy
- Mobile-first CSS utility pattern via Tailwind v4.
- Breakpoints: Mobile (`<640px`), Tablet (`sm:` 640px - 768px), Desktop (`md:` 768px - 1024px), Large Desktop (`lg:` 1024px+).

---

## 4. PAGE ARCHITECTURE

| Route | Page Component | Purpose | Primary CTA | Secondary CTA | Key Components |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/` | `HomeShell` | Brand flagship, 9-section narrative | `BOOK D’FABULOUS` | `EXPLORE THE EXPERIENCE` | HeroMediaSlot, ServiceCard, TestimonialCard, GalleryCard, SectionHeading |
| `/about` | `GenericPageShell` | Heritage, cultural authority & story | `BOOK D’FABULOUS` | `EXPLORE OUR SERVICES` | PageHero, SectionHeading, Container, Button |
| `/services` | `ServicesCatalogShell` | Complete catalog of all 8 services | `BOOK D’FABULOUS` | `CONTACT CONSULTATIONS` | PageHero, ServiceCard grid, Container |
| `/services/alaga-iduro` | `GenericPageShell` | Groom's family spokesperson role | `BOOK D’FABULOUS` | `EXPLORE OUR SERVICES` | PageHero, Feature Lists, Service Detail Cards |
| `/services/alaga-ijoko` | `GenericPageShell` | Bride's family host role | `BOOK D’FABULOUS` | `EXPLORE OUR SERVICES` | PageHero, Protocol Highlights, Service Detail Cards |
| `/services/wedding-mc` | `GenericPageShell` | Reception MC hosting | `BOOK D’FABULOUS` | `EXPLORE OUR SERVICES` | PageHero, Reception Flow Cards, Media Slot |
| `/services/engagement-coordination` | `GenericPageShell` | Protocol & timing management | `BOOK D’FABULOUS` | `EXPLORE OUR SERVICES` | PageHero, Timeline Workflow, Service Detail Cards |
| `/services/private-events` | `GenericPageShell` | Milestone galas & birthdays | `BOOK D’FABULOUS` | `EXPLORE OUR SERVICES` | PageHero, Gala Highlights |
| `/services/eru-iyawo` | `GenericPageShell` | Gift styling & presentation | `BOOK D’FABULOUS` | `EXPLORE OUR SERVICES` | PageHero, Gift Curation Showcase |
| `/services/brand-influencing` | `GenericPageShell` | Cultural ambassadorship | `BOOK D’FABULOUS` | `CONTACT CONSULTATIONS` | PageHero, Partnership Highlights |
| `/services/destination-events` | `GenericPageShell` | International destination hosting | `DISCOVER DESTINATION SERVICES` | `BOOK D’FABULOUS` | PageHero, Global Capability Cards |
| `/experience` | `GenericPageShell` | The 4 Pillars of D'Fabulous | `BOOK D’FABULOUS` | `EXPLORE FULL GALLERY` | PageHero, Pillar Grid |
| `/experience/gallery` | `GalleryShell` | High-res celebration photography | `BOOK D’FABULOUS` | `CONTACT CONSULTATIONS` | PageHero, GalleryCard Grid, Filter Tabs |
| `/experience/videos` | `GalleryShell` | Cinematic video archives | `BOOK D’FABULOUS` | `CONTACT CONSULTATIONS` | PageHero, Video Frames, Media Slots |
| `/experience/testimonials` | `GenericPageShell` | Client reflections & reviews | `BOOK D’FABULOUS` | `CONTACT CONSULTATIONS` | PageHero, TestimonialCard Grid |
| `/experience/awards` | `GenericPageShell` | Industry honors & recognitions | `BOOK D’FABULOUS` | `CONTACT CONSULTATIONS` | PageHero, Award Credibility Grid |
| `/contact` | `ContactShell` | Direct consultations & inquiry | `SUBMIT BOOKING ENQUIRY` | `BOOK D’FABULOUS` | PageHero, Contact Form, Contact Info Cards |
| `/book` | `BookShell` | Primary date reservation funnel | `SUBMIT BOOKING ENQUIRY` | `CONTACT CONSULTATIONS` | PageHero, Multi-step Booking Form |
| `/faq` | `GenericPageShell` | Client FAQ & operational clarity | `BOOK D’FABULOUS` | `CONTACT CONSULTATIONS` | PageHero, Accordion / FAQ List |
| `/privacy`, `/cookies`, `/terms`, `/booking-terms`, `/accessibility` | `GenericPageShell` | Legal, compliance & privacy policies | `BOOK D’FABULOUS` | `CONTACT CONSULTATIONS` | PageHero, Legal Text Container |

---

## 5. COMPONENT ARCHITECTURE

### Reusable UI Components
- **`Header.tsx`**: Sticky top navigation bar with luxury brand logo, desktop dropdown menus (`DesktopNavigation.tsx`), mobile overlay drawer (`MobileNavigation.tsx`), and `BOOK D’FABULOUS` CTA button.
- **`Footer.tsx`**: Complete sitemap, brand positioning, social media handles, contact details, and legal compliance links (`Privacy`, `Cookies`, `Terms`, `Accessibility`).
- **`Container.tsx`**: Standardized max-width wrapper (`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`).
- **`SectionHeading.tsx`**: Consistent typographic heading with eyebrow badge, display title, and optional description text.
- **`PageHero.tsx`**: Inner page hero banner with background overlay, breadcrumbs, and display heading.
- **`Button.tsx`**: Flexible button primitive supporting variants (`primary`, `secondary`, `outline`, `outline-light`, `text`), sizes (`sm`, `md`, `lg`), and link routing.
- **`ServiceCard.tsx`**: Service card shell featuring category badges, Yoruba cultural labels, description, and link CTA.
- **`GalleryCard.tsx`**: Image gallery shell with aspect ratio framing, captions, category tags, and zoom hover effects.
- **`TestimonialCard.tsx`**: Editorial review card for verified client reflections.
- **`HeroMediaSlot.tsx`**: Cinematic background media slot frame with dark burgundy opacity overlay.
- **`Image.tsx`**: Image renderer with placeholder fallback (`showPlaceholderFallback`), error boundary, and lazy loading.
- **`SEO.tsx`**: Page head title, meta description, and canonical route updater.
- **`SkipToContent.tsx`**: Accessible skip link for keyboard users.

---

## 6. CONTENT ARCHITECTURE
Mapping approved Phase 7 Content to application components:

- **`07 Content/Website Content.md`**
  - Section 1 (Hero) → `HomeShell.tsx` (Hero Section)
  - Section 2 (Heritage) → `HomeShell.tsx` (Brand Statements & 3 Pillars)
  - Section 3 (Core Services) → `ServicesCatalogShell.tsx` & `ServiceCard.tsx`
  - Section 4 (Experience) → `HomeShell.tsx` & `GenericPageShell.tsx` (`/experience`)
  - Section 5 (Gallery) → `GalleryShell.tsx` & `GalleryCard.tsx`
  - Section 6 (Destination) → `HomeShell.tsx` (`/experience/destination-events`)
  - Section 7 (Testimonials) → `TestimonialCard.tsx` & `GenericPageShell.tsx` (`/experience/testimonials`)
  - Section 8 (Awards) → `HomeShell.tsx` & `GenericPageShell.tsx` (`/experience/awards`)
  - Section 9 (Final CTA) → `HomeShell.tsx` (Footer CTA) & `BookShell.tsx`
- **`07 Content/SEO Metadata.md`** → `/src/data/brand.ts` (`ALL_ROUTES`) & `<SEO />`
- **`07 Content/CTA System.md`** → `<Button />` props & link targets across all pages
- **`07 Content/FAQ Content.md`** → `GenericPageShell.tsx` (`/faq`)

---

## 7. IMAGE AND ASSET ARCHITECTURE
- **Storage Location**: Static assets placed in `/public/` directory or optimized remote CDN URLs.
- **Naming Conventions**: Lowercase hyphenated names (e.g., `hero-alaga-hosting.webp`, `service-alaga-iduro.webp`, `gallery-traditional-engagement-01.webp`).
- **Optimization Strategy**: Modern WebP/AVIF formats, compressed under 150KB for images, 2MB for hero background media slots.
- **Fallback Mechanism**: All `Image.tsx` calls feature a styled D'Fabulous editorial fallback state when source is loading or unavailable.
- **Alt Text**: Strictly sourced from `07 Content/SEO Metadata.md`.

---

## 8. FORM AND BOOKING ARCHITECTURE

### Booking & Contact Form Specifications
- **Form Component Locations**: `BookShell.tsx` and `ContactShell.tsx`.
- **Fields**:
  1. Full Name (`string`, required)
  2. Email Address (`string`, required, email validation)
  3. Phone / WhatsApp (`string`, required)
  4. Proposed Event Date (`date`, required)
  5. Event Location / City / Country (`string`, required)
  6. Service Requested (`array`, required checkboxes)
  7. Estimated Guest Count (`number`, optional)
  8. Celebration Details / Special Requirements (`string`, optional)

### Workflow & Submission Mechanics
1. **Client Input**: Real-time controlled inputs with validation state feedback.
2. **Submission**: Async POST request to serverless endpoint or Webhook service (e.g. Formspree/Resend/Serverless function).
3. **User Feedback**:
   - Loading State: "Transmitting Your Celebration Inquiry..."
   - Success State: "Thank you. Your enquiry has been received. D’Fabulous team will review date availability and contact you within 24-48 hours."
   - Error State: Clear alert messaging without losing form input data.

---

## 9. BACKEND REQUIREMENTS
- **Current Requirement**: Pure static / serverless client application.
- **Database Needed?**: **No.** Event inquiries and availability checks are submitted directly via email/webhook services.
- **CMS Needed?**: **No.** Brand data, services list, and sitemap are cleanly maintained in `/src/data/brand.ts`.
- **Authentication Needed?**: **No.** Public luxury brand showcases do not require client portals.
- **API Routes**: Minimal serverless endpoint for form submission proxying if environment secrets are required.

---

## 10. THIRD-PARTY SERVICES
Only services strictly required for production deployment:
1. **Form Delivery**: Formspree or Resend API for booking email dispatch.
2. **Analytics**: Google Analytics 4 (GA4) / Google Search Console via script tags.
3. **Fonts**: Google Fonts (`Playfair Display`, `Plus Jakarta Sans`) loaded via `index.html`.

---

## 11. SEO ARCHITECTURE
- **Meta Tag Injection**: `<SEO />` component updates `document.title`, `meta[name="description"]`, `meta[property="og:title"]`, `meta[property="og:description"]`, and canonical URL links on every route change.
- **Structured Data**: JSON-LD Schema (`EventVenue`, `LocalBusiness`, `Service`) injected in `index.html`.
- **Semantic HTML**: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`, `<h1>`-`<h3>` tags used rigorously across all pages.
- **Sitemap & Robots**: `sitemap.xml` and `robots.txt` generated in `/public/`.

---

## 12. PERFORMANCE ARCHITECTURE
- **Initial Load Target**: First Contentful Paint (FCP) < 1.0s, Largest Contentful Paint (LCP) < 1.8s.
- **Lighthouse Benchmark**: 95+ across Performance, Accessibility, Best Practices, and SEO.
- **Asset Optimization**: Vite tree-shaking, ES modules compilation, standard font preloading, lazy loading for non-hero images (`loading="lazy"`).
- **Zero Layout Shift**: Fixed aspect ratios for all media containers (`aspect-video`, `aspect-[4/3]`, `aspect-square`).

---

## 13. ACCESSIBILITY ARCHITECTURE (WCAG 2.2 AA)
- **Keyboard Navigation**: Focus outlines on all interactive elements (`focus:outline-none focus:ring-2 focus:ring-gold-luxury`).
- **Skip to Content**: Implemented in `SkipToContent.tsx` linking to `#main-content`.
- **Color Contrast**: Dark Burgundy (`#3A0007`), Gold (`#D4AF37`), Ivory (`#FAFAF7`), and Rich Black (`#0C0C0C`) pass WCAG AA 4.5:1 ratio for text.
- **ARIA Attributes**: `aria-expanded` and `aria-controls` for mobile navigation drawer and dropdown menus.

---

## 14. SECURITY ARCHITECTURE
- **Environment Variables**: Managed via `.env.example` (e.g. `VITE_FORM_ENDPOINT`).
- **Input Sanitization**: HTML escaping on all form inputs to prevent XSS.
- **Content Security Policy (CSP)**: Security headers applied at hosting level.
- **Client/Server Separation**: No private API keys exposed to browser bundle.

---

## 15. RECOMMENDED PROJECT FOLDER STRUCTURE
```
/
├── .env.example
├── index.html
├── metadata.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── /07 Content/
│   ├── Website Content.md
│   ├── SEO Metadata.md
│   ├── CTA System.md
│   ├── FAQ Content.md
│   └── Content Review.md
├── /08 Development/
│   └── Technical Architecture.md
└── /src/
    ├── App.tsx
    ├── index.css
    ├── main.tsx
    ├── /components/
    │   ├── Button.tsx
    │   ├── Container.tsx
    │   ├── DesktopNavigation.tsx
    │   ├── Footer.tsx
    │   ├── GalleryCard.tsx
    │   ├── Header.tsx
    │   ├── HeroMediaSlot.tsx
    │   ├── Image.tsx
    │   ├── MobileNavigation.tsx
    │   ├── PageHero.tsx
    │   ├── SEO.tsx
    │   ├── SectionHeading.tsx
    │   ├── ServiceCard.tsx
    │   ├── SkipToContent.tsx
    │   └── TestimonialCard.tsx
    ├── /data/
    │   └── brand.ts
    ├── /layouts/
    │   └── AppLayout.tsx
    ├── /lib/
    │   └── router.tsx
    ├── /pages/
    │   ├── BookShell.tsx
    │   ├── ContactShell.tsx
    │   ├── GalleryShell.tsx
    │   ├── GenericPageShell.tsx
    │   ├── HomeShell.tsx
    │   └── ServicesCatalogShell.tsx
    └── /types/
        └── index.ts
```

---

## 16. DEPLOYMENT ARCHITECTURE
- **Platform**: Cloud Run / Vercel / Netlify / Custom static host.
- **Build Command**: `npm run build` (`vite build`).
- **Output Directory**: `dist/`.
- **Production Server**: Node/Express or static file web server (nginx).
- **SSL / Custom Domain**: Managed via Cloud Run / Vercel DNS with automatic HTTPS certificate provisioning.

---

## 17. MAINTENANCE ARCHITECTURE
- Centralized brand registry in `/src/data/brand.ts` allows future developers to update service definitions, phone numbers, emails, navigation links, and SEO metadata in one single file.
- Strict TypeScript interfaces in `/src/types/index.ts` prevent regressions when adding new services or gallery media.

---

## 18. TECHNICAL RISKS & MITIGATION
1. **Risk**: Heavy unoptimized image uploads degrading mobile load speed.
   - *Mitigation*: Enforce `Image.tsx` lazy loading and explicit width/height aspect ratios.
2. **Risk**: Spam submissions on `/book` and `/contact` forms.
   - *Mitigation*: Honeypot fields and client-side rate-limiting.
3. **Risk**: Deep-linking 404s on static hosting reloads.
   - *Mitigation*: Configure SPA rewrites to `/index.html` in static hosting config.

---

## 19. RECOMMENDED IMPLEMENTATION SEQUENCE
```
Component Update / Page Implementation
  ↓
Build Verification (`compile_applet`)
  ↓
Linter Check (`lint_applet`)
  ↓
Approval & Review
  ↓
Next Route / Component
```

---

## 20. FINAL ARCHITECTURE DECISION
**Recommendation**: Proceed with the existing **React 19 + Vite + TypeScript + Tailwind CSS v4** SPA architecture. It is lightweight, compiled, and eliminates backend overhead while providing complete client responsiveness, instant routing, and pristine luxury editorial UI.

---
*End of Technical Architecture Document*
