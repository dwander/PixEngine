/**
 * Konva.js-based Image Viewer
 * High-performance Canvas 2D rendering with hardware acceleration
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { Stage, Layer, Image as KonvaImage, Line } from 'react-konva'
import Konva from 'konva'
import { useViewerStore } from '../../store/viewerStore'

interface KonvaImageViewerProps {
  imageUrl: string | null
  gridType?: 'none' | '3div' | '6div'
  onRenderComplete?: () => void
  onError?: (error: Error) => void
  containerWidth: number
  containerHeight: number
  enableHardwareAcceleration?: boolean
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
  enableHardwareAcceleration = false
}: KonvaImageViewerProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [imageScale, setImageScale] = useState({ x: 0, y: 0, scale: 1 })
  const [currentZoom, setCurrentZoom] = useState<number>(0) // Current zoom scale (0 = fit)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number } | null>(null)
  const [showZoomIndicator, setShowZoomIndicator] = useState(false)
  const [isCtrlPressed, setIsCtrlPressed] = useState(false)
  const zoomIndicatorTimeoutRef = useRef<number | null>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const layerRef = useRef<Konva.Layer>(null)
  const imageRef = useRef<Konva.Image>(null)
  const fitToScreenScale = useRef<number>(1)
  const zoomSteps = useRef<number[]>([]) // Dynamic zoom steps
  const isZoomingRef = useRef<boolean>(false) // Track if zoom is in progress
  const setIsZoomedIn = useViewerStore((state) => state.setIsZoomedIn)

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
  useEffect(() => {
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

    zoomSteps.current = steps

    // Reset to fit when steps change
    const fitIndex = steps.indexOf(fitScale)
    setCurrentZoom(fitIndex)
  }, [image, containerWidth, containerHeight])

  // Calculate image position and scale based on current zoom
  useEffect(() => {
    if (!image || zoomSteps.current.length === 0) return

    // Skip if zoom function is handling the position
    if (isZoomingRef.current) {
      isZoomingRef.current = false
      return
    }

    const imgWidth = image.width
    const imgHeight = image.height
    const containerW = containerWidth
    const containerH = containerHeight

    const targetScale = zoomSteps.current[currentZoom]

    // Center the image (initial position before panning)
    const x = (containerW - imgWidth * targetScale) / 2
    const y = (containerH - imgHeight * targetScale) / 2

    setImageScale({ x, y, scale: targetScale })
  }, [image, containerWidth, containerHeight, currentZoom])

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
  const zoom = useCallback((direction: 'in' | 'out', mouseX?: number, mouseY?: number) => {
    if (!image || zoomSteps.current.length === 0) return

    const oldZoom = currentZoom
    let newZoom = oldZoom

    if (direction === 'in') {
      newZoom = Math.min(oldZoom + 1, zoomSteps.current.length - 1)
    } else {
      newZoom = Math.max(oldZoom - 1, 0)
    }

    if (newZoom !== oldZoom) {
      const oldScale = zoomSteps.current[oldZoom]
      const newScale = zoomSteps.current[newZoom]

      // Use mouse position if provided, otherwise use viewport center
      const zoomPointX = mouseX !== undefined ? mouseX : containerWidth / 2
      const zoomPointY = mouseY !== undefined ? mouseY : containerHeight / 2

      // Convert zoom point to image coordinates (before zoom)
      const imagePointX = (zoomPointX - imageScale.x) / oldScale
      const imagePointY = (zoomPointY - imageScale.y) / oldScale

      // Calculate new position to keep the same point at zoom point
      const newX = zoomPointX - imagePointX * newScale
      const newY = zoomPointY - imagePointY * newScale

      // Mark that zoom is handling the position
      isZoomingRef.current = true

      // Update zoom level
      setCurrentZoom(newZoom)

      // Update position to maintain zoom point
      setImageScale(prev => ({
        ...prev,
        x: newX,
        y: newY,
        scale: newScale
      }))

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

    // Store mouse down position
    setMouseDownPos({ x: pointerPos.x, y: pointerPos.y })

    // If zoomed in and not Ctrl pressed, prepare for dragging
    if (!isFitToScreen() && !isCtrlPressed) {
      setDragStart({
        x: e.evt.clientX - imageScale.x,
        y: e.evt.clientY - imageScale.y
      })
    }
  }, [isFitToScreen, isCtrlPressed, imageScale])

  // Handle mouse move
  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!mouseDownPos) return

    const stage = e.target.getStage()
    if (!stage) return

    const pointerPos = stage.getPointerPosition()
    if (!pointerPos) return

    // Check if moved beyond threshold (5 pixels)
    const dx = Math.abs(pointerPos.x - mouseDownPos.x)
    const dy = Math.abs(pointerPos.y - mouseDownPos.y)

    if (dx > 5 || dy > 5) {
      if (!isFitToScreen() && !isCtrlPressed) {
        setIsDragging(true)
      }
    }

    // If dragging, update position
    if (isDragging) {
      const newX = e.evt.clientX - dragStart.x
      const newY = e.evt.clientY - dragStart.y
      setImageScale(prev => ({ ...prev, x: newX, y: newY }))
    }
  }, [mouseDownPos, isDragging, isFitToScreen, isCtrlPressed, dragStart])

  // Handle mouse up
  const handleMouseUp = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isDragging) {
      setIsDragging(false)
    } else if (mouseDownPos) {
      // This was a click, not a drag - perform zoom
      const stage = e.target.getStage()
      if (!stage) return

      const pointerPos = stage.getPointerPosition()
      if (!pointerPos) return

      if (isCtrlPressed) {
        zoom('out', pointerPos.x, pointerPos.y)
      } else {
        zoom('in', pointerPos.x, pointerPos.y)
      }
    }

    setMouseDownPos(null)
  }, [isDragging, mouseDownPos, isCtrlPressed, zoom])

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
            : !isFitToScreen() && !isCtrlPressed
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
