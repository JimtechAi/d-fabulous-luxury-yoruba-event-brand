/**
 * D'Fabulous Button System
 * Reusable buttons with precise luxury typography, accessible focus states, and interaction feedback.
 */

import React from 'react';
import { ButtonProps } from '../types';
import { Link } from '../lib/router';

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  href,
  icon,
  iconPosition = 'right',
  fullWidth = false,
  children,
  className = '',
  disabled,
  onClick,
  ...props
}) => {
  // Size classes ensuring touch-friendly 44px minimum target size
  const sizeStyles = {
    sm: 'px-5 py-2.5 text-xs tracking-widest uppercase min-h-[40px]',
    md: 'px-7 py-3.5 text-xs sm:text-sm tracking-[0.15em] uppercase min-h-[48px]',
    lg: 'px-9 py-4 text-sm tracking-[0.2em] uppercase min-h-[56px]',
  };

  // Base styles: restrained, editorial, non-pill (rounded-sm or rounded-md), clear focus ring
  const baseStyles = `inline-flex items-center justify-center font-medium font-sans transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none rounded-none border ${
    fullWidth ? 'w-full' : 'w-auto'
  }`;

  // Variant styles adhering strictly to the color palette (Burgundy, Gold, Champagne, Rich Black)
  const variantStyles = {
    primary:
      'bg-burgundy-deep text-ivory-warm border-burgundy-deep hover:bg-burgundy-dark hover:border-burgundy-dark active:scale-[0.99] shadow-sm',
    secondary:
      'bg-transparent text-burgundy-deep border-burgundy-deep hover:bg-burgundy-deep hover:text-ivory-warm active:scale-[0.99]',
    text:
      'bg-transparent text-burgundy-deep border-transparent hover:text-gold-luxury p-0 min-h-0 min-w-0 font-semibold tracking-wider group',
    outline:
      'bg-transparent text-burgundy-deep border-burgundy-deep hover:bg-burgundy-deep hover:text-ivory-warm active:scale-[0.99]',
    'outline-light':
      'bg-transparent text-ivory-warm border-champagne-soft/40 hover:border-gold-luxury hover:text-gold-luxury hover:bg-black-rich/30 active:scale-[0.99]',
    danger:
      'bg-red-700 text-white border-red-700 hover:bg-red-800 active:scale-[0.99]',
  };

  const combinedClasses = `${baseStyles} ${variant === 'text' ? '' : sizeStyles[size]} ${variantStyles[variant]} ${className}`;

  const content = (
    <>
      {icon && iconPosition === 'left' && (
        <span className="mr-2.5 inline-block transition-transform duration-300 group-hover:-translate-x-1">
          {icon}
        </span>
      )}
      <span>{children}</span>
      {icon && iconPosition === 'right' && (
        <span className="ml-2.5 inline-block transition-transform duration-300 group-hover:translate-x-1">
          {icon}
        </span>
      )}
    </>
  );

  if (href && !disabled) {
    return (
      <Link
        href={href}
        className={combinedClasses}
        onClick={onClick as unknown as React.MouseEventHandler<HTMLElement>}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      className={combinedClasses}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {content}
    </button>
  );
};
