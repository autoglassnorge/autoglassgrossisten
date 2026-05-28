import { useEffect } from 'react';

/* ========================================================================
   PageMeta — SPA document title + meta description
   Minste robuste løsning uten react-helmet dependency.
   ======================================================================== */

interface PageMetaProps {
  title: string;
  description: string;
  canonicalPath?: string;
}

export function PageMeta({ title, description, canonicalPath }: PageMetaProps) {
  useEffect(() => {
    const fullTitle = title.includes('Autoglass') ? title : `${title} | Autoglass AS`;
    document.title = fullTitle;

    let metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = description;

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (canonicalPath) {
      const canonicalUrl = `https://autoglass-frontend.pages.dev${canonicalPath}`;
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.appendChild(canonical);
      }
      canonical.href = canonicalUrl;
    } else if (canonical) {
      canonical.remove();
    }
  }, [title, description, canonicalPath]);

  return null;
}
