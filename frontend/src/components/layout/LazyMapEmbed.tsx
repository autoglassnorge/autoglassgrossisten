import { useState } from 'react';
import { MapPin } from 'lucide-react';

interface LazyMapEmbedProps {
  src: string;
  title: string;
}

export function LazyMapEmbed({ src, title }: LazyMapEmbedProps) {
  const [showMap, setShowMap] = useState(false);

  if (showMap) {
    return (
      <iframe
        src={src}
        width="100%"
        height="100%"
        style={{ border: 0, filter: 'grayscale(100%) invert(92%) contrast(83%)' }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title={title}
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-carbon-400">
      <MapPin className="h-8 w-8 text-carbon-500" />
      <p className="text-center text-sm">{title}</p>
      <button
        type="button"
        onClick={() => setShowMap(true)}
        className="rounded-md bg-carbon-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-carbon-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-glass-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-carbon-900"
      >
        Vis kart
      </button>
    </div>
  );
}
