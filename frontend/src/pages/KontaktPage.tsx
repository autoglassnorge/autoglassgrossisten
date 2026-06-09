import { useState } from 'react';
import { PageMeta } from '@/components/seo/PageMeta';
import { Phone, Mail, MapPin, Clock, CheckCircle, AlertCircle } from 'lucide-react';

export default function KontaktPage() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    subject: '',
    message: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Integrate with backend form handler
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 5000);
  };

  return (
    <div className="min-h-screen bg-white">
      <PageMeta
        title="Kontakt — Autoglass AS"
        description="Kontakt Autoglass AS for bestilling, support eller for å bli kunde. Telefon +47 21 37 83 90, e-post post@alfa-glass.no."
        canonicalPath="/kontakt"
      />

      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-800 py-20 px-4 text-white">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold mb-4">Kontakt oss</h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Vi er her for å hjelpe deg. Ta kontakt for bestilling, support eller for å bli kunde.
          </p>
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="mx-auto max-w-6xl grid md:grid-cols-2 gap-12">
          {/* Contact Info */}
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-bold mb-6">Kontaktinformasjon</h2>
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Phone className="h-5 w-5 text-autoglass-blue" />
                  </div>
                  <div>
                    <div className="font-medium">Telefon</div>
                    <a href="tel:+4722905000" className="text-autoglass-blue hover:underline">
                      +47 21 37 83 90
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Mail className="h-5 w-5 text-autoglass-blue" />
                  </div>
                  <div>
                    <div className="font-medium">E-post</div>
                    <a href="mailto:post@alfa-glass.no" className="text-autoglass-blue hover:underline">
                      post@alfa-glass.no
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <MapPin className="h-5 w-5 text-autoglass-blue" />
                  </div>
                  <div>
                    <div className="font-medium">Adresse</div>
                    <p className="text-gray-600">
                      Autoglass AS<br />
                      Oslo, Norge
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Clock className="h-5 w-5 text-autoglass-blue" />
                  </div>
                  <div>
                    <div className="font-medium">Åpningstider</div>
                    <p className="text-gray-600">
                      Man–Fre: 07:00 – 16:00<br />
                      Lør–Søn: Stengt
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick links */}
            <div className="bg-gray-50 rounded-xl p-6">
              <h3 className="font-bold mb-3">Hurtiglenker</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="https://auto-glass.no" className="text-autoglass-blue hover:underline">
                    → Gammel nettside (auto-glass.no)
                  </a>
                </li>
                <li>
                  <a href="https://www.finnbilglass.no" className="text-autoglass-blue hover:underline">
                    → Finn Bilglass (finnbilglass.no)
                  </a>
                </li>
                <li>
                  <a href="https://autoglass-frontend.pages.dev/" className="text-autoglass-blue hover:underline">
                    → Ny B2B-portal
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Contact Form */}
          <div>
            <h2 className="text-2xl font-bold mb-6">Send oss en melding</h2>
            
            {submitted ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <div>
                  <div className="font-medium text-green-800">Takk for din henvendelse!</div>
                  <div className="text-sm text-green-700">Vi svarer så fort vi kan.</div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Navn *</label>
                    <input
                      required
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue outline-none"
                      placeholder="Ditt navn"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Firma</label>
                    <input
                      type="text"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue outline-none"
                      placeholder="Firmanavn"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">E-post *</label>
                    <input
                      required
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue outline-none"
                      placeholder="din@epost.no"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Telefon</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue outline-none"
                      placeholder="+47 000 00 000"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Emne</label>
                  <select
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue outline-none"
                  >
                    <option value="">Velg emne...</option>
                    <option value="bestilling">Bestilling</option>
                    <option value="support">Support</option>
                    <option value="bli-kunde">Bli kunde</option>
                    <option value="reklamasjon">Reklamasjon</option>
                    <option value="annet">Annet</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Melding *</label>
                  <textarea
                    required
                    rows={5}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue outline-none resize-none"
                    placeholder="Beskriv ditt behov..."
                  />
                </div>

                <div className="flex items-start gap-2 text-sm text-gray-600">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <p>
                    Dette skjemaet er for øyeblikket en demo. For faktiske henvendelser, 
                    vennligst ring oss eller send e-post direkte.
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-autoglass-blue text-white rounded-lg font-medium hover:bg-blue-700 transition"
                >
                  Send melding
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
