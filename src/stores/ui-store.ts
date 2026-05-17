import { create } from "zustand";

/** Ephemeral UI state only — no domain data lives here. */
interface State {
  sidebarCollapsed: boolean;
  toggleSidebar(): void;
  activeModal: string | null;
  openModal(id: string): void;
  closeModal(): void;
}

export const useStore = create<State>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  activeModal: null,
  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),
}));
