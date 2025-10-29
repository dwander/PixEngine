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

/// 유휴 상태인지 확인 (기본값: 5초 이상 입력 없음)
pub fn is_idle(threshold_ms: u64) -> bool {
    get_idle_time_ms() >= threshold_ms
}
