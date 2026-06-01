import { ChevronRight, Home, Car, Calendar } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  step: 'brand' | 'model' | 'year';
  isActive: boolean;
}

interface BreadcrumbNavProps {
  items: BreadcrumbItem[];
  onItemClick: (step: 'brand' | 'model' | 'year') => void;
  isMobile?: boolean;
}

const stepIcons = {
  brand: Home,
  model: Car,
  year: Calendar,
};

const stepLabels = {
  brand: 'Merke',
  model: 'Modell',
  year: 'År',
};

export default function BreadcrumbNav({
  items,
  onItemClick,
  isMobile = false,
}: BreadcrumbNavProps) {
  // Filter out items that don't have meaningful content yet (except current step)
  const visibleItems = items.filter((item) => {
    // Always show if it has a value or is the current active step
    const hasValue = !item.label.startsWith('Velg');
    return hasValue || item.isActive;
  });

  if (visibleItems.length === 0) {
    return (
      <nav className="flex items-center">
        <span className="text-sm text-gray-400">Velg merke for å starte</span>
      </nav>
    );
  }

  return (
    <nav
      className="flex items-center"
      aria-label="Brødsmulesti"
    >
      <ol className="flex items-center flex-wrap gap-1">
        {visibleItems.map((item, index) => {
          const Icon = stepIcons[item.step];
          const isClickable = !item.isActive && !item.label.startsWith('Velg');

          return (
            <li key={item.step} className="flex items-center">
              {index > 0 && (
                <ChevronRight
                  className={`mx-1 flex-shrink-0 text-gray-400 ${
                    isMobile ? 'w-3 h-3' : 'w-4 h-4'
                  }`}
                />
              )}

              <button
                onClick={() => isClickable && onItemClick(item.step)}
                disabled={!isClickable}
                className={`
                  flex items-center gap-1.5 rounded-md transition-colors
                  ${isMobile ? 'text-xs py-1 px-1.5' : 'text-sm py-1.5 px-2'}
                  ${
                    item.isActive
                      ? 'font-semibold text-autoglass-blue bg-blue-50'
                      : isClickable
                      ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 cursor-pointer'
                      : 'text-gray-400 cursor-default'
                  }
                `}
              >
                <Icon
                  className={`flex-shrink-0 ${
                    isMobile ? 'w-3 h-3' : 'w-4 h-4'
                  } ${item.isActive ? 'text-autoglass-blue' : 'text-gray-400'}`}
                />
                <span className="truncate max-w-[120px] sm:max-w-[150px]">
                  {isMobile ? (
                    item.label
                  ) : (
                    <>
                      <span className="text-gray-500 font-normal">
                        {stepLabels[item.step]}:
                      </span>{' '}
                      <span className={item.isActive ? 'font-semibold' : ''}>
                        {item.label.startsWith('Velg')
                          ? item.label
                          : item.label}
                      </span>
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
