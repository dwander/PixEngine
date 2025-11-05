/**
 * Konva.js-based Image Viewer
 * High-performance Canvas 2D rendering with superior quality
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
}

export function KonvaImageViewer({
  imageUrl,
  gridType = 'none',
  onRenderComplete,
  onError,
  containerWidth,
  containerHeight
}: KonvaImageViewerProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [imageScale, setImageScale] = useState({ x: 0, y: 0, scale: 1 })
  const stageRef = useRef<Konva.Stage>(null)

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

  // Calculate image position and scale
  useEffect(() => {
    if (!image) return

    const imgWidth = image.width
    const imgHeight = image.height
    const containerW = containerWidth
    const containerH = containerHeight

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
  }, [image, containerWidth, containerHeight])

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

  // Set high-quality image smoothing on stage
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const canvas = stage.getStage().content?.querySelector('canvas')
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        // High-quality image smoothing for better downscaling
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
      }
    }
  }, [image])

  return (
    <Stage
      ref={stageRef}
      width={containerWidth}
      height={containerHeight}
      style={{ backgroundColor: '#171717' }}
    >
      <Layer imageSmoothingEnabled={true}>
        {image && (
          <KonvaImage
            image={image}
            x={imageScale.x}
            y={imageScale.y}
            width={image.width * imageScale.scale}
            height={image.height * imageScale.scale}
            listening={false}
          />
        )}
        {renderGridLines()}
      </Layer>
    </Stage>
  )
}
