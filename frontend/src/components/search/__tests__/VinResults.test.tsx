import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VinResults } from '../results/VinResults';
import { maskVin } from '@/utils/formatters';
import type { VinLookupResult, VinLookupVehicle } from '@/types/api';

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
}));

const openChat = vi.fn();

vi.mock('@/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'vin.title': 'VIN-søk',
        'vin.subtitle': 'Slå opp bilen via VIN',
        'vin.status.resolved': 'Kjøretøy funnet',
        'vin.status.pending': 'Vi undersøker VIN-et',
        'vin.status.needs_review': 'VIN-et krever manuell sjekk',
        'vin.status.failed': 'Vi fant ikke dette VIN-et',
        'vin.unknown.title': 'VIN-et er ikke i katalogen ennå',
        'vin.unknown.description': 'Vi kan ikke vise produktsvar for dette nummeret.',
        'vin.action.quote': 'Be om pristilbud',
        'vin.action.chat': 'Spør Professor Autoglass',
        'vin.action.regnr': 'Søk med reg.nr',
        'vin.action.catalog': 'Bla i katalogen',
        'vin.action.showProduct': 'Vis passende glass',
        'vin.action.reset': 'Søk på nytt',
        'vin.masked': 'VIN: {vin}',
        'vin.chat.initial': 'VIN: {vin}',
        'vin.chat.quoteRequest': 'Be om pristilbud for VIN {vin}',
        'vin.loading.label': 'Laster VIN-søk',
      }[key] ?? key),
  }),
}));

vi.mock('@/stores/chatStore', () => ({
  useChatStore: () => ({ openChat }),
}));

import { useQuery } from '@tanstack/react-query';
const mockedUseQuery = vi.mocked(useQuery);

const renderWithRouter = (ui: JSX.Element) => render(<MemoryRouter>{ui}</MemoryRouter>);

const mockVehicle = (overrides: Partial<VinLookupVehicle> = {}): VinLookupVehicle => ({
  make: 'Volvo',
  model: 'V70',
  year: 2015,
  vin: 'YV1MS7659M2436185',
  ...overrides,
});

describe('VinResults', () => {
  const defaultProps = {
    activeQuery: 'YV1MS7659M2436185',
    onClear: vi.fn(),
    onDetail: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseQuery.mockReturnValue({ isLoading: false, data: undefined, error: null } as any);
  });

  it('disables the query when input is not 17 characters', () => {
    renderWithRouter(<VinResults {...defaultProps} activeQuery="SHORT" />);
    expect(mockedUseQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('shows loading skeleton while the query is loading', () => {
    mockedUseQuery.mockReturnValue({ isLoading: true, data: undefined, error: null } as any);
    const { container } = renderWithRouter(<VinResults {...defaultProps} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('VIN-et krever manuell sjekk')).not.toBeInTheDocument();
  });

  it('shows choices for unknown VIN (needs_review)', () => {
    const data: VinLookupResult = {
      status: 'needs_review',
      vehicle: mockVehicle(),
    };
    mockedUseQuery.mockReturnValue({ isLoading: false, data, error: null } as any);
    renderWithRouter(<VinResults {...defaultProps} />);

    expect(screen.getByText('VIN-et krever manuell sjekk')).toBeInTheDocument();
    expect(screen.getByText('Spør Professor Autoglass')).toBeInTheDocument();
    expect(screen.getByText('Be om pristilbud')).toBeInTheDocument();
    expect(screen.getByText('Søk med reg.nr')).toBeInTheDocument();
    expect(screen.getByText('Bla i katalogen')).toBeInTheDocument();
  });

  it('shows choices for pending VIN', () => {
    const data: VinLookupResult = {
      status: 'pending',
      requestId: 42,
      vehicle: mockVehicle({ make: 'Audi', model: 'A4', year: 2020, vin: 'WAUZZZ8V1LA123456' }),
    };
    mockedUseQuery.mockReturnValue({ isLoading: false, data, error: null } as any);
    renderWithRouter(<VinResults {...defaultProps} activeQuery="WAUZZZ8V1LA123456" />);

    expect(screen.getByText('Vi undersøker VIN-et')).toBeInTheDocument();
  });

  it('shows choices on query error', () => {
    mockedUseQuery.mockReturnValue({ isLoading: false, data: undefined, error: new Error('network down') } as any);
    renderWithRouter(<VinResults {...defaultProps} />);

    expect(screen.getByText('VIN-et er ikke i katalogen ennå')).toBeInTheDocument();
    expect(screen.getByText('Vi kan ikke vise produktsvar for dette nummeret.')).toBeInTheDocument();
  });

  it('does not show product answers when resolved without eurocode', () => {
    const data: VinLookupResult = {
      status: 'resolved',
      vehicle: mockVehicle({ make: 'BMW', model: 'X5', year: 2018, vin: '5UXKR0C59J0X12345' }),
      match: { ktype: 99999, confidence: 0.95, source: 'glass_rules' },
    };
    mockedUseQuery.mockReturnValue({ isLoading: false, data, error: null } as any);
    renderWithRouter(<VinResults {...defaultProps} activeQuery="5UXKR0C59J0X12345" />);

    expect(screen.getByText('Kjøretøy funnet')).toBeInTheDocument();
    expect(screen.queryByText('M0080AGNCMV')).not.toBeInTheDocument();
  });

  it('shows resolved vehicle and eurocode when VIN is resolved with eurocode', () => {
    const data: VinLookupResult = {
      status: 'resolved',
      vehicle: mockVehicle(),
      match: { eurocode: 'M0080AGNCMV', confidence: 0.95, source: 'glass_rules' },
    };
    mockedUseQuery.mockReturnValue({ isLoading: false, data, error: null } as any);
    renderWithRouter(<VinResults {...defaultProps} />);

    expect(screen.getByText('Kjøretøy funnet')).toBeInTheDocument();
    expect(screen.getByText('Volvo V70 2015')).toBeInTheDocument();
    expect(screen.getByText('M0080AGNCMV')).toBeInTheDocument();
    expect(screen.getByText(`VIN: ${maskVin(mockVehicle().vin)}`)).toBeInTheDocument();
  });

  it('calls onClear when regnr-search choice is clicked', () => {
    const data: VinLookupResult = {
      status: 'failed',
      vehicle: mockVehicle(),
    };
    mockedUseQuery.mockReturnValue({ isLoading: false, data, error: null } as any);
    renderWithRouter(<VinResults {...defaultProps} />);

    fireEvent.click(screen.getByText('Søk med reg.nr'));
    expect(defaultProps.onClear).toHaveBeenCalled();
  });

  it('calls onClear when reset button is clicked', () => {
    const data: VinLookupResult = {
      status: 'failed',
      vehicle: mockVehicle(),
    };
    mockedUseQuery.mockReturnValue({ isLoading: false, data, error: null } as any);
    renderWithRouter(<VinResults {...defaultProps} />);

    fireEvent.click(screen.getByText('Søk på nytt'));
    expect(defaultProps.onClear).toHaveBeenCalled();
  });

  it('opens chat with VIN when chat button is clicked', () => {
    const data: VinLookupResult = {
      status: 'failed',
      vehicle: mockVehicle(),
    };
    mockedUseQuery.mockReturnValue({ isLoading: false, data, error: null } as any);
    renderWithRouter(<VinResults {...defaultProps} />);

    fireEvent.click(screen.getByText('Spør Professor Autoglass'));
    expect(openChat).toHaveBeenCalledWith({ message: 'VIN: YV1MS7659M2436185' });
  });

  it('opens chat with quote request when quote button is clicked', () => {
    const data: VinLookupResult = {
      status: 'failed',
      vehicle: mockVehicle(),
    };
    mockedUseQuery.mockReturnValue({ isLoading: false, data, error: null } as any);
    renderWithRouter(<VinResults {...defaultProps} />);

    fireEvent.click(screen.getByText('Be om pristilbud'));
    expect(openChat).toHaveBeenCalledWith({ message: 'Be om pristilbud for VIN YV1MS7659M2436185' });
  });

  it('renders catalog link', () => {
    const data: VinLookupResult = {
      status: 'failed',
      vehicle: mockVehicle(),
    };
    mockedUseQuery.mockReturnValue({ isLoading: false, data, error: null } as any);
    renderWithRouter(<VinResults {...defaultProps} />);

    const link = screen.getByRole('link', { name: 'Bla i katalogen' });
    expect(link).toHaveAttribute('href', '/bla');
  });
});
