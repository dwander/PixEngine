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
 * 여러 이미지의 XMP Rating을 배치로 읽기
 * @param filePaths 이미지 파일 경로 배열
 * @returns [경로, 별점] 튜플 배열 (별점이 없으면 null)
 */
export async function readImageRatingsBatch(filePaths: string[]): Promise<Array<[string, number | null]>> {
  return await invoke<Array<[string, number | null]>>('read_image_ratings_batch', { filePaths })
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
