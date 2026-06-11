/**
 * HowItWorksSection — "Slik handler du hos Autoglass"
 * Shows 4-step B2B workflow for ALL visitors.
 * Replaces the mock PersonalDashboard that never rendered.
 */

import { useRef } from 'react';
import { Search, GlassWater, Tag, Package, ArrowRight } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { Link } from 'react-router-dom';

const STEPS = [
  {
    num: '01',
    icon: Search,
    title: 'Søk med registreringsnummer',
    description: 'Skriv inn bilens regnr og få eksakt match med eurocode, egenskaper og lagerstatus.',
    link: '/sok',
    linkText: 'Gå til søk',
  },
  {
    num: '02',
    icon: GlassWater,
    title: 'Velg riktig glass',
    description: 'Vi viser alle tilgjengelige varianter — OEM, OEE, med/uten ADAS, oppvarmet, regnsensor.',
    link: '/bilglassguide',
    linkText: 'Les om varianter',
  },
  {
    num: '03',
    icon: Tag,
    title: 'Se din B2B-pris',
    description: 'Logg inn for å se rabattert pris basert på din avtale. Første gangs kjøp? Kontakt oss for pristilbud.',
    link: '/kontakt',
    linkText: 'Be om tilbud',
  },
  {
    num: '04',
    icon: Package,
    title: 'Bestill med neste-dag-levering',
    description: 'Legg i handlekurv, bekreft ordre, og få levert direkte til verkstedet innen 24 timer.',
    link: '/sok',
    linkText: 'Start bestilling',
  },
];

export function HowItWorksSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isVisible = useScrollReveal(sectionRef);

  return (
    <section
      ref={sectionRef}
      className={`bg-carbon-50 py-16 sm:py-20 border-y border-carbon-200 transition-all duration-500 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-carbon-900 tracking-tight">
            Slik handler du hos Autoglass
          </h2>
          <p className="mt-3 text-base text-carbon-500 max-w-2xl mx-auto">
            Rask og enkel bestilling for verksteder. Fra søk til levering på under 24 timer.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((step) => (
            <div
              key={step.num}
              className="group relative rounded-xl border border-carbon-200 bg-white p-6 hover:border-glass-cyan/40 hover:shadow-lg transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-glass-cyan/10 group-hover:bg-glass-cyan/20 transition-colors">
                  <step.icon className="h-6 w-6 text-glass-cyan" />
                </div>
                <span className="text-3xl font-bold text-carbon-100 group-hover:text-glass-cyan/20 transition-colors">
                  {step.num}
                </span>
              </div>

              <h3 className="text-base font-semibold text-carbon-900 mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-carbon-500 leading-relaxed mb-4">
                {step.description}
              </p>

              <Link
                to={step.link}
                className="inline-flex items-center gap-1 text-sm font-medium text-autoglass-blue hover:underline"
              >
                {step.linkText}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
