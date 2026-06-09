import { GlassWater, Phone, Mail, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 text-autoglass-blue mb-4">
              <GlassWater className="h-6 w-6" />
              <span className="text-lg font-bold">Autoglass AS</span>
            </div>
            <p className="text-sm text-gray-600">
              Norges største bilglass-grossist. 130 000+ ruter på lager. Levering neste dag til over 500 verksteder.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-4">Navigasjon</h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li><Link to="/" className="hover:text-autoglass-blue">Forside</Link></li>
              <li><Link to="/bla" className="hover:text-autoglass-blue">Katalog</Link></li>
              <li><Link to="/bilglassguide" className="hover:text-autoglass-blue">Bilglassguide</Link></li>
              <li><Link to="/sok" className="hover:text-autoglass-blue">Søk</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-4">Kontakt</h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <span>+47 21 37 83 90</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <span>post@alfa-glass.no</span>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>Oslo, Norge</span>
              </li>
            </ul>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-4">Lenker</h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li><a href="https://auto-glass.no" className="hover:text-autoglass-blue">auto-glass.no</a></li>
              <li><a href="https://www.finnbilglass.no" className="hover:text-autoglass-blue">finnbilglass.no</a></li>
              <li><span className="text-gray-400">B2B Katalog v3.0</span></li>
              <li><Link to="/admin" className="text-gray-400 hover:text-autoglass-blue transition">Admin</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500">
          <div>
            © {new Date().getFullYear()} Autoglass AS. Alle rettigheter reservert.
          </div>
          <div className="flex gap-4">
            <Link to="/personvern" className="hover:text-autoglass-blue">Personvern</Link>
            <Link to="/vilkar" className="hover:text-autoglass-blue">Vilkår</Link>
            <Link to="/kontakt" className="hover:text-autoglass-blue">Kontakt</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
