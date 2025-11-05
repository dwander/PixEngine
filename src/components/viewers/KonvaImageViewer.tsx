/**
 * Konva.js-based Image Viewer
 * High-performance Canvas 2D rendering with hardware acceleration
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { Stage, Layer, Image as KonvaImage, Line } from 'react-konva'
import Konva from 'konva'

interface KonvaImageViewerProps {
  imageUrl: string | null
  gridType?: 'none' | '3div' | '6div'
  onRenderComplete?: () => void
  onError?: (error: Error) => void
  containerWidth: number
  containerHeight: number
  enableHardwareAcceleration?: boolean
}

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
  const [debouncedSize, setDebouncedSize] = useState({ width: containerWidth, height: containerHeight })
  const [isResizing, setIsResizing] = useState(false)
  const stageRef = useRef<Konva.Stage>(null)
  const layerRef = useRef<Konva.Layer>(null)
  const imageRef = useRef<Konva.Image>(null)
  const resizeTimeoutRef = useRef<number | null>(null)

  // Load image
  useEffect(() => {
    if (!imageUrl) {
      setImage(null)
      return
    }

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

  // Debounce container size changes
  useEffect(() => {
    // Mark as resizing
    setIsResizing(true)

    // Clear previous timeout
    if (resizeTimeoutRef.current) {
      window.clearTimeout(resizeTimeoutRef.current)
    }

    // Set new timeout
    resizeTimeoutRef.current = window.setTimeout(() => {
      console.log('[Konva] Applying debounced size:', { width: containerWidth, height: containerHeight })
      setDebouncedSize({ width: containerWidth, height: containerHeight })
      setIsResizing(false)
    }, 100) // 100ms 디바운스

    return () => {
      if (resizeTimeoutRef.current) {
        window.clearTimeout(resizeTimeoutRef.current)
      }
    }
  }, [containerWidth, containerHeight])

  // Update stage size when debounced size changes
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    console.log('[Konva] Container size changed:', {
      width: debouncedSize.width,
      height: debouncedSize.height,
      stageWidth: stage.width(),
      stageHeight: stage.height()
    })

    // Force stage to update its size
    stage.width(debouncedSize.width)
    stage.height(debouncedSize.height)

    // Force canvas elements to update
    const canvas = stage.getStage().content?.querySelector('canvas') as HTMLCanvasElement
    if (canvas) {
      canvas.width = debouncedSize.width * (window.devicePixelRatio || 1)
      canvas.height = debouncedSize.height * (window.devicePixelRatio || 1)
      canvas.style.width = `${debouncedSize.width}px`
      canvas.style.height = `${debouncedSize.height}px`
    }

    console.log('[Konva] After update:', {
      stageWidth: stage.width(),
      stageHeight: stage.height(),
      canvasWidth: canvas?.width,
      canvasHeight: canvas?.height
    })
  }, [debouncedSize])

  // Calculate image position and scale
  useEffect(() => {
    if (!image) return

    const imgWidth = image.width
    const imgHeight = image.height
    const containerW = debouncedSize.width
    const containerH = debouncedSize.height

    // Calculate scale to fit
    const scale = Math.min(
      containerW / imgWidth,
      containerH / imgHeight,
      1 // Don't scale up beyond original size
    )

    // Center the image
    const x = (containerW - imgWidth * scale) / 2
    const y = (containerH - imgHeight * scale) / 2

    setImageScale({ x, y, scale })

    // Redraw after scale calculation
    const stage = stageRef.current
    if (stage) {
      stage.batchDraw()
    }
  }, [image, debouncedSize])

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
    <Stage
      ref={stageRef}
      width={debouncedSize.width}
      height={debouncedSize.height}
      pixelRatio={window.devicePixelRatio || 1}
      style={{
        backgroundColor: '#171717',
        display: 'block',
        maxWidth: '100%',
        maxHeight: '100%'
      }}
    >
      <Layer
        ref={layerRef}
        imageSmoothingEnabled={true}
        listening={false}
      >
        {image && !isResizing && (
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
        {!isResizing && renderGridLines()}
      </Layer>
    </Stage>
  )
}
