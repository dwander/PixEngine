import { invoke } from '@tauri-apps/api/core'

/**
 * XMP Rating 읽기 (0-5)
 * @param filePath 이미지 파일 경로
 * @returns 별점 (0 = unrated, 1-5 = rating)
 */
export async function readImageRating(filePath: string): Promise<number> {
  return await invoke<number>('read_image_rating', { filePath })
}

/**
 * XMP Rating 쓰기 (0-5)
 * @param filePath 이미지 파일 경로
 * @param rating 별점 (0 = unrate, 1-5 = rating)
 */
export async function writeImageRating(filePath: string, rating: number): Promise<void> {
  if (rating < 0 || rating > 5) {
    throw new Error(`유효하지 않은 별점: ${rating}. 0-5 사이여야 합니다.`)
  }
  await invoke<void>('write_image_rating', { filePath, rating })
}
