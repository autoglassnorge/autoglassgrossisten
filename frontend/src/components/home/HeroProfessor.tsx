/**
 * HeroProfessor — Professor Autoglass as the primary entry point
 * Hero image on top, CTA section below on blue background
 */

import { useChatStore } from '@/stores/chatStore';
import { ArrowRight, Sparkles } from 'lucide-react';
import { BUSINESS_METRICS, formatCompact } from '@/constants/businessMetrics';

export function HeroProfessor() {
  const { openChat } = useChatStore();

  return (
    <section className="relative w-full">
      {/* Hero image — full width, no overlay */}
      <div className="relative w-full aspect-[16/9] md:aspect-[21/9] lg:aspect-[3/1] max-h-[520px]">
        <img
          src="/hero-autoglass.png"
          alt="Professor Autoglass — din bilglass-AI"
          className="absolute inset-0 w-full h-full object-cover object-top"
          loading="eager"
        />
      </div>

      {/* CTA section below image */}
      <div className="bg-gradient-to-b from-autoglass-blue via-blue-700 to-blue-900 text-white py-8 md:py-12">
        <div className="mx-auto max-w-4xl px-4 text-center">
          {/* Main CTA */}
          <button
            onClick={() => openChat()}
            className="group inline-flex items-center gap-3 bg-white text-autoglass-blue px-6 py-3 md:px-8 md:py-4 rounded-2xl text-base md:text-lg font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
          >
            <Sparkles className="h-5 w-5" />
            Snakk med Professor Autoglass om bilglass
            <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* Stats */}
          <div className="mt-6 md:mt-8 grid grid-cols-3 gap-4 md:gap-8 max-w-lg mx-auto">
            <div>
              <div className="text-xl md:text-3xl font-bold">{BUSINESS_METRICS.YEARS_EXPERIENCE}+</div>
              <div className="text-xs md:text-sm text-blue-200">Års erfaring</div>
            </div>
            <div>
              <div className="text-xl md:text-3xl font-bold">{formatCompact(BUSINESS_METRICS.VARIANTS)}+</div>
              <div className="text-xs md:text-sm text-blue-200">Varianter</div>
            </div>
            <div>
              <div className="text-xl md:text-3xl font-bold">24/7</div>
              <div className="text-xs md:text-sm text-blue-200">Tilgjengelig</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
