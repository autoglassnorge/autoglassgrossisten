import { create } from 'zustand';
import type { Product } from '@/types/api';

interface CartItem {
  product: Product;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  addItem: (product: Product) => void;
  removeItem: (eurocode: string) => void;
  updateQuantity: (eurocode: string, quantity: number) => void;
  clear: () => void;
  totalItems: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: JSON.parse(localStorage.getItem('cart') ?? '[]'),

  addItem: (product) => {
    set((state) => {
      const existing = state.items.find((i) => i.product.eurocode === product.eurocode);
      const next = existing
        ? state.items.map((i) =>
            i.product.eurocode === product.eurocode
              ? { ...i, quantity: i.quantity + 1 }
              : i
          )
        : [...state.items, { product, quantity: 1 }];
      localStorage.setItem('cart', JSON.stringify(next));
      return { items: next };
    });
  },

  removeItem: (eurocode) => {
    set((state) => {
      const next = state.items.filter((i) => i.product.eurocode !== eurocode);
      localStorage.setItem('cart', JSON.stringify(next));
      return { items: next };
    });
  },

  updateQuantity: (eurocode, quantity) => {
    set((state) => {
      const next = quantity <= 0
        ? state.items.filter((i) => i.product.eurocode !== eurocode)
        : state.items.map((i) =>
            i.product.eurocode === eurocode ? { ...i, quantity } : i
          );
      localStorage.setItem('cart', JSON.stringify(next));
      return { items: next };
    });
  },

  clear: () => {
    localStorage.removeItem('cart');
    set({ items: [] });
  },

  totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
}));
