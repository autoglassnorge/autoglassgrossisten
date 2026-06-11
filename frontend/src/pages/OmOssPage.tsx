import { Link } from 'react-router-dom';
import { PageMeta } from '@/components/seo/PageMeta';
import { Truck, Globe, Award, Users, Building2, Phone, Clock } from 'lucide-react';
import { COMPANY } from '@/config/company.config';

export default function OmOssPage() {
  return (
    <div className="min-h-screen bg-white">
      <PageMeta
        title="Om oss — Autoglass AS"
        description="Norges ledende bilglass-grossist siden 1992. 133 000+ glass på lager i Oslo. Leverer til 500+ verksteder i Norge, Sverige og Europa."
        canonicalPath="/om-oss"
      />

      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-800 py-20 px-4 text-white">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold mb-4">Om Autoglass AS</h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Vi sier ja der andre sier nei. Norges mest komplette bilglass-grossist.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-4">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-autoglass-blue mb-1">133 000+</div>
              <div className="text-sm text-gray-600">Ruter på lager</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-autoglass-blue mb-1">500+</div>
              <div className="text-sm text-gray-600">Verksteder</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-autoglass-blue mb-1">30+</div>
              <div className="text-sm text-gray-600">Års erfaring</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-autoglass-blue mb-1">25+</div>
              <div className="text-sm text-gray-600">Bilmerker</div>
            </div>
          </div>
        </div>
      </section>

      {/* Hovedinnhold */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="mx-auto max-w-4xl space-y-16">
          
          {/* Vårt motto */}
          <div className="text-center">
            <blockquote className="text-2xl md:text-3xl font-semibold text-slate-800 italic">
              "Vi sier ja der andre sier nei"
            </blockquote>
            <p className="mt-4 text-gray-600">
              Med andre ord: Vi har det bilglasset du trenger når du har et knust bilglass.
            </p>
          </div>

          {/* Lager og logistikk */}
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Building2 className="h-6 w-6 text-autoglass-blue" />
                <h2 className="text-xl font-bold">Hovedlager i Oslo</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Vårt hovedlager i Oslo har en lagerbeholdning på over 133 000 glass. 
                Dette gjør oss i stand til å levere bilglass til over 500 verksteder 
                med kort varsel — ofte neste dag.
              </p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-0.5 text-green-600" />
                  <span>Levering neste dag til de fleste verksteder</span>
                </li>
                <li className="flex items-start gap-2">
                  <Truck className="h-4 w-4 mt-0.5 text-green-600" />
                  <span>Egen vognpark og logistikkpartner</span>
                </li>
                <li className="flex items-start gap-2">
                  <Award className="h-4 w-4 mt-0.5 text-green-600" />
                  <span>Systematisk lagerstyring og kvalitetskontroll</span>
                </li>
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Globe className="h-6 w-6 text-autoglass-blue" />
                <h2 className="text-xl font-bold">Eksport til Europa</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Autoglass AS eksporterer også bilglass til hele Skandinavia og resten av Europa. 
                Vi har etablert logistikkløsninger som sikrer rask levering også over landegrenser.
              </p>
              <div className="flex flex-wrap gap-2">
                {['Norge', 'Sverige', 'Danmark', 'Finland', 'Tyskland', 'Polen'].map((land) => (
                  <span key={land} className="px-3 py-1 bg-white rounded-full text-sm text-gray-700 border">
                    {land}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Kvalitet og sikkerhet */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Users className="h-6 w-6 text-autoglass-blue" />
              <h2 className="text-xl font-bold">Kvalitet og sikkerhet</h2>
            </div>
            <p className="text-gray-600">
              Alle våre samarbeidspartnere har montører med lang erfaring fra bilglassbransjen. 
              Glasset blir skiftet etter de mest moderne prinsipper. Vårt mål er å alltid være best 
              på kvalitet og sikkerhet innen vårt fagområde.
            </p>
          </div>

        </div>
      </section>

      {/* Kontakt-CTA */}
      <section className="py-16 px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold mb-4">Vil du bli kunde?</h2>
          <p className="text-gray-600 mb-6">
            Vi leverer til verksteder, bilglasskjeder og bilforhandlere. 
            Ta kontakt for å diskutere ditt behov.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/kontakt"
              className="inline-flex items-center justify-center px-6 py-3 bg-autoglass-blue text-white rounded-lg font-medium hover:bg-blue-700 transition"
            >
              <Phone className="h-4 w-4 mr-2" />
              Kontakt oss
            </Link>
            <a
              href={`tel:${COMPANY.PHONE_RAW}`}
              className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition"
            >
              {COMPANY.PHONE}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
