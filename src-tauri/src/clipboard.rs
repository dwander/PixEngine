use std::path::PathBuf;

#[cfg(target_os = "windows")]
use clipboard_win::{formats, Clipboard, Setter};

#[cfg(target_os = "windows")]
use windows::Win32::System::DataExchange::{SetClipboardData, RegisterClipboardFormatA};
#[cfg(target_os = "windows")]
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HANDLE;
#[cfg(target_os = "windows")]
use windows::core::PCSTR;

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

    // 잘라내기 모드인 경우 Preferred DropEffect 설정
    if is_cut {
        unsafe {
            // "Preferred DropEffect" 포맷 등록
            let format_name = b"Preferred DropEffect\0";
            let format = RegisterClipboardFormatA(PCSTR::from_raw(format_name.as_ptr()));

            if format == 0 {
                return Err("Failed to register clipboard format".to_string());
            }

            // DROPEFFECT_MOVE = 2
            let drop_effect: u32 = 2;

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
    }

    Ok(())
}

/// macOS/Linux용 임시 구현 (추후 확장 가능)
#[cfg(not(target_os = "windows"))]
pub fn copy_files_to_clipboard(_file_paths: Vec<String>, _is_cut: bool) -> Result<(), String> {
    Err("Clipboard copy is not supported on this platform yet".to_string())
}
