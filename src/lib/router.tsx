/**
 * Lightweight Portable Client Router
 * Built for smooth SPA routing in AI Studio preview & straightforward VS Code migration.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface RouterContextType {
  currentPath: string;
  navigate: (path: string) => void;
}

const RouterContext = createContext<RouterContextType>({
  currentPath: '/',
  navigate: () => {},
});

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return window.location.pathname || '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/');
      window.scrollTo(0, 0);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((path: string) => {
    const destination = new URL(path, window.location.origin);
    if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
    window.history.pushState({}, '', path);
    setCurrentPath(destination.pathname);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <RouterContext.Provider value={{ currentPath, navigate }}>
      {children}
    </RouterContext.Provider>
  );
};

export const useRouter = () => useContext(RouterContext);

export const Link: React.FC<{
  href: string;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
  tabIndex?: number;
  role?: string;
}> = ({ href, className = '', children, ariaLabel, onClick, tabIndex, role }) => {
  const { navigate } = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Standard link behavior for external links or modifier key clicks
    if (e.metaKey || e.ctrlKey || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return;
    }
    e.preventDefault();
    onClick?.(e as unknown as React.MouseEvent<HTMLElement>);
    navigate(href);
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      className={className}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      role={role}
    >
      {children}
    </a>
  );
};
