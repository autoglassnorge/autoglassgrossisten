import { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <div
      className={cn(
        'fixed inset-0 z-[60] flex flex-col justify-end transition-opacity duration-300 lg:hidden',
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      )}
      onClick={handleBackdropClick}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Sheet */}
      <div
        className={cn(
          'relative w-full max-w-lg mx-auto rounded-t-2xl bg-white shadow-xl transition-transform duration-300 ease-out max-h-[85vh] flex flex-col',
          open ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1.5 w-10 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Lukk"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-4 flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
