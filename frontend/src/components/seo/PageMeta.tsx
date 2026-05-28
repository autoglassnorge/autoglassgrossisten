import { useEffect } from 'react';

/* ========================================================================
   PageMeta — SPA document title + meta description + Open Graph + Twitter Card
   Minste robuste løsning uten react-helmet dependency.
   ======================================================================== */

const SITE_URL = 'https://autoglass-frontend.pages.dev';
const DEFAULT_OG_IMAGE = `${SITE_URL}/logo.png`;

interface PageMetaProps {
  title: string;
  description: string;
  canonicalPath?: string;
  ogImage?: string;
  ogType?: 'website' | 'article';
  twitterCard?: 'summary' | 'summary_large_image';
}

export function PageMeta({
  title,
  description,
  canonicalPath,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = 'website',
  twitterCard = 'summary_large_image',
}: PageMetaProps) {
  useEffect(() => {
    const fullTitle = title.includes('Autoglass') ? title : `${title} | Autoglass AS`;
    document.title = fullTitle;

    const setMeta = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector) as HTMLElement | null;
      if (!el) {
        el = document.createElement('meta');
        (el as any)[attr] = selector.match(/property=/) ? 'property' : 'name';
        (el as any).content = value; // placeholder
        document.head.appendChild(el);
      }
      if (attr === 'property') (el as any).setAttribute('property', selector.match(/property="([^"]+)"/)?.[1] || '');
      if (attr === 'name') (el as any).setAttribute('name', selector.match(/name="([^"]+)"/)?.[1] || '');
      (el as any).setAttribute('content', value);
    };

    // Standard meta
    let metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = description;

    // Canonical
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (canonicalPath) {
      const canonicalUrl = `${SITE_URL}${canonicalPath}`;
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.appendChild(canonical);
      }
      canonical.href = canonicalUrl;
    } else if (canonical) {
      canonical.remove();
    }

    // Open Graph
    const ogTitle = fullTitle;
    const ogUrl = canonicalPath ? `${SITE_URL}${canonicalPath}` : SITE_URL;

    setMeta('meta[property="og:title"]', 'property', ogTitle);
    setMeta('meta[property="og:description"]', 'property', description);
    setMeta('meta[property="og:image"]', 'property', ogImage);
    setMeta('meta[property="og:url"]', 'property', ogUrl);
    setMeta('meta[property="og:type"]', 'property', ogType);

    // Twitter Card
    setMeta('meta[name="twitter:card"]', 'name', twitterCard);
    setMeta('meta[name="twitter:title"]', 'name', ogTitle);
    setMeta('meta[name="twitter:description"]', 'name', description);
    setMeta('meta[name="twitter:image"]', 'name', ogImage);

    return () => {
      // Cleanup optional — leave OG tags as-is for SPA navigation
    };
  }, [title, description, canonicalPath, ogImage, ogType, twitterCard]);

  return null;
}
