use std::path::PathBuf;

#[cfg(target_os = "windows")]
use clipboard_win::{formats, Clipboard, Setter};

/// 파일 경로 목록을 클립보드에 복사
#[cfg(target_os = "windows")]
pub fn copy_files_to_clipboard(file_paths: Vec<String>) -> Result<(), String> {
    // 경로를 정규화하여 절대 경로로 변환
    let canonical_paths: Vec<String> = file_paths
        .iter()
        .map(|p| {
            let path_buf = PathBuf::from(p);
            match path_buf.canonicalize() {
                Ok(canonical) => {
                    // Windows UNC 경로 형식을 일반 경로로 변환
                    let path_str = canonical.to_string_lossy().to_string();
                    // "\\\\?\\" 접두사 제거 (Windows 확장 경로 형식)
                    if path_str.starts_with("\\\\?\\") {
                        path_str[4..].to_string()
                    } else {
                        path_str
                    }
                }
                Err(_) => p.clone(),
            }
        })
        .collect();

    // 클립보드 열기
    let _clip = Clipboard::new_attempts(10)
        .map_err(|e| format!("Failed to open clipboard: {}", e))?;

    // 문자열 슬라이스로 변환
    let path_refs: Vec<&str> = canonical_paths.iter().map(|s| s.as_str()).collect();

    // 파일 목록 복사 (CF_HDROP 포맷)
    formats::FileList.write_clipboard(&path_refs)
        .map_err(|e| format!("Failed to copy to clipboard: {}", e))?;

    Ok(())
}

/// macOS/Linux용 임시 구현 (추후 확장 가능)
#[cfg(not(target_os = "windows"))]
pub fn copy_files_to_clipboard(_file_paths: Vec<String>) -> Result<(), String> {
    Err("Clipboard copy is not supported on this platform yet".to_string())
}
