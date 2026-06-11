/**
 * SupportSection — "Snakk med vårt erfarne glassteam"
 * Fixed section on homepage, not a floating widget.
 */

import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, MessageCircle, ArrowRight } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { COMPANY } from '@/config/company.config';

export function SupportSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isVisible = useScrollReveal(sectionRef);
  const { openChat } = useChatStore();
  const navigate = useNavigate();

  return (
    <section
      ref={sectionRef}
      className={`bg-carbon-900 py-16 sm:py-20 border-t border-carbon-800 transition-all duration-500 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-glass-cyan/10 mb-5">
          <MessageCircle className="h-7 w-7 text-glass-cyan" />
        </div>

        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">
          Snakk med vårt erfarne glassteam
        </h2>

        <p className="mt-3 text-base sm:text-lg text-carbon-300 max-w-xl mx-auto">
          Trenger du hjelp med å finne riktig glass? Tomar og teamet vårt har over {COMPANY.YEARS_EXPERIENCE} års erfaring
          i bilglassbransjen og hjelper deg gjerne.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => openChat()}
            className="group inline-flex items-center justify-center gap-2 bg-glass-cyan hover:bg-glass-cyanLight text-carbon-950 font-semibold px-7 py-3.5 rounded-md transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            Start chat
            <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
          </button>

          <a
            href={`tel:${COMPANY.PHONE_RAW}`}
            className="inline-flex items-center justify-center gap-2 border border-carbon-700 hover:border-glass-cyan hover:text-glass-cyan text-white px-7 py-3.5 rounded-md transition-colors"
          >
            <Phone className="h-4 w-4" />
            {COMPANY.PHONE}
          </a>
        </div>
      </div>
    </section>
  );
}
