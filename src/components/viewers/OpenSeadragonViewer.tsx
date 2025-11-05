/**
 * OpenSeadragon-based Image Viewer
 * High-performance viewer for large images using Canvas 2D
 * No WebGL required - stable and compatible
 */

import { useEffect, useRef, useCallback } from 'react'
import OpenSeadragon from 'openseadragon'

interface OpenSeadragonViewerProps {
  imageUrl: string | null
  gridType?: 'none' | '3div' | '6div'
  onRenderComplete?: () => void
  onError?: (error: Error) => void
  containerWidth: number
  containerHeight: number
}

export function OpenSeadragonViewer({
  imageUrl,
  gridType = 'none',
  onRenderComplete,
  onError,
  containerWidth,
  containerHeight
}: OpenSeadragonViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)

  // Initialize OpenSeadragon viewer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    try {
      // Create OpenSeadragon viewer
      const viewer = OpenSeadragon({
        element: container,
        prefixUrl: 'https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.0/images/',
        showNavigationControl: false, // Hide default controls
        showNavigator: false,
        animationTime: 0.3,
        blendTime: 0.1,
        constrainDuringPan: true,
        maxZoomPixelRatio: 2,
        minZoomLevel: 0.8,
        visibilityRatio: 1,
        zoomPerScroll: 1.2,
        defaultZoomLevel: 0,
        gestureSettingsMouse: {
          clickToZoom: false, // Disable click to zoom
          dblClickToZoom: true
        }
      })

      viewerRef.current = viewer

      // Create overlay canvas for grid
      const canvas = document.createElement('canvas')
      canvas.style.position = 'absolute'
      canvas.style.top = '0'
      canvas.style.left = '0'
      canvas.style.pointerEvents = 'none'
      overlayCanvasRef.current = canvas
      container.appendChild(canvas)

      console.log('OpenSeadragon initialized')
    } catch (error) {
      console.error('Failed to initialize OpenSeadragon:', error)
      onError?.(error instanceof Error ? error : new Error('Failed to initialize OpenSeadragon'))
    }

    return () => {
      // Cleanup
      if (overlayCanvasRef.current) {
        overlayCanvasRef.current.remove()
        overlayCanvasRef.current = null
      }

      const viewer = viewerRef.current
      if (viewer) {
        viewer.destroy()
        viewerRef.current = null
      }
    }
  }, [onError])

  // Draw grid overlay
  const drawGridOverlay = useCallback(() => {
    const viewer = viewerRef.current
    const canvas = overlayCanvasRef.current
    if (!viewer || !canvas || gridType === 'none') {
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      return
    }

    const tiledImage = viewer.world.getItemAt(0)
    if (!tiledImage) return

    const imageBounds = tiledImage.getBounds()

    // Get image rectangle in viewport coordinates
    const imageRect = viewer.viewport.viewportToViewerElementRectangle(imageBounds)

    // Update canvas size and position
    canvas.width = imageRect.width
    canvas.height = imageRect.height
    canvas.style.width = `${imageRect.width}px`
    canvas.style.height = `${imageRect.height}px`
    canvas.style.left = `${imageRect.x}px`
    canvas.style.top = `${imageRect.y}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)'
    ctx.lineWidth = 2

    const width = canvas.width
    const height = canvas.height

    if (gridType === '3div') {
      // Rule of Thirds
      ctx.beginPath()
      // Vertical lines
      ctx.moveTo(width / 3, 0)
      ctx.lineTo(width / 3, height)
      ctx.moveTo((width * 2) / 3, 0)
      ctx.lineTo((width * 2) / 3, height)
      // Horizontal lines
      ctx.moveTo(0, height / 3)
      ctx.lineTo(width, height / 3)
      ctx.moveTo(0, (height * 2) / 3)
      ctx.lineTo(width, (height * 2) / 3)
      ctx.stroke()
    } else if (gridType === '6div') {
      const isLandscape = width > height
      ctx.beginPath()

      if (isLandscape) {
        // Landscape: 6 vertical divisions, 3 horizontal
        for (let i = 1; i <= 5; i++) {
          const x = (width * i) / 6
          ctx.moveTo(x, 0)
          ctx.lineTo(x, height)
        }
        for (let i = 1; i <= 2; i++) {
          const y = (height * i) / 3
          ctx.moveTo(0, y)
          ctx.lineTo(width, y)
        }
      } else {
        // Portrait: 6 horizontal divisions, 3 vertical
        for (let i = 1; i <= 5; i++) {
          const y = (height * i) / 6
          ctx.moveTo(0, y)
          ctx.lineTo(width, y)
        }
        for (let i = 1; i <= 2; i++) {
          const x = (width * i) / 3
          ctx.moveTo(x, 0)
          ctx.lineTo(x, height)
        }
      }
      ctx.stroke()
    }
  }, [gridType])

  // Load image when imageUrl changes
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !imageUrl) return

    try {
      // Clear existing image
      viewer.world.removeAll()

      // Add new image as simple image (non-tiled for now)
      viewer.addSimpleImage({
        url: imageUrl,
        success: () => {
          console.log('Image loaded successfully')

          // Fit image to viewport
          viewer.viewport.goHome(true)

          // Draw grid overlay
          setTimeout(() => {
            drawGridOverlay()
            onRenderComplete?.()
          }, 100)
        },
        error: (event) => {
          console.error('Failed to load image:', event)
          onError?.(new Error('Failed to load image'))
        }
      })

      // Update grid on zoom/pan
      viewer.addHandler('animation', drawGridOverlay)
      viewer.addHandler('resize', drawGridOverlay)
    } catch (error) {
      console.error('Failed to load image with OpenSeadragon:', error)
      onError?.(error instanceof Error ? error : new Error('Failed to load image'))
    }

    return () => {
      if (viewer) {
        viewer.removeHandler('animation', drawGridOverlay)
        viewer.removeHandler('resize', drawGridOverlay)
      }
    }
  }, [imageUrl, onRenderComplete, onError, drawGridOverlay])

  // Update grid when gridType changes
  useEffect(() => {
    drawGridOverlay()
  }, [gridType, drawGridOverlay])

  // Resize viewer when container size changes
  useEffect(() => {
    const viewer = viewerRef.current
    const container = containerRef.current
    if (!viewer || !container) return

    // Check if viewer is fully initialized
    if (!viewer.viewport || !viewer.viewport.getContainerSize) return

    // Update viewer size
    container.style.width = `${containerWidth}px`
    container.style.height = `${containerHeight}px`

    // Trigger viewer resize (no arguments needed)
    try {
      viewer.viewport.resize()
    } catch (error) {
      console.warn('Failed to resize viewport:', error)
    }

    // Redraw grid
    setTimeout(drawGridOverlay, 50)
  }, [containerWidth, containerHeight, drawGridOverlay])

  return (
    <div
      ref={containerRef}
      style={{
        width: containerWidth,
        height: containerHeight,
        backgroundColor: '#171717', // neutral-900
        position: 'relative'
      }}
    />
  )
}
