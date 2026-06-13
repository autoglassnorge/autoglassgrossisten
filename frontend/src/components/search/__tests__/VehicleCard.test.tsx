import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VehicleCard } from '../VehicleCard';
import type { VehicleInfo, EquipmentFlags } from '@/types/api';

const mockVehicle: VehicleInfo = {
  make: 'Volvo',
  model: 'V70',
  year: 2015,
  vin: 'YV1MS7659M2436185',
  k_type: 12345,
  regno: 'AB12345',
  submodel: 'D4 Momentum',
  color: 'Rød',
  fuelType: 'Diesel',
  registrationStatus: 'Registrert',
  vehicleClass: 'Personbil',
  seatCount: 5,
  euroClass: 'Euro 6',
};

const mockEquipment: EquipmentFlags = {
  adas: true,
  rainSensor: true,
  heated: true,
  acoustic: false,
  antenna: false,
  hud: false,
  camera: false,
  laneAssist: false,
};

describe('VehicleCard', () => {
  it('renders make, model, year, regnr and masked VIN', () => {
    render(<VehicleCard vehicle={mockVehicle} regnr="AB12345" />);

    expect(screen.getByText('Volvo V70 2015')).toBeInTheDocument();
    expect(screen.getByText('AB12345')).toBeInTheDocument();
    expect(screen.getByText(/YV1•••••••••••185/i)).toBeInTheDocument();
  });

  it('renders equipment badges for active equipment', () => {
    render(<VehicleCard vehicle={mockVehicle} equipment={mockEquipment} />);

    expect(screen.getAllByText('ADAS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Regnsensor').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Oppvarmet').length).toBeGreaterThan(0);
  });

  it('shows extended vehicle details and toggles equipment section', () => {
    render(<VehicleCard vehicle={mockVehicle} equipment={mockEquipment} />);

    expect(screen.getByText('Personbil')).toBeInTheDocument();
    expect(screen.getByText('Registrert')).toBeInTheDocument();
    expect(screen.getByText('Rød')).toBeInTheDocument();
    expect(screen.getByText('Diesel')).toBeInTheDocument();
    expect(screen.getByText('5 seter')).toBeInTheDocument();

    const toggleButton = screen.getByRole('button', { name: /Vis utstyr/i });
    expect(toggleButton).toBeInTheDocument();

    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-label', 'Skjul utstyr');

    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-label', 'Vis utstyr');
  });
});
