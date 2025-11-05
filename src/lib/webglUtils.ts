/**
 * WebGL detection and utilities
 */

export function isWebGLSupported(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    return gl !== null && gl instanceof WebGLRenderingContext
  } catch (e) {
    return false
  }
}

export function isWebGL2Supported(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    return gl !== null && gl instanceof WebGL2RenderingContext
  } catch (e) {
    return false
  }
}

export function getWebGLInfo(): {
  supported: boolean
  version: 'webgl' | 'webgl2' | 'none'
  renderer?: string
  vendor?: string
} {
  if (isWebGL2Supported()) {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (gl) {
      return {
        supported: true,
        version: 'webgl2',
        renderer: gl.getParameter(gl.RENDERER) || undefined,
        vendor: gl.getParameter(gl.VENDOR) || undefined,
      }
    }
  }

  if (isWebGLSupported()) {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (gl) {
      return {
        supported: true,
        version: 'webgl',
        renderer: (gl as WebGLRenderingContext).getParameter((gl as WebGLRenderingContext).RENDERER) || undefined,
        vendor: (gl as WebGLRenderingContext).getParameter((gl as WebGLRenderingContext).VENDOR) || undefined,
      }
    }
  }

  return {
    supported: false,
    version: 'none',
  }
}
