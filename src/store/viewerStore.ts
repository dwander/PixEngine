import { create } from 'zustand'

interface ViewerState {
  isZoomedIn: boolean
  setIsZoomedIn: (isZoomedIn: boolean) => void
  toggleFullscreen: (() => void) | null
  setToggleFullscreen: (fn: (() => void) | null) => void
}

export const useViewerStore = create<ViewerState>((set) => ({
  isZoomedIn: false,
  setIsZoomedIn: (isZoomedIn) => set({ isZoomedIn }),
  toggleFullscreen: null,
  setToggleFullscreen: (fn) => set({ toggleFullscreen: fn }),
}))
