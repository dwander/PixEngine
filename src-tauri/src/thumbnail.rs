use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use base64::{engine::general_purpose::STANDARD, Engine};
use exif::{In, Reader, Tag};
use image::{ImageBuffer, RgbImage};
use jpeg_decoder::Decoder as JpegDecoder;
use tauri::Manager;
use webp::Encoder as WebPEncoder;

/// 썸네일 결과
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThumbnailResult {
    pub path: String,
    pub thumbnail_base64: String,
    pub width: u32,
    pub height: u32,
    pub source: ThumbnailSource,
    pub exif_metadata: Option<ExifMetadata>,
}

/// 썸네일 소스 (어디서 가져왔는지)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ThumbnailSource {
    #[serde(rename = "cache")]
    Cache,
    #[serde(rename = "exif")]
    ExifEmbedded,
    #[serde(rename = "dct")]
    DctScaling,
}

/// EXIF 메타데이터
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExifMetadata {
    pub orientation: u8,
    pub datetime: Option<String>,
    pub datetime_original: Option<String>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub focal_length: Option<f64>,
    pub aperture: Option<f64>,
    pub shutter_speed: Option<String>,
    pub iso: Option<u32>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

impl Default for ExifMetadata {
    fn default() -> Self {
        Self {
            orientation: 1,
            datetime: None,
            datetime_original: None,
            camera_make: None,
            camera_model: None,
            lens_model: None,
            focal_length: None,
            aperture: None,
            shutter_speed: None,
            iso: None,
            width: None,
            height: None,
        }
    }
}

/// 썸네일 캐시 키 생성
pub fn generate_cache_key(file_path: &str, mtime: u64) -> String {
    let input = format!("{}:{}", file_path, mtime);
    let hash = blake3::hash(input.as_bytes());
    format!("{}", hash.to_hex())
}

/// 파일 수정 시간 가져오기
pub fn get_file_mtime(path: &str) -> Result<u64, String> {
    let metadata = fs::metadata(path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;

    let mtime = metadata
        .modified()
        .map_err(|e| format!("Failed to get modified time: {}", e))?
        .duration_since(SystemTime::UNIX_EPOCH)
        .map_err(|e| format!("Invalid system time: {}", e))?
        .as_secs();

    Ok(mtime)
}

/// 캐시 디렉토리 가져오기
pub fn get_cache_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    Ok(app_data.join("thumbnails"))
}

/// 메타데이터 디렉토리 가져오기
#[allow(dead_code)]
pub fn get_metadata_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    Ok(app_data.join("metadata"))
}

/// 캐시 파일 경로 가져오기
pub fn get_cache_path(app_handle: &tauri::AppHandle, cache_key: &str) -> Result<PathBuf, String> {
    let cache_dir = get_cache_dir(app_handle)?;
    fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache directory: {}", e))?;

    Ok(cache_dir.join(format!("{}.jpg", cache_key)))
}

/// 메타데이터 파일 경로 가져오기 (폴더별)
#[allow(dead_code)]
pub fn get_metadata_path(app_handle: &tauri::AppHandle, folder_path: &str) -> Result<PathBuf, String> {
    let metadata_dir = get_metadata_dir(app_handle)?;
    fs::create_dir_all(&metadata_dir)
        .map_err(|e| format!("Failed to create metadata directory: {}", e))?;

    // 폴더 경로를 해시해서 파일명으로 사용
    let folder_hash = blake3::hash(folder_path.as_bytes());
    Ok(metadata_dir.join(format!("{}.json", folder_hash.to_hex())))
}

/// EXIF 메타데이터 추출
pub fn extract_exif_metadata(file_path: &str) -> Result<ExifMetadata, String> {
    let file = File::open(file_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;

    let exif_reader = Reader::new();
    let exif = exif_reader
        .read_from_container(&mut BufReader::new(file))
        .map_err(|e| format!("Failed to read EXIF: {}", e))?;

    let mut metadata = ExifMetadata::default();

    // Orientation
    if let Some(field) = exif.get_field(Tag::Orientation, In::PRIMARY) {
        if let exif::Value::Short(ref shorts) = field.value {
            if let Some(&orientation) = shorts.first() {
                metadata.orientation = orientation as u8;
            }
        }
    }

    // DateTime
    if let Some(field) = exif.get_field(Tag::DateTime, In::PRIMARY) {
        metadata.datetime = Some(field.display_value().to_string());
    }

    // DateTimeOriginal
    if let Some(field) = exif.get_field(Tag::DateTimeOriginal, In::PRIMARY) {
        metadata.datetime_original = Some(field.display_value().to_string());
    }

    // Camera Make
    if let Some(field) = exif.get_field(Tag::Make, In::PRIMARY) {
        metadata.camera_make = Some(field.display_value().to_string());
    }

    // Camera Model
    if let Some(field) = exif.get_field(Tag::Model, In::PRIMARY) {
        metadata.camera_model = Some(field.display_value().to_string());
    }

    // Lens Model
    if let Some(field) = exif.get_field(Tag::LensModel, In::PRIMARY) {
        metadata.lens_model = Some(field.display_value().to_string());
    }

    // Focal Length
    if let Some(field) = exif.get_field(Tag::FocalLength, In::PRIMARY) {
        if let exif::Value::Rational(ref rationals) = field.value {
            if let Some(rational) = rationals.first() {
                metadata.focal_length = Some(rational.num as f64 / rational.denom as f64);
            }
        }
    }

    // Aperture (F-Number)
    if let Some(field) = exif.get_field(Tag::FNumber, In::PRIMARY) {
        if let exif::Value::Rational(ref rationals) = field.value {
            if let Some(rational) = rationals.first() {
                metadata.aperture = Some(rational.num as f64 / rational.denom as f64);
            }
        }
    }

    // Shutter Speed
    if let Some(field) = exif.get_field(Tag::ExposureTime, In::PRIMARY) {
        metadata.shutter_speed = Some(field.display_value().to_string());
    }

    // ISO
    if let Some(field) = exif.get_field(Tag::PhotographicSensitivity, In::PRIMARY) {
        if let exif::Value::Short(ref shorts) = field.value {
            if let Some(&iso) = shorts.first() {
                metadata.iso = Some(iso as u32);
            }
        }
    }

    // Image Width
    if let Some(field) = exif.get_field(Tag::PixelXDimension, In::PRIMARY) {
        if let exif::Value::Long(ref longs) = field.value {
            if let Some(&width) = longs.first() {
                metadata.width = Some(width);
            }
        }
    }

    // Image Height
    if let Some(field) = exif.get_field(Tag::PixelYDimension, In::PRIMARY) {
        if let exif::Value::Long(ref longs) = field.value {
            if let Some(&height) = longs.first() {
                metadata.height = Some(height);
            }
        }
    }

    Ok(metadata)
}

/// EXIF 내장 썸네일 추출
pub fn extract_exif_thumbnail(file_path: &str) -> Result<Vec<u8>, String> {
    let mut file = File::open(file_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;

    // JPEG 시그니처 확인
    let mut buffer = [0u8; 2];
    file.read_exact(&mut buffer)
        .map_err(|e| format!("Failed to read JPEG header: {}", e))?;

    if buffer != [0xFF, 0xD8] {
        return Err("Not a JPEG file".to_string());
    }

    // APP1 (EXIF) 마커 찾기
    let exif_offset = loop {
        file.read_exact(&mut buffer)
            .map_err(|e| format!("Failed to read marker: {}", e))?;

        if buffer[0] != 0xFF {
            return Err("Invalid JPEG marker".to_string());
        }

        let marker = buffer[1];

        // 세그먼트 길이 읽기
        file.read_exact(&mut buffer)
            .map_err(|e| format!("Failed to read segment length: {}", e))?;
        let length = u16::from_be_bytes(buffer) as u64;

        if marker == 0xE1 {
            // APP1 (EXIF) 마커 발견
            let current_pos = file.stream_position()
                .map_err(|e| format!("Failed to get position: {}", e))?;
            break current_pos;
        }

        // 다음 마커로 이동
        file.seek(SeekFrom::Current(length as i64 - 2))
            .map_err(|e| format!("Failed to seek: {}", e))?;
    };

    // EXIF 데이터 읽기
    file.seek(SeekFrom::Start(0))
        .map_err(|e| format!("Failed to seek to start: {}", e))?;

    let exif_reader = Reader::new();
    let mut bufreader = BufReader::new(&mut file);

    let exif = exif_reader
        .read_from_container(&mut bufreader)
        .map_err(|e| format!("Failed to read EXIF: {}", e))?;

    // 썸네일 오프셋과 길이 찾기
    let tiff_offset = exif
        .get_field(Tag::JPEGInterchangeFormat, In::THUMBNAIL)
        .and_then(|field| {
            if let exif::Value::Long(ref longs) = field.value {
                longs.first().copied()
            } else {
                None
            }
        })
        .ok_or("No thumbnail offset found")?;

    let length = exif
        .get_field(Tag::JPEGInterchangeFormatLength, In::THUMBNAIL)
        .and_then(|field| {
            if let exif::Value::Long(ref longs) = field.value {
                longs.first().copied()
            } else {
                None
            }
        })
        .ok_or("No thumbnail length found")?;

    // 썸네일 데이터 읽기
    drop(bufreader);

    let tiff_header_offset = exif_offset + 6; // "Exif\0\0"
    let absolute_offset = tiff_header_offset + tiff_offset as u64;

    file.seek(SeekFrom::Start(absolute_offset))
        .map_err(|e| format!("Failed to seek to thumbnail: {}", e))?;

    let mut thumbnail_data = vec![0u8; length as usize];
    file.read_exact(&mut thumbnail_data)
        .map_err(|e| format!("Failed to read thumbnail: {}", e))?;

    // JPEG 시그니처 확인
    if thumbnail_data.len() >= 2 && thumbnail_data[0] == 0xFF && thumbnail_data[1] == 0xD8 {
        Ok(thumbnail_data)
    } else {
        Err("Invalid JPEG signature in EXIF thumbnail".to_string())
    }
}

/// DCT 스케일링으로 JPEG 썸네일 생성 (320x320 이내)
pub fn generate_dct_thumbnail(file_path: &str, max_size: u16) -> Result<(Vec<u8>, u32, u32), String> {
    let file = File::open(file_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;

    let mut decoder = JpegDecoder::new(BufReader::new(file));

    // DCT 스케일링 설정
    decoder
        .scale(max_size, max_size)
        .map_err(|e| format!("Failed to set scale: {}", e))?;

    // 디코딩
    let pixels = decoder
        .decode()
        .map_err(|e| format!("Failed to decode JPEG: {}", e))?;

    let info = decoder
        .info()
        .ok_or_else(|| "Failed to get image info".to_string())?;

    Ok((pixels, info.width as u32, info.height as u32))
}

/// 썸네일을 JPEG로 인코딩
pub fn encode_thumbnail_to_jpeg(rgb_data: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    encode_thumbnail_to_jpeg_with_quality(rgb_data, width, height, 90)
}

pub fn encode_thumbnail_to_jpeg_with_quality(rgb_data: &[u8], width: u32, height: u32, quality: u8) -> Result<Vec<u8>, String> {
    let img: RgbImage = ImageBuffer::from_raw(width, height, rgb_data.to_vec())
        .ok_or_else(|| "Failed to create RGB image buffer".to_string())?;

    let mut jpeg_data = Vec::new();
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg_data, quality);

    encoder
        .encode(
            img.as_raw(),
            width,
            height,
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| format!("Failed to encode JPEG: {}", e))?;

    Ok(jpeg_data)
}

/// 썸네일을 Base64로 인코딩
pub fn encode_to_base64(data: &[u8]) -> String {
    STANDARD.encode(data)
}

/// RGB 데이터를 WebP로 인코딩 (HQ 썸네일용, 고속 인코딩)
pub fn encode_thumbnail_to_webp(rgb_data: &[u8], width: u32, height: u32, quality: f32) -> Result<Vec<u8>, String> {
    let encoder = WebPEncoder::from_rgb(rgb_data, width, height);

    // 고속 인코딩 모드 (quality: 60 = 빠른 인코딩 + 충분한 품질)
    let webp_data = encoder.encode(quality);

    Ok(webp_data.to_vec())
}

/// 썸네일 생성 (캐시 우선, EXIF → DCT fallback)
pub async fn generate_thumbnail(app_handle: &tauri::AppHandle, file_path: &str) -> Result<ThumbnailResult, String> {
    // 항상 원본 이미지에서 EXIF 메타데이터 추출 (orientation 정보 필수)
    let exif_metadata = extract_exif_metadata(file_path).ok();

    // 1. EXIF 썸네일 추출 시도 (캐시 없이 항상 추출 - 매우 빠름)
    if let Ok(exif_thumb) = extract_exif_thumbnail(file_path) {
        let thumbnail_base64 = encode_to_base64(&exif_thumb);

        let img = image::load_from_memory(&exif_thumb)
            .map_err(|e| format!("Failed to decode EXIF thumbnail: {}", e))?;

        return Ok(ThumbnailResult {
            path: file_path.to_string(),
            thumbnail_base64,
            width: img.width(),
            height: img.height(),
            source: ThumbnailSource::ExifEmbedded,
            exif_metadata,
        });
    }

    // 2. HQ 캐시 확인 (EXIF 썸네일이 없는 경우)
    let mtime = get_file_mtime(file_path)?;
    let cache_key = generate_cache_key(file_path, mtime);
    let cache_path = get_cache_path(app_handle, &cache_key)?;

    if cache_path.exists() {
        let cached_data = fs::read(&cache_path)
            .map_err(|e| format!("Failed to read cache: {}", e))?;

        let thumbnail_base64 = encode_to_base64(&cached_data);

        let img = image::load_from_memory(&cached_data)
            .map_err(|e| format!("Failed to decode cached image: {}", e))?;

        return Ok(ThumbnailResult {
            path: file_path.to_string(),
            thumbnail_base64,
            width: img.width(),
            height: img.height(),
            source: ThumbnailSource::Cache,
            exif_metadata,
        });
    }

    // 3. DCT 스케일링 fallback (EXIF도 없고 캐시도 없는 경우)
    let (rgb_data, width, height) = generate_dct_thumbnail(file_path, 320)?;
    let jpeg_data = encode_thumbnail_to_jpeg(&rgb_data, width, height)?;

    // HQ 캐시에 저장
    fs::write(&cache_path, &jpeg_data)
        .map_err(|e| format!("Failed to write cache: {}", e))?;

    let thumbnail_base64 = encode_to_base64(&jpeg_data);

    Ok(ThumbnailResult {
        path: file_path.to_string(),
        thumbnail_base64,
        width,
        height,
        source: ThumbnailSource::DctScaling,
        exif_metadata,
    })
}

/// 폴더별 EXIF 메타데이터 저장
#[allow(dead_code)]
pub fn save_folder_metadata(
    app_handle: &tauri::AppHandle,
    folder_path: &str,
    metadata_map: &HashMap<String, ExifMetadata>,
) -> Result<(), String> {
    let metadata_path = get_metadata_path(app_handle, folder_path)?;

    let json = serde_json::to_string_pretty(metadata_map)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;

    fs::write(&metadata_path, json)
        .map_err(|e| format!("Failed to write metadata file: {}", e))?;

    Ok(())
}

/// 폴더별 EXIF 메타데이터 로드
#[allow(dead_code)]
pub fn load_folder_metadata(app_handle: &tauri::AppHandle, folder_path: &str) -> Result<HashMap<String, ExifMetadata>, String> {
    let metadata_path = get_metadata_path(app_handle, folder_path)?;

    if !metadata_path.exists() {
        return Ok(HashMap::new());
    }

    let json = fs::read_to_string(&metadata_path)
        .map_err(|e| format!("Failed to read metadata file: {}", e))?;

    let metadata_map: HashMap<String, ExifMetadata> = serde_json::from_str(&json)
        .map_err(|e| format!("Failed to deserialize metadata: {}", e))?;

    Ok(metadata_map)
}

/// 개별 파일 EXIF 메타데이터 캐시에서 로드
#[allow(dead_code)]
fn load_cached_exif_metadata(app_handle: &tauri::AppHandle, file_path: &str) -> Result<ExifMetadata, String> {
    let parent_dir = Path::new(file_path)
        .parent()
        .ok_or("No parent directory")?
        .to_str()
        .ok_or("Invalid path")?;

    let metadata_map = load_folder_metadata(app_handle, parent_dir)?;
    metadata_map
        .get(file_path)
        .cloned()
        .ok_or_else(|| "Metadata not found".to_string())
}

/// 고화질 DCT 썸네일 생성 (320px, WebP 포맷으로 고속 인코딩)
pub async fn generate_hq_thumbnail(app_handle: &tauri::AppHandle, file_path: &str) -> Result<ThumbnailResult, String> {
    let mtime = get_file_mtime(file_path)?;
    let cache_key = generate_cache_key(file_path, mtime);
    let cache_path = get_cache_path(app_handle, &cache_key)?;

    // 캐시 파일이 이미 존재하면 기존 HQ 썸네일 로드
    if cache_path.exists() {
        let webp_data = fs::read(&cache_path)
            .map_err(|e| format!("Failed to read cached HQ thumbnail: {}", e))?;

        let thumbnail_base64 = encode_to_base64(&webp_data);
        let exif_metadata = extract_exif_metadata(file_path).ok();

        // WebP 이미지 크기 추출
        let (width, height) = extract_webp_dimensions(&webp_data).unwrap_or((320, 320));

        return Ok(ThumbnailResult {
            path: file_path.to_string(),
            thumbnail_base64,
            width,
            height,
            source: ThumbnailSource::Cache,
            exif_metadata,
        });
    }

    // EXIF 메타데이터 추출
    let exif_metadata = extract_exif_metadata(file_path).ok();

    // DCT 스케일링으로 320px 고화질 썸네일 생성
    let (rgb_data, width, height) = generate_dct_thumbnail(file_path, 320)?;

    // WebP 인코딩 (품질 60 = 빠른 인코딩 + 충분한 품질, JPEG 70보다 2배 빠름)
    let webp_data = encode_thumbnail_to_webp(&rgb_data, width, height, 60.0)?;

    // 캐시 저장
    fs::write(&cache_path, &webp_data)
        .map_err(|e| format!("Failed to write HQ thumbnail cache: {}", e))?;

    let thumbnail_base64 = encode_to_base64(&webp_data);

    Ok(ThumbnailResult {
        path: file_path.to_string(),
        thumbnail_base64,
        width,
        height,
        source: ThumbnailSource::DctScaling,
        exif_metadata,
    })
}

/// WebP 파일의 이미지 크기 추출
fn extract_webp_dimensions(webp_data: &[u8]) -> Option<(u32, u32)> {
    // WebP 시그니처 확인: RIFF....WEBP
    if webp_data.len() < 30 {
        return None;
    }

    if &webp_data[0..4] != b"RIFF" || &webp_data[8..12] != b"WEBP" {
        return None;
    }

    // VP8/VP8L/VP8X 청크 찾기
    let chunk_type = &webp_data[12..16];

    match chunk_type {
        b"VP8 " => {
            // Lossy WebP - 바이트 26-29에 width/height
            if webp_data.len() < 30 {
                return None;
            }
            let width = (u16::from_le_bytes([webp_data[26], webp_data[27]]) & 0x3FFF) as u32;
            let height = (u16::from_le_bytes([webp_data[28], webp_data[29]]) & 0x3FFF) as u32;
            Some((width, height))
        }
        b"VP8L" => {
            // Lossless WebP - 바이트 21-24에 packed bits
            if webp_data.len() < 25 {
                return None;
            }
            let bits = u32::from_le_bytes([webp_data[21], webp_data[22], webp_data[23], webp_data[24]]);
            let width = ((bits & 0x3FFF) + 1) as u32;
            let height = (((bits >> 14) & 0x3FFF) + 1) as u32;
            Some((width, height))
        }
        b"VP8X" => {
            // Extended WebP - 바이트 24-29에 width/height (24-bit little endian)
            if webp_data.len() < 30 {
                return None;
            }
            let width = (u32::from_le_bytes([webp_data[24], webp_data[25], webp_data[26], 0]) & 0xFFFFFF) + 1;
            let height = (u32::from_le_bytes([webp_data[27], webp_data[28], webp_data[29], 0]) & 0xFFFFFF) + 1;
            Some((width, height))
        }
        _ => None,
    }
}

/// HQ 썸네일이 이미 존재하는지 확인 (캐시 파일 존재 여부)
/// 이제 캐시는 모두 HQ 썸네일만 저장되므로 파일 존재만 확인
pub fn has_hq_thumbnail(app_handle: &tauri::AppHandle, file_path: &str) -> bool {
    match get_file_mtime(file_path) {
        Ok(mtime) => {
            let cache_key = generate_cache_key(file_path, mtime);
            match get_cache_path(app_handle, &cache_key) {
                Ok(cache_path) => cache_path.exists(),
                Err(_) => false,
            }
        }
        Err(_) => false,
    }
}

/// 이미지 경로 배열을 HQ 썸네일 존재 여부로 분류
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HqThumbnailClassification {
    pub existing: Vec<String>,
    pub missing: Vec<String>,
}

pub fn classify_hq_thumbnails(app_handle: &tauri::AppHandle, image_paths: Vec<String>) -> HqThumbnailClassification {
    let mut existing = Vec::new();
    let mut missing = Vec::new();

    for path in image_paths {
        if has_hq_thumbnail(app_handle, &path) {
            existing.push(path);
        } else {
            missing.push(path);
        }
    }

    HqThumbnailClassification { existing, missing }
}
