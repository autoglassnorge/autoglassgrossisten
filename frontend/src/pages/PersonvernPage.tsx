import { Link } from 'react-router-dom';
import { PageMeta } from '@/components/seo/PageMeta';
import { COMPANY } from '@/config/company.config';

export default function PersonvernPage() {
  return (
    <div className="min-h-screen bg-white">
      <PageMeta
        title="Personvernerklæring — Autoglass AS"
        description="Personvernerklæring for Autoglass AS. Informasjon om hvordan vi håndterer dine personopplysninger."
        canonicalPath="/personvern"
      />

      <section className="py-16 px-4">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold mb-8">Personvernerklæring</h1>
          
          <div className="prose prose-slate max-w-none">
            <p className="text-gray-600 mb-6">
              Sist oppdatert: {new Date().toLocaleDateString('nb-NO')}.
            </p>

            <h2 className="text-xl font-bold mt-8 mb-4">1. Innledning</h2>
            <p className="text-gray-600 mb-4">
              Autoglass AS («vi», «oss») er ansvarlig for behandling av personopplysninger 
              som samles inn via våre nettsider og tjenester. Vi tar ditt personvern på alvor 
              og behandler opplysninger i samsvar med gjeldende personvernlovgivning, 
              herunder EUs personvernforordning (GDPR).
            </p>

            <h2 className="text-xl font-bold mt-8 mb-4">2. Hvilke opplysninger samler vi inn?</h2>
            <p className="text-gray-600 mb-4">
              Vi kan samle inn følgende typer personopplysninger:
            </p>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-1">
              <li>Kontaktinformasjon (navn, e-post, telefon, firma)</li>
              <li>Registreringsnummer (for glass-søk og bestilling)</li>
              <li>Bruksdata (IP-adresse, nettleser, enhet)</li>
              <li>Ordrehistorikk og transaksjonsdata</li>
            </ul>

            <h2 className="text-xl font-bold mt-8 mb-4">3. Formål med behandlingen</h2>
            <p className="text-gray-600 mb-4">
              Vi bruker personopplysningene til:
            </p>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-1">
              <li>Å levere våre tjenester og produkter</li>
              <li>Å behandle bestillinger og leveranser</li>
              <li>Å kommunisere med deg om din ordre</li>
              <li>Å forbedre våre tjenester og nettsider</li>
              <li>Å oppfylle rettslige forpliktelser</li>
            </ul>

            <h2 className="text-xl font-bold mt-8 mb-4">4. Dine rettigheter</h2>
            <p className="text-gray-600 mb-4">
              Du har følgende rettigheter vedrørende dine personopplysninger:
            </p>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-1">
              <li>Rett til innsyn</li>
              <li>Rett til retting</li>
              <li>Rett til sletting («retten til å bli glemt»)</li>
              <li>Rett til begrensning av behandling</li>
              <li>Rett til dataportabilitet</li>
              <li>Rett til å protestere</li>
            </ul>

            <h2 className="text-xl font-bold mt-8 mb-4">5. Kontakt</h2>
            <p className="text-gray-600 mb-4">
              Hvis du har spørsmål om personvern eller ønsker å utøve dine rettigheter, 
              kan du kontakte oss på:
            </p>
            <div className="bg-gray-50 rounded-lg p-4 text-gray-600">
              <p><strong>{COMPANY.NAME}</strong></p>
              <p>E-post: {COMPANY.EMAIL}</p>
              <p>Telefon: {COMPANY.PHONE}</p>
            </div>

            <h2 className="text-xl font-bold mt-8 mb-4">6. Endringer i erklæringen</h2>
            <p className="text-gray-600 mb-4">
              Vi forbeholder oss retten til å oppdatere denne personvernerklæringen. 
              Endringer vil bli publisert på denne siden med oppdatert dato.
            </p>
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
