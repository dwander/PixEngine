import { useCallback, useRef } from 'react'

/**
 * Creates a throttled function that only invokes the provided function at most once per specified delay.
 *
 * @param callback - The function to throttle
 * @param delay - The delay in milliseconds
 * @returns A throttled version of the callback
 */
export function useThrottle<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const lastRun = useRef<number>(0)
  const timeoutRef = useRef<number | null>(null)

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now()
      const timeSinceLastRun = now - lastRun.current

      if (timeSinceLastRun >= delay) {
        // Execute immediately if enough time has passed
        callback(...args)
        lastRun.current = now
      } else {
        // Schedule execution for the remaining time
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current)
        }

        timeoutRef.current = window.setTimeout(() => {
          callback(...args)
          lastRun.current = Date.now()
          timeoutRef.current = null
        }, delay - timeSinceLastRun)
      }
    },
    [callback, delay]
  )
}
