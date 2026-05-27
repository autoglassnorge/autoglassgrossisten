import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product } from '@/types/api';

interface CartItem {
  product: Product;
  quantity: number;
}

interface CartWarning {
  eurocode: string;
  message: string;
  type: 'list' | 'klips';
}

interface CartState {
  items: CartItem[];
  warnings: CartWarning[];
  addItem: (product: Product) => void;
  removeItem: (eurocode: string) => void;
  updateQuantity: (eurocode: string, quantity: number) => void;
  clear: () => void;
  dismissWarning: (eurocode: string) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      warnings: [],

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

          // Generate warning if product requires lister/klips
          const warnings: CartWarning[] = [];
          if (product.properties?.listRequired && !state.warnings.find(w => w.eurocode === product.eurocode && w.type === 'list')) {
            warnings.push({
              eurocode: product.eurocode,
              message: 'Dette glasset krever lister som bestilles separat',
              type: 'list',
            });
          }
          if (product.properties?.klipsRequired && !state.warnings.find(w => w.eurocode === product.eurocode && w.type === 'klips')) {
            warnings.push({
              eurocode: product.eurocode,
              message: 'Dette glasset krever klips som bestilles separat',
              type: 'klips',
            });
          }

          return { items: next, warnings: [...state.warnings, ...warnings] };
        });
      },

      removeItem: (eurocode) => {
        set((state) => ({
          items: state.items.filter((i) => i.product.eurocode !== eurocode),
          warnings: state.warnings.filter((w) => w.eurocode !== eurocode),
        }));
      },
      dismissWarning: (eurocode) => {
        set((state) => ({
          warnings: state.warnings.filter((w) => w.eurocode !== eurocode),
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

      clear: () => set({ items: [], warnings: [] }),
    }),
    {
      name: 'autoglass-cart',
    }
  )
);
