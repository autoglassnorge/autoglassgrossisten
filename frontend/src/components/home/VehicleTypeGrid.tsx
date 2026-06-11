import { useI18n } from '@/i18n/I18nProvider';

interface VehicleType {
  key: string;
  image: string;
}

export function VehicleTypeGrid() {
  const { t } = useI18n();

  const vehicles: VehicleType[] = [
    { key: 'car', image: '/images/vehicles/car.jpg' },
    { key: 'van', image: '/images/vehicles/van.jpg' },
    { key: 'rv', image: '/images/vehicles/rv.jpg' },
    { key: 'truck', image: '/images/vehicles/truck.jpg' },
    { key: 'classic', image: '/images/vehicles/classic.jpg' },
    { key: 'muscle', image: '/images/vehicles/muscle.jpg' },
    { key: 'construction', image: '/images/vehicles/construction.jpg' },
  ];

  return (
    <section className="bg-carbon-50 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-carbon-900 tracking-tight">
            {t('vehiclegrid.title')}
          </h2>
        </div>

        {/* Desktop: Grid */}
        <div className="hidden lg:grid grid-cols-7 gap-4">
          {vehicles.map((vehicle) => (
            <div
              key={vehicle.key}
              className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-carbon-200 bg-white shadow-sm"
            >
              <img
                src={vehicle.image}
                alt={t(`vehiclegrid.${vehicle.key}.title`)}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              {/* Title */}
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h3 className="text-sm font-bold text-white text-center">
                  {t(`vehiclegrid.${vehicle.key}.title`)}
                </h3>
              </div>
            </div>
          ))}
        </div>

        {/* Mobile/Tablet: Horizontal scroll carousel */}
        <div className="lg:hidden flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 -mx-4 px-4 scrollbar-hide">
          {vehicles.map((vehicle) => (
            <div
              key={vehicle.key}
              className="group relative aspect-[3/4] w-40 flex-shrink-0 snap-start overflow-hidden rounded-xl border border-carbon-200 bg-white shadow-sm"
            >
              <img
                src={vehicle.image}
                alt={t(`vehiclegrid.${vehicle.key}.title`)}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              {/* Title */}
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <h3 className="text-sm font-bold text-white text-center">
                  {t(`vehiclegrid.${vehicle.key}.title`)}
                </h3>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
