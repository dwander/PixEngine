import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DevState {
  strictMode: boolean
  setStrictMode: (enabled: boolean) => void
}

export const useDevStore = create<DevState>()(
  persist(
    (set) => ({
      strictMode: true, // 기본값: 활성화
      setStrictMode: (enabled) => set({ strictMode: enabled }),
    }),
    {
      name: 'dev-settings', // localStorage 키
    }
  )
)
