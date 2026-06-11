/**
 * UNI Micro API — Prepared for future integration.
 * Currently returns mock data. Replace with real API calls when endpoint is ready.
 */

export interface UniMicroCustomer {
  id: string;
  name: string;
  orgNumber: string;
  email: string;
  phone: string;
  discountPercent: number;
  creditLimit: number;
}

export interface UniMicroOrderLine {
  productId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface UniMicroOrder {
  id: string;
  orderNumber: string;
  status: 'draft' | 'confirmed' | 'shipped' | 'invoiced' | 'cancelled';
  createdAt: string;
  lines: UniMicroOrderLine[];
  total: number;
  totalWithVat: number;
}

export interface UniMicroInvoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  dueDate: string;
  total: number;
  totalWithVat: number;
}

// TODO: Replace with real UNI Micro API endpoints when available
const MOCK_CUSTOMER: UniMicroCustomer = {
  id: 'cust-001',
  name: 'Demo Verksted AS',
  orgNumber: '999 888 777 MVA',
  email: 'demo@verksted.no',
  phone: '+47 90 12 34 56',
  discountPercent: 12,
  creditLimit: 100_000,
};

const MOCK_ORDERS: UniMicroOrder[] = [
  {
    id: 'ord-001',
    orderNumber: 'AG-2026-001',
    status: 'shipped',
    createdAt: '2026-06-05T10:00:00Z',
    lines: [
      { productId: '4525AGNMV', description: 'Frontrute VW Transporter T6', quantity: 1, unitPrice: 3450, discount: 12, total: 3036 },
      { productId: 'LIM-KIT-01', description: 'Limpakke standard', quantity: 2, unitPrice: 280, discount: 12, total: 493 },
    ],
    total: 3529,
    totalWithVat: 4411,
  },
  {
    id: 'ord-002',
    orderNumber: 'AG-2026-002',
    status: 'confirmed',
    createdAt: '2026-06-10T14:30:00Z',
    lines: [
      { productId: '3892BGNMV', description: 'Bakrute BMW X5', quantity: 1, unitPrice: 2100, discount: 12, total: 1848 },
    ],
    total: 1848,
    totalWithVat: 2310,
  },
];

export async function getCustomer(): Promise<UniMicroCustomer | null> {
  // TODO: Replace with: return fetch('/api/unimicro/customer').then(r => r.json())
  return Promise.resolve(MOCK_CUSTOMER);
}

export async function getOrders(): Promise<UniMicroOrder[]> {
  // TODO: Replace with: return fetch('/api/unimicro/orders').then(r => r.json())
  return Promise.resolve(MOCK_ORDERS);
}

export async function getInvoices(): Promise<UniMicroInvoice[]> {
  // TODO: Replace with: return fetch('/api/unimicro/invoices').then(r => r.json())
  return Promise.resolve([]);
}
