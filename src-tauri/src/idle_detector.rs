use std::sync::Mutex;

/// 현재 앱 윈도우 핸들 저장 (전역)
static APP_WINDOW_HANDLE: Mutex<Option<isize>> = Mutex::new(None);

/// 앱 윈도우 핸들 설정
pub fn set_app_window_handle(handle: isize) {
    if let Ok(mut app_handle) = APP_WINDOW_HANDLE.lock() {
        *app_handle = Some(handle);
    }
}

/// Windows 유휴 시간 감지
#[cfg(target_os = "windows")]
pub fn get_idle_time_ms() -> u64 {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetLastInputInfo;
    use windows::Win32::UI::Input::KeyboardAndMouse::LASTINPUTINFO;
    use windows::Win32::System::SystemInformation::GetTickCount;

    unsafe {
        let mut last_input_info = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };

        if GetLastInputInfo(&mut last_input_info).as_bool() {
            let current_tick = GetTickCount();
            let idle_time = current_tick.saturating_sub(last_input_info.dwTime);
            idle_time as u64
        } else {
            0
        }
    }
}

/// 비-Windows 플랫폼에서는 항상 0 반환 (항상 활성 상태로 간주)
#[cfg(not(target_os = "windows"))]
pub fn get_idle_time_ms() -> u64 {
    0
}

/// 앱이 포커스를 가지고 있는지 확인
#[cfg(target_os = "windows")]
pub fn is_app_focused() -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    unsafe {
        let foreground_window = GetForegroundWindow();

        if let Ok(app_handle) = APP_WINDOW_HANDLE.lock() {
            if let Some(handle) = *app_handle {
                return HWND(handle as *mut _) == foreground_window;
            }
        }

        // 윈도우 핸들이 설정되지 않았으면 포커스 있는 것으로 간주
        true
    }
}

/// 비-Windows 플랫폼에서는 항상 true 반환
#[cfg(not(target_os = "windows"))]
pub fn is_app_focused() -> bool {
    true
}

/// HQ 썸네일 생성을 진행해도 되는지 확인
/// - 앱이 포커스를 잃었으면 즉시 true 반환 (백그라운드에서 작업)
/// - 앱이 포커스를 가지고 있으면 유휴 시간 확인
pub fn should_generate_hq(threshold_ms: u64) -> bool {
    // 앱이 백그라운드에 있으면 즉시 생성
    if !is_app_focused() {
        return true;
    }

    // 앱이 포그라운드에 있으면 유휴 시간 확인
    get_idle_time_ms() >= threshold_ms
}
