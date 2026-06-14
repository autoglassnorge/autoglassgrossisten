import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeVinResponse, searchByVin, SearchError } from '../glass';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

describe('normalizeVinResponse', () => {
  it('maps resolved VIN with eurocode', () => {
    const result = normalizeVinResponse({
      status: 'resolved',
      vehicle: { make: 'Volvo', model: 'V70', year: 2015, vin: 'YV1MS7659M2436185', kType: 12345, bodyClass: 'Station Wagon' },
      match: { eurocode: 'M0080AGNCMV', confidence: 0.95, source: 'glass_rules' },
    });
    expect(result.status).toBe('resolved');
    expect(result.match?.eurocode).toBe('M0080AGNCMV');
    expect(result.vehicle?.kType).toBe(12345);
    expect(result.vehicle?.bodyClass).toBe('Station Wagon');
  });

  it('maps pending VIN with message', () => {
    const result = normalizeVinResponse({
      status: 'pending',
      requestId: 42,
      message: 'Enrichment queued',
      vehicle: { make: 'Audi', model: 'A4', year: 2020, vin: 'WAUZZZ8V1LA123456' },
    });
    expect(result.status).toBe('pending');
    expect(result.requestId).toBe(42);
    expect(result.message).toBe('Enrichment queued');
  });

  it('maps unknown VIN to needs_review without match', () => {
    const result = normalizeVinResponse({
      status: 'needs_review',
      reasons: ['No rule match'],
      vehicle: { vin: 'WVWZZZ3CZLE123456' },
    });
    expect(result.status).toBe('needs_review');
    expect(result.match).toBeUndefined();
    expect(result.reasons).toEqual(['No rule match']);
  });

  it('coerces unknown status to failed', () => {
    const result = normalizeVinResponse({ status: 'weird' });
    expect(result.status).toBe('failed');
  });

  it('handles missing vehicle and match', () => {
    const result = normalizeVinResponse({ status: 'failed' });
    expect(result.vehicle).toBeUndefined();
    expect(result.match).toBeUndefined();
  });
});

describe('searchByVin', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns normalized result on success', async () => {
    const payload = {
      status: 'resolved',
      vehicle: { make: 'Volvo', model: 'V70', year: 2015, vin: 'YV1MS7659M2436185' },
      match: { eurocode: 'M0080AGNCMV', confidence: 0.95, source: 'glass_rules' },
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    } as Response);

    const result = await searchByVin('YV1MS7659M2436185');

    expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/api/glass?vin=YV1MS7659M2436185`);
    expect(result.status).toBe('resolved');
    expect(result.match?.eurocode).toBe('M0080AGNCMV');
  });

  it('throws SearchError on HTTP error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'VIN not found', code: 'vin_not_found' }),
    } as Response);

    await expect(searchByVin('YV1MS7659M2436185')).rejects.toThrow(SearchError);
    await expect(searchByVin('YV1MS7659M2436185')).rejects.toMatchObject({
      message: 'VIN not found',
      status: 404,
      code: 'vin_not_found',
    });
  });

  it('throws SearchError when fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Network error'));

    await expect(searchByVin('YV1MS7659M2436185')).rejects.toThrow('Network error');
  });
});
