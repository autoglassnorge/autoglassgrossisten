import { useMemo } from 'react';
import { Bell, Calendar, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EUKontrollReminderProps {
  nextEUDate?: string; // ISO dato format (YYYY-MM-DD)
}

type EUStatus = 'ok' | 'soon' | 'urgent' | 'overdue';

interface StatusConfig {
  status: EUStatus;
  label: string;
  icon: React.ReactNode;
  colors: {
    bg: string;
    border: string;
    text: string;
    iconBg: string;
  };
}

export function EUKontrollReminder({ nextEUDate }: EUKontrollReminderProps) {
  const { formattedDate, statusConfig } = useMemo(() => {
    if (!nextEUDate) {
      return { daysUntil: null, formattedDate: null, statusConfig: null };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const euDate = new Date(nextEUDate);
    euDate.setHours(0, 0, 0, 0);

    const diffTime = euDate.getTime() - today.getTime();
    const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Format date in Norwegian: "15. mars 2025"
    const formattedDate = euDate.toLocaleDateString('no-NO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    let statusConfig: StatusConfig;

    if (daysUntil > 60) {
      statusConfig = {
        status: 'ok',
        label: `${daysUntil} dager igjen`,
        icon: <CheckCircle className="h-4 w-4" />,
        colors: {
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          text: 'text-emerald-400',
          iconBg: 'bg-emerald-500/20',
        },
      };
    } else if (daysUntil >= 30) {
      statusConfig = {
        status: 'soon',
        label: `${daysUntil} dager igjen`,
        icon: <AlertTriangle className="h-4 w-4" />,
        colors: {
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          text: 'text-amber-400',
          iconBg: 'bg-amber-500/20',
        },
      };
    } else if (daysUntil >= 0) {
      statusConfig = {
        status: 'urgent',
        label: `${daysUntil} dager igjen`,
        icon: <AlertTriangle className="h-4 w-4" />,
        colors: {
          bg: 'bg-red-500/10',
          border: 'border-red-500/30',
          text: 'text-red-400',
          iconBg: 'bg-red-500/20',
        },
      };
    } else {
      statusConfig = {
        status: 'overdue',
        label: `Overskredet med ${Math.abs(daysUntil)} dager`,
        icon: <XCircle className="h-4 w-4" />,
        colors: {
          bg: 'bg-red-500/10',
          border: 'border-red-500/30',
          text: 'text-red-400',
          iconBg: 'bg-red-500/20',
        },
      };
    }

    return { formattedDate, statusConfig };
  }, [nextEUDate]);

  // Don't render if no date provided
  if (!nextEUDate || !statusConfig) {
    return null;
  }

  const handleAddToCalendar = () => {
    // Generate iCal/ICS format
    const eventDate = new Date(nextEUDate);
    const endDate = new Date(eventDate);
    endDate.setDate(endDate.getDate() + 1);

    const formatICSDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Autoglass AS//EU Kontroll//NO',
      'BEGIN:VEVENT',
      `DTSTART;VALUE=DATE:${formatICSDate(eventDate).slice(0, 8)}`,
      `DTEND;VALUE=DATE:${formatICSDate(endDate).slice(0, 8)}`,
      'SUMMARY:EU-kontroll',
      'DESCRIPTION:Påminnelse om EU-kontroll (periodisk kjøretøykontroll)',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:EU-kontroll i dag',
      'TRIGGER:-P7D',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'eu-kontroll.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={cn(
        'rounded-lg border p-4 backdrop-blur-sm',
        'bg-cyan-950/30 border-cyan-500/30',
        statusConfig.colors.bg,
        statusConfig.colors.border
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full',
            statusConfig.colors.iconBg
          )}
        >
          <Bell className={cn('h-5 w-5', statusConfig.colors.text)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-cyan-50 text-sm">EU-kontroll</h3>
          
          <p className="text-sm text-cyan-100/80 mt-1">
            Neste kontroll: <span className="font-medium text-cyan-50">{formattedDate}</span>
          </p>

          {/* Status indicator */}
          <div className="flex items-center gap-2 mt-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                statusConfig.colors.bg,
                statusConfig.colors.text,
                'border',
                statusConfig.colors.border
              )}
            >
              {statusConfig.icon}
              {statusConfig.label}
            </span>
          </div>
        </div>
      </div>

      {/* Calendar button */}
      <button
        onClick={handleAddToCalendar}
        className={cn(
          'mt-3 w-full inline-flex items-center justify-center gap-2',
          'rounded-md px-3 py-2 text-xs font-medium',
          'bg-cyan-500/10 text-cyan-300',
          'border border-cyan-500/30',
          'hover:bg-cyan-500/20 hover:border-cyan-500/50',
          'transition-colors duration-200',
          'focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 focus:ring-offset-cyan-950'
        )}
        aria-label="Legg til EU-kontroll i kalender"
      >
        <Calendar className="h-3.5 w-3.5" />
        Legg til i kalender
      </button>
    </div>
  );
}

export type { EUKontrollReminderProps };
