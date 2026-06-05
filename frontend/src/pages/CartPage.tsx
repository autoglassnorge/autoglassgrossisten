import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageMeta } from '@/components/seo/PageMeta';
import { useCartStore } from '@/stores/cartStore';
import { Button } from '@/components/ui/Button';
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  AlertTriangle,
  Package,
  Send,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';
import { API_BASE } from '@/api/client';

interface QuoteForm {
  name: string;
  email: string;
  company: string;
  phone: string;
  message: string;
}

export default function CartPage() {
  const { items, warnings, removeItem, updateQuantity, clear, dismissWarning } =
    useCartStore();
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<QuoteForm>({
    name: '',
    email: '',
    company: '',
    phone: '',
    message: '',
  });

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = items.reduce(
    (sum, i) => sum + (i.product.price || 0) * i.quantity,
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || items.length === 0) return;

    setSubmitting(true);
    setError(null);

    try {
      // Send én forespørsel per produkt (quote API støtter én eurocode om gangen)
      const promises = items.map((item) =>
        fetch(`${API_BASE}/api/quote-request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: form.email,
            eurocode: item.product.eurocode || item.product.articleNumber,
            quantity: item.quantity,
            message: [
              `Firma: ${form.company || 'Ikke oppgitt'}`,
              `Navn: ${form.name || 'Ikke oppgitt'}`,
              `Telefon: ${form.phone || 'Ikke oppgitt'}`,
              form.message,
              `Produkt: ${item.product.title} (${item.product.brand} ${item.product.model})`,
              `Eurokode: ${item.product.eurocode || item.product.articleNumber}`,
              `Glass: ${item.product.typeDescription || item.product.typeCode}`,
              `Lager: ${item.product.stockStatus} stk`,
            ]
              .filter(Boolean)
              .join('\n'),
          }),
        })
      );

      const results = await Promise.all(promises);
      const allOk = results.every((r) => r.ok);

      if (!allOk) {
        const failed = results.filter((r) => !r.ok).length;
        throw new Error(`${failed} av ${results.length} forespørsler feilet`);
      }

      setSubmitted(true);
      clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ukjent feil');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-white">
        <PageMeta
          title="Forespørsel sendt — Autoglass AS"
          description="Din tilbudsforespørsel er mottatt. Vi kontakter deg snarest."
          canonicalPath="/kasse"
        />
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-6" />
          <h1 className="text-3xl font-bold mb-4">Forespørsel mottatt!</h1>
          <p className="text-gray-600 mb-8">
            Takk for din henvendelse. Vi har mottatt din tilbudsforespørsel og vil
            kontakte deg på <strong>{form.email}</strong> så snart som mulig.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/"
              className="inline-flex items-center justify-center px-6 py-3 bg-autoglass-blue text-white rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Til forsiden
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              to="/bla"
              className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition"
            >
              Fortsett å handle
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-white">
        <PageMeta
          title="Handlekurv — Autoglass AS"
          description="Din handlekurv hos Autoglass AS. Bestill bilglass for B2B."
          canonicalPath="/kasse"
        />
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <ShoppingCart className="mx-auto h-16 w-16 text-gray-300 mb-6" />
          <h1 className="text-2xl font-bold mb-4">Handlekurven er tom</h1>
          <p className="text-gray-600 mb-8">
            Du har ikke lagt til noen produkter ennå. Bruk søket eller katalogen
            for å finne riktig bilglass.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/sok"
              className="inline-flex items-center justify-center px-6 py-3 bg-autoglass-blue text-white rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Søk etter glass
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              to="/bla"
              className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition"
            >
              Bla i katalogen
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <PageMeta
        title="Handlekurv — Autoglass AS"
        description={`${totalItems} produkt${totalItems !== 1 ? 'er' : ''} i handlekurven. Send tilbudsforespørsel til Autoglass AS.`}
        canonicalPath="/kasse"
      />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold mb-8 flex items-center gap-3">
          <ShoppingCart className="h-6 w-6" />
          Handlekurv
          <span className="text-sm font-normal text-gray-500">
            ({totalItems} {totalItems === 1 ? 'produkt' : 'produkter'})
          </span>
        </h1>

        {/* Advarsler */}
        {warnings.length > 0 && (
          <div className="mb-6 space-y-2">
            {warnings.map((w) => (
              <div
                key={`${w.id}-${w.type}`}
                className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4"
              >
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-amber-800">{w.message}</p>
                </div>
                <button
                  onClick={() => dismissWarning(w.id)}
                  className="text-amber-600 hover:text-amber-800 text-sm"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Produktliste */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <div
                key={item.product.id}
                className="flex gap-4 p-4 border rounded-lg bg-white"
              >
                {/* Bilde */}
                <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  {item.product.imageUrl ? (
                    <img
                      src={item.product.imageUrl}
                      alt={item.product.title}
                      className="w-full h-full object-contain rounded-lg"
                      loading="lazy"
                    />
                  ) : (
                    <Package className="h-8 w-8 text-gray-400" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-medium text-gray-900 truncate">
                        {item.product.title}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {item.product.brand} {item.product.model}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.product.eurocode && (
                          <span className="text-xs font-mono font-semibold bg-autoglass-blue/10 text-autoglass-blue px-2 py-0.5 rounded">
                            {item.product.eurocode}
                          </span>
                        )}
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                          {item.product.typeDescription || item.product.typeCode}
                        </span>
                        {item.product.stockStatus > 0 ? (
                          <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">
                            {item.product.stockStatus} på lager
                          </span>
                        ) : (
                          <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded">
                            Ikke på lager
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeItem(item.product.id)}
                      className="p-2 text-gray-400 hover:text-red-500 transition flex-shrink-0"
                      aria-label="Fjern fra handlekurv"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Antall + pris */}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          updateQuantity(item.product.id, item.quantity - 1)
                        }
                        className="p-1 border rounded hover:bg-gray-50"
                        aria-label="Reduser antall"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center font-medium">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          updateQuantity(item.product.id, item.quantity + 1)
                        }
                        className="p-1 border rounded hover:bg-gray-50"
                        aria-label="Øk antall"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="text-right">
                      {item.product.price ? (
                        <>
                          <div className="font-semibold">
                            {(item.product.price * item.quantity).toLocaleString(
                              'nb-NO'
                            )}{' '}
                            kr
                          </div>
                          <div className="text-xs text-gray-500">
                            {item.product.price.toLocaleString('nb-NO')} kr/stk eks. mva
                          </div>
                        </>
                      ) : (
                        <span className="text-sm text-gray-500">
                          Pris på forespørsel
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Tøm handlekurv */}
            <button
              onClick={clear}
              className="text-sm text-gray-500 hover:text-red-500 transition flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" />
              Tøm handlekurv
            </button>
          </div>

          {/* Oppsummering */}
          <div className="space-y-4">
            <div className="border rounded-lg p-6 bg-gray-50">
              <h2 className="font-bold text-lg mb-4">Oppsummering</h2>

              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between">
                  <span>Antall produkter</span>
                  <span>{totalItems}</span>
                </div>
                {totalPrice > 0 && (
                  <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2">
                    <span>Totalt (eks. mva.)</span>
                    <span>{totalPrice.toLocaleString('nb-NO')} kr</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-500 mb-4">
                Prisene er veiledende. Endelig pris fastsettes i tilbud. 
                Frakt beregnes basert på vekt og destinasjon.
              </p>

              <Button
                onClick={() => setShowForm(true)}
                className="w-full"
                size="lg"
              >
                <Send className="mr-2 h-4 w-4" />
                Send tilbudsforespørsel
              </Button>

              <Link
                to="/bla"
                className="block text-center text-sm text-autoglass-blue hover:underline mt-3"
              >
                Fortsett å handle
              </Link>
            </div>

            {/* Hjelp */}
            <div className="border rounded-lg p-4 text-sm text-gray-600">
              <h3 className="font-medium text-gray-900 mb-2">
                Trenger du hjelp?
              </h3>
              <p className="mb-2">
                Ring oss på{' '}
                <a
                  href="tel:+4722905000"
                  className="text-autoglass-blue hover:underline"
                >
                  +47 22 90 50 00
                </a>
              </p>
              <p>
                eller send e-post til{' '}
                <a
                  href="mailto:post@autoglass.no"
                  className="text-autoglass-blue hover:underline"
                >
                  post@autoglass.no
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Forespørselskjema (modal-ish) */}
        {showForm && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h2 className="text-xl font-bold mb-4">
                  Send tilbudsforespørsel
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                  Fyll inn kontaktinfo, så sender vi deg et tilbud på{' '}
                  <strong>{totalItems}</strong> produkt
                  {totalItems !== 1 ? 'er' : ''}.
                </p>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      E-post *{' '}
                      <span className="text-xs text-gray-400">
                        (påkrevd)
                      </span>
                    </label>
                    <input
                      required
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm({ ...form, email: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue outline-none"
                      placeholder="din@bedrift.no"
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Navn
                      </label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue outline-none"
                        placeholder="Ditt navn"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Firma
                      </label>
                      <input
                        type="text"
                        value={form.company}
                        onChange={(e) =>
                          setForm({ ...form, company: e.target.value })
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue outline-none"
                        placeholder="Bedriftsnavn"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Telefon
                    </label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) =>
                        setForm({ ...form, phone: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue outline-none"
                      placeholder="+47 000 00 000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Melding / merknad
                    </label>
                    <textarea
                      rows={3}
                      value={form.message}
                      onChange={(e) =>
                        setForm({ ...form, message: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue outline-none resize-none"
                      placeholder="Spesielle ønsker, leveringsdato, etc."
                    />
                  </div>

                  {/* Produktoppsummering i skjema */}
                  <div className="bg-gray-50 rounded-lg p-3 text-sm">
                    <div className="font-medium mb-2">
                      Produkter i forespørselen:
                    </div>
                    <ul className="space-y-1 text-gray-600">
                      {items.map((item) => (
                        <li key={item.product.id} className="flex justify-between">
                          <span className="truncate">
                            {item.product.eurocode || item.product.articleNumber}
                          </span>
                          <span>× {item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="flex-1 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition"
                    >
                      Avbryt
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || !form.email}
                      className="flex-1 py-3 bg-autoglass-blue text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Sender...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <Send className="h-4 w-4" />
                          Send forespørsel
                        </span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
