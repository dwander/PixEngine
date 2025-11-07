use std::path::PathBuf;
use std::fs;
use serde::{Deserialize, Serialize};

#[cfg(target_os = "windows")]
use clipboard_win::{formats, Clipboard, Setter, Getter};

#[cfg(target_os = "windows")]
use windows::Win32::System::DataExchange::{SetClipboardData, RegisterClipboardFormatA, GetClipboardData, OpenClipboard, CloseClipboard};
#[cfg(target_os = "windows")]
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{HANDLE, HGLOBAL};
#[cfg(target_os = "windows")]
use windows::core::PCSTR;

#[derive(Debug, Serialize, Deserialize)]
pub struct DuplicateFileInfo {
    pub source: String,
    pub destination: String,
    pub file_name: String,
}

/// 파일 경로 목록을 클립보드에 복사
#[cfg(target_os = "windows")]
pub fn copy_files_to_clipboard(file_paths: Vec<String>, is_cut: bool) -> Result<(), String> {
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

    // Preferred DropEffect 설정 (복사/잘라내기 구분)
    unsafe {
        // "Preferred DropEffect" 포맷 등록
        let format_name = b"Preferred DropEffect\0";
        let format = RegisterClipboardFormatA(PCSTR::from_raw(format_name.as_ptr()));

        if format == 0 {
            return Err("Failed to register clipboard format".to_string());
        }

        // DROPEFFECT_COPY = 1, DROPEFFECT_MOVE = 2
        let drop_effect: u32 = if is_cut { 2 } else { 1 };

        // 글로벌 메모리 할당
        let h_mem = GlobalAlloc(GMEM_MOVEABLE, 4)
            .map_err(|e| format!("Failed to allocate memory: {}", e))?;

        // 메모리 잠금 및 데이터 쓰기
        let ptr = GlobalLock(h_mem);
        if ptr.is_null() {
            return Err("Failed to lock memory".to_string());
        }

        std::ptr::copy_nonoverlapping(
            &drop_effect as *const u32 as *const u8,
            ptr as *mut u8,
            4
        );

        // GlobalUnlock은 성공 시에도 0을 반환할 수 있으므로 에러 체크하지 않음
        let _ = GlobalUnlock(h_mem);

        // 클립보드에 데이터 설정 (HGLOBAL을 HANDLE로 변환)
        SetClipboardData(format, HANDLE(h_mem.0))
            .map_err(|e| format!("Failed to set clipboard data: {}", e))?;
    }

    Ok(())
}

/// macOS/Linux용 임시 구현 (추후 확장 가능)
#[cfg(not(target_os = "windows"))]
pub fn copy_files_to_clipboard(_file_paths: Vec<String>, _is_cut: bool) -> Result<(), String> {
    Err("Clipboard copy is not supported on this platform yet".to_string())
}

/// 클립보드에서 파일 경로 읽기
#[cfg(target_os = "windows")]
pub fn get_files_from_clipboard() -> Result<Vec<String>, String> {
    let _clip = Clipboard::new_attempts(10)
        .map_err(|e| format!("Failed to open clipboard: {}", e))?;

    let mut files = Vec::new();
    formats::FileList
        .read_clipboard(&mut files)
        .map_err(|e| format!("Failed to read from clipboard: {}", e))?;

    Ok(files)
}

/// 클립보드가 잘라내기 모드인지 확인
#[cfg(target_os = "windows")]
pub fn is_clipboard_cut_mode() -> Result<bool, String> {
    unsafe {
        if OpenClipboard(None).is_err() {
            return Ok(false);
        }

        let format_name = b"Preferred DropEffect\0";
        let format = RegisterClipboardFormatA(PCSTR::from_raw(format_name.as_ptr()));

        if format == 0 {
            let _ = CloseClipboard();
            return Ok(false);
        }

        let h_data = GetClipboardData(format);

        let _ = CloseClipboard();

        if h_data.is_err() || h_data.as_ref().unwrap().is_invalid() {
            return Ok(false);
        }

        let h_data_handle = h_data.unwrap();
        let h_global = HGLOBAL(h_data_handle.0);

        let ptr = GlobalLock(h_global);
        if ptr.is_null() {
            return Ok(false);
        }

        let drop_effect = *(ptr as *const u32);
        let _ = GlobalUnlock(h_global);

        // DROPEFFECT_MOVE = 2
        Ok(drop_effect == 2)
    }
}

/// 파일을 대상 디렉토리에 붙여넣기 (중복 확인 포함)
#[cfg(target_os = "windows")]
pub fn paste_files(
    destination_dir: String,
    overwrite_files: Vec<String>,
    skip_files: Vec<String>,
) -> Result<Vec<DuplicateFileInfo>, String> {
    // 클립보드에서 파일 목록 가져오기
    let source_files = get_files_from_clipboard()?;

    if source_files.is_empty() {
        return Err("클립보드에 파일이 없습니다.".to_string());
    }

    // 잘라내기 모드인지 확인
    let is_cut = is_clipboard_cut_mode()?;

    // 대상 디렉토리 정규화
    let dest_dir_canonical = PathBuf::from(&destination_dir)
        .canonicalize()
        .map_err(|e| format!("Failed to resolve destination directory: {}", e))?;

    // 자기 자신에게 복사하는지 확인
    let mut self_copy_detected = false;
    for source in &source_files {
        let source_path = PathBuf::from(source);

        // 소스 파일의 부모 디렉토리 확인
        if let Some(source_parent) = source_path.parent() {
            if let Ok(source_parent_canonical) = source_parent.canonicalize() {
                if source_parent_canonical == dest_dir_canonical {
                    self_copy_detected = true;
                    break;
                }
            }
        }
    }

    // 자기 자신에게 복사하려는 경우 에러 반환
    if self_copy_detected && !is_cut {
        return Err("같은 폴더에 파일을 복사할 수 없습니다.".to_string());
    }

    // 중복 파일 확인
    let mut duplicates = Vec::new();

    for source in &source_files {
        let source_path = PathBuf::from(source);
        let file_name = source_path
            .file_name()
            .ok_or("Invalid file name")?
            .to_string_lossy()
            .to_string();

        let dest_path = PathBuf::from(&destination_dir).join(&file_name);

        // 이미 처리 결정된 파일인지 확인
        if overwrite_files.contains(&file_name) || skip_files.contains(&file_name) {
            continue;
        }

        // 중복 파일 발견
        if dest_path.exists() {
            // 대상 경로에서 \\?\ 접두사 제거
            let dest_str = dest_path.to_string_lossy().to_string();
            let clean_dest = if dest_str.starts_with("\\\\?\\") {
                dest_str[4..].to_string()
            } else {
                dest_str
            };

            duplicates.push(DuplicateFileInfo {
                source: source.clone(),
                destination: clean_dest,
                file_name,
            });
        }
    }

    // 중복 파일이 있고 아직 처리되지 않은 경우, 사용자에게 묻기 위해 반환
    if !duplicates.is_empty() {
        return Ok(duplicates);
    }

    // 실제 파일 복사/이동 수행
    for source in &source_files {
        let source_path = PathBuf::from(source);
        let file_name = source_path
            .file_name()
            .ok_or("Invalid file name")?
            .to_string_lossy()
            .to_string();

        // 건너뛰기 목록에 있으면 건너뛰기
        if skip_files.contains(&file_name) {
            continue;
        }

        let dest_path = PathBuf::from(&destination_dir).join(&file_name);

        if is_cut {
            // 이동
            fs::rename(&source_path, &dest_path)
                .map_err(|e| format!("Failed to move file: {}", e))?;
        } else {
            // 복사
            fs::copy(&source_path, &dest_path)
                .map_err(|e| format!("Failed to copy file: {}", e))?;
        }
    }

    Ok(Vec::new())
}

#[cfg(not(target_os = "windows"))]
pub fn get_files_from_clipboard() -> Result<Vec<String>, String> {
    Err("Clipboard paste is not supported on this platform yet".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn is_clipboard_cut_mode() -> Result<bool, String> {
    Err("Clipboard paste is not supported on this platform yet".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn paste_files(
    _destination_dir: String,
    _overwrite_files: Vec<String>,
    _skip_files: Vec<String>,
) -> Result<Vec<DuplicateFileInfo>, String> {
    Err("Clipboard paste is not supported on this platform yet".to_string())
}
