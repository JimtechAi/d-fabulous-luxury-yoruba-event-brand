/**
 * Reusable Container Component
 * Enforces standardized grid max-widths and responsive gutter padding.
 */

import React from 'react';
import { ContainerProps } from '../types';

export const Container: React.FC<ContainerProps> = ({
  children,
  className = '',
  size = 'normal',
  as: Component = 'div',
}) => {
  const sizeClasses = {
    normal: 'max-w-7xl', // ~1280px max-width
    narrow: 'max-w-4xl', // ~896px max-width
    wide: 'max-w-[1440px]', // ~1440px max-width
  };

  return (
    <Component
      className={`w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 ${sizeClasses[size]} ${className}`}
    >
      {children}
    </Component>
  );
};
