/**
 * HeroProfessor — Professor Autoglass as the primary entry point
 * Replaces the traditional search hero with a conversational AI experience
 */

import ProfessorAvatar from '@/components/ordremottaker/ProfessorAvatar';
import { useChatStore } from '@/stores/chatStore';
import { ArrowRight, Sparkles } from 'lucide-react';

const QUICK_PROMPTS = [
  'VW Transporter 2019, frontrute',
  'BMW X5 2020, bakrute med varme',
  'Jeg har regnr SU18018',
];

export function HeroProfessor() {
  const { openChat } = useChatStore();

  return (
    <section className="relative bg-gradient-to-br from-autoglass-blue via-blue-700 to-blue-900 text-white py-16 md:py-24">
      <div className="mx-auto max-w-4xl px-4 text-center">
        {/* Professor Avatar */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <ProfessorAvatar size="xl" className="border-4 border-white/30 shadow-2xl" />
            <div className="absolute -bottom-1 -right-1 bg-green-500 h-5 w-5 rounded-full border-2 border-white" title="Professor er online" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-5xl font-bold mb-4">
          Professor Autoglass
        </h1>
        <p className="text-lg md:text-xl text-blue-100 mb-2">
          Verdens smarteste bilglass-ekspert
        </p>
        <p className="text-base text-blue-200 mb-8 max-w-2xl mx-auto">
          Fortell meg hva du trenger — regnr, merke/modell, eller eurocode — så finner jeg riktig glass på sekunder.
        </p>

        {/* Main CTA */}
        <button
          onClick={() => openChat()}
          className="group inline-flex items-center gap-3 bg-white text-autoglass-blue px-8 py-4 rounded-2xl text-lg font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
        >
          <Sparkles className="h-5 w-5" />
          Start samtale med Professor
          <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* Quick prompts */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => openChat({ message: prompt })}
              className="bg-white/10 backdrop-blur-sm border border-white/20 text-white px-4 py-2 rounded-full text-sm hover:bg-white/20 transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="mt-12 grid grid-cols-3 gap-8 max-w-lg mx-auto">
          <div>
            <div className="text-2xl md:text-3xl font-bold">30+</div>
            <div className="text-sm text-blue-200">Års erfaring</div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold">37k+</div>
            <div className="text-sm text-blue-200">Produkter</div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold">24/7</div>
            <div className="text-sm text-blue-200">Tilgjengelig</div>
          </div>
        </div>
      </div>
    </section>
  );
}
