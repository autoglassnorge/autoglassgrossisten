import { Suspense, lazy } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Car, MessageCircle, Search, Store, Wrench, AlertCircle } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { searchByVin } from '@/api/glass';
import { Card } from '@/components/ui/Card';
import { maskVin } from '@/utils/formatters';
import { useChatStore } from '@/stores/chatStore';
import type { Product } from '@/types/api';

const IdentifierResults = lazy(() =>
  import('@/components/search/results/IdentifierResults').then((m) => ({ default: m.IdentifierResults }))
);

interface VinResultsProps {
  activeQuery: string;
  onClear: () => void;
  onDetail: (product: Product) => void;
}

function VinSkeleton() {
  return (
    <div className="animate-pulse space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mx-auto h-12 w-12 rounded-full bg-gray-200" />
      <div className="mx-auto h-6 w-48 rounded bg-gray-200" />
      <div className="mx-auto h-4 w-72 rounded bg-gray-200" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="h-24 rounded-xl bg-gray-200" />
        <div className="h-24 rounded-xl bg-gray-200" />
        <div className="h-24 rounded-xl bg-gray-200" />
      </div>
    </div>
  );
}

function VinChoiceButton({
  icon: Icon,
  label,
  onClick,
  primary = false,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-3 rounded-xl border px-4 py-5 text-center transition min-h-[96px] ${
        primary
          ? 'border-autoglass-blue bg-autoglass-light text-autoglass-blue hover:bg-autoglass-blue hover:text-white'
          : 'border-gray-200 bg-white text-gray-700 hover:border-glass-cyan hover:text-glass-cyan'
      }`}
    >
      <Icon className="h-6 w-6" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

export function VinResults({ activeQuery, onClear, onDetail }: VinResultsProps) {
  const { t } = useI18n();

  const query = useQuery({
    queryKey: ['search', 'vin', activeQuery],
    queryFn: () => searchByVin(activeQuery),
    enabled: activeQuery.length === 17,
    retry: 1,
  });

  if (query.isLoading) {
    return <VinSkeleton />;
  }

  if (query.error || !query.data) {
    return (
      <VinChoices
        title={t('vin.unknown.title')}
        description={query.error ? String(query.error) : t('vin.unknown.description')}
        vin={activeQuery}
        onClear={onClear}
      />
    );
  }

  const result = query.data;
  const eurocode = result.match?.eurocode;
  const hasProduct = result.status === 'resolved' && eurocode;

  if (!hasProduct) {
    return (
      <VinChoices
        title={t(`vin.status.${result.status}`)}
        description={t('vin.unknown.description')}
        vin={result.vehicle?.vin ?? activeQuery}
        onClear={onClear}
        vehicle={result.vehicle}
      />
    );
  }

  return (
    <div className="animate-slide-up space-y-5">
      <Card className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-autoglass-light text-autoglass-blue">
            <Car className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">{t('vin.status.resolved')}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {result.vehicle?.make} {result.vehicle?.model} {result.vehicle?.year}
            </p>
            <p className="mt-1 font-mono text-xs text-gray-400">
              {t('vin.masked').replace('{vin}', maskVin(result.vehicle?.vin ?? activeQuery))}
            </p>
          </div>
          <div className="shrink-0 rounded-lg bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            {eurocode}
          </div>
        </div>
      </Card>

      <Suspense fallback={<VinSkeleton />}>
        <IdentifierResults activeQuery={eurocode} queryType="eurocode" onDetail={onDetail} />
      </Suspense>
    </div>
  );
}

function VinChoices({
  title,
  description,
  vin,
  onClear,
  vehicle,
}: {
  title: string;
  description: string;
  vin: string;
  onClear: () => void;
  vehicle?: { make?: string; model?: string; year?: number };
}) {
  const { t } = useI18n();
  const { openChat } = useChatStore();

  return (
    <Card className="animate-slide-up overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-600 mb-4">
        <AlertCircle className="h-8 w-8" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      {vehicle && (
        <p className="mt-1 text-sm text-gray-500">
          {vehicle.make} {vehicle.model} {vehicle.year}
        </p>
      )}
      <p className="mt-1 font-mono text-xs text-gray-400">{t('vin.masked').replace('{vin}', maskVin(vin))}</p>
      <p className="mx-auto mt-3 max-w-md text-sm text-gray-600">{description}</p>

      <div className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        <VinChoiceButton
          icon={MessageCircle}
          label={t('vin.action.chat')}
          onClick={() => openChat({ message: `VIN: ${vin}` })}
          primary
        />
        <VinChoiceButton
          icon={Wrench}
          label={t('vin.action.quote')}
          onClick={() => openChat({ message: `Be om pristilbud for VIN ${vin}` })}
        />
        <VinChoiceButton
          icon={Search}
          label={t('vin.action.regnr')}
          onClick={onClear}
        />
        <VinChoiceButton
          icon={Store}
          label={t('vin.action.catalog')}
          onClick={() => { window.location.href = '/bla'; }}
        />
      </div>

      <button
        type="button"
        onClick={onClear}
        className="mt-6 text-sm text-autoglass-blue hover:underline"
      >
        Søk på nytt
      </button>
    </Card>
  );
}
