/**
 * D'Fabulous Design Tokens
 * Stage 1 Design System Foundation
 */

export const colors = {
  burgundyDeep: '#5A1020',
  burgundyDark: '#320812',
  goldLuxury: '#C9A227',
  champagneSoft: '#E8D8B5',
  ivoryWarm: '#F8F4EC',
  blackRich: '#0B0B0B',
  charcoalSoft: '#252525',
} as const;

export const visualRatioTarget = {
  neutral: '60%',
  burgundyAndBlack: '25%',
  imagery: '10%',
  goldAccents: '5%',
} as const;

export const spacing = {
  s4: '4px',
  s8: '8px',
  s12: '12px',
  s16: '16px',
  s24: '24px',
  s32: '32px',
  s48: '48px',
  s64: '64px',
  s80: '80px',
  s96: '96px',
  s128: '128px',
  s160: '160px',
} as const;

export const typography = {
  fonts: {
    display: "'Cormorant Garamond', Georgia, serif",
    body: "'Plus Jakarta Sans', sans-serif",
  },
  scale: {
    xs: '0.75rem',     // 12px
    sm: '0.875rem',    // 14px
    base: '1rem',      // 16px
    lg: '1.125rem',    // 18px
    xl: '1.25rem',     // 20px
    '2xl': '1.5rem',   // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem',  // 36px
    '5xl': '3rem',     // 48px
    '6xl': '3.75rem',  // 60px
    '7xl': '4.5rem',   // 72px
  },
} as const;

export const containerWidths = {
  max: '1280px',
  narrow: '800px',
  wide: '1440px',
} as const;

export const transitions = {
  interface: '200ms cubic-bezier(0.16, 1, 0.3, 1)',
  editorial: '600ms cubic-bezier(0.16, 1, 0.3, 1)',
} as const;
