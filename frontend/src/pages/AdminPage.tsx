import { useState, useEffect } from 'react';
import { PageMeta } from '@/components/seo/PageMeta';
import { API_BASE } from '@/api/client';
import {
  Loader2,
  AlertCircle,
  Mail,
  Calendar,
  Package,
  MessageSquare,
  Clock,
  CheckCircle,
  RefreshCw,
  Shield,
} from 'lucide-react';

interface QuoteRequest {
  id: number;
  email: string;
  eurocode: string | null;
  regnr: string | null;
  quantity: number;
  message: string | null;
  created_at: string;
  status: string;
}

export default function AdminPage() {
  const [quotes, setQuotes] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [filter, setFilter] = useState('all'); // all, new, contacted, closed
  const [searchTerm, setSearchTerm] = useState('');

  const fetchQuotes = async () => {
    setLoading(true);
    setError(null);
    setAuthRequired(false);

    try {
      const res = await fetch(`${API_BASE}/api/admin/quotes`, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (res.status === 401) {
        setAuthRequired(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Feil: ${res.status}`);
      }

      const data = await res.json();
      setQuotes(data.quotes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ukjent feil');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
  }, []);

  const filteredQuotes = quotes
    .filter((q) => {
      if (filter === 'all') return true;
      return q.status === filter;
    })
    .filter((q) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        q.email.toLowerCase().includes(term) ||
        (q.eurocode?.toLowerCase() || '').includes(term) ||
        (q.regnr?.toLowerCase() || '').includes(term) ||
        (q.message?.toLowerCase() || '').includes(term)
      );
    });

  const statusBadge = (status: string) => {
    switch (status) {
      case 'new':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full font-medium">
            <Clock className="h-3 w-3" /> Ny
          </span>
        );
      case 'contacted':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded-full font-medium">
            <MessageSquare className="h-3 w-3" /> Kontaktet
          </span>
        );
      case 'closed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded-full font-medium">
            <CheckCircle className="h-3 w-3" /> Lukket
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 text-gray-600 text-xs rounded-full font-medium">
            {status}
          </span>
        );
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('nb-NO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (authRequired) {
    return (
      <div className="min-h-screen bg-white">
        <PageMeta
          title="Admin — Tilbudsforespørsler"
          description="Administrasjonspanel for tilbudsforespørsler hos Autoglass AS."
          canonicalPath="/admin"
        />
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <Shield className="mx-auto h-16 w-16 text-autoglass-blue mb-6" />
          <h1 className="text-2xl font-bold mb-4">Innlogging kreves</h1>
          <p className="text-gray-600 mb-6">
            Dette admin-panelet er beskyttet av Cloudflare Access. 
            Du må logge inn via organisasjonens identitetsleverandør for å se tilbudsforespørsler.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 text-left max-w-md mx-auto">
            <p className="font-medium mb-2">Slik fungerer det:</p>
            <ul className="space-y-1 list-disc pl-4">
              <li>Admin-panelet er kun tilgjengelig for autoriserte brukere</li>
              <li>Innlogging skjer via Cloudflare Access (Google, Microsoft, etc.)</li>
              <li>Kontakt systemadministrator hvis du trenger tilgang</li>
            </ul>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-6 py-2 bg-autoglass-blue text-white rounded-lg hover:bg-blue-700 transition"
          >
            Prøv igjen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <PageMeta
        title="Admin — Tilbudsforespørsler"
        description="Administrasjonspanel for tilbudsforespørsler hos Autoglass AS."
        canonicalPath="/admin"
      />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="h-6 w-6 text-autoglass-blue" />
              Tilbudsforespørsler
            </h1>
            <p className="text-gray-600 text-sm mt-1">
              {quotes.length} forespørsler totalt
              {quotes.filter((q) => q.status === 'new').length > 0 && (
                <span className="ml-2 text-blue-600 font-medium">
                  ({quotes.filter((q) => q.status === 'new').length} nye)
                </span>
              )}
            </p>
          </div>
          <button
            onClick={fetchQuotes}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Oppdater
          </button>
        </div>

        {/* Filter + søk */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex gap-2">
            {[
              { key: 'all', label: 'Alle' },
              { key: 'new', label: 'Nye' },
              { key: 'contacted', label: 'Kontaktet' },
              { key: 'closed', label: 'Lukket' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  filter === f.key
                    ? 'bg-autoglass-blue text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
                <span className="ml-1 opacity-70">
                  (
                  {
                    quotes.filter((q) =>
                      f.key === 'all' ? true : q.status === f.key
                    ).length
                  }
                  )
                </span>
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Søk i e-post, eurocode, regnr..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 max-w-md rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue outline-none"
          />
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-autoglass-blue" />
            <span className="ml-3 text-gray-600">Henter forespørsler...</span>
          </div>
        )}

        {error && !authRequired && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">Kunne ikke hente forespørsler</p>
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={fetchQuotes}
                className="mt-2 text-sm text-red-600 hover:underline"
              >
                Prøv igjen
              </button>
            </div>
          </div>
        )}

        {!loading && !error && filteredQuotes.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            {searchTerm || filter !== 'all' ? (
              <p>Ingen forespørsler matcher filteret.</p>
            ) : (
              <p>Ingen tilbudsforespørsler ennå.</p>
            )}
          </div>
        )}

        {!loading && filteredQuotes.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">ID</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">E-post</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Eurocode</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Reg.nr</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Antall</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Melding</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Dato</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredQuotes.map((q) => (
                  <tr
                    key={q.id}
                    className="hover:bg-gray-50 transition"
                  >
                    <td className="px-4 py-3 text-gray-500">#{q.id}</td>
                    <td className="px-4 py-3">
                      <a
                        href={`mailto:${q.email}`}
                        className="text-autoglass-blue hover:underline flex items-center gap-1"
                      >
                        <Mail className="h-3 w-3" />
                        {q.email}
                      </a>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {q.eurocode || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {q.regnr || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">{q.quantity}</td>
                    <td className="px-4 py-3 max-w-xs">
                      {q.message ? (
                        <div className="truncate" title={q.message}>
                          {q.message}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(q.created_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3">{statusBadge(q.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
