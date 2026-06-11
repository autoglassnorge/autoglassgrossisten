/**
 * useScrollReveal — Hook that returns true when element enters viewport.
 * Uses IntersectionObserver for performant scroll-triggered animations.
 */

import { useState, useEffect, type RefObject } from 'react';

export function useScrollReveal(
  ref: RefObject<HTMLElement | null>,
  options: IntersectionObserverInit = { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // If reduced motion is preferred, show immediately
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.unobserve(el);
      }
    }, options);

    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, options.threshold, options.rootMargin]);

  return isVisible;
}
