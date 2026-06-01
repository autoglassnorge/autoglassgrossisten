import { renderHook, act } from '@testing-library/react';
import { useWizardState } from '../VehicleWizard/hooks/useWizardState';

describe('useWizardState', () => {
  it('should initialize with regnr step', () => {
    const { result } = renderHook(() => useWizardState());
    expect(result.current.state.step).toBe('regnr');
    expect(result.current.state.regnr).toBe('');
  });

  it('should update regnr and advance to brand step', () => {
    const { result } = renderHook(() => useWizardState());
    
    act(() => {
      result.current.setRegnr('AB12345');
    });
    
    expect(result.current.state.regnr).toBe('AB12345');
    
    act(() => {
      result.current.goToStep('brand');
    });
    
    expect(result.current.state.step).toBe('brand');
  });

  it('should select brand and advance to model step', () => {
    const { result } = renderHook(() => useWizardState());
    
    act(() => {
      result.current.setRegnr('AB12345');
      result.current.goToStep('brand');
      result.current.selectBrand('Volvo');
    });
    
    expect(result.current.state.selectedBrand).toBe('Volvo');
    expect(result.current.state.step).toBe('model');
  });

  it('should allow going back to previous step', () => {
    const { result } = renderHook(() => useWizardState());
    
    act(() => {
      result.current.setRegnr('AB12345');
      result.current.goToStep('brand');
      result.current.selectBrand('Volvo');
    });
    
    expect(result.current.state.step).toBe('model');
    
    act(() => {
      result.current.goBack();
    });
    
    expect(result.current.state.step).toBe('brand');
    expect(result.current.state.selectedBrand).toBeUndefined();
  });

  it('should reset to initial state', () => {
    const { result } = renderHook(() => useWizardState());
    
    act(() => {
      result.current.setRegnr('AB12345');
      result.current.goToStep('brand');
      result.current.selectBrand('Volvo');
      result.current.reset();
    });
    
    expect(result.current.state.step).toBe('regnr');
    expect(result.current.state.regnr).toBe('');
    expect(result.current.state.selectedBrand).toBeUndefined();
  });
});
