/**
 * TopBar — B2B contact bar with phone number.
 * Hidden on mobile, visible on sm+ screens.
 */
import { Phone } from 'lucide-react';
import { COMPANY } from '@/config/company.config';

export function TopBar() {
  return (
    <div className="hidden sm:block bg-carbon-900 border-b border-carbon-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-end gap-6 h-8">
          <a
            href={`tel:${COMPANY.PHONE_RAW}`}
            className="flex items-center gap-1.5 text-xs text-carbon-300 hover:text-glass-cyan transition-colors"
          >
            <Phone className="h-3 w-3" />
            <span className="font-medium">{COMPANY.PHONE}</span>
            <span className="text-carbon-500">— Ring oss for bestilling</span>
          </a>
        </div>
      </div>
    </div>
  );
}
