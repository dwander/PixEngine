/**
 * Konva.js-based Image Viewer
 * High-performance Canvas 2D rendering with hardware acceleration
 */

import { useEffect, useRef, useCallback, useState, useLayoutEffect } from 'react'
import { Stage, Layer, Image as KonvaImage, Line } from 'react-konva'
import Konva from 'konva'
import { useViewerStore } from '../../store/viewerStore'
import { useWindowFocus } from '../../contexts/WindowFocusContext'

interface KonvaImageViewerProps {
  imageUrl: string | null
  gridType?: 'none' | '3div' | '6div'
  onRenderComplete?: () => void
  onError?: (error: Error) => void
  containerWidth: number
  containerHeight: number
  enableHardwareAcceleration?: boolean
  onZoomStateChange?: (isFitToScreen: boolean) => void
  onRightClickZoomReset?: () => void
}

// Zoom levels: fit → dynamic steps to 100% → fixed steps after 100%
const ZOOM_LEVELS_AFTER_100 = [1.0, 1.25, 1.5, 2.0, 3.0, 4.0]

export function KonvaImageViewer({
  imageUrl,
  gridType = 'none',
  onRenderComplete,
  onError,
  containerWidth,
  containerHeight,
  enableHardwareAcceleration = false,
  onZoomStateChange,
  onRightClickZoomReset
}: KonvaImageViewerProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [imageScale, setImageScale] = useState({ x: 0, y: 0, scale: 1 })
  const [currentZoom, setCurrentZoom] = useState<number>(0) // Current zoom scale (0 = fit)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number; button: number } | null>(null)
  const [showZoomIndicator, setShowZoomIndicator] = useState(false)
  const [isCtrlPressed, setIsCtrlPressed] = useState(false)
  const zoomIndicatorTimeoutRef = useRef<number | null>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const layerRef = useRef<Konva.Layer>(null)
  const imageRef = useRef<Konva.Image>(null)
  const fitToScreenScale = useRef<number>(1)
  const zoomSteps = useRef<number[]>([]) // Dynamic zoom steps
  const isZoomingRef = useRef<boolean>(false) // Track if zoom is in progress
  const previousFitToScreenState = useRef<boolean>(true) // Track previous fit-to-screen state
  const previousImageUrl = useRef<string | null>(null) // Track image changes
  const previousContainerSize = useRef<{ width: number; height: number }>({ width: 0, height: 0 }) // Track container size changes
  const setIsZoomedIn = useViewerStore((state) => state.setIsZoomedIn)
  const { shouldConsumeClick } = useWindowFocus() // 윈도우 포커스 상태 추적

  // Load image
  useEffect(() => {
    if (!imageUrl) {
      setImage(null)
      return
    }

    // Reset zoom and dragging state when loading new image
    setIsDragging(false)
    // Note: currentZoom will be set by the zoom steps effect

    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      setImage(img)
      onRenderComplete?.()
    }

    img.onerror = () => {
      console.error('Failed to load image:', imageUrl)
      onError?.(new Error('Failed to load image'))
    }

    img.src = imageUrl

    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [imageUrl, onRenderComplete, onError])

  // Update stage size when container size changes
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    // Force stage to update its size
    stage.width(containerWidth)
    stage.height(containerHeight)

    // Force canvas elements to update
    const canvas = stage.getStage().content?.querySelector('canvas') as HTMLCanvasElement
    if (canvas) {
      canvas.width = containerWidth * (window.devicePixelRatio || 1)
      canvas.height = containerHeight * (window.devicePixelRatio || 1)
      canvas.style.width = `${containerWidth}px`
      canvas.style.height = `${containerHeight}px`
    }

    stage.batchDraw()
  }, [containerWidth, containerHeight])

  // Calculate fit-to-screen scale and zoom steps
  useLayoutEffect(() => {
    if (!image) return

    const imgWidth = image.width
    const imgHeight = image.height
    const containerW = containerWidth
    const containerH = containerHeight

    // Calculate scale to fit (no upscaling beyond 100%)
    const fitScale = Math.min(
      containerW / imgWidth,
      containerH / imgHeight,
      1
    )

    const previousFitScale = fitToScreenScale.current
    fitToScreenScale.current = fitScale

    // Build dynamic zoom steps with zoom out levels
    const steps: number[] = []

    // Add zoom out levels (5%, 10%, 15%, 20%, 25%, 33%, 50%)
    const zoomOutLevels = [0.05, 0.1, 0.15, 0.2, 0.25, 0.33, 0.5]
    for (const level of zoomOutLevels) {
      if (level < fitScale) {
        steps.push(level)
      }
    }

    // Add fit-to-screen
    steps.push(fitScale)

    // Add intermediate steps to 100%
    if (fitScale < 0.5) {
      steps.push(0.5, 0.75)
    } else if (fitScale < 0.75) {
      steps.push(0.75)
    }

    // Add 100% and levels after 100%
    steps.push(...ZOOM_LEVELS_AFTER_100)

    const previousSteps = zoomSteps.current
    zoomSteps.current = steps

    // Only reset zoom when image changes, not when container size changes
    const imageChanged = previousImageUrl.current !== imageUrl
    if (imageChanged) {
      previousImageUrl.current = imageUrl
      const fitIndex = steps.indexOf(fitScale)
      setCurrentZoom(fitIndex)
    } else if (previousSteps.length > 0 && steps.length > 0) {
      // Container size changed but image didn't change
      // Preserve zoom state intelligently
      const wasFitToScreen = previousSteps[currentZoom] === previousFitScale

      if (wasFitToScreen) {
        // Was fit-to-screen: switch to new fit-to-screen
        const newFitIndex = steps.indexOf(fitScale)
        if (newFitIndex !== -1) {
          setCurrentZoom(newFitIndex)
        }
      } else {
        // Was at specific scale: preserve that scale if possible
        const currentScale = previousSteps[currentZoom]
        const newIndex = steps.indexOf(currentScale)
        if (newIndex !== -1) {
          setCurrentZoom(newIndex)
        } else {
          // If exact scale not found, find closest
          const closestIndex = steps.reduce((bestIdx, scale, idx) => {
            return Math.abs(scale - currentScale) < Math.abs(steps[bestIdx] - currentScale)
              ? idx
              : bestIdx
          }, 0)
          setCurrentZoom(closestIndex)
        }
      }
    }
  }, [image, containerWidth, containerHeight, imageUrl, currentZoom])

  // Notify parent when zoom state changes (only when it actually changes)
  useEffect(() => {
    if (!image || zoomSteps.current.length === 0) return

    const fitIndex = zoomSteps.current.indexOf(fitToScreenScale.current)
    const isFitToScreen = currentZoom === fitIndex

    // Only call the callback if the state actually changed
    if (previousFitToScreenState.current !== isFitToScreen) {
      previousFitToScreenState.current = isFitToScreen
      onZoomStateChange?.(isFitToScreen)
    }
  }, [currentZoom, image])

  // Calculate image position and scale based on current zoom
  // ⚠️ CRITICAL: Do not modify this effect without understanding the full interaction with zoom() function
  // This effect must balance three requirements:
  // 1. Allow zoom() to set custom positions (skip when isZoomingRef is true)
  // 2. Recalculate position when container resizes (track previousContainerSize)
  // 3. Avoid infinite loops (skip when scale matches AND container size unchanged)
  useLayoutEffect(() => {
    if (!image || zoomSteps.current.length === 0) return

    const targetScale = zoomSteps.current[currentZoom]

    // Skip if zoom function is handling the position
    if (isZoomingRef.current) {
      return
    }

    // Check if container size changed
    const containerSizeChanged =
      previousContainerSize.current.width !== containerWidth ||
      previousContainerSize.current.height !== containerHeight

    // Skip if imageScale already matches the target AND container size hasn't changed
    // ⚠️ IMPORTANT: Both conditions must be checked to allow panel resize repositioning
    if (imageScale.scale === targetScale && !containerSizeChanged) {
      return
    }

    // Update previous container size
    previousContainerSize.current = { width: containerWidth, height: containerHeight }

    const imgWidth = image.width
    const imgHeight = image.height
    const containerW = containerWidth
    const containerH = containerHeight

    // Center the image (initial position before panning)
    const x = (containerW - imgWidth * targetScale) / 2
    const y = (containerH - imgHeight * targetScale) / 2

    setImageScale({ x, y, scale: targetScale })
  }, [image, containerWidth, containerHeight, currentZoom, imageScale.scale])

  // Reset isZoomingRef after all state updates complete
  useEffect(() => {
    if (isZoomingRef.current) {
      // Use setTimeout to ensure all state updates have completed
      const timeoutId = setTimeout(() => {
        isZoomingRef.current = false
      }, 0)
      return () => clearTimeout(timeoutId)
    }
  }, [currentZoom])

  // Helper function to show zoom indicator
  const showZoomIndicatorTemporarily = useCallback(() => {
    // Clear previous timeout
    if (zoomIndicatorTimeoutRef.current !== null) {
      clearTimeout(zoomIndicatorTimeoutRef.current)
    }

    // Show indicator
    setShowZoomIndicator(true)

    // Hide after 2 seconds
    zoomIndicatorTimeoutRef.current = window.setTimeout(() => {
      setShowZoomIndicator(false)
      zoomIndicatorTimeoutRef.current = null
    }, 2000)
  }, [])

  // Check if current zoom is fit-to-screen
  const isFitToScreen = useCallback(() => {
    if (zoomSteps.current.length === 0) return true
    return zoomSteps.current[currentZoom] === fitToScreenScale.current
  }, [currentZoom])

  // Check if current zoom is fit-to-screen or smaller (zoomed out)
  const isFitOrSmaller = useCallback(() => {
    if (zoomSteps.current.length === 0) return true
    return zoomSteps.current[currentZoom] <= fitToScreenScale.current
  }, [currentZoom])

  // Get current zoom percentage for display
  const getZoomPercentage = useCallback(() => {
    if (zoomSteps.current.length === 0) return 100
    const currentScale = zoomSteps.current[currentZoom]
    return Math.round(currentScale * 100)
  }, [currentZoom])

  // Update global zoom state for other components (e.g., ThumbnailPanel)
  useEffect(() => {
    setIsZoomedIn(!isFitToScreen())
  }, [currentZoom, isFitToScreen, setIsZoomedIn])

  // Draw grid lines
  const renderGridLines = useCallback(() => {
    if (!image || gridType === 'none') return null

    const imgWidth = image.width * imageScale.scale
    const imgHeight = image.height * imageScale.scale
    const offsetX = imageScale.x
    const offsetY = imageScale.y

    const lines: React.ReactElement[] = []

    if (gridType === '3div') {
      // Rule of Thirds - Vertical lines
      lines.push(
        <Line
          key="v1"
          points={[
            offsetX + imgWidth / 3, offsetY,
            offsetX + imgWidth / 3, offsetY + imgHeight
          ]}
          stroke="rgba(0, 0, 0, 0.25)"
          strokeWidth={2}
          listening={false}
        />,
        <Line
          key="v2"
          points={[
            offsetX + (imgWidth * 2) / 3, offsetY,
            offsetX + (imgWidth * 2) / 3, offsetY + imgHeight
          ]}
          stroke="rgba(0, 0, 0, 0.25)"
          strokeWidth={2}
          listening={false}
        />
      )

      // Horizontal lines
      lines.push(
        <Line
          key="h1"
          points={[
            offsetX, offsetY + imgHeight / 3,
            offsetX + imgWidth, offsetY + imgHeight / 3
          ]}
          stroke="rgba(0, 0, 0, 0.25)"
          strokeWidth={2}
          listening={false}
        />,
        <Line
          key="h2"
          points={[
            offsetX, offsetY + (imgHeight * 2) / 3,
            offsetX + imgWidth, offsetY + (imgHeight * 2) / 3
          ]}
          stroke="rgba(0, 0, 0, 0.25)"
          strokeWidth={2}
          listening={false}
        />
      )
    } else if (gridType === '6div') {
      const isLandscape = imgWidth > imgHeight

      if (isLandscape) {
        // Landscape: 6 vertical divisions, 3 horizontal
        for (let i = 1; i <= 5; i++) {
          lines.push(
            <Line
              key={`v${i}`}
              points={[
                offsetX + (imgWidth * i) / 6, offsetY,
                offsetX + (imgWidth * i) / 6, offsetY + imgHeight
              ]}
              stroke="rgba(0, 0, 0, 0.25)"
              strokeWidth={2}
              listening={false}
            />
          )
        }
        for (let i = 1; i <= 2; i++) {
          lines.push(
            <Line
              key={`h${i}`}
              points={[
                offsetX, offsetY + (imgHeight * i) / 3,
                offsetX + imgWidth, offsetY + (imgHeight * i) / 3
              ]}
              stroke="rgba(0, 0, 0, 0.25)"
              strokeWidth={2}
              listening={false}
            />
          )
        }
      } else {
        // Portrait: 6 horizontal divisions, 3 vertical
        for (let i = 1; i <= 5; i++) {
          lines.push(
            <Line
              key={`h${i}`}
              points={[
                offsetX, offsetY + (imgHeight * i) / 6,
                offsetX + imgWidth, offsetY + (imgHeight * i) / 6
              ]}
              stroke="rgba(0, 0, 0, 0.25)"
              strokeWidth={2}
              listening={false}
            />
          )
        }
        for (let i = 1; i <= 2; i++) {
          lines.push(
            <Line
              key={`v${i}`}
              points={[
                offsetX + (imgWidth * i) / 3, offsetY,
                offsetX + (imgWidth * i) / 3, offsetY + imgHeight
              ]}
              stroke="rgba(0, 0, 0, 0.25)"
              strokeWidth={2}
              listening={false}
            />
          )
        }
      }
    }

    return lines
  }, [image, gridType, imageScale])

  // Zoom in/out function with position preservation
  // ⚠️ CRITICAL: This function must use imageScale.scale/x/y to calculate zoom positions
  // The useLayoutEffect above will skip execution when scale matches, allowing this function
  // to control positioning during zoom operations via isZoomingRef flag
  const zoom = useCallback((direction: 'in' | 'out', mouseX?: number, mouseY?: number) => {
    if (!image || zoomSteps.current.length === 0) return

    const oldZoom = currentZoom
    let newZoom = oldZoom

    if (direction === 'in') {
      const currentScale = zoomSteps.current[oldZoom]
      const isClickZoom = mouseX !== undefined && mouseY !== undefined

      // 마우스 클릭 줌이고 현재 배율이 100% 미만이면 100%로 바로 이동
      if (isClickZoom && currentScale < 1.0) {
        const zoom100Index = zoomSteps.current.findIndex(scale => scale >= 1.0)
        if (zoom100Index !== -1) {
          newZoom = zoom100Index
        } else {
          newZoom = Math.min(oldZoom + 1, zoomSteps.current.length - 1)
        }
      } else {
        newZoom = Math.min(oldZoom + 1, zoomSteps.current.length - 1)
      }
    } else {
      newZoom = Math.max(oldZoom - 1, 0)
    }

    if (newZoom !== oldZoom) {
      const oldScale = zoomSteps.current[oldZoom]
      const newScale = zoomSteps.current[newZoom]
      const fitScale = fitToScreenScale.current

      let newX: number
      let newY: number

      // Case 1: fit 이하 → zoom in (클릭한 위치가 중앙으로 오도록)
      if (oldScale <= fitScale && newScale > fitScale) {
        const zoomPointX = mouseX !== undefined ? mouseX : containerWidth / 2
        const zoomPointY = mouseY !== undefined ? mouseY : containerHeight / 2

        // 현재 실제 적용된 스케일 사용 (imageScale.scale)
        const currentScale = imageScale.scale
        const imgLeft = imageScale.x
        const imgTop = imageScale.y
        const imgRight = imgLeft + image.width * currentScale
        const imgBottom = imgTop + image.height * currentScale

        // 마우스 포인터가 이미지 위에 있는지 확인
        const isOnImage = (
          zoomPointX >= imgLeft && zoomPointX <= imgRight &&
          zoomPointY >= imgTop && zoomPointY <= imgBottom
        )

        if (isOnImage) {
          // 클릭한 지점을 이미지 좌표로 변환
          const imagePointX = (zoomPointX - imageScale.x) / currentScale
          const imagePointY = (zoomPointY - imageScale.y) / currentScale

          // 해당 지점이 뷰포트 중앙에 오도록 계산
          newX = containerWidth / 2 - imagePointX * newScale
          newY = containerHeight / 2 - imagePointY * newScale
        } else {
          // 빈 공간 클릭 시 이미지 중앙을 뷰포트 중앙에 배치
          newX = containerWidth / 2 - (image.width / 2) * newScale
          newY = containerHeight / 2 - (image.height / 2) * newScale
        }
      }
      // Case 2: 이미 줌인된 상태에서 추가 줌 (클릭한 위치가 중앙으로 오도록)
      else if (oldScale > fitScale && newScale > fitScale) {
        const zoomPointX = mouseX !== undefined ? mouseX : containerWidth / 2
        const zoomPointY = mouseY !== undefined ? mouseY : containerHeight / 2

        // 현재 실제 적용된 스케일 사용
        const currentScale = imageScale.scale

        // 클릭한 지점을 이미지 좌표로 변환
        const imagePointX = (zoomPointX - imageScale.x) / currentScale
        const imagePointY = (zoomPointY - imageScale.y) / currentScale

        // 해당 지점이 뷰포트 중앙에 오도록 계산
        newX = containerWidth / 2 - imagePointX * newScale
        newY = containerHeight / 2 - imagePointY * newScale
      }
      // Case 3: fit 이하로 줌아웃 시 중앙 정렬
      else {
        const imgWidth = image.width
        const imgHeight = image.height
        newX = (containerWidth - imgWidth * newScale) / 2
        newY = (containerHeight - imgHeight * newScale) / 2
      }

      // Mark that zoom is handling the position
      isZoomingRef.current = true

      // Update position
      setImageScale(prev => ({
        ...prev,
        x: newX,
        y: newY,
        scale: newScale
      }))

      // Update zoom level
      setCurrentZoom(newZoom)

      // Show zoom indicator
      showZoomIndicatorTemporarily()
    }
  }, [image, currentZoom, imageScale, containerWidth, containerHeight, showZoomIndicatorTemporarily])

  // Handle mouse wheel zoom (Ctrl + Wheel)
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    // Only handle zoom when Ctrl is pressed
    if (!e.evt.ctrlKey) return

    e.evt.preventDefault()

    if (!image || zoomSteps.current.length === 0) return

    const delta = e.evt.deltaY

    if (delta < 0) {
      zoom('in')
    } else {
      zoom('out')
    }
  }, [image, zoom])

  // Pan with arrow keys
  const pan = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (isFitToScreen()) return

    const panStep = 50 // pixels to move per key press

    setImageScale(prev => {
      let newX = prev.x
      let newY = prev.y

      switch (direction) {
        case 'left':
          newX += panStep
          break
        case 'right':
          newX -= panStep
          break
        case 'up':
          newY += panStep
          break
        case 'down':
          newY -= panStep
          break
      }

      return { ...prev, x: newX, y: newY }
    })
  }, [isFitToScreen])

  // Reset to fit-to-screen
  const resetToFit = useCallback(() => {
    if (zoomSteps.current.length === 0) return
    const fitIndex = zoomSteps.current.indexOf(fitToScreenScale.current)
    if (fitIndex !== -1) {
      setCurrentZoom(fitIndex)
      // Show zoom indicator
      showZoomIndicatorTemporarily()
    }
  }, [showZoomIndicatorTemporarily])

  // Handle keyboard shortcuts and Ctrl key state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Track Ctrl key state
      if (e.key === 'Control') {
        setIsCtrlPressed(true)
      }

      // ESC: Reset to fit-to-screen
      if (e.key === 'Escape') {
        e.preventDefault()
        resetToFit()
      }
      // Zoom shortcuts
      else if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        zoom('in')
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        zoom('out')
      }
      // Pan shortcuts (only when zoomed in, not fit-to-screen)
      else if (!isFitToScreen()) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          e.stopPropagation()
          pan('left')
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          e.stopPropagation()
          pan('right')
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          e.stopPropagation()
          pan('up')
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          e.stopPropagation()
          pan('down')
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      // Track Ctrl key state
      if (e.key === 'Control') {
        setIsCtrlPressed(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [zoom, pan, isFitToScreen, resetToFit])

  // Handle mouse down
  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (!stage) return

    const pointerPos = stage.getPointerPosition()
    if (!pointerPos) return

    // Store mouse down position with button information
    // button: 0 = left, 1 = middle, 2 = right
    setMouseDownPos({ x: pointerPos.x, y: pointerPos.y, button: e.evt.button })

    // Only prepare for dragging on left click when zoomed in (not fit-to-screen or smaller)
    if (e.evt.button === 0 && !isFitOrSmaller() && !isCtrlPressed) {
      setDragStart({
        x: e.evt.clientX - imageScale.x,
        y: e.evt.clientY - imageScale.y
      })
    }
  }, [isFitOrSmaller, isCtrlPressed, imageScale])

  // Handle mouse move
  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!mouseDownPos) return

    // Only handle move for left button
    if (mouseDownPos.button !== 0) return

    const stage = e.target.getStage()
    if (!stage) return

    const pointerPos = stage.getPointerPosition()
    if (!pointerPos) return

    // Check if moved beyond threshold (5 pixels)
    const dx = Math.abs(pointerPos.x - mouseDownPos.x)
    const dy = Math.abs(pointerPos.y - mouseDownPos.y)

    if (dx > 5 || dy > 5) {
      if (!isFitOrSmaller() && !isCtrlPressed) {
        setIsDragging(true)
      }
    }

    // If dragging, update position
    if (isDragging) {
      const newX = e.evt.clientX - dragStart.x
      const newY = e.evt.clientY - dragStart.y
      setImageScale(prev => ({ ...prev, x: newX, y: newY }))
    }
  }, [mouseDownPos, isDragging, isFitOrSmaller, isCtrlPressed, dragStart])

  // Handle mouse up
  const handleMouseUp = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isDragging) {
      setIsDragging(false)
    } else if (mouseDownPos) {
      // 윈도우 포커스가 없었던 경우 첫 클릭은 포커스 복원용으로 소비
      if (shouldConsumeClick()) {
        setMouseDownPos(null)
        return
      }

      const stage = e.target.getStage()
      if (!stage) return

      const pointerPos = stage.getPointerPosition()
      if (!pointerPos) return

      if (mouseDownPos.button === 0) {
        // Left click: zoom in/out based on Ctrl key
        if (isCtrlPressed) {
          zoom('out', pointerPos.x, pointerPos.y)
        } else {
          zoom('in', pointerPos.x, pointerPos.y)
        }
      } else if (mouseDownPos.button === 2 && !isFitToScreen()) {
        // Right click: reset to fit-to-screen when zoomed in
        resetToFit()
        // Notify parent that zoom reset via right-click occurred
        onRightClickZoomReset?.()
      }
    }

    setMouseDownPos(null)
  }, [isDragging, mouseDownPos, isCtrlPressed, zoom, isFitToScreen, resetToFit, onRightClickZoomReset, shouldConsumeClick])

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setIsDragging(false)
    setMouseDownPos(null)
  }, [])

  // Cleanup zoom indicator timeout on unmount
  useEffect(() => {
    return () => {
      if (zoomIndicatorTimeoutRef.current !== null) {
        clearTimeout(zoomIndicatorTimeoutRef.current)
        zoomIndicatorTimeoutRef.current = null
      }
    }
  }, [])

  // Set high-quality image smoothing and optional hardware acceleration
  useEffect(() => {
    const stage = stageRef.current
    const layer = layerRef.current
    const imageNode = imageRef.current

    if (!stage || !layer || !imageNode || !image) return

    // High-quality image smoothing
    const canvas = stage.getStage().content?.querySelector('canvas')
    if (canvas) {
      const contextOptions: CanvasRenderingContext2DSettings = {
        alpha: true,
      }

      // 하드웨어 가속 옵션 (필요시에만 활성화)
      if (enableHardwareAcceleration) {
        contextOptions.desynchronized = true
      }

      const ctx = canvas.getContext('2d', contextOptions)
      if (ctx) {
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
      }
    }

    // 이미지 노드 최적화 (하드웨어 가속 활성화 시에만)
    if (enableHardwareAcceleration) {
      imageNode.perfectDrawEnabled(false)
      imageNode.shadowForStrokeEnabled(false)
      imageNode.hitStrokeWidth(0)
    }

    // Layer 렌더링
    layer.clearBeforeDraw(true)
    layer.batchDraw()
  }, [image, imageScale, enableHardwareAcceleration])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Stage
        ref={stageRef}
        width={containerWidth}
        height={containerHeight}
        pixelRatio={window.devicePixelRatio || 1}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{
          backgroundColor: '#171717',
          display: 'block',
          maxWidth: '100%',
          maxHeight: '100%',
          cursor: isDragging
            ? 'grabbing'
            : !isFitOrSmaller() && !isCtrlPressed
              ? 'grab'
              : isCtrlPressed
                ? 'zoom-out'
                : 'zoom-in'
        }}
      >
        <Layer
          ref={layerRef}
          imageSmoothingEnabled={true}
          listening={false}
        >
          {image && (
            <KonvaImage
              ref={imageRef}
              image={image}
              x={imageScale.x}
              y={imageScale.y}
              width={image.width * imageScale.scale}
              height={image.height * imageScale.scale}
              listening={false}
              perfectDrawEnabled={false}
            />
          )}
          {renderGridLines()}
        </Layer>
      </Stage>

      {/* Zoom level indicator */}
      {showZoomIndicator && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            color: 'white',
            padding: '6px 20px',
            borderRadius: '999px',
            fontSize: '15px',
            fontWeight: '500',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            pointerEvents: 'none',
            zIndex: 1000,
            backdropFilter: 'blur(8px)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            letterSpacing: '0.5px',
          }}
        >
          {getZoomPercentage()}%
        </div>
      )}
    </div>
  )
}
