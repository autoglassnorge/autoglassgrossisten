import { useNavigate } from 'react-router-dom';
import { Search, BookOpen, Phone, FileText, ArrowRight } from 'lucide-react';

/**
 * QuickActions - CTA-seksjon med hurtigvalg
 * Inspirert av Sekurit Service "Hva kan vi hjelpe deg med?"
 */

const ACTIONS = [
  {
    id: 'search',
    icon: Search,
    title: 'Søk etter glass',
    description: 'Bla gjennom katalogen etter bilmerke og modell',
    href: '/bilglassguide',
    primary: true,
  },
  {
    id: 'guide',
    icon: BookOpen,
    title: 'Bilglassguiden',
    description: 'Lær om ulike glass, ADAS og montering',
    href: '/bilglassguide',
    primary: false,
  },
  {
    id: 'quote',
    icon: FileText,
    title: 'Be om pristilbud',
    description: 'Få tilbud på større innkjøp eller spesialglass',
    href: '/pristilbud',
    primary: false,
  },
  {
    id: 'contact',
    icon: Phone,
    title: 'Kontakt oss',
    description: 'Snakk med våre eksperter om dine behov',
    href: '/kontakt',
    primary: false,
  },
];

export function QuickActions() {
  const navigate = useNavigate();

  return (
    <section className="py-16 bg-carbon-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            Hva kan vi hjelpe deg med?
          </h2>
          <p className="text-carbon-400 max-w-2xl mx-auto">
            Velg det som passer ditt behov, eller kontakt oss for personlig veiledning
          </p>
        </div>

        {/* Action cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => navigate(action.href)}
              className={`group relative p-6 rounded-xl text-left transition-all duration-200 ${
                action.primary
                  ? 'bg-glass-cyan hover:bg-glass-cyanLight text-carbon-950'
                  : 'bg-carbon-900 hover:bg-carbon-800 text-white border border-carbon-800 hover:border-carbon-700'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className={`inline-flex items-center justify-center w-12 h-12 rounded-lg ${
                    action.primary
                      ? 'bg-carbon-950/10'
                      : 'bg-glass-cyan/10'
                  }`}
                >
                  <action.icon
                    className={`h-6 w-6 ${
                      action.primary ? 'text-carbon-950' : 'text-glass-cyan'
                    }`}
                  />
                </div>
                <ArrowRight
                  className={`h-5 w-5 transition-transform group-hover:translate-x-1 ${
                    action.primary ? 'text-carbon-950' : 'text-carbon-500'
                  }`}
                />
              </div>
              <h3 className="text-lg font-semibold mb-2">{action.title}</h3>
              <p
                className={`text-sm ${
                  action.primary ? 'text-carbon-800' : 'text-carbon-400'
                }`}
              >
                {action.description}
              </p>
            </button>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 text-center">
          <p className="text-carbon-500 text-sm mb-4">
            Trenger du hjelp med å finne riktig glass?
          </p>
          <a
            href="tel:+4733221122"
            className="inline-flex items-center gap-2 text-glass-cyan hover:text-glass-cyanLight font-medium transition-colors"
          >
            <Phone className="h-4 w-4" />
            Ring oss på 33 22 11 22
          </a>
        </div>
      </div>
    </section>
  );
}
