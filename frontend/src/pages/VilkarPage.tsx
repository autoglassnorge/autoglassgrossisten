import { Link } from 'react-router-dom';
import { PageMeta } from '@/components/seo/PageMeta';

export default function VilkarPage() {
  return (
    <div className="min-h-screen bg-white">
      <PageMeta
        title="Vilkår — Autoglass AS"
        description="Salgs- og leveringsvilkår for Autoglass AS. B2B-grossist av bilglass."
        canonicalPath="/vilkar"
      />

      <section className="py-16 px-4">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold mb-8">Vilkår og betingelser</h1>
          
          <div className="prose prose-slate max-w-none">
            <p className="text-gray-600 mb-6">
              Sist oppdatert: {new Date().toLocaleDateString('nb-NO')}.
            </p>

            <h2 className="text-xl font-bold mt-8 mb-4">1. Generelt</h2>
            <p className="text-gray-600 mb-4">
              Disse vilkårene gjelder for alle kjøp og leveranser fra Autoglass AS 
              til våre B2B-kunder (verksteder, bilglasskjeder, bilforhandlere). 
              Ved bestilling aksepterer du disse vilkårene.
            </p>

            <h2 className="text-xl font-bold mt-8 mb-4">2. Priser</h2>
            <p className="text-gray-600 mb-4">
              Alle priser er oppgitt i norske kroner (NOK) og er eksklusive merverdiavgift (mva.), 
              med mindre annet er spesifisert. Prisene kan endres uten forvarsel, 
              men endringer påvirker ikke bekreftede ordrer.
            </p>

            <h2 className="text-xl font-bold mt-8 mb-4">3. Bestilling og levering</h2>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-1">
              <li>Bestillinger kan plasseres via vår B2B-portal, telefon eller e-post.</li>
              <li>Leveringstid er normalt 1–2 virkedager for varer på lager.</li>
              <li>Varer som ikke er på lager kan ha lengre leveringstid. Vi vil informere deg.</li>
              <li>Frakt beregnes basert på vekt og destinasjon.</li>
            </ul>

            <h2 className="text-xl font-bold mt-8 mb-4">4. Betaling</h2>
            <p className="text-gray-600 mb-4">
              Betalingsvilkår er 14 dager netto fra fakturadato, med mindre annet er avtalt. 
              Ved forsinket betaling påløper purregebyr og forsinkelsesrente i henhold til 
              norsk lov om renter ved forsinket betaling.
            </p>

            <h2 className="text-xl font-bold mt-8 mb-4">5. Retur og reklamasjon</h2>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-1">
              <li>Retur av standardvarer aksepteres innen 30 dager mot gyldig returgrunn.</li>
              <li>Spesialbestilte varer og tilpassede produkter kan ikke returneres.</li>
              <li>Ved feil eller mangler, kontakt oss umiddelbart for reklamasjon.</li>
              <li>Reklamasjonsfristen er 2 år i henhold til norsk kjøpslovgivning.</li>
            </ul>

            <h2 className="text-xl font-bold mt-8 mb-4">6. Eierskifte og risiko</h2>
            <p className="text-gray-600 mb-4">
              Eierskiftet skjer ved levering. Risikoen for varen går over på kjøper ved levering, 
              med mindre annet er spesifisert i fraktavtalen.
            </p>

            <h2 className="text-xl font-bold mt-8 mb-4">7. Ansvarsfraskrivelse</h2>
            <p className="text-gray-600 mb-4">
              Autoglass AS er ikke ansvarlig for indirekte tap eller følgeskader som følge av 
              forsinkelse, leveringsproblemer eller produktfeil, med mindre det foreligger grov uaktsomhet 
              eller forsett fra vår side.
            </p>

            <h2 className="text-xl font-bold mt-8 mb-4">8. Force majeure</h2>
            <p className="text-gray-600 mb-4">
              Autoglass AS er ikke ansvarlig for forsinkelser eller manglende oppfyllelse som skyldes 
              omstendigheter utenfor vår rimelige kontroll, inkludert men ikke begrenset til: 
              streik, lockout, naturkatastrofer, pandemier, leverandørproblemer, transportforstyrrelser.
            </p>

            <h2 className="text-xl font-bold mt-8 mb-4">9. Tvisteløsning</h2>
            <p className="text-gray-600 mb-4">
              Tvister skal først søkes løst i minnelighet. Dersom dette ikke er mulig, 
              er partene enige om at tvisten skal avgjøres av de ordinære domstoler med 
              Oslo som verneting.
            </p>

            <h2 className="text-xl font-bold mt-8 mb-4">10. Kontakt</h2>
            <div className="bg-gray-50 rounded-lg p-4 text-gray-600">
              <p><strong>Autoglass AS</strong></p>
              <p>Telefon: +47 21 37 83 90</p>
              <p>E-post: post@alfa-glass.no</p>
              <p>Adresse: Oslo, Norge</p>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t">
            <Link to="/" className="text-autoglass-blue hover:underline">
              ← Tilbake til forsiden
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
