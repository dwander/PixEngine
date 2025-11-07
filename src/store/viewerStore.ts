import { create } from 'zustand'

interface ViewerState {
  isZoomedIn: boolean
  setIsZoomedIn: (isZoomedIn: boolean) => void
  isFullscreenViewer: boolean
  setIsFullscreenViewer: (isFullscreen: boolean) => void
  toggleFullscreen: (() => void) | null
  setToggleFullscreen: (fn: (() => void) | null) => void
}

export const useViewerStore = create<ViewerState>((set) => ({
  isZoomedIn: false,
  setIsZoomedIn: (isZoomedIn) => set({ isZoomedIn }),
  isFullscreenViewer: false,
  setIsFullscreenViewer: (isFullscreen) => set({ isFullscreenViewer: isFullscreen }),
  toggleFullscreen: null,
  setToggleFullscreen: (fn) => set({ toggleFullscreen: fn }),
}))
