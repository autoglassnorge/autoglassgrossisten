import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWizardState } from '../VehicleWizard/hooks/useWizardState';

describe('useWizardState', () => {
  it('initializes at regnr step with empty regnr', () => {
    const { result } = renderHook(() => useWizardState());
    expect(result.current.state.step).toBe('regnr');
    expect(result.current.state.regnr).toBe('');
    expect(result.current.state.ktype).toBeUndefined();
    expect(result.current.state.ktypeVehicle).toBeUndefined();
    expect(result.current.state.selectedBrand).toBeUndefined();
    expect(result.current.state.selectedModel).toBeUndefined();
    expect(result.current.state.selectedYear).toBeUndefined();
  });

  it('setRegnr normalizes input (uppercase, strips spaces)', () => {
    const { result } = renderHook(() => useWizardState());
    act(() => {
      result.current.setRegnr('ab 12345');
    });
    expect(result.current.state.regnr).toBe('AB12345');
  });

  it('selectBrand advances to model step and sets selectedBrand', () => {
    const { result } = renderHook(() => useWizardState());
    act(() => {
      result.current.selectBrand('Volvo');
    });
    expect(result.current.state.step).toBe('model');
    expect(result.current.state.selectedBrand).toBe('Volvo');
  });

  it('goBack from model returns to brand AND clears selectedBrand', () => {
    const { result } = renderHook(() => useWizardState());
    act(() => {
      result.current.selectBrand('Volvo');
    });
    expect(result.current.state.step).toBe('model');
    act(() => {
      result.current.goBack();
    });
    expect(result.current.state.step).toBe('brand');
    expect(result.current.state.selectedBrand).toBeUndefined();
  });

  it('reset returns to initial state', () => {
    const { result } = renderHook(() => useWizardState());
    act(() => {
      result.current.setRegnr('XY99999');
      result.current.selectBrand('BMW');
      result.current.selectModel('X5');
      result.current.selectYear('2020');
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.state.step).toBe('regnr');
    expect(result.current.state.regnr).toBe('');
    expect(result.current.state.selectedBrand).toBeUndefined();
    expect(result.current.state.selectedModel).toBeUndefined();
    expect(result.current.state.selectedYear).toBeUndefined();
    expect(result.current.state.ktype).toBeUndefined();
    expect(result.current.state.ktypeVehicle).toBeUndefined();
  });

  it('goBack from summary with ktype returns to regnr AND clears ktype + ktypeVehicle', () => {
    const { result } = renderHook(() => useWizardState());
    act(() => {
      result.current.setKtypeMatch('12345', { brand: 'Volvo', model: 'V70', year: 2015 });
    });
    expect(result.current.state.step).toBe('summary');
    expect(result.current.state.ktype).toBe('12345');
    expect(result.current.state.ktypeVehicle).toEqual({ brand: 'Volvo', model: 'V70', year: 2015 });
    act(() => {
      result.current.goBack();
    });
    expect(result.current.state.step).toBe('regnr');
    expect(result.current.state.ktype).toBeUndefined();
    expect(result.current.state.ktypeVehicle).toBeUndefined();
  });

  it('goBack from summary without ktype returns to year AND clears selectedYear', () => {
    const { result } = renderHook(() => useWizardState());
    act(() => {
      result.current.selectBrand('BMW');
      result.current.selectModel('X5');
      result.current.selectYear('2020');
    });
    expect(result.current.state.step).toBe('summary');
    act(() => {
      result.current.goBack();
    });
    expect(result.current.state.step).toBe('year');
    expect(result.current.state.selectedYear).toBeUndefined();
  });

  it('selectModel advances to year', () => {
    const { result } = renderHook(() => useWizardState());
    act(() => {
      result.current.selectBrand('BMW');
    });
    act(() => {
      result.current.selectModel('X5');
    });
    expect(result.current.state.step).toBe('year');
    expect(result.current.state.selectedModel).toBe('X5');
  });

  it('selectYear advances to summary', () => {
    const { result } = renderHook(() => useWizardState());
    act(() => {
      result.current.selectBrand('BMW');
      result.current.selectModel('X5');
      result.current.selectYear('2020');
    });
    expect(result.current.state.step).toBe('summary');
    expect(result.current.state.selectedYear).toBe('2020');
  });
});
