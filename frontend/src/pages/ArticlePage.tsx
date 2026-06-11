/**
 * ArticlePage — Dynamic article renderer for /bilglassguide/:slug
 * Looks up article metadata from ARTICLES registry.
 * Falls back to generic layout if no dedicated component exists.
 */

import { useParams, Link } from 'react-router-dom';
import { PageMeta } from '@/components/seo/PageMeta';
import { JsonLd } from '@/components/seo/JsonLd';
import { ARTICLES } from '@/data/bilglassguide/content';
import { ArrowLeft, Calendar, Tag, ChevronRight } from 'lucide-react';

export default function ArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const article = ARTICLES.find((a) => a.slug === slug);

  if (!article) {
    return (
      <div className="min-h-[60vh] bg-carbon-950 flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-4xl font-bold text-white mb-4">404</h1>
        <p className="text-carbon-400 mb-2">Artikkelen finnes ikke.</p>
        <p className="text-carbon-500 text-sm mb-6">Slug: {slug}</p>
        <Link to="/bilglassguide" className="text-glass-cyan hover:underline font-medium flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />
          Tilbake til bilglassguiden
        </Link>
      </div>
    );
  }

  // JSON-LD for article
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    url: `https://autoglass-frontend.pages.dev/bilglassguide/${article.slug}`,
    datePublished: article.publishedAt,
    dateModified: article.modifiedAt,
    author: {
      '@type': 'Organization',
      name: 'Autoglass AS',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Autoglass AS',
      logo: {
        '@type': 'ImageObject',
        url: 'https://autoglass-frontend.pages.dev/logo.png',
      },
    },
  };

  // Find related articles in same category
  const related = ARTICLES.filter(
    (a) => a.category === article.category && a.slug !== article.slug
  ).slice(0, 3);

  return (
    <>
      <PageMeta
        title={`${article.title} — Autoglass AS`}
        description={article.description}
        canonicalPath={`/bilglassguide/${article.slug}`}
        ogType="article"
      />
      <JsonLd data={articleJsonLd} />

      <article className="bg-carbon-950 min-h-screen">
        {/* Hero */}
        <div className="bg-gradient-to-b from-carbon-900 to-carbon-950 py-16 sm:py-20 border-b border-carbon-800">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <Link
              to="/bilglassguide"
              className="inline-flex items-center gap-1 text-sm text-carbon-400 hover:text-glass-cyan transition-colors mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Bilglassguide
            </Link>

            <div className="flex items-center gap-3 text-xs text-carbon-500 mb-4">
              <span className="flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {article.category}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(article.publishedAt).toLocaleDateString('no-NO')}
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              {article.title}
            </h1>
            <p className="mt-4 text-lg text-carbon-300 leading-relaxed">
              {article.description}
            </p>
          </div>
        </div>

        {/* Content placeholder — article body would go here */}
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
          <div className="prose prose-invert prose-lg max-w-none">
            <p className="text-carbon-400">
              Detaljert innhold for denne artikkelen er under utvikling.
              Kontakt oss for spesifikk informasjon om{' '}
              <span className="text-glass-cyan">{article.title}</span>.
            </p>

            <div className="mt-8 p-6 rounded-xl border border-carbon-800 bg-carbon-900">
              <h3 className="text-lg font-semibold text-white mb-3">
                Trenger du hjelp?
              </h3>
              <p className="text-carbon-400 text-sm mb-4">
                Vårt erfarne glassteam hjelper deg med å finne riktig glass og svarer på tekniske spørsmål.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/kontakt"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-glass-cyan text-carbon-950 font-medium text-sm hover:bg-glass-cyanLight transition-colors"
                >
                  Kontakt oss
                </Link>
                <Link
                  to="/sok"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-carbon-700 text-carbon-300 font-medium text-sm hover:border-glass-cyan hover:text-glass-cyan transition-colors"
                >
                  Søk etter glass
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Related articles */}
        {related.length > 0 && (
          <div className="border-t border-carbon-800 bg-carbon-900 py-12">
            <div className="mx-auto max-w-3xl px-4 sm:px-6">
              <h3 className="text-lg font-semibold text-white mb-6">Relaterte artikler</h3>
              <div className="space-y-3">
                {related.map((r) => (
                  <Link
                    key={r.slug}
                    to={`/bilglassguide/${r.slug}`}
                    className="group flex items-center justify-between p-4 rounded-lg border border-carbon-800 bg-carbon-950 hover:border-glass-cyan/40 transition-colors"
                  >
                    <div>
                      <div className="text-sm font-medium text-white group-hover:text-glass-cyan transition-colors">
                        {r.title}
                      </div>
                      <div className="text-xs text-carbon-500 mt-0.5">{r.category}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-carbon-600 group-hover:text-glass-cyan transition-colors" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </article>
    </>
  );
}
