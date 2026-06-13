import { GlassWater, Phone, Mail, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { COMPANY } from '@/config/company.config';

export function Footer() {
  return (
    <footer className="border-t border-carbon-800 bg-carbon-950">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand + Contact */}
          <div>
            <div className="flex items-center gap-2 text-glass-cyan mb-4">
              <GlassWater className="h-6 w-6" />
              <span className="text-lg font-bold">{COMPANY.NAME}</span>
            </div>
            <p className="text-sm text-carbon-400 mb-4">
              Norges største bilglass-grossist. 130 000+ ruter på lager. Levering neste dag til over 500 verksteder.
            </p>
            <ul className="space-y-2 text-sm text-carbon-400">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-carbon-500" />
                <a href={`tel:${COMPANY.PHONE_RAW}`} className="hover:text-glass-cyan transition-colors">{COMPANY.PHONE}</a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-carbon-500" />
                <a href={`mailto:${COMPANY.EMAIL}`} className="hover:text-glass-cyan transition-colors">{COMPANY.EMAIL}</a>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-carbon-500" />
                <span>{COMPANY.ADDRESS.FULL}</span>
              </li>
            </ul>
            <p className="mt-3 text-xs text-carbon-600">
              Org.nr: {COMPANY.ORG_NUMBER}
            </p>

            <a
              href={`tel:${COMPANY.PHONE_RAW}`}
              className="md:hidden mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-glass-cyan px-4 py-2.5 text-sm font-semibold text-carbon-950 hover:bg-glass-cyanLight transition-colors"
            >
              <Phone className="h-4 w-4" />
              Ring {COMPANY.PHONE}
            </a>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="font-semibold text-white mb-4">Navigasjon</h4>
            <ul className="space-y-2 text-sm text-carbon-400">
              <li><Link to="/" className="hover:text-glass-cyan transition-colors">Forside</Link></li>
              <li><Link to="/bla" className="hover:text-glass-cyan transition-colors">Katalog</Link></li>
              <li><Link to="/bilglassguide" className="hover:text-glass-cyan transition-colors">Bilglassguide</Link></li>
              <li><Link to="/sok" className="hover:text-glass-cyan transition-colors">Søk</Link></li>
              <li><Link to="/kontakt" className="hover:text-glass-cyan transition-colors">Kontakt</Link></li>
            </ul>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold text-white mb-4">Lenker</h4>
            <ul className="space-y-2 text-sm text-carbon-400">
              <li><a href="https://auto-glass.no" className="hover:text-glass-cyan transition-colors">auto-glass.no (vår nettbutikk)</a></li>
              <li><a href="https://www.finnbilglass.no" className="hover:text-glass-cyan transition-colors">finnbilglass.no</a></li>
              <li><Link to="/personvern" className="hover:text-glass-cyan transition-colors">Personvern</Link></li>
              <li><Link to="/vilkar" className="hover:text-glass-cyan transition-colors">Vilkår</Link></li>
            </ul>
          </div>

          {/* Map placeholder */}
          <div>
            <h4 className="font-semibold text-white mb-4">Besøksadresse</h4>
            <div className="rounded-lg border border-carbon-800 bg-carbon-900 overflow-hidden aspect-video">
              <iframe
                src={COMPANY.MAP_EMBED_URL}
                width="100%"
                height="100%"
                style={{ border: 0, filter: 'grayscale(100%) invert(92%) contrast(83%)' }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Autoglass AS lokasjon"
              />
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-carbon-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-carbon-500">
          <div>
            © {new Date().getFullYear()} Autoglass AS. Alle rettigheter reservert.
          </div>
          <div className="flex gap-4">
            <Link to="/personvern" className="hover:text-glass-cyan transition-colors">Personvern</Link>
            <Link to="/vilkar" className="hover:text-glass-cyan transition-colors">Vilkår</Link>
            <Link to="/kontakt" className="hover:text-glass-cyan transition-colors">Kontakt</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
