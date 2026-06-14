import { Suspense, lazy, memo, type ElementType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Car, MessageCircle, Search, Store, Wrench, AlertCircle } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { searchByVin } from '@/api/glass';
import { maskVin } from '@/utils/formatters';
import { useChatStore } from '@/stores/chatStore';
import type { Product, VinLookupVehicle } from '@/types/api';

const IdentifierResults = lazy(() =>
  import('@/components/search/results/IdentifierResults').then((m) => ({ default: m.IdentifierResults }))
);

interface VinResultsProps {
  activeQuery: string;
  onClear: () => void;
  onDetail: (product: Product) => void;
}

const cardClasses =
  'overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm';

function formatVehicle(vehicle?: { make?: string; model?: string; year?: number }): string {
  if (!vehicle) return '';
  return [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ');
}

function VinSkeleton() {
  const { t } = useI18n();
  return (
    <div
      className="animate-pulse space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      aria-busy="true"
      role="status"
      aria-label={t('vin.loading.label')}
    >
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

function choiceClasses(primary: boolean): string {
  const base =
    'flex flex-col items-center gap-3 rounded-xl border px-4 py-5 text-center transition min-h-24 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-glass-cyan focus-visible:ring-offset-2';
  return primary
    ? `${base} border-autoglass-blue bg-autoglass-light text-autoglass-blue hover:bg-autoglass-blue hover:text-white`
    : `${base} border-gray-200 bg-white text-gray-700 hover:border-glass-cyan hover:text-glass-cyan`;
}

function VinChoiceButton({
  icon: Icon,
  label,
  onClick,
  primary = false,
}: {
  icon: ElementType;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} className={choiceClasses(primary)}>
      <Icon className="h-6 w-6" aria-hidden="true" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

function VinChoiceLink({
  icon: Icon,
  label,
  to,
  primary = false,
}: {
  icon: ElementType;
  label: string;
  to: string;
  primary?: boolean;
}) {
  return (
    <Link to={to} className={choiceClasses(primary)}>
      <Icon className="h-6 w-6" aria-hidden="true" />
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

function VinResultsInner({ activeQuery, onClear, onDetail }: VinResultsProps) {
  const { t } = useI18n();

  const query = useQuery({
    queryKey: ['search', 'vin', activeQuery],
    queryFn: ({ signal }) => searchByVin(activeQuery, signal),
    enabled: activeQuery.length === 17,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  if (query.isLoading) {
    return <VinSkeleton />;
  }

  if (query.error || !query.data) {
    return (
      <VinChoices
        title={t('vin.unknown.title')}
        description={t('vin.unknown.description')}
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
      <div className={`${cardClasses} p-6`}>
        <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-autoglass-light text-autoglass-blue">
            <Car className="h-7 w-7" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">{t('vin.status.resolved')}</h2>
            <p className="text-sm text-gray-500 mt-1">{formatVehicle(result.vehicle)}</p>
            <p className="mt-1 font-mono text-xs text-gray-400">
              {t('vin.masked').replace('{vin}', maskVin(result.vehicle?.vin ?? activeQuery))}
            </p>
          </div>
          <div className="shrink-0 rounded-lg bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            {eurocode}
          </div>
        </div>
      </div>

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
  vehicle?: VinLookupVehicle;
}) {
  const { t } = useI18n();
  const { openChat } = useChatStore();

  return (
    <div className={`${cardClasses} animate-slide-up p-6 sm:p-8 text-center`}>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-600 mb-4">
        <AlertCircle className="h-8 w-8" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      {vehicle && <p className="mt-1 text-sm text-gray-500">{formatVehicle(vehicle)}</p>}
      <p className="mt-1 font-mono text-xs text-gray-400">
        {t('vin.masked').replace('{vin}', maskVin(vin))}
      </p>
      <p className="mx-auto mt-3 max-w-md text-sm text-gray-600">{description}</p>

      <div className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        <VinChoiceButton
          icon={MessageCircle}
          label={t('vin.action.chat')}
          onClick={() => openChat({ message: t('vin.chat.initial').replace('{vin}', vin) })}
          primary
        />
        <VinChoiceButton
          icon={Wrench}
          label={t('vin.action.quote')}
          onClick={() => openChat({ message: t('vin.chat.quoteRequest').replace('{vin}', vin) })}
        />
        <VinChoiceButton
          icon={Search}
          label={t('vin.action.regnr')}
          onClick={onClear}
        />
        <VinChoiceLink
          icon={Store}
          label={t('vin.action.catalog')}
          to="/bla"
        />
      </div>

      <button
        type="button"
        onClick={onClear}
        className="mt-6 text-sm text-autoglass-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-glass-cyan focus-visible:ring-offset-2 rounded"
      >
        {t('vin.action.reset')}
      </button>
    </div>
  );
}

export const VinResults = memo(VinResultsInner);
