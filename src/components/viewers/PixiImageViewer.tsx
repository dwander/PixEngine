/**
 * Pixi.js-based Image Viewer with WebGL acceleration
 * Falls back to Canvas 2D if WebGL is not supported
 */

import { useEffect, useRef, useCallback } from 'react'
import { Application, Sprite, Texture, Graphics } from 'pixi.js'

interface PixiImageViewerProps {
  imageUrl: string | null
  gridType?: 'none' | '3div' | '6div'
  onRenderComplete?: () => void
  onError?: (error: Error) => void
  containerWidth: number
  containerHeight: number
}

export function PixiImageViewer({
  imageUrl,
  gridType = 'none',
  onRenderComplete,
  onError,
  containerWidth,
  containerHeight
}: PixiImageViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pixiAppRef = useRef<Application | null>(null)
  const spriteRef = useRef<Sprite | null>(null)
  const gridGraphicsRef = useRef<Graphics | null>(null)
  const imageTextureRef = useRef<Texture | null>(null)
  const currentImageUrlRef = useRef<string | null>(null)

  // Initialize Pixi Application
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let mounted = true

    // Create Pixi Application with WebGL
    ;(async () => {
      try {
        const app = new Application()
        await app.init({
          canvas,
          width: containerWidth,
          height: containerHeight,
          backgroundColor: 0x171717, // neutral-900
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
          antialias: false, // Disable antialiasing to avoid shader issues
          preference: 'webgl', // Try WebGL first
          hello: false, // Disable Pixi.js hello message
        })

        if (!mounted) {
          app.destroy(true, { children: true, texture: false })
          return
        }

        pixiAppRef.current = app

        // Create sprite for image
        const sprite = new Sprite()
        app.stage.addChild(sprite)
        spriteRef.current = sprite

        // Create graphics for grid overlay
        const gridGraphics = new Graphics()
        app.stage.addChild(gridGraphics)
        gridGraphicsRef.current = gridGraphics

        console.log('Pixi.js initialized with renderer:', app.renderer.type)
      } catch (error) {
        console.error('Failed to initialize Pixi.js:', error)
        if (mounted) {
          onError?.(error instanceof Error ? error : new Error('Failed to initialize Pixi.js'))
        }
      }
    })()

    return () => {
      mounted = false

      // Destroy current texture if any
      const texture = imageTextureRef.current
      if (texture) {
        texture.destroy(true)
        imageTextureRef.current = null
      }

      const app = pixiAppRef.current
      if (app) {
        app.destroy(true, { children: true, texture: false })
      }
      pixiAppRef.current = null
      spriteRef.current = null
      gridGraphicsRef.current = null
      currentImageUrlRef.current = null
    }
  }, [])

  // Resize Pixi renderer when container size changes
  useEffect(() => {
    const app = pixiAppRef.current
    if (!app) return

    const padding = 10
    const width = containerWidth - padding * 2
    const height = containerHeight - padding * 2

    app.renderer.resize(width, height)
  }, [containerWidth, containerHeight])

  // Draw grid lines
  const drawGridLines = useCallback(
    (graphics: Graphics, displayWidth: number, displayHeight: number) => {
      graphics.clear()

      if (gridType === 'none') return

      graphics.lineStyle(2, 0x000000, 0.25)

      if (gridType === '3div') {
        // Rule of Thirds
        // Vertical lines
        graphics.moveTo(displayWidth / 3, 0)
        graphics.lineTo(displayWidth / 3, displayHeight)
        graphics.moveTo((displayWidth * 2) / 3, 0)
        graphics.lineTo((displayWidth * 2) / 3, displayHeight)
        // Horizontal lines
        graphics.moveTo(0, displayHeight / 3)
        graphics.lineTo(displayWidth, displayHeight / 3)
        graphics.moveTo(0, (displayHeight * 2) / 3)
        graphics.lineTo(displayWidth, (displayHeight * 2) / 3)
      } else if (gridType === '6div') {
        const isLandscape = displayWidth > displayHeight

        if (isLandscape) {
          // Landscape: 6 vertical divisions, 3 horizontal
          for (let i = 1; i <= 5; i++) {
            const x = (displayWidth * i) / 6
            graphics.moveTo(x, 0)
            graphics.lineTo(x, displayHeight)
          }
          for (let i = 1; i <= 2; i++) {
            const y = (displayHeight * i) / 3
            graphics.moveTo(0, y)
            graphics.lineTo(displayWidth, y)
          }
        } else {
          // Portrait: 6 horizontal divisions, 3 vertical
          for (let i = 1; i <= 5; i++) {
            const y = (displayHeight * i) / 6
            graphics.moveTo(0, y)
            graphics.lineTo(displayWidth, y)
          }
          for (let i = 1; i <= 2; i++) {
            const x = (displayWidth * i) / 3
            graphics.moveTo(x, 0)
            graphics.lineTo(x, displayHeight)
          }
        }
      }
    },
    [gridType]
  )

  // Load and render image
  useEffect(() => {
    const sprite = spriteRef.current
    const gridGraphics = gridGraphicsRef.current
    const app = pixiAppRef.current

    if (!sprite || !app || !imageUrl) return

    let cancelled = false

    ;(async () => {
      try {
        // Destroy previous texture manually
        const prevTexture = imageTextureRef.current
        if (prevTexture) {
          prevTexture.destroy(true)
          imageTextureRef.current = null
        }

        // Load texture using Texture.from() instead of Assets API
        const texture = await Texture.from(imageUrl)
        if (cancelled) {
          texture.destroy(true)
          return
        }

        currentImageUrlRef.current = imageUrl
        imageTextureRef.current = texture
        sprite.texture = texture

        // Calculate scale to fit viewport
        const containerWidth = app.renderer.width
        const containerHeight = app.renderer.height
        const imgWidth = texture.width
        const imgHeight = texture.height

        const scale = Math.min(
          containerWidth / imgWidth,
          containerHeight / imgHeight,
          1 // Don't scale up beyond original size
        )

        sprite.width = imgWidth * scale
        sprite.height = imgHeight * scale

        // Center the sprite
        sprite.x = (containerWidth - sprite.width) / 2
        sprite.y = (containerHeight - sprite.height) / 2

        // Draw grid lines if needed
        if (gridGraphics) {
          gridGraphics.position.set(sprite.x, sprite.y)
          drawGridLines(gridGraphics, sprite.width, sprite.height)
        }

        onRenderComplete?.()
      } catch (error) {
        console.error('Failed to load image with Pixi.js:', error)
        onError?.(error instanceof Error ? error : new Error('Failed to load image'))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [imageUrl, onRenderComplete, drawGridLines, onError])

  // Update grid when gridType changes
  useEffect(() => {
    const sprite = spriteRef.current
    const gridGraphics = gridGraphicsRef.current

    if (!sprite || !gridGraphics || !sprite.texture || sprite.texture.width === 0) return

    gridGraphics.position.set(sprite.x, sprite.y)
    drawGridLines(gridGraphics, sprite.width, sprite.height)
  }, [gridType, drawGridLines])

  return <canvas ref={canvasRef} />
}
