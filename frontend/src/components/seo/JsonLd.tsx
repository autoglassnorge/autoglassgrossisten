/* ========================================================================
   JsonLd — Structured Data script tags for Google Rich Results
   Pass any JSON-LD object; renders as <script type="application/ld+json">.
   ======================================================================== */

interface JsonLdProps {
  data: Record<string, unknown> | Record<string, unknown>[];
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data),
      }}
    />
  );
}
