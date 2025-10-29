use tauri::{Manager, PhysicalPosition, PhysicalSize};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_window_state,
            show_window,
            save_layout_state,
            load_layout_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
