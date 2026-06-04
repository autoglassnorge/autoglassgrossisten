import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegnrStep } from '../VehicleWizard/steps/RegnrStep';
import type { KtypeLookupResponse } from '@/types/api';

describe('RegnrStep', () => {
  const defaultProps = {
    currentStep: 'regnr' as const,
    regnr: '',
    onRegnrChange: vi.fn(),
    onKtypeFound: vi.fn(),
    onManualSelect: vi.fn(),
    lookupKtype: vi.fn(),
    isLoading: false,
    error: null as string | null,
  };

  const renderComponent = (props = {}) => {
    return render(<RegnrStep {...defaultProps} {...props} />);
  };

  it('renders input field with placeholder "AB 12345"', () => {
    renderComponent();
    const input = screen.getByPlaceholderText('AB 12345');
    expect(input).toBeDefined();
    expect((input as HTMLInputElement).id).toBe('regnr');
  });

  it('calls onRegnrChange with uppercase value when typing', () => {
    const onRegnrChange = vi.fn();
    renderComponent({ onRegnrChange });
    const input = screen.getByPlaceholderText('AB 12345');

    fireEvent.change(input, { target: { value: 'ab 12345' } });
    expect(onRegnrChange).toHaveBeenCalledWith('AB 12345');

    fireEvent.change(input, { target: { value: 'xy99999' } });
    expect(onRegnrChange).toHaveBeenLastCalledWith('XY99999');
  });

  it('shows error message for invalid regnr format when submit clicked', () => {
    // Use ABC123 — length >= 5 so button is not disabled, but 3 letters fails regex
    renderComponent({ regnr: 'ABC123' });
    const submitButton = screen.getByRole('button', { name: /Finn bilglass/i });

    fireEvent.click(submitButton);

    expect(screen.getByText('Ugyldig registreringsnummer. Format: AB12345')).toBeDefined();
  });

  it('calls lookupKtype with regnr on valid form submit', async () => {
    const lookupKtype = vi.fn().mockResolvedValue({
      success: false,
    } as KtypeLookupResponse);
    renderComponent({ regnr: 'AB12345', lookupKtype });
    const submitButton = screen.getByRole('button', { name: /Finn bilglass/i });

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(lookupKtype).toHaveBeenCalledWith('AB12345');
    });
  });

  it('calls onKtypeFound when lookup returns success + ktype', async () => {
    const onKtypeFound = vi.fn();
    const lookupKtype = vi.fn().mockResolvedValue({
      success: true,
      ktype: 12345,
      vehicle: { brand: 'Volvo', model: 'V70', year: 2015 },
    } as KtypeLookupResponse);

    renderComponent({ regnr: 'AB12345', onKtypeFound, lookupKtype });
    const submitButton = screen.getByRole('button', { name: /Finn bilglass/i });

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onKtypeFound).toHaveBeenCalledWith('12345', {
        brand: 'Volvo',
        model: 'V70',
        year: 2015,
      });
    });
  });

  it('calls onManualSelect when lookup returns success=false (no ktype found)', async () => {
    const onManualSelect = vi.fn();
    const lookupKtype = vi.fn().mockResolvedValue({
      success: false,
    } as KtypeLookupResponse);

    renderComponent({ regnr: 'AB12345', onManualSelect, lookupKtype });
    const submitButton = screen.getByRole('button', { name: /Finn bilglass/i });

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onManualSelect).toHaveBeenCalled();
    });
  });

  it('shows loading state (button text changes to "Søker...")', () => {
    renderComponent({ isLoading: true });
    const submitButton = screen.getByRole('button', { name: /Søker\.\.\./i });
    expect(submitButton).toBeDefined();
  });

  it('submit button is disabled when isLoading=true', () => {
    renderComponent({ isLoading: true });
    const submitButton = screen.getByRole('button', { name: /Søker\.\.\./i }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
  });

  it('submit button is disabled when regnr.length < 5', () => {
    renderComponent({ regnr: 'AB12' });
    const submitButton = screen.getByRole('button', { name: /Finn bilglass/i }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
  });

  it('submit button is enabled when regnr.length >= 5 and not loading', () => {
    renderComponent({ regnr: 'AB123' });
    const submitButton = screen.getByRole('button', { name: /Finn bilglass/i }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(false);
  });

  it('"Jeg har ikke registreringsnummeret" button calls onManualSelect', () => {
    const onManualSelect = vi.fn();
    renderComponent({ onManualSelect });
    const manualButton = screen.getByRole('button', { name: /Jeg har ikke registreringsnummeret/i });

    fireEvent.click(manualButton);

    expect(onManualSelect).toHaveBeenCalled();
  });

  it('displays external error when error prop is provided', () => {
    renderComponent({ error: 'Nettverksfeil' });
    expect(screen.getByText('Nettverksfeil')).toBeDefined();
  });

  it('clears local error when user types in the input', () => {
    renderComponent({ regnr: 'ABC123' });
    const submitButton = screen.getByRole('button', { name: /Finn bilglass/i });
    const input = screen.getByPlaceholderText('AB 12345');

    fireEvent.click(submitButton);
    expect(screen.getByText('Ugyldig registreringsnummer. Format: AB12345')).toBeDefined();

    fireEvent.change(input, { target: { value: 'AB123' } });
    expect(screen.queryByText('Ugyldig registreringsnummer. Format: AB12345')).toBeNull();
  });
});
