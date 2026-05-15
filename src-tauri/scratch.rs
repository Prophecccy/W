
use windows::Win32::Foundation::{CloseHandle, HWND, MAX_PATH};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
};
use windows::core::PWSTR;

fn main() {
    unsafe {
        let hwnd: HWND = GetForegroundWindow();
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        println!("PID: {}", pid);
    }
}
