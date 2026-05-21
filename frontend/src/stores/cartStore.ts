import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],

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
          return { items: next };
        });
      },

      removeItem: (eurocode) => {
        set((state) => ({
          items: state.items.filter((i) => i.product.eurocode !== eurocode),
        }));
      },

      updateQuantity: (eurocode, quantity) => {
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => i.product.eurocode !== eurocode)
              : state.items.map((i) =>
                  i.product.eurocode === eurocode ? { ...i, quantity } : i
                ),
        }));
      },

      clear: () => set({ items: [] }),
    }),
    {
      name: 'autoglass-cart',
    }
  )
);
