/**
 * D'Fabulous Design System & Shell Architecture Types
 * Stage 1 Foundation
 */

import React from 'react';

export type ColorToken =
  | 'burgundy-deep'
  | 'burgundy-dark'
  | 'gold-luxury'
  | 'champagne-soft'
  | 'ivory-warm'
  | 'black-rich'
  | 'charcoal-soft';

export type SpacingToken =
  | 4
  | 8
  | 12
  | 16
  | 24
  | 32
  | 48
  | 64
  | 80
  | 96
  | 128
  | 160;

export interface NavItem {
  label: string;
  href: string;
  description?: string;
  children?: NavItem[];
  isPrimaryCTA?: boolean;
}

export interface ServiceDefinition {
  id: string;
  slug: string;
  title: string;
  yorubaName?: string;
  shortDescription: string;
  fullDescriptionPlaceholder?: string;
  category: 'core' | 'specialist' | 'brand';
  iconName?: string;
}

export interface PageMetaProps {
  title: string;
  description: string;
  canonicalUrl?: string;
  ogImage?: string;
  ogType?: 'website' | 'article';
  schemaType?: 'service' | 'faq';
  schemaName?: string;
  schemaItems?: { question: string; answer: string }[];
  noindex?: boolean;
}

export interface ImageMediaProps {
  src: string;
  alt: string;
  aspectRatio?: '1/1' | '4/3' | '16/9' | '21/9' | '3/4' | 'auto';
  objectPosition?: string;
  overlayOpacity?: number; // 0 to 1
  caption?: string;
  className?: string;
  priority?: boolean;
  isPlaceholder?: boolean;
}

export interface HeroMediaSlotProps {
  desktopVideoSrc?: string;
  mobileVideoSrc?: string;
  posterImageSrc?: string;
  fallbackImageSrc: string;
  altText: string;
  overlayOpacity?: number;
  className?: string;
  isPlaceholder?: boolean;
}

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'outline' | 'outline-light' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  href?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  children: React.ReactNode;
}

export interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center' | 'right';
  hasCulturalDivider?: boolean;
  titleAs?: 'h1' | 'h2' | 'h3' | 'h4';
  className?: string;
}

export interface ContainerProps {
  children: React.ReactNode;
  className?: string;
  size?: 'normal' | 'wide' | 'narrow';
  as?: React.ElementType;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeroProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  breadcrumbs?: BreadcrumbItem[];
  mediaSlot?: React.ReactNode;
  align?: 'left' | 'center';
}
