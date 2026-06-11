/**
 * PreloadLink — Link wrapper that preloads the target page on hover.
 * Falls back to regular Link if no preload function is provided.
 */

import { Link, type LinkProps } from 'react-router-dom';
import { preloadPage } from '@/hooks/useRoutePreload';
import { useCallback } from 'react';

interface PreloadLinkProps extends Omit<LinkProps, 'to'> {
  to: string;
  preload?: () => Promise<unknown>;
  children: React.ReactNode;
  className?: string;
}

export function PreloadLink({ to, preload, children, className, ...rest }: PreloadLinkProps) {
  const handlePreload = useCallback(() => {
    if (preload) {
      preloadPage(preload);
    }
  }, [preload]);

  return (
    <Link
      to={to}
      className={className}
      onMouseEnter={handlePreload}
      onFocus={handlePreload}
      {...rest}
    >
      {children}
    </Link>
  );
}
