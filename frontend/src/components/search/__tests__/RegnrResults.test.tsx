import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RegnrResults } from '../results/RegnrResults';
import type { SearchResult, Product, VehicleInfo } from '@/types/api';

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
}));

import { useQuery } from '@tanstack/react-query';

const mockedUseQuery = vi.mocked(useQuery);

const mockVehicle: VehicleInfo = {
  make: 'Volvo',
  model: 'V70',
  year: 2015,
  vin: 'YV1MS7659M2436185',
  k_type: 12345,
  regno: 'AB12345',
  nextEUDate: '2026-12-31',
  color: 'Svart',
  fuelType: 'Diesel',
  registrationStatus: 'Registrert',
  vehicleClass: 'Personbil',
  seatCount: 5,
};

const mockProduct = (id: number, overrides: Partial<Product> = {}): Product => ({
  id,
  eurocode: `EURO-${id}`,
  brand: 'Volvo',
  model: 'V70',
  title: `Frontrute Volvo V70 ${id}`,
  description: '',
  category: 'frontrute',
  yearFrom: 2008,
  yearTo: 2016,
  articleNumber: `ART-${id}`,
  price: 4500 + id,
  stockStatus: 5,
  imageUrl: '',
  typeCode: 'F',
  typeCodeDesc: 'Frontrute',
  position: null,
  properties: {
    heated: false,
    rainSensor: false,
    adas: false,
    hud: false,
    acoustic: false,
    antenna: false,
    color: null,
    solar: false,
    tinted: false,
    camera: false,
    green: false,
    blue: false,
    coated: false,
    encapsulated: false,
    laminated: false,
    darkGreen: false,
    laneAssist: false,
    hasList: false,
    listRequired: false,
    listIncluded: false,
    listType: null,
    hasKlips: false,
    klipsRequired: false,
    klipsType: null,
  },
  sourceUrl: '',
  ...overrides,
});

const renderWithRouter = (ui: JSX.Element) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('RegnrResults', () => {
  const defaultProps = {
    activeQuery: 'AB12345',
    onClear: vi.fn(),
    onDetail: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseQuery.mockReturnValue({ isLoading: false, data: undefined } as any);
  });

  it('renders loading skeleton while the query is loading', () => {
    mockedUseQuery.mockReturnValue({ isLoading: true, data: undefined } as any);
    const { container } = renderWithRouter(<RegnrResults {...defaultProps} />);

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Ingen kjøretøy funnet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Volvo V70 2015/i)).not.toBeInTheDocument();
  });

  it('renders vehicle information and product candidates when data is available', () => {
    const result: SearchResult = {
      vehicle: mockVehicle,
      candidates: [mockProduct(1)],
      confidence: 'exact',
      layer: 1,
      regnr: 'AB12345',
    };
    mockedUseQuery.mockReturnValue({ isLoading: false, data: result } as any);

    renderWithRouter(<RegnrResults {...defaultProps} />);

    expect(screen.getByRole('heading', { name: 'Volvo V70 2015' })).toBeInTheDocument();
    expect(screen.getAllByText('AB12345').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1 resultat')).toBeInTheDocument();
    expect(screen.getByText('Frontrute Volvo V70 1')).toBeInTheDocument();
  });

  it('shows "Ingen kjøretøy funnet" when no vehicle is returned', () => {
    mockedUseQuery.mockReturnValue({ isLoading: false, data: undefined } as any);

    renderWithRouter(<RegnrResults {...defaultProps} />);

    expect(screen.getByText('Ingen kjøretøy funnet')).toBeInTheDocument();
    expect(screen.getByText(/Kunne ikke finne kjøretøy for AB12345/i)).toBeInTheDocument();
  });

  it('shows "Ingen glass funnet" when a vehicle exists but has no candidates', () => {
    const result: SearchResult = {
      vehicle: mockVehicle,
      candidates: [],
      confidence: 'high',
      layer: 1,
      regnr: 'AB12345',
    };
    mockedUseQuery.mockReturnValue({ isLoading: false, data: result } as any);

    renderWithRouter(<RegnrResults {...defaultProps} />);

    expect(screen.getByText('Ingen glass funnet')).toBeInTheDocument();
    expect(
      screen.getByText(/Vi fant kjøretøyet, men har ingen registrerte glass som passer/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bla i katalogen/i })).toBeInTheDocument();
  });
});
