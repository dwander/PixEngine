use tauri::{Manager, PhysicalPosition, PhysicalSize, State};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

mod thumbnail;
mod thumbnail_queue;

use thumbnail_queue::ThumbnailQueueManager;

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
fn get_window_state_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("Failed to get app data dir")
        .join("window-state.json")
}

// 레이아웃 상태 파일 경로 가져오기
fn get_layout_state_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("Failed to get app data dir")
        .join("layout-state.json")
}

// dockview 레이아웃 파일 경로 가져오기
fn get_dockview_layout_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("Failed to get app data dir")
        .join("dockview-layout.json")
}

// 저장된 윈도우 상태 로드
fn load_window_state(app: &tauri::AppHandle) -> Option<WindowState> {
    let path = get_window_state_path(app);
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
    let state = WindowState {
        x,
        y,
        width,
        height,
        maximized,
    };

    let path = get_window_state_path(&app);

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

    let path = get_layout_state_path(&app);

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
    let path = get_layout_state_path(&app);
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
    let path = get_dockview_layout_path(&app);

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
    let path = get_dockview_layout_path(&app);
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
fn has_subdirectories(path: &str) -> bool {
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();

            // canonicalize로 심볼릭 링크/junction 해결
            let real_path = fs::canonicalize(&entry_path)
                .unwrap_or_else(|_| entry_path.clone());

            // 실제 경로의 메타데이터로 디렉토리 확인
            if let Ok(metadata) = fs::metadata(&real_path) {
                if metadata.is_dir() {
                    return true;
                }
            }
        }
    }
    false
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

// 디렉토리 내용 읽기
#[tauri::command]
fn read_directory_contents(path: &str) -> Result<Vec<serde_json::Value>, String> {
    let entries = fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut results = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();

        // canonicalize로 심볼릭 링크/junction 해결
        let real_path = fs::canonicalize(&path)
            .unwrap_or_else(|_| path.clone());

        // 실제 경로의 메타데이터 확인
        if let Ok(metadata) = fs::metadata(&real_path) {
            let name = entry.file_name().to_string_lossy().to_string();
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

// 이미지 정보 가져오기
#[derive(Serialize)]
struct ImageInfo {
    path: String,
    width: u32,
    height: u32,
    file_size: u64,
}

#[tauri::command]
async fn get_image_info(file_path: String) -> Result<ImageInfo, String> {
    use image::ImageReader;

    // ImageReader로 메타데이터만 빠르게 읽기 (디코딩 안함!)
    let reader = ImageReader::open(&file_path)
        .map_err(|e| format!("Failed to open image: {}", e))?
        .with_guessed_format()
        .map_err(|e| format!("Failed to guess format: {}", e))?;

    let (width, height) = reader
        .into_dimensions()
        .map_err(|e| format!("Failed to get dimensions: {}", e))?;

    let file_size = fs::metadata(&file_path)
        .map_err(|e| format!("Failed to get file size: {}", e))?
        .len();

    Ok(ImageInfo {
        path: file_path,
        width,
        height,
        file_size,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            // 저장된 윈도우 상태 복원
            if let Some(state) = load_window_state(&app.handle()) {
                if state.maximized {
                    let _ = window.maximize();
                } else {
                    let _ = window.set_size(PhysicalSize::new(state.width, state.height));
                    let _ = window.set_position(PhysicalPosition::new(state.x, state.y));
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
            read_directory_contents,
            calculate_images_total_size,
            generate_thumbnail_for_image,
            start_thumbnail_generation,
            update_thumbnail_priorities,
            pause_thumbnail_generation,
            resume_thumbnail_generation,
            get_completed_thumbnails,
            get_image_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
