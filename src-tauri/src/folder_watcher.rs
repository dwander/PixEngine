use notify_debouncer_full::{
    new_debouncer,
    notify::{RecursiveMode, Watcher},
    DebounceEventResult,
};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[allow(clippy::enum_variant_names)]
pub enum FolderChangeEvent {
    FileAdded { path: String },
    FileRemoved { path: String },
    FileModified { path: String },
}

// 지원하는 이미지 확장자 목록
const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg",  // JPEG
    "png",          // PNG
    "gif",          // GIF
    "bmp",          // BMP
    "webp",         // WebP
    "tiff", "tif",  // TIFF
    "exr",          // OpenEXR
    "avif",         // AVIF
    "ico",          // ICO
    "svg",          // SVG
];

fn is_image_file(path: &Path) -> bool {
    if let Some(ext) = path.extension() {
        let ext_str = ext.to_string_lossy().to_lowercase();
        IMAGE_EXTENSIONS.contains(&ext_str.as_str())
    } else {
        false
    }
}

pub struct FolderWatcher {
    _debouncer: Arc<Mutex<Option<notify_debouncer_full::Debouncer<notify::RecommendedWatcher, notify_debouncer_full::FileIdMap>>>>,
    current_path: Arc<Mutex<Option<PathBuf>>>,
}

impl FolderWatcher {
    pub fn new() -> Self {
        Self {
            _debouncer: Arc::new(Mutex::new(None)),
            current_path: Arc::new(Mutex::new(None)),
        }
    }

    pub fn watch_folder(&self, app: AppHandle, folder_path: String) -> Result<(), String> {
        let path = PathBuf::from(&folder_path);

        if !path.exists() || !path.is_dir() {
            return Err(format!("Invalid folder path: {}", folder_path));
        }

        // 현재 감시 중인 경로 업데이트
        *self.current_path.lock().unwrap() = Some(path.clone());

        // 디바운서 생성 (500ms 디바운싱)
        let debouncer = new_debouncer(
            Duration::from_millis(500),
            None,
            move |result: DebounceEventResult| {
                match result {
                    Ok(events) => {
                        for event in events {
                            for path in &event.paths {
                                // 이미지 파일만 처리
                                if !is_image_file(path) {
                                    continue;
                                }

                                let path_str = path.to_string_lossy().to_string();

                                let change_event = match event.kind {
                                    notify::EventKind::Create(_) => {
                                        Some(FolderChangeEvent::FileAdded { path: path_str })
                                    }
                                    notify::EventKind::Remove(_) => {
                                        Some(FolderChangeEvent::FileRemoved { path: path_str })
                                    }
                                    notify::EventKind::Modify(_) => {
                                        Some(FolderChangeEvent::FileModified { path: path_str })
                                    }
                                    _ => None,
                                };

                                if let Some(evt) = change_event {
                                    // 프론트엔드로 이벤트 전송
                                    let _ = app.emit("folder-change", evt);
                                }
                            }
                        }
                    }
                    Err(errors) => {
                        for error in errors {
                            eprintln!("Folder watcher error: {:?}", error);
                        }
                    }
                }
            },
        ).map_err(|e| format!("Failed to create watcher: {}", e))?;

        // 폴더 감시 시작 (비재귀 - 하위 폴더는 감시하지 않음)
        let mut debouncer_guard = self._debouncer.lock().unwrap();
        if let Some(old_debouncer) = debouncer_guard.take() {
            drop(old_debouncer);
        }

        let mut new_debouncer = debouncer;
        new_debouncer
            .watcher()
            .watch(&path, RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch folder: {}", e))?;

        *debouncer_guard = Some(new_debouncer);

        Ok(())
    }

    pub fn stop_watching(&self) {
        let mut debouncer = self._debouncer.lock().unwrap();
        if let Some(d) = debouncer.take() {
            drop(d);
        }
        *self.current_path.lock().unwrap() = None;
    }

    #[allow(dead_code)]
    pub fn get_current_path(&self) -> Option<PathBuf> {
        self.current_path.lock().unwrap().clone()
    }
}
