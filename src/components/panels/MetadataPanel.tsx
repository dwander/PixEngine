import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useImageContext } from '../../contexts/ImageContext'
import { Info, Camera, Settings, MapPin, Calendar, User } from 'lucide-react'

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

interface MetadataSection {
  title: string
  icon: React.ReactNode
  fields: { label: string; value: string | undefined }[]
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-neutral-900 text-gray-400">
        <div className="text-center">
          <Info className="h-12 w-12 mx-auto mb-2 opacity-50 animate-pulse" />
          <p className="text-sm">메타데이터 로딩 중...</p>
        </div>
      </div>
    )
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

  const sections: MetadataSection[] = [
    {
      title: '카메라',
      icon: <Camera className="h-4 w-4" />,
      fields: [
        { label: '제조사', value: metadata.camera_make },
        { label: '모델', value: metadata.camera_model },
        { label: '렌즈', value: metadata.lens_model },
      ],
    },
    {
      title: '촬영 설정',
      icon: <Settings className="h-4 w-4" />,
      fields: [
        { label: 'ISO', value: metadata.iso },
        { label: '조리개', value: metadata.aperture },
        { label: '셔터 속도', value: metadata.shutter_speed },
        { label: '초점 거리', value: metadata.focal_length },
        { label: '노출 보정', value: metadata.exposure_bias },
        { label: '플래시', value: metadata.flash },
      ],
    },
    {
      title: '이미지 정보',
      icon: <Info className="h-4 w-4" />,
      fields: [
        {
          label: '해상도',
          value:
            metadata.image_width && metadata.image_height
              ? `${metadata.image_width} x ${metadata.image_height}`
              : undefined,
        },
        { label: '방향', value: metadata.orientation },
        { label: '색공간', value: metadata.color_space },
      ],
    },
    {
      title: '날짜/시간',
      icon: <Calendar className="h-4 w-4" />,
      fields: [
        { label: '촬영 일시', value: metadata.date_time_original },
        { label: '디지털화 일시', value: metadata.date_time_digitized },
      ],
    },
    {
      title: 'GPS 위치',
      icon: <MapPin className="h-4 w-4" />,
      fields: [
        { label: '위도', value: metadata.gps_latitude },
        { label: '경도', value: metadata.gps_longitude },
        { label: '고도', value: metadata.gps_altitude },
      ],
    },
    {
      title: '저작권',
      icon: <User className="h-4 w-4" />,
      fields: [
        { label: '소프트웨어', value: metadata.software },
        { label: '작가', value: metadata.artist },
        { label: '저작권', value: metadata.copyright },
      ],
    },
  ]

  // 빈 섹션 필터링
  const visibleSections = sections.filter((section) =>
    section.fields.some((field) => field.value)
  )

  return (
    <div className="h-full bg-neutral-900 overflow-y-auto p-4">
      <div className="space-y-4">
        {visibleSections.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <Info className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">EXIF 정보가 없습니다</p>
          </div>
        ) : (
          visibleSections.map((section) => (
            <div key={section.title} className="border border-neutral-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-3 text-blue-400">
                {section.icon}
                <h3 className="text-sm font-semibold">{section.title}</h3>
              </div>
              <div className="space-y-2">
                {section.fields.map(
                  (field) =>
                    field.value && (
                      <div key={field.label} className="flex justify-between text-xs">
                        <span className="text-gray-400">{field.label}</span>
                        <span className="text-gray-200 text-right ml-4 break-all">
                          {field.value}
                        </span>
                      </div>
                    )
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
