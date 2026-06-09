import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ToolResult } from '@/api/ordremottaker';
import ToolResultsPanel from '../ToolResultsPanel';

describe('ToolResultsPanel', () => {
  it('renders match explanation, quote draft and handoff summary', () => {
    const results: ToolResult[] = [
      {
        tool: 'search',
        id: 'search-1',
        success: true,
        data: {
          matchExplanation: {
            layer: -1,
            layerName: 'ground_truth',
            confidence: 'high',
            reasons: ['Syntetisert fra eksisterende ordremottaker-søk'],
            vehicle: { make: 'VW', model: 'Transporter', year: 2019, regnr: 'SU18018' },
          },
        },
      },
      {
        tool: 'buildQuote',
        id: 'quote-1',
        success: true,
        data: {
          items: [
            {
              product: {
                id: 1,
                supplier_sku: 'SKU-001',
                article_number: null,
                eurocode: 'DW01AGNCMV',
                brand: 'VW',
                model: 'Transporter',
                category: 'frontrute',
                description: 'Frontrute',
                price: 4500,
              },
              qty: 1,
              accessories: [
                { sku: 'LIM-STD', name: 'Lim', price: 189, included: true, removable: false, category: 'required' },
              ],
            },
          ],
          subtotal: 4500,
          accessoryTotal: 189,
          total: 4689,
        },
      },
      {
        tool: 'handoff',
        id: 'handoff-1',
        success: true,
        data: {
          reason: 'customer_request',
          summary: 'Kunden ønsker ordremottaker.',
        },
      },
    ];

    render(<ToolResultsPanel results={results} />);

    expect(screen.getByText('Match')).toBeInTheDocument();
    expect(screen.getByText('VW Transporter (2019)')).toBeInTheDocument();
    expect(screen.getByText('Tilbudskladd')).toBeInTheDocument();
    expect(screen.getByText('Lim')).toBeInTheDocument();
    expect(screen.getByText('Totalt')).toBeInTheDocument();
    expect(screen.getByText('Overføring')).toBeInTheDocument();
    expect(screen.getByText('Kunden ønsker ordremottaker.')).toBeInTheDocument();
  });
});
