import { Shield, Square, PanelLeft, Eye, Truck, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';

interface Category {
  key: string;
  icon: React.ReactNode;
  href: string;
}

export function CategoryGrid() {
  const { t } = useI18n();

  const categories: Category[] = [
    {
      key: 'windshield',
      icon: <Shield className="h-8 w-8" />,
      href: '/bilglassguide/frontrute',
    },
    {
      key: 'rear',
      icon: <Square className="h-8 w-8" />,
      href: '/bla?category=bakrute',
    },
    {
      key: 'side',
      icon: <PanelLeft className="h-8 w-8" />,
      href: '/bla?category=sideglass',
    },
    {
      key: 'adas',
      icon: <Eye className="h-8 w-8" />,
      href: '/bilglassguide/adas-kamera',
    },
    {
      key: 'transporter',
      icon: <Truck className="h-8 w-8" />,
      href: '/bla?category=transporter',
    },
    {
      key: 'calibration',
      icon: <Settings className="h-8 w-8" />,
      href: '/bilglassguide/kalibrering',
    },
  ];

  return (
    <section className="bg-carbon-900 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">
            {t('categorygrid.title')}
          </h2>
          <p className="mt-3 text-base sm:text-lg text-carbon-400">
            {t('categorygrid.subtitle')}
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {categories.map((category) => (
            <Link
              key={category.key}
              to={category.href}
              className="group relative flex flex-col items-center p-6 rounded-lg border border-carbon-800 bg-carbon-950/50 hover:border-glass-cyan/50 hover:bg-carbon-950 transition-all duration-200 hover:scale-[1.02]"
            >
              {/* Icon */}
              <div className="flex items-center justify-center h-14 w-14 rounded-full bg-carbon-900 group-hover:bg-glass-cyan/10 transition-colors duration-200">
                <span className="text-glass-cyan">{category.icon}</span>
              </div>

              {/* Title */}
              <h3 className="mt-4 text-sm sm:text-base font-semibold text-white text-center">
                {t(`categorygrid.${category.key}.title`)}
              </h3>

              {/* Description */}
              <p className="mt-2 text-xs sm:text-sm text-carbon-400 text-center leading-relaxed">
                {t(`categorygrid.${category.key}.desc`)}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
