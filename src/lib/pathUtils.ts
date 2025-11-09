// 경로 처리 유틸리티 함수

/**
 * 경로를 정규화합니다 (백슬래시를 슬래시로 변환)
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * 경로 배열을 정규화합니다
 */
export function normalizePaths(paths: string[]): string[] {
  return paths.map(normalizePath);
}

/**
 * 두 경로가 동일한지 비교합니다 (대소문자 구분 없이, 정규화 후 비교)
 */
export function pathsEqual(path1: string, path2: string): boolean {
  return normalizePath(path1).toLowerCase() === normalizePath(path2).toLowerCase();
}

/**
 * 경로에서 파일명을 추출합니다
 */
export function getFileName(path: string): string {
  const normalized = normalizePath(path);
  const parts = normalized.split('/');
  return parts[parts.length - 1] || '';
}

/**
 * 경로에서 디렉토리 경로를 추출합니다
 */
export function getDirectoryPath(path: string): string {
  const normalized = normalizePath(path);
  const parts = normalized.split('/');
  parts.pop();
  return parts.join('/');
}

/**
 * 경로에서 확장자를 추출합니다
 */
export function getFileExtension(path: string): string {
  const fileName = getFileName(path);
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * 파일이 이미지인지 확인합니다
 */
export function isImageFile(path: string): boolean {
  const ext = getFileExtension(path);
  const imageExtensions = [
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'tif',
    'exr', 'avif', 'ico', 'svg',
    // RAW formats
    'nef', 'nrw', 'cr2', 'crw', 'arw', 'srf', 'sr2', 'dng', 'raf', 'orf', 'rw2', 'pef'
  ];
  return imageExtensions.includes(ext);
}
