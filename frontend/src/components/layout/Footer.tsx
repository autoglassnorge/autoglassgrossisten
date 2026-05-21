import { GlassWater, Phone, Mail, MapPin } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
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

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-4">Kontakt</h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <span>+47 22 90 50 00</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <span>post@autoglass.no</span>
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
              <li><a href="https://autoglass-frontend.pages.dev" className="hover:text-autoglass-blue">Grossistportal</a></li>
              <li><span className="text-gray-400">B2B Katalog v3.0</span></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t pt-8 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Autoglass AS. Alle rettigheter reservert.
        </div>
      </div>
    </footer>
  );
}
