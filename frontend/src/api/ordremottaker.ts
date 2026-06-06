import type { Product } from '@/types/api';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export class OrdremottakerError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'OrdremottakerError';
  }
}

export interface AccessoryItem {
  sku: string;
  name: string;
  price: number;
  included: boolean;
  removable: boolean;
  notes?: string;
  category?: 'required' | 'recommended' | 'warning';
}

export interface OrdremottakerResponse {
  status: 'question' | 'recommendation' | 'order_ready' | 'escalated' | 'clarification';
  ai_response: string;
  session_token: string;
  candidates?: Product[];
  accessories?: AccessoryItem[];
  cart_url?: string;
  confidence: number;
  next_action?: string;
}

export async function sendMessage(
  message: string,
  sessionToken?: string
): Promise<OrdremottakerResponse> {
  const res = await fetch(`${API_BASE}/api/ordremottaker`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      session_token: sessionToken,
      channel: 'chat',
      language: 'no',
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new OrdremottakerError(body.error || `Feil (${res.status})`, res.status);
  }

  return res.json();
}
