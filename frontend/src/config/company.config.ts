/**
 * Company config — single source of truth for all contact details.
 * Update this file to change phone, email, address, or opening hours
 * across the entire site.
 */

export const COMPANY = {
  NAME: 'Autoglass AS',
  PHONE: '+47 21 37 83 90',
  PHONE_RAW: '+4721378390',
  EMAIL: 'post@auto-glass.no',
  ADDRESS: {
    STREET: 'Industriveien 1',
    CITY: 'Oslo',
    ZIP: '0661',
    COUNTRY: 'Norge',
    FULL: 'Industriveien 1, 0661 Oslo',
  },
  OPENING_HOURS: {
    WEEKDAYS: 'Man–Fre: 07:00 – 16:00',
    WEEKEND: 'Lør–Søn: Stengt',
    SHORT_VALUE: '07–16',
    LABEL: 'Man–fre',
  },
  ORG_NUMBER:
    import.meta.env.VITE_COMPANY_ORG_NUMBER ?? '123 456 789 MVA',
  MAP_EMBED_URL:
    import.meta.env.VITE_COMPANY_MAP_EMBED_URL ??
    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2000!2d10.8!3d59.9!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNTnCsDU0JzAwLjAiTiAxMMKwNDgnMDAuMCJF!5e0!3m2!1sno!2sno!4v1',
  FOUNDED_YEAR: 1991,
  get YEARS_EXPERIENCE(): number {
    return new Date().getFullYear() - this.FOUNDED_YEAR;
  },
} as const;
