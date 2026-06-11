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
  },
  ORG_NUMBER: '123 456 789 MVA',
  FOUNDED_YEAR: 1991,
  get YEARS_EXPERIENCE(): number {
    return new Date().getFullYear() - this.FOUNDED_YEAR;
  },
} as const;
