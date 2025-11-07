use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, State};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

mod thumbnail;
mod thumbnail_queue;
mod idle_detector;
mod rating;
mod clipboard;

use thumbnail_queue::ThumbnailQueueManager;

// 경로 검증 함수
fn validate_path(path: &str) -> Result<PathBuf, String> {
    let path_buf = PathBuf::from(path);

    // 경로가 존재하는지 확인
    if !path_buf.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    // 경로를 정규화하여 상대 경로 공격 방지
    match path_buf.canonicalize() {
        Ok(canonical_path) => Ok(canonical_path),
        Err(e) => Err(format!("Failed to canonicalize path: {}", e))
    }
}

// 디렉토리가 숨김/시스템 디렉토리인지 확인
fn is_hidden_or_system_dir(name: &str) -> bool {
    // 숨김 파일/폴더 (점으로 시작)
    if name.starts_with('.') {
        return true;
    }

    // Windows 시스템 디렉토리
    #[cfg(target_os = "windows")]
    {
        let system_dirs = [
            "$Recycle.Bin",
            "System Volume Information",
            "Recovery",
            "ProgramData",
            "Windows",
            "Program Files",
            "Program Files (x86)",
            "Boot",
            "Config.Msi",
            "PerfLogs",
            "msdia80.dll",
        ];

        if system_dirs.iter().any(|&dir| name.eq_ignore_ascii_case(dir)) {
            return true;
        }
    }

    // macOS/Linux 시스템 디렉토리
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let system_dirs = [
            "proc",
            "sys",
            "dev",
            "run",
            "tmp",
            "var",
            "bin",
            "sbin",
            "lib",
            "lib64",
            "boot",
            "lost+found",
        ];

        if system_dirs.contains(&name) {
            return true;
        }
    }

    false
}

#[derive(Serialize)]
struct DriveInfo {
    name: String,
    path: String,
}

#[derive(Serialize)]
struct FolderInfo {
    name: String,
    path: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct WindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct LayoutState {
    folder_width: u32,
    metadata_height: u32,
    thumbnail_width: u32,
}

// 윈도우 상태 파일 경로 가져오기
fn get_window_state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("window-state.json"))
        .map_err(|e| format!("Failed to get app data dir: {}", e))
}

// 레이아웃 상태 파일 경로 가져오기
fn get_layout_state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("layout-state.json"))
        .map_err(|e| format!("Failed to get app data dir: {}", e))
}

// dockview 레이아웃 파일 경로 가져오기
fn get_dockview_layout_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("dockview-layout.json"))
        .map_err(|e| format!("Failed to get app data dir: {}", e))
}

// 저장된 윈도우 상태 로드
fn load_window_state(app: &tauri::AppHandle) -> Option<WindowState> {
    let path = get_window_state_path(app).ok()?;
    if path.exists() {
        let content = fs::read_to_string(path).ok()?;
        serde_json::from_str(&content).ok()
    } else {
        None
    }
}

// 윈도우 상태 저장
#[tauri::command]
fn save_window_state(
    app: tauri::AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
) -> Result<(), String> {
    let path = get_window_state_path(&app)?;

    // 기존 상태 로드 (있으면)
    let mut state = if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str::<WindowState>(&content).unwrap_or(WindowState {
            x,
            y,
            width,
            height,
            maximized,
        })
    } else {
        WindowState {
            x,
            y,
            width,
            height,
            maximized,
        }
    };

    // 최대화 상태는 항상 업데이트
    state.maximized = maximized;

    // 최대화 상태가 아닐 때만 위치와 크기 업데이트
    if !maximized {
        state.x = x;
        state.y = y;
        state.width = width;
        state.height = height;
    }

    // 디렉토리가 없으면 생성
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;

    Ok(())
}

// 프론트엔드 준비 완료 시 윈도우 표시
#[tauri::command]
fn show_window(window: tauri::Window) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())?;
    Ok(())
}

// 레이아웃 상태 저장
#[tauri::command]
fn save_layout_state(
    app: tauri::AppHandle,
    folder_width: u32,
    metadata_height: u32,
    thumbnail_width: u32,
) -> Result<(), String> {
    let state = LayoutState {
        folder_width,
        metadata_height,
        thumbnail_width,
    };

    let path = get_layout_state_path(&app)?;

    // 디렉토리가 없으면 생성
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;

    Ok(())
}

// 레이아웃 상태 로드
#[tauri::command]
fn load_layout_state(app: tauri::AppHandle) -> Result<Option<LayoutState>, String> {
    let path = get_layout_state_path(&app)?;
    if path.exists() {
        let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
        let state: LayoutState = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(Some(state))
    } else {
        Ok(None)
    }
}

// dockview 레이아웃 저장
#[tauri::command]
fn save_dockview_layout(app: tauri::AppHandle, layout: serde_json::Value) -> Result<(), String> {
    let path = get_dockview_layout_path(&app)?;

    // 디렉토리가 없으면 생성
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::to_string_pretty(&layout).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;

    Ok(())
}

// dockview 레이아웃 로드
#[tauri::command]
fn load_dockview_layout(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    let path = get_dockview_layout_path(&app)?;
    if path.exists() {
        let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
        let layout: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(Some(layout))
    } else {
        Ok(None)
    }
}

// 드라이브 목록 가져오기
#[tauri::command]
fn get_drives() -> Vec<DriveInfo> {
    let mut drives = Vec::new();

    #[cfg(target_os = "windows")]
    {
        // Windows: A-Z 드라이브 체크
        for letter in b'A'..=b'Z' {
            let drive_path = format!("{}:\\", letter as char);
            if std::path::Path::new(&drive_path).exists() {
                drives.push(DriveInfo {
                    name: format!("{}:", letter as char),
                    path: drive_path,
                });
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        // macOS: /Volumes 디렉토리의 볼륨들
        if let Ok(entries) = fs::read_dir("/Volumes") {
            for entry in entries.flatten() {
                if let Ok(name) = entry.file_name().into_string() {
                    let path = format!("/Volumes/{}", name);
                    drives.push(DriveInfo {
                        name: name.clone(),
                        path,
                    });
                }
            }
        }

        // 루트 디렉토리도 추가
        drives.push(DriveInfo {
            name: "Macintosh HD".to_string(),
            path: "/".to_string(),
        });
    }

    #[cfg(target_os = "linux")]
    {
        // Linux: 루트와 마운트 포인트
        drives.push(DriveInfo {
            name: "Root".to_string(),
            path: "/".to_string(),
        });

        // /mnt와 /media의 마운트 포인트들
        for mount_dir in ["/mnt", "/media"] {
            if let Ok(entries) = fs::read_dir(mount_dir) {
                for entry in entries.flatten() {
                    if let Ok(name) = entry.file_name().into_string() {
                        let path = format!("{}/{}", mount_dir, name);
                        drives.push(DriveInfo {
                            name: name.clone(),
                            path,
                        });
                    }
                }
            }
        }
    }

    drives
}

// 서브디렉토리 존재 여부 확인
#[tauri::command]
fn has_subdirectories(path: &str) -> Result<bool, String> {
    // 경로 검증
    let validated_path = validate_path(path)?;

    if let Ok(entries) = fs::read_dir(validated_path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();

            // canonicalize로 심볼릭 링크/junction 해결
            let real_path = fs::canonicalize(&entry_path)
                .unwrap_or_else(|_| entry_path.clone());

            // 실제 경로의 메타데이터로 디렉토리 확인
            if let Ok(metadata) = fs::metadata(&real_path) {
                if metadata.is_dir() {
                    return Ok(true);
                }
            }
        }
    }
    Ok(false)
}

// 사진 폴더 가져오기
#[tauri::command]
fn get_picture_folder() -> Option<FolderInfo> {
    if let Some(picture_dir) = dirs::picture_dir() {
        // canonicalize로 심볼릭 링크를 실제 경로로 해결
        let real_path = fs::canonicalize(&picture_dir)
            .unwrap_or(picture_dir.clone());

        Some(FolderInfo {
            name: "사진".to_string(),
            path: real_path.to_string_lossy().to_string(),
        })
    } else {
        None
    }
}

// 바탕화면 폴더 가져오기
#[tauri::command]
fn get_desktop_folder() -> Option<FolderInfo> {
    if let Some(desktop_dir) = dirs::desktop_dir() {
        // canonicalize로 심볼릭 링크를 실제 경로로 해결
        let real_path = fs::canonicalize(&desktop_dir)
            .unwrap_or(desktop_dir.clone());

        Some(FolderInfo {
            name: "바탕화면".to_string(),
            path: real_path.to_string_lossy().to_string(),
        })
    } else {
        None
    }
}

// 문서 폴더 가져오기
#[tauri::command]
fn get_documents_folder() -> Option<FolderInfo> {
    if let Some(documents_dir) = dirs::document_dir() {
        // canonicalize로 심볼릭 링크를 실제 경로로 해결
        let real_path = fs::canonicalize(&documents_dir)
            .unwrap_or(documents_dir.clone());

        Some(FolderInfo {
            name: "문서".to_string(),
            path: real_path.to_string_lossy().to_string(),
        })
    } else {
        None
    }
}

// 디렉토리 내용 읽기
#[tauri::command]
fn read_directory_contents(path: &str) -> Result<Vec<serde_json::Value>, String> {
    // 경로 검증
    let validated_path = validate_path(path)?;

    let entries = fs::read_dir(validated_path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut results = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // 숨김/시스템 디렉토리 필터링
        if is_hidden_or_system_dir(&name) {
            continue;
        }

        // canonicalize로 심볼릭 링크/junction 해결
        let real_path = fs::canonicalize(&path)
            .unwrap_or_else(|_| path.clone());

        // 실제 경로의 메타데이터 확인
        if let Ok(metadata) = fs::metadata(&real_path) {
            let is_dir = metadata.is_dir();

            results.push(serde_json::json!({
                "name": name,
                "path": real_path.to_string_lossy().to_string(),
                "isDir": is_dir,
            }));
        }
    }

    Ok(results)
}

// 이미지 파일들의 총 용량 계산
#[tauri::command]
async fn calculate_images_total_size(paths: Vec<String>) -> Result<u64, String> {
    tokio::task::spawn_blocking(move || {
        let mut total_size: u64 = 0;

        for path in paths {
            if let Ok(metadata) = fs::metadata(&path) {
                total_size += metadata.len();
            }
        }

        Ok(total_size)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// 썸네일 생성 (단일 파일)
#[tauri::command]
async fn generate_thumbnail_for_image(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<thumbnail::ThumbnailResult, String> {
    thumbnail::generate_thumbnail(&app, &file_path).await
}

// 썸네일 배치 생성 시작
#[tauri::command]
async fn start_thumbnail_generation(
    image_paths: Vec<String>,
    queue: State<'_, Arc<Mutex<ThumbnailQueueManager>>>,
) -> Result<(), String> {
    let queue = queue.lock().await;
    queue.initialize(image_paths).await;
    queue.start_worker().await;
    Ok(())
}

// 썸네일 우선순위 업데이트
#[tauri::command]
async fn update_thumbnail_priorities(
    visible_indices: Vec<usize>,
    queue: State<'_, Arc<Mutex<ThumbnailQueueManager>>>,
) -> Result<(), String> {
    let queue = queue.lock().await;
    queue.update_priorities(visible_indices).await;
    Ok(())
}

// 썸네일 생성 일시정지
#[tauri::command]
async fn pause_thumbnail_generation(
    queue: State<'_, Arc<Mutex<ThumbnailQueueManager>>>,
) -> Result<(), String> {
    let queue = queue.lock().await;
    queue.pause().await;
    Ok(())
}

// 썸네일 생성 재개
#[tauri::command]
async fn resume_thumbnail_generation(
    queue: State<'_, Arc<Mutex<ThumbnailQueueManager>>>,
) -> Result<(), String> {
    let queue = queue.lock().await;
    queue.resume().await;
    Ok(())
}

// 완료된 썸네일 가져오기
#[tauri::command]
async fn get_completed_thumbnails(
    queue: State<'_, Arc<Mutex<ThumbnailQueueManager>>>,
) -> Result<std::collections::HashMap<String, thumbnail::ThumbnailResult>, String> {
    let queue = queue.lock().await;
    Ok(queue.get_all_completed().await)
}

// HQ 썸네일 존재 여부로 이미지 분류
#[tauri::command]
fn classify_hq_thumbnails(
    image_paths: Vec<String>,
    app_handle: tauri::AppHandle,
) -> Result<thumbnail::HqThumbnailClassification, String> {
    Ok(thumbnail::classify_hq_thumbnails(&app_handle, image_paths))
}

// 기존 HQ 썸네일 즉시 로드 (유휴 시간 대기 없음)
#[tauri::command]
async fn load_existing_hq_thumbnails(
    image_paths: Vec<String>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    thumbnail_queue::load_existing_hq_thumbnails(app_handle, image_paths).await;
    Ok(())
}

// 신규 HQ 썸네일 생성 시작 (유휴 시간 대기)
#[tauri::command]
async fn start_hq_thumbnail_generation(
    image_paths: Vec<String>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    thumbnail_queue::start_hq_thumbnail_worker(app_handle, image_paths).await;
    Ok(())
}

// 고화질 DCT 썸네일 생성 취소
#[tauri::command]
fn cancel_hq_thumbnail_generation() -> Result<(), String> {
    thumbnail_queue::cancel_hq_thumbnail_generation();
    Ok(())
}

// HQ 생성 뷰포트 경로 업데이트
#[tauri::command]
async fn update_hq_viewport_paths(paths: Vec<String>) -> Result<(), String> {
    thumbnail_queue::update_hq_viewport_paths(paths).await;
    Ok(())
}

// 이미지 정보 가져오기
#[derive(Serialize)]
struct ImageInfo {
    path: String,
    width: u32,
    height: u32,
    file_size: u64,
    modified_time: Option<String>, // 파일 수정 시간
    date_taken: Option<String>,    // EXIF 촬영 날짜 (DateTimeOriginal)
}

#[tauri::command]
async fn get_image_info(file_path: String) -> Result<ImageInfo, String> {
    use image::ImageReader;
    use std::time::SystemTime;

    // ImageReader로 메타데이터만 빠르게 읽기 (디코딩 안함!)
    let reader = ImageReader::open(&file_path)
        .map_err(|e| format!("Failed to open image: {}", e))?
        .with_guessed_format()
        .map_err(|e| format!("Failed to guess format: {}", e))?;

    let (width, height) = reader
        .into_dimensions()
        .map_err(|e| format!("Failed to get dimensions: {}", e))?;

    let metadata = fs::metadata(&file_path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;

    let file_size = metadata.len();

    // 수정 시간 가져오기
    let modified_time = metadata.modified()
        .ok()
        .and_then(|time| {
            time.duration_since(SystemTime::UNIX_EPOCH).ok()
        })
        .map(|duration| {
            use chrono::{DateTime, Local};
            let datetime = DateTime::from_timestamp(duration.as_secs() as i64, 0)?;
            let local_time: DateTime<Local> = datetime.into();
            Some(local_time.format("%Y-%m-%d %H:%M:%S").to_string())
        })
        .flatten();

    // EXIF에서 촬영 날짜 가져오기
    let date_taken = extract_date_taken(&file_path);

    Ok(ImageInfo {
        path: file_path,
        width,
        height,
        file_size,
        modified_time,
        date_taken,
    })
}

// EXIF에서 촬영 날짜 추출 (DateTimeOriginal 또는 DateTime)
fn extract_date_taken(file_path: &str) -> Option<String> {
    use std::io::BufReader;

    let file = fs::File::open(file_path).ok()?;
    let mut reader = BufReader::new(file);

    let exif_reader = exif::Reader::new();
    let exif_data = exif_reader.read_from_container(&mut reader).ok()?;

    // 우선순위: DateTimeOriginal (촬영일시) -> DateTime (파일 생성일시)
    let date_field = exif_data
        .get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY)
        .or_else(|| exif_data.get_field(exif::Tag::DateTime, exif::In::PRIMARY))?;

    // EXIF 날짜 형식: "YYYY:MM:DD HH:MM:SS"를 "YYYY-MM-DD HH:MM:SS"로 변환
    if let exif::Value::Ascii(ref vec) = date_field.value {
        if let Some(bytes) = vec.first() {
            if let Ok(date_str) = std::str::from_utf8(bytes) {
                let trimmed = date_str.trim();
                // 공백으로 날짜와 시간 분리
                if let Some((date_part, time_part)) = trimmed.split_once(' ') {
                    // 날짜 부분의 ':'를 '-'로 변환 (YYYY:MM:DD -> YYYY-MM-DD)
                    let formatted_date = date_part.replace(':', "-");
                    return Some(format!("{} {}", formatted_date, time_part));
                }
            }
        }
    }

    None
}

// 상세 EXIF 메타데이터 구조체
#[derive(Serialize)]
struct ExifMetadata {
    // 카메라 정보
    camera_make: Option<String>,
    camera_model: Option<String>,
    lens_model: Option<String>,

    // 촬영 설정
    iso: Option<String>,
    aperture: Option<String>,
    shutter_speed: Option<String>,
    focal_length: Option<String>,
    exposure_bias: Option<String>,
    flash: Option<String>,
    metering_mode: Option<String>,
    white_balance: Option<String>,

    // 날짜/시간
    date_time_original: Option<String>,
    date_time_digitized: Option<String>,

    // 이미지 정보
    image_width: Option<u32>,
    image_height: Option<u32>,
    orientation: Option<String>,
    color_space: Option<String>,

    // GPS 정보
    gps_latitude: Option<String>,
    gps_longitude: Option<String>,
    gps_altitude: Option<String>,

    // 소프트웨어
    software: Option<String>,

    // 저작권
    copyright: Option<String>,
    artist: Option<String>,

    // 파일 정보 (get_image_info에서 가져오던 것)
    file_size: Option<u64>,
    modified_time: Option<String>,
}

// EXIF 메타데이터 추출
#[tauri::command]
async fn get_exif_metadata(file_path: String) -> Result<ExifMetadata, String> {
    use std::io::BufReader;

    let file = fs::File::open(&file_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    let mut reader = BufReader::new(file);

    let exif_reader = exif::Reader::new();
    let exif_data = exif_reader
        .read_from_container(&mut reader)
        .map_err(|e| format!("Failed to read EXIF data: {}", e))?;

    // EXIF 필드 읽기 헬퍼 함수
    let get_field_string = |tag: exif::Tag| -> Option<String> {
        exif_data.get_field(tag, exif::In::PRIMARY)
            .map(|field| field.display_value().to_string())
    };

    let get_field_ascii = |tag: exif::Tag| -> Option<String> {
        exif_data.get_field(tag, exif::In::PRIMARY)
            .and_then(|field| {
                if let exif::Value::Ascii(ref vec) = field.value {
                    vec.first().and_then(|bytes| {
                        std::str::from_utf8(bytes).ok().map(|s| s.trim().to_string())
                    })
                } else {
                    None
                }
            })
    };

    // 날짜 형식 변환 헬퍼
    let format_exif_date = |date_str: &str| -> Option<String> {
        if let Some((date_part, time_part)) = date_str.split_once(' ') {
            let formatted_date = date_part.replace(':', "-");
            Some(format!("{} {}", formatted_date, time_part))
        } else {
            None
        }
    };

    // GPS 좌표 변환
    let format_gps_coord = |degrees: &[exif::Rational], ref_val: &str| -> Option<String> {
        if degrees.len() >= 3 {
            let d = degrees[0].to_f64();
            let m = degrees[1].to_f64();
            let s = degrees[2].to_f64();
            let decimal = d + m / 60.0 + s / 3600.0;
            Some(format!("{:.6}° {}", decimal, ref_val))
        } else {
            None
        }
    };

    // GPS 정보 추출
    let gps_latitude = exif_data.get_field(exif::Tag::GPSLatitude, exif::In::PRIMARY)
        .and_then(|field| {
            if let exif::Value::Rational(ref coords) = field.value {
                let lat_ref = get_field_ascii(exif::Tag::GPSLatitudeRef)?;
                format_gps_coord(coords, &lat_ref)
            } else {
                None
            }
        });

    let gps_longitude = exif_data.get_field(exif::Tag::GPSLongitude, exif::In::PRIMARY)
        .and_then(|field| {
            if let exif::Value::Rational(ref coords) = field.value {
                let lon_ref = get_field_ascii(exif::Tag::GPSLongitudeRef)?;
                format_gps_coord(coords, &lon_ref)
            } else {
                None
            }
        });

    let gps_altitude = exif_data.get_field(exif::Tag::GPSAltitude, exif::In::PRIMARY)
        .and_then(|field| {
            if let exif::Value::Rational(ref alt) = field.value {
                alt.first().map(|r| format!("{:.1}m", r.to_f64()))
            } else {
                None
            }
        });

    // 날짜 정보 포매팅
    let date_time_original = get_field_ascii(exif::Tag::DateTimeOriginal)
        .and_then(|s| format_exif_date(&s));

    let date_time_digitized = get_field_ascii(exif::Tag::DateTimeDigitized)
        .and_then(|s| format_exif_date(&s));

    // Orientation 값을 문자열로 변환
    let orientation = exif_data.get_field(exif::Tag::Orientation, exif::In::PRIMARY)
        .map(|field| {
            match field.value {
                exif::Value::Short(ref v) if !v.is_empty() => {
                    match v[0] {
                        1 => "Normal",
                        3 => "Rotate 180°",
                        6 => "Rotate 90° CW",
                        8 => "Rotate 270° CW",
                        _ => "Unknown",
                    }.to_string()
                },
                _ => field.display_value().to_string(),
            }
        });

    // 포맷팅 헬퍼 함수들
    let format_shutter_speed = |speed_str: String| -> String {
        // "1/250 s" -> "1/250s", "1/250" -> "1/250s"
        let trimmed = speed_str.trim();
        if trimmed.ends_with(" s") {
            trimmed.replace(" s", "s")
        } else if trimmed.ends_with('s') {
            trimmed.to_string()
        } else {
            format!("{}s", trimmed)
        }
    };

    let format_aperture = |aperture_str: String| -> String {
        // "f/2.8" -> "2.8", "F2.8" -> "2.8", "2.8" -> "2.8"
        let trimmed = aperture_str.trim();
        if trimmed.starts_with("f/") || trimmed.starts_with("F/") {
            trimmed[2..].to_string()
        } else if trimmed.starts_with('f') || trimmed.starts_with('F') {
            trimmed[1..].to_string()
        } else {
            trimmed.to_string()
        }
    };

    let format_focal_length = |focal_str: String| -> String {
        // "85 mm" -> "85mm", "85" -> "85mm"
        let trimmed = focal_str.trim();
        if trimmed.ends_with(" mm") {
            trimmed.replace(" mm", "mm")
        } else if trimmed.ends_with("mm") {
            trimmed.to_string()
        } else {
            format!("{}mm", trimmed)
        }
    };

    let format_exposure_bias = |bias_str: String| -> String {
        // "+0.33 EV" -> "+0.3eV", "+0.33" -> "+0.3eV"
        let trimmed = bias_str.trim();

        // EV 제거하고 숫자만 추출
        let number_str = trimmed
            .replace(" EV", "")
            .replace(" eV", "")
            .replace("EV", "")
            .replace("eV", "");

        // 숫자를 파싱하고 소수점 1자리로 포맷
        if let Ok(value) = number_str.trim().parse::<f64>() {
            format!("{:+.1}eV", value)
        } else {
            // 파싱 실패 시 원본 반환 (eV 추가)
            if trimmed.ends_with("eV") || trimmed.ends_with("EV") {
                trimmed.replace("EV", "eV")
            } else {
                format!("{}eV", trimmed)
            }
        }
    };

    // 파일 메타데이터 가져오기
    let file_metadata = fs::metadata(&file_path).ok();
    let file_size = file_metadata.as_ref().map(|m| m.len());

    // 수정 시간 가져오기
    let modified_time = file_metadata.and_then(|metadata| {
        use std::time::SystemTime;
        use chrono::{DateTime, Local};

        metadata.modified().ok().and_then(|time| {
            time.duration_since(SystemTime::UNIX_EPOCH).ok().and_then(|duration| {
                DateTime::from_timestamp(duration.as_secs() as i64, 0)
                    .map(|datetime| {
                        let local_time: DateTime<Local> = datetime.into();
                        local_time.format("%Y-%m-%d %H:%M:%S").to_string()
                    })
            })
        })
    });

    Ok(ExifMetadata {
        // 카메라 정보
        camera_make: get_field_ascii(exif::Tag::Make),
        camera_model: get_field_ascii(exif::Tag::Model),
        lens_model: get_field_ascii(exif::Tag::LensModel),

        // 촬영 설정 (포맷팅 적용)
        iso: get_field_string(exif::Tag::PhotographicSensitivity),
        aperture: get_field_string(exif::Tag::FNumber).map(format_aperture),
        shutter_speed: get_field_string(exif::Tag::ExposureTime).map(format_shutter_speed),
        focal_length: get_field_string(exif::Tag::FocalLength).map(format_focal_length),
        exposure_bias: get_field_string(exif::Tag::ExposureBiasValue).map(format_exposure_bias),
        flash: get_field_string(exif::Tag::Flash),
        metering_mode: get_field_string(exif::Tag::MeteringMode),
        white_balance: get_field_string(exif::Tag::WhiteBalance),

        // 날짜/시간
        date_time_original,
        date_time_digitized,

        // 이미지 정보
        image_width: exif_data.get_field(exif::Tag::PixelXDimension, exif::In::PRIMARY)
            .and_then(|f| f.value.get_uint(0)),
        image_height: exif_data.get_field(exif::Tag::PixelYDimension, exif::In::PRIMARY)
            .and_then(|f| f.value.get_uint(0)),
        orientation,
        color_space: get_field_string(exif::Tag::ColorSpace),

        // GPS 정보
        gps_latitude,
        gps_longitude,
        gps_altitude,

        // 소프트웨어
        software: get_field_ascii(exif::Tag::Software),

        // 저작권
        copyright: get_field_ascii(exif::Tag::Copyright),
        artist: get_field_ascii(exif::Tag::Artist),

        // 파일 정보
        file_size,
        modified_time,
    })
}

// 경량 메타데이터 (정렬용)
#[derive(Serialize)]
struct LightMetadata {
    path: String,
    file_size: Option<u64>,
    modified_time: Option<String>,
    date_taken: Option<String>,
}

// 여러 이미지의 경량 메타데이터를 배치로 가져오기 (정렬용)
#[tauri::command]
async fn get_images_light_metadata(file_paths: Vec<String>) -> Result<Vec<LightMetadata>, String> {
    use std::io::BufReader;
    use rayon::prelude::*;

    // 병렬로 메타데이터 추출 (Rayon 사용)
    let results: Vec<LightMetadata> = file_paths
        .par_iter()
        .map(|path| {
            // 파일 메타데이터 (크기, 수정시간)
            let file_metadata = fs::metadata(path).ok();
            let file_size = file_metadata.as_ref().map(|m| m.len());

            let modified_time = file_metadata.as_ref().and_then(|m| {
                m.modified().ok().and_then(|time| {
                    use chrono::{DateTime, Utc};
                    let datetime: DateTime<Utc> = time.into();
                    Some(datetime.format("%Y-%m-%d %H:%M:%S").to_string())
                })
            });

            // EXIF에서 촬영 날짜만 빠르게 추출
            let date_taken = fs::File::open(path).ok().and_then(|file| {
                let mut reader = BufReader::new(file);
                let exif_reader = exif::Reader::new();
                exif_reader.read_from_container(&mut reader).ok().and_then(|exif_data| {
                    // DateTimeOriginal만 추출
                    exif_data.get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY)
                        .and_then(|field| {
                            if let exif::Value::Ascii(ref vec) = field.value {
                                vec.first().and_then(|bytes| {
                                    std::str::from_utf8(bytes).ok().and_then(|date_str| {
                                        let trimmed = date_str.trim();
                                        if let Some((date_part, time_part)) = trimmed.split_once(' ') {
                                            let formatted_date = date_part.replace(':', "-");
                                            Some(format!("{} {}", formatted_date, time_part))
                                        } else {
                                            None
                                        }
                                    })
                                })
                            } else {
                                None
                            }
                        })
                })
            });

            LightMetadata {
                path: path.clone(),
                file_size,
                modified_time,
                date_taken,
            }
        })
        .collect();

    Ok(results)
}

// XMP Rating 읽기
#[tauri::command]
async fn read_image_rating(file_path: String) -> Result<i32, String> {
    // 백그라운드 스레드에서 실행 (파일 I/O 블로킹)
    tokio::task::spawn_blocking(move || {
        rating::read_rating(&file_path)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// XMP Rating 쓰기
#[tauri::command]
async fn write_image_rating(app: tauri::AppHandle, file_path: String, rating: i32) -> Result<(), String> {
    let file_path_clone = file_path.clone();

    // 백그라운드 스레드에서 실행 (파일 I/O 블로킹)
    tokio::task::spawn_blocking(move || {
        rating::write_rating(&file_path_clone, rating)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    // 별점 변경 이벤트 발생
    app.emit("rating-changed", serde_json::json!({
        "path": file_path,
        "rating": rating
    })).map_err(|e| format!("Failed to emit event: {}", e))?;

    Ok(())
}

// 폴더 생성
#[tauri::command]
async fn create_folder(parent_path: String, folder_name: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let new_path = PathBuf::from(&parent_path).join(&folder_name);
        fs::create_dir(&new_path)
            .map_err(|e| format!("폴더 생성 실패: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// 폴더 이름 변경
#[tauri::command]
async fn rename_folder(old_path: String, new_name: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let old_path_buf = PathBuf::from(&old_path);
        let parent = old_path_buf.parent()
            .ok_or("부모 디렉토리를 찾을 수 없습니다")?;
        let new_path = parent.join(&new_name);

        fs::rename(&old_path, &new_path)
            .map_err(|e| format!("이름 변경 실패: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// 폴더 삭제
#[tauri::command]
async fn delete_folder(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        fs::remove_dir_all(&path)
            .map_err(|e| format!("폴더 삭제 실패: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// 파일 경로들을 클립보드에 복사
#[tauri::command]
async fn copy_files_to_clipboard(file_paths: Vec<String>, is_cut: bool) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        clipboard::copy_files_to_clipboard(file_paths, is_cut)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let window = app.get_webview_window("main")
                .ok_or("Failed to get main window")?;

            // 윈도우 핸들을 idle_detector에 설정 (Windows만)
            #[cfg(target_os = "windows")]
            {
                use raw_window_handle::{HasWindowHandle, RawWindowHandle};
                if let Ok(handle) = window.window_handle() {
                    if let RawWindowHandle::Win32(win32_handle) = handle.as_raw() {
                        idle_detector::set_app_window_handle(win32_handle.hwnd.get() as isize);
                    }
                }
            }

            // 저장된 윈도우 상태 복원
            if let Some(state) = load_window_state(&app.handle()) {
                // 최대화 상태일 때도 먼저 일반 위치/크기를 설정해야 함
                // (복원 시 사용할 크기/위치를 Tauri에 알려주기 위함)
                let _ = window.set_size(PhysicalSize::new(state.width, state.height));
                let _ = window.set_position(PhysicalPosition::new(state.x, state.y));

                // 최대화 상태면 설정 후 최대화 실행
                if state.maximized {
                    let _ = window.maximize();
                }
            }

            // 썸네일 큐 매니저 초기화
            let queue_manager = ThumbnailQueueManager::new(app.handle().clone());
            app.manage(Arc::new(Mutex::new(queue_manager)));

            Ok(())
        })
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            save_window_state,
            show_window,
            save_layout_state,
            load_layout_state,
            save_dockview_layout,
            load_dockview_layout,
            get_drives,
            has_subdirectories,
            get_picture_folder,
            get_desktop_folder,
            get_documents_folder,
            read_directory_contents,
            calculate_images_total_size,
            generate_thumbnail_for_image,
            start_thumbnail_generation,
            update_thumbnail_priorities,
            pause_thumbnail_generation,
            resume_thumbnail_generation,
            get_completed_thumbnails,
            classify_hq_thumbnails,
            load_existing_hq_thumbnails,
            start_hq_thumbnail_generation,
            cancel_hq_thumbnail_generation,
            update_hq_viewport_paths,
            get_image_info,
            get_exif_metadata,
            get_images_light_metadata,
            read_image_rating,
            write_image_rating,
            create_folder,
            rename_folder,
            delete_folder,
            copy_files_to_clipboard
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
