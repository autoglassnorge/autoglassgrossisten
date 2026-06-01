import { Quote, Star } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';

interface Testimonial {
  quote: string;
  author: string;
  company: string;
  location: string;
}

export function TestimonialsSection() {
  const { t } = useI18n();

  const testimonials: Testimonial[] = [
    {
      quote: t('testimonials.1.quote'),
      author: t('testimonials.1.author'),
      company: t('testimonials.1.company'),
      location: t('testimonials.1.location'),
    },
    {
      quote: t('testimonials.2.quote'),
      author: t('testimonials.2.author'),
      company: t('testimonials.2.company'),
      location: t('testimonials.2.location'),
    },
    {
      quote: t('testimonials.3.quote'),
      author: t('testimonials.3.author'),
      company: t('testimonials.3.company'),
      location: t('testimonials.3.location'),
    },
  ];

  return (
    <section className="relative bg-carbon-950 py-20 sm:py-28 overflow-hidden">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-carbon-900/20 via-transparent to-carbon-900/20 pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Star className="h-3.5 w-3.5 text-glass-cyan" />
            <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-glass-cyan">
              {t('testimonials.eyebrow')}
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
            {t('testimonials.title')}
          </h2>
          <p className="mt-4 text-base sm:text-lg text-carbon-400 max-w-2xl mx-auto">
            {t('testimonials.subtitle')}
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="group relative border border-carbon-800 bg-carbon-900 rounded-xl p-6 sm:p-8 
                         hover:border-glass-cyan/30 hover:bg-carbon-850 transition-all duration-300
                         hover:-translate-y-1"
              style={{
                animationDelay: `${index * 100}ms`,
              }}
            >
              {/* Quote icon */}
              <div className="absolute top-6 right-6 opacity-10 group-hover:opacity-20 transition-opacity">
                <Quote className="h-10 w-10 text-glass-cyan" />
              </div>

              {/* Stars */}
              <div className="flex items-center gap-1 mb-5">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className="h-4 w-4 text-glass-cyan fill-glass-cyan/20"
                  />
                ))}
              </div>

              {/* Quote text */}
              <blockquote className="text-sm sm:text-base text-carbon-200 leading-relaxed mb-6 min-h-[80px]">
                "{testimonial.quote}"
              </blockquote>

              {/* Author info */}
              <div className="pt-5 border-t border-carbon-800">
                <div className="font-medium text-white text-sm">
                  {testimonial.company}
                </div>
                <div className="mt-1 text-xs text-carbon-500 font-mono uppercase tracking-wider">
                  {testimonial.location}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
