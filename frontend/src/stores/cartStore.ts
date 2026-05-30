import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product } from '@/types/api';

interface CartItem {
  product: Product;
  quantity: number;
}

interface CartWarning {
  id: number;
  message: string;
  type: 'list' | 'klips';
}

interface CartState {
  items: CartItem[];
  warnings: CartWarning[];
  addItem: (product: Product) => void;
  removeItem: (id: number) => void;
  updateQuantity: (id: number, quantity: number) => void;
  clear: () => void;
  dismissWarning: (id: number) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      warnings: [],

      addItem: (product) => {
        set((state) => {
          const existing = state.items.find((i) => i.product.id === product.id);
          const next = existing
            ? state.items.map((i) =>
                i.product.id === product.id
                  ? { ...i, quantity: i.quantity + 1 }
                  : i
              )
            : [...state.items, { product, quantity: 1 }];

          // Generate warning if product requires lister/klips
          const warnings: CartWarning[] = [];
          if (product.properties?.listRequired && !state.warnings.find(w => w.id === product.id && w.type === 'list')) {
            warnings.push({
              id: product.id,
              message: 'Dette glasset krever lister som bestilles separat',
              type: 'list',
            });
          }
          if (product.properties?.klipsRequired && !state.warnings.find(w => w.id === product.id && w.type === 'klips')) {
            warnings.push({
              id: product.id,
              message: 'Dette glasset krever klips som bestilles separat',
              type: 'klips',
            });
          }

          return { items: next, warnings: [...state.warnings, ...warnings] };
        });
      },

      removeItem: (id) => {
        set((state) => ({
          items: state.items.filter((i) => i.product.id !== id),
          warnings: state.warnings.filter((w) => w.id !== id),
        }));
      },
      dismissWarning: (id) => {
        set((state) => ({
          warnings: state.warnings.filter((w) => w.id !== id),
        }));
      },

      updateQuantity: (id, quantity) => {
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => i.product.id !== id)
              : state.items.map((i) =>
                  i.product.id === id ? { ...i, quantity } : i
                ),
        }));
      },

      clear: () => set({ items: [], warnings: [] }),
    }),
    {
      name: 'autoglass-cart',
    }
  )
);
