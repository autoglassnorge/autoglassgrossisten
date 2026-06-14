import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VinResults } from '../results/VinResults';
import type { VinLookupResult } from '@/types/api';

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
}));

vi.mock('@/i18n/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/stores/chatStore', () => ({
  useChatStore: () => ({ openChat: vi.fn() }),
}));

import { useQuery } from '@tanstack/react-query';
const mockedUseQuery = vi.mocked(useQuery);

const renderWithRouter = (ui: JSX.Element) => render(<MemoryRouter>{ui}</MemoryRouter>);

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

  it('shows loading skeleton while loading', () => {
    mockedUseQuery.mockReturnValue({ isLoading: true, data: undefined, error: null } as any);
    const { container } = renderWithRouter(<VinResults {...defaultProps} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('vin.status.needs_review')).not.toBeInTheDocument();
  });

  it('shows choices for unknown VIN (needs_review)', () => {
    const data: VinLookupResult = {
      status: 'needs_review',
      vehicle: { make: 'Volvo', model: 'V70', year: 2015, vin: 'YV1MS7659M2436185' },
    };
    mockedUseQuery.mockReturnValue({ isLoading: false, data, error: null } as any);
    renderWithRouter(<VinResults {...defaultProps} />);

    expect(screen.getByText('vin.status.needs_review')).toBeInTheDocument();
    expect(screen.getByText('vin.action.chat')).toBeInTheDocument();
    expect(screen.getByText('vin.action.quote')).toBeInTheDocument();
    expect(screen.getByText('vin.action.regnr')).toBeInTheDocument();
    expect(screen.getByText('vin.action.catalog')).toBeInTheDocument();
    expect(screen.queryByTestId('identifier-results')).not.toBeInTheDocument();
  });

  it('shows choices for pending VIN', () => {
    const data: VinLookupResult = {
      status: 'pending',
      requestId: 42,
      vehicle: { make: 'Audi', model: 'A4', year: 2020, vin: 'WAUZZZ8V1LA123456' },
    };
    mockedUseQuery.mockReturnValue({ isLoading: false, data, error: null } as any);
    renderWithRouter(<VinResults {...defaultProps} activeQuery="WAUZZZ8V1LA123456" />);

    expect(screen.getByText('vin.status.pending')).toBeInTheDocument();
    expect(screen.queryByTestId('identifier-results')).not.toBeInTheDocument();
  });

  it('does not show product answers when resolved without eurocode', () => {
    const data: VinLookupResult = {
      status: 'resolved',
      vehicle: { make: 'BMW', model: 'X5', year: 2018, vin: '5UXKR0C59J0X12345' },
      match: { ktype: 99999, confidence: 0.95, source: 'glass_rules' },
    };
    mockedUseQuery.mockReturnValue({ isLoading: false, data, error: null } as any);
    renderWithRouter(<VinResults {...defaultProps} activeQuery="5UXKR0C59J0X12345" />);

    expect(screen.getByText('vin.status.resolved')).toBeInTheDocument();
    expect(screen.queryByTestId('identifier-results')).not.toBeInTheDocument();
  });

  it('shows product results for resolved VIN with eurocode', () => {
    const data: VinLookupResult = {
      status: 'resolved',
      vehicle: { make: 'Volvo', model: 'V70', year: 2015, vin: 'YV1MS7659M2436185' },
      match: { eurocode: 'M0080AGNCMV', confidence: 0.95, source: 'glass_rules' },
    };
    mockedUseQuery.mockReturnValue({ isLoading: false, data, error: null } as any);
    renderWithRouter(<VinResults {...defaultProps} />);

    expect(screen.getByText('vin.status.resolved')).toBeInTheDocument();
    expect(screen.getByText('M0080AGNCMV')).toBeInTheDocument();
  });

  it('calls onClear when regnr-search choice is clicked', () => {
    const data: VinLookupResult = {
      status: 'failed',
      vehicle: { make: '', model: '', year: 0, vin: 'YV1MS7659M2436185' },
    };
    mockedUseQuery.mockReturnValue({ isLoading: false, data, error: null } as any);
    renderWithRouter(<VinResults {...defaultProps} />);

    fireEvent.click(screen.getByText('vin.action.regnr'));
    expect(defaultProps.onClear).toHaveBeenCalled();
  });

  it('renders catalog link', () => {
    const data: VinLookupResult = {
      status: 'failed',
      vehicle: { vin: 'YV1MS7659M2436185' },
    };
    mockedUseQuery.mockReturnValue({ isLoading: false, data, error: null } as any);
    renderWithRouter(<VinResults {...defaultProps} />);

    const link = screen.getByRole('link', { name: 'vin.action.catalog' });
    expect(link).toHaveAttribute('href', '/bla');
  });
});
