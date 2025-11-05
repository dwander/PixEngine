import { create } from 'zustand'

interface ViewerState {
  isZoomedIn: boolean
  setIsZoomedIn: (isZoomedIn: boolean) => void
}

export const useViewerStore = create<ViewerState>((set) => ({
  isZoomedIn: false,
  setIsZoomedIn: (isZoomedIn) => set({ isZoomedIn }),
}))
