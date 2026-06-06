import { create } from 'zustand';

interface ChatState {
  isOpen: boolean;
  initialMessage: string | null;
  initialRegnr: string | null;
  openChat: (opts?: { message?: string; regnr?: string }) => void;
  closeChat: () => void;
  clearInitial: () => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  isOpen: false,
  initialMessage: null,
  initialRegnr: null,

  openChat: (opts) => {
    set({
      isOpen: true,
      initialMessage: opts?.message ?? null,
      initialRegnr: opts?.regnr ?? null,
    });
  },

  closeChat: () => set({ isOpen: false }),

  clearInitial: () => set({ initialMessage: null, initialRegnr: null }),
}));
