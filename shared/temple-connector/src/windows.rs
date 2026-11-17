use std::env;
use std::ffi::OsStr;
use std::fs::{self, OpenOptions};
use std::io;
use std::os::windows::ffi::OsStrExt;
use std::path::PathBuf;
use std::process::{Child, Command, ExitCode, Stdio};
use std::ptr::{null, null_mut};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use windows_sys::Win32::Foundation::{CloseHandle, ERROR_ALREADY_EXISTS, GetLastError, HANDLE};
use windows_sys::Win32::Networking::WinHttp::*;
use windows_sys::Win32::System::Console::{CTRL_BREAK_EVENT, CTRL_C_EVENT, SetConsoleCtrlHandler};
use windows_sys::Win32::System::Registry::{
    HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE, REG_OPTION_NON_VOLATILE, REG_SZ, RegCloseKey,
    RegCreateKeyExW, RegSetValueExW,
};
use windows_sys::Win32::System::Threading::CreateMutexW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    MB_ICONERROR, MB_ICONINFORMATION, MB_OK, MessageBoxW,
};

const APPDEV_HOST: &str = "appdev.sourcerytech.com.au";
const PROTOCOL_KEY: &str = r"Software\Classes\sourcery-appdev-tunnels";
const CONNECTOR: &str = "AppDev-Temple-Connector.exe";
const MAX_HOMEPAGE: usize = 2 * 1024 * 1024;
static STOPPING: AtomicBool = AtomicBool::new(false);

pub fn run() -> ExitCode {
    let args: Vec<_> = env::args_os().skip(1).collect();
    let result = match args.as_slice() {
        [] => {
            let result = install();
            let (message, icon) = match &result {
                Ok(()) => (
                    "AppDev Temple Connector is installed. Return to Connect to Temple and select Open SSH tunnels.".to_owned(),
                    MB_ICONINFORMATION,
                ),
                Err(error) => (format!("AppDev setup could not finish.\n\n{error}"), MB_ICONERROR),
            };
            // The dialog owns no windows and all strings live through the call.
            unsafe {
                MessageBoxW(
                    null_mut(),
                    wide(message).as_ptr(),
                    wide("AppDev Temple Connector").as_ptr(),
                    MB_OK | icon,
                );
            }
            result
        }
        [arg] if arg == "--watch" => watch(),
        [arg] if arg == "--show" => load_ports().map(|ports| {
            println!("ssh {}", ssh_arguments(&ports).join(" "));
        }),
        _ => Err(io::Error::other(
            "Usage: AppDev-Temple-Connector.exe [--show | --watch]",
        )),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("AppDev tunnel sync failed. {error}");
            ExitCode::FAILURE
        }
    }
}

fn wide(text: impl AsRef<OsStr>) -> Vec<u16> {
    text.as_ref().encode_wide().chain([0]).collect()
}

fn install() -> io::Result<()> {
    ssh_path()?;
    let source = env::current_exe()?;
    let target = PathBuf::from(
        env::var_os("LOCALAPPDATA")
            .ok_or_else(|| io::Error::other("Local AppData is unavailable."))?,
    )
    .join(r"Sourcery\AppDev")
    .join(CONNECTOR);
    fs::create_dir_all(target.parent().expect("connector has a parent"))?;
    if source != target {
        let bytes = fs::read(&source)?;
        if fs::read(&target).ok().as_deref() != Some(bytes.as_slice()) {
            let stage = target.with_extension(format!("{}.tmp", std::process::id()));
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&stage)?;
            use std::io::Write;
            let result = file.write_all(&bytes).and_then(|()| file.sync_all());
            drop(file);
            let result = result.and_then(|()| fs::rename(&stage, &target));
            if let Err(error) = result {
                let _ = fs::remove_file(&stage);
                return Err(io::Error::other(format!(
                    "Could not install the connector. Close any running connector window and retry. {error}"
                )));
            }
        }
    }
    // The handler starts a fixed command. The URI is never inserted into it.
    let mut command = wide("\"");
    command.pop();
    command.extend(target.as_os_str().encode_wide());
    command.extend(wide("\" --watch"));
    set_registry(PROTOCOL_KEY, "", &wide("URL:AppDev SSH Tunnels"))?;
    set_registry(&format!(r"{PROTOCOL_KEY}\shell\open\command"), "", &command)?;
    set_registry(PROTOCOL_KEY, "URL Protocol", &wide(""))
}

fn set_registry(path: &str, name: &str, value: &[u16]) -> io::Result<()> {
    let mut key: HKEY = null_mut();
    // This creates or opens a key owned by the current Windows user.
    let status = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            wide(path).as_ptr(),
            0,
            null(),
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            null(),
            &mut key,
            null_mut(),
        )
    };
    if status != 0 {
        return Err(io::Error::from_raw_os_error(status as i32));
    }
    // REG_SZ expects UTF-16 bytes including the terminating zero.
    let status = unsafe {
        let status = RegSetValueExW(
            key,
            wide(name).as_ptr(),
            0,
            REG_SZ,
            value.as_ptr().cast(),
            (value.len() * 2) as u32,
        );
        RegCloseKey(key);
        status
    };
    if status == 0 {
        Ok(())
    } else {
        Err(io::Error::from_raw_os_error(status as i32))
    }
}

fn ssh_path() -> io::Result<PathBuf> {
    let path = env::var_os("PATH").unwrap_or_default();
    env::split_paths(&path)
        .filter(|dir| dir.is_absolute())
        .map(|dir| dir.join("ssh.exe"))
        .find(|file| file.is_file())
        .ok_or_else(|| io::Error::other("Windows OpenSSH client was not found on PATH."))
}

fn ssh_arguments(ports: &[u16]) -> Vec<String> {
    let mut args: Vec<String> = [
        "-N",
        "-T",
        "-o",
        "ExitOnForwardFailure=yes",
        "-o",
        "ServerAliveInterval=30",
        "-o",
        "ControlPath=none",
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "IgnoreUnknown=ForkAfterAuthentication",
        "-o",
        "ForkAfterAuthentication=no",
        "-o",
        "ConnectTimeout=10",
    ]
    .into_iter()
    .map(str::to_owned)
    .collect();
    for port in ports {
        args.extend([
            "-L".to_owned(),
            format!("127.0.0.1:{port}:127.0.0.1:{port}"),
        ]);
    }
    args.push("aaron-dev".to_owned());
    args
}

unsafe extern "system" fn stop_handler(event: u32) -> i32 {
    if event == CTRL_C_EVENT || event == CTRL_BREAK_EVENT {
        STOPPING.store(true, Ordering::Relaxed);
        1
    } else {
        0
    }
}

struct Instance(HANDLE);
impl Drop for Instance {
    fn drop(&mut self) {
        // The mutex handle is owned by this process.
        unsafe { CloseHandle(self.0) };
    }
}

struct Connection {
    child: Child,
    ports: Vec<u16>,
}
impl Drop for Connection {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn watch() -> io::Result<()> {
    let ssh = ssh_path()?;
    // A named mutex prevents a second launch in the same Windows session.
    let mutex = unsafe {
        CreateMutexW(
            null(),
            0,
            wide(r"Local\SourceryAppDevTunnelConnector").as_ptr(),
        )
    };
    if mutex.is_null() {
        return Err(io::Error::last_os_error());
    }
    let _instance = Instance(mutex);
    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        println!("The Temple tunnel connector is already running.");
        return Ok(());
    }
    // The callback only updates an atomic flag. The foreground thread owns SSH.
    check(unsafe { SetConsoleCtrlHandler(Some(stop_handler), 1) })?;
    let mut connection: Option<Connection> = None;
    let mut last_ports = Vec::new();
    println!("Checking AppDev every 30 seconds. Keep this window open. Press Ctrl+C to stop.");
    while !STOPPING.load(Ordering::Relaxed) {
        match load_ports() {
            Ok(ports) => last_ports = ports,
            Err(error) => eprintln!("Could not refresh AppDev tunnels. {error}"),
        }
        if STOPPING.load(Ordering::Relaxed) {
            break;
        }
        if let Some(current) = &mut connection {
            if let Some(status) = current.child.try_wait()? {
                if !status.success() {
                    eprintln!("SSH exited. The connector will retry.");
                }
                connection = None;
            } else if current.ports != last_ports {
                connection = None;
            }
        }
        if connection.is_none() && !last_ports.is_empty() {
            println!("Opening AppDev SSH forwards on {:?}.", last_ports);
            match Command::new(&ssh)
                .args(ssh_arguments(&last_ports))
                .stdin(Stdio::null())
                .spawn()
            {
                Ok(child) => {
                    connection = Some(Connection {
                        child,
                        ports: last_ports.clone(),
                    })
                }
                Err(error) => eprintln!("Could not start OpenSSH. {error}"),
            }
        }
        for _ in 0..150 {
            if STOPPING.load(Ordering::Relaxed) {
                break;
            }
            thread::sleep(Duration::from_millis(200));
        }
    }
    Ok(())
}

fn check(result: i32) -> io::Result<()> {
    if result == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

struct Http(*mut core::ffi::c_void);
impl Http {
    fn new(handle: *mut core::ffi::c_void) -> io::Result<Self> {
        if handle.is_null() {
            Err(io::Error::last_os_error())
        } else {
            Ok(Self(handle))
        }
    }
}
impl Drop for Http {
    fn drop(&mut self) {
        // WinHTTP handles are closed in reverse creation order.
        unsafe { WinHttpCloseHandle(self.0) };
    }
}

fn load_ports() -> io::Result<Vec<u16>> {
    // WinHTTP validates TLS using the Windows trust store. The host and request
    // path are fixed, redirects are disabled, and the response is bounded.
    let html = unsafe {
        let session = Http::new(WinHttpOpen(
            wide("AppDev Temple Connector/1").as_ptr(),
            WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
            null(),
            null(),
            0,
        ))?;
        check(WinHttpSetTimeouts(
            session.0, 10_000, 10_000, 10_000, 10_000,
        ))?;
        let server = Http::new(WinHttpConnect(
            session.0,
            wide(APPDEV_HOST).as_ptr(),
            443,
            0,
        ))?;
        let request = Http::new(WinHttpOpenRequest(
            server.0,
            wide("GET").as_ptr(),
            wide("/").as_ptr(),
            null(),
            null(),
            null(),
            WINHTTP_FLAG_SECURE,
        ))?;
        let mut redirects = WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
        check(WinHttpSetOption(
            request.0,
            WINHTTP_OPTION_REDIRECT_POLICY,
            (&mut redirects as *mut u32).cast(),
            4,
        ))?;
        check(WinHttpSendRequest(request.0, null(), 0, null(), 0, 0, 0))?;
        check(WinHttpReceiveResponse(request.0, null_mut()))?;
        let mut status = 0u32;
        let mut length = 4;
        check(WinHttpQueryHeaders(
            request.0,
            WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
            null(),
            (&mut status as *mut u32).cast(),
            &mut length,
            null_mut(),
        ))?;
        if status != 200 {
            return Err(io::Error::other(format!("AppDev returned HTTP {status}.")));
        }
        let mut html = Vec::new();
        let mut buffer = [0u8; 8192];
        loop {
            let mut read = 0;
            check(WinHttpReadData(
                request.0,
                buffer.as_mut_ptr().cast(),
                buffer.len() as u32,
                &mut read,
            ))?;
            if read == 0 {
                break;
            }
            if html.len() + read as usize > MAX_HOMEPAGE {
                return Err(io::Error::other(
                    "The AppDev homepage exceeded the download limit.",
                ));
            }
            html.extend_from_slice(&buffer[..read as usize]);
        }
        html
    };
    let html = std::str::from_utf8(&html).map_err(io::Error::other)?;
    super::tunnel_ports(html).map_err(io::Error::other)
}
