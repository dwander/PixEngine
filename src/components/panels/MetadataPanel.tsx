import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useImageContext } from '../../contexts/ImageContext'
import { Info } from 'lucide-react'

interface ExifMetadata {
  // 카메라 정보
  camera_make?: string
  camera_model?: string
  lens_model?: string

  // 촬영 설정
  iso?: string
  aperture?: string
  shutter_speed?: string
  focal_length?: string
  exposure_bias?: string
  flash?: string

  // 날짜/시간
  date_time_original?: string
  date_time_digitized?: string

  // 이미지 정보
  image_width?: number
  image_height?: number
  orientation?: string
  color_space?: string

  // GPS 정보
  gps_latitude?: string
  gps_longitude?: string
  gps_altitude?: string

  // 소프트웨어
  software?: string

  // 저작권
  copyright?: string
  artist?: string
}

interface MetadataField {
  label: string
  value: string | undefined
}

export function MetadataPanel() {
  const { currentPath } = useImageContext()
  const [metadata, setMetadata] = useState<ExifMetadata | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!currentPath) {
      setMetadata(null)
      setError(null)
      return
    }

    const loadMetadata = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const data = await invoke<ExifMetadata>('get_exif_metadata', {
          filePath: currentPath,
        })
        setMetadata(data)
      } catch (err) {
        console.error('Failed to load EXIF metadata:', err)
        setError('EXIF 정보를 읽을 수 없습니다')
        setMetadata(null)
      } finally {
        setIsLoading(false)
      }
    }

    loadMetadata()
  }, [currentPath])

  if (!currentPath) {
    return (
      <div className="flex items-center justify-center h-full bg-neutral-900 text-gray-400">
        <div className="text-center">
          <Info className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">이미지를 선택하세요</p>
        </div>
      </div>
    )
  }

  // 로딩 중일 때는 빈 화면 표시 (깜빡임 방지)
  if (isLoading) {
    return <div className="h-full bg-neutral-900" />
  }

  if (error || !metadata) {
    return (
      <div className="flex items-center justify-center h-full bg-neutral-900 text-gray-400">
        <div className="text-center">
          <Info className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{error || 'EXIF 정보 없음'}</p>
        </div>
      </div>
    )
  }

  // 모든 필드를 하나의 배열로
  const fields: MetadataField[] = [
    // 촬영 설정 (재정렬: 셔터속도, 조리개, ISO, 촛점거리, 노출보정)
    { label: '셔터 속도', value: metadata.shutter_speed },
    { label: '조리개', value: metadata.aperture },
    { label: 'ISO', value: metadata.iso },
    { label: '초점 거리', value: metadata.focal_length },
    { label: '노출 보정', value: metadata.exposure_bias },
    { label: '플래시', value: metadata.flash },

    // 이미지 정보
    {
      label: '해상도',
      value:
        metadata.image_width && metadata.image_height
          ? `${metadata.image_width} x ${metadata.image_height}`
          : undefined,
    },
    { label: '방향', value: metadata.orientation },
    { label: '색공간', value: metadata.color_space },

    // 날짜/시간
    { label: '촬영 일시', value: metadata.date_time_original },
    { label: '디지털화 일시', value: metadata.date_time_digitized },

    // GPS 위치
    { label: 'GPS 위도', value: metadata.gps_latitude },
    { label: 'GPS 경도', value: metadata.gps_longitude },
    { label: 'GPS 고도', value: metadata.gps_altitude },

    // 소프트웨어 & 저작권
    { label: '소프트웨어', value: metadata.software },
    { label: '작가', value: metadata.artist },
    { label: '저작권', value: metadata.copyright },

    // 카메라 정보 (맨 아래로 이동)
    { label: '제조사', value: metadata.camera_make },
    { label: '모델', value: metadata.camera_model },
    { label: '렌즈', value: metadata.lens_model },
  ]

  // 값이 있는 필드만 필터링
  const visibleFields = fields.filter((field) => field.value)

  return (
    <div className="h-full bg-neutral-900 overflow-y-auto p-4">
      {visibleFields.length === 0 ? (
        <div className="text-center text-gray-400 py-8">
          <Info className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">EXIF 정보가 없습니다</p>
        </div>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {visibleFields.map((field, index) => (
              <tr
                key={index}
                className="border-b border-neutral-800 hover:bg-neutral-800/50"
              >
                <td className="py-2 pr-4 text-gray-400 whitespace-nowrap align-top">
                  {field.label}
                </td>
                <td className="py-2 text-gray-200 break-all">
                  {field.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
