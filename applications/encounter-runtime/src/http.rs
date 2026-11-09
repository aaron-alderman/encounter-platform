// Loopback HTTP transport for the bounded browser profile.
use crate::{Result, fail};
use std::{
    collections::BTreeMap,
    io::{self, BufRead, BufReader, Read, Write},
    net::{Ipv4Addr, TcpListener, TcpStream},
    sync::{Arc, atomic::{AtomicBool, Ordering}},
    thread,
    time::Duration,
};

pub struct Request {
    pub method: String,
    pub path: String,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
}

const HEADER_LIMIT: u64 = 8192;
const BODY_LIMIT: usize = 16384;
static SIGNAL_STOP: AtomicBool = AtomicBool::new(false);

extern "C" fn request_stop(_: libc::c_int) {
    SIGNAL_STOP.store(true, Ordering::Release);
}

fn install_stop_signals() -> io::Result<()> {
    // The handler only stores a lock-free flag. The main loop drains the
    // current request before dropping the store and listener.
    unsafe {
        let mut action: libc::sigaction = std::mem::zeroed();
        action.sa_sigaction = request_stop as *const () as usize;
        libc::sigemptyset(&mut action.sa_mask);
        for signal in [libc::SIGTERM, libc::SIGINT] {
            if libc::sigaction(signal, &action, std::ptr::null_mut()) != 0 {
                return Err(io::Error::last_os_error());
            }
        }
    }
    Ok(())
}

fn line(reader: &mut impl BufRead, remaining: &mut u64) -> Result<String> {
    let mut bytes = Vec::new();
    let read = reader.take(*remaining).read_until(b'\n', &mut bytes)? as u64;
    *remaining -= read;
    if !bytes.ends_with(b"\r\n") {
        return Err(fail("invalid or oversized HTTP header"));
    }
    bytes.truncate(bytes.len() - 2);
    Ok(String::from_utf8(bytes)?)
}

pub fn read(stream: &mut TcpStream) -> Result<Request> {
    stream.set_read_timeout(Some(Duration::from_secs(3)))?;
    stream.set_write_timeout(Some(Duration::from_secs(3)))?;
    let mut reader = BufReader::new(stream);
    let mut remaining = HEADER_LIMIT;
    let start = line(&mut reader, &mut remaining)?;
    let (method, path) = match start.split(' ').collect::<Vec<_>>().as_slice() {
        [method, path, "HTTP/1.1"] => (method.to_string(), path.to_string()),
        _ => return Err(fail("invalid HTTP request line")),
    };
    let mut headers = BTreeMap::new();
    loop {
        let header = line(&mut reader, &mut remaining)?;
        if header.is_empty() {
            break;
        }
        let (key, value) = header.split_once(':').ok_or_else(|| fail("invalid HTTP header"))?;
        if key.is_empty() || !key.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-') {
            return Err(fail("invalid HTTP header name"));
        }
        let key = key.to_ascii_lowercase();
        if headers.insert(key, value.trim().to_string()).is_some() {
            return Err(fail("duplicate HTTP header"));
        }
    }
    if headers.contains_key("transfer-encoding") || headers.contains_key("expect") {
        return Err(fail("unsupported HTTP framing"));
    }
    let length = match headers.get("content-length") {
        Some(value) if !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit()) => value.parse()?,
        Some(_) => return Err(fail("invalid HTTP content length")),
        None => 0,
    };
    if length > BODY_LIMIT || (method != "POST" && length != 0) {
        return Err(fail("unsupported HTTP body length"));
    }
    let mut body = vec![0; length];
    reader.read_exact(&mut body)?;
    Ok(Request { method, path, headers, body })
}

fn decode(input: &[u8]) -> Result<String> {
    let mut decoded = Vec::with_capacity(input.len());
    let mut input = input.iter();
    while let Some(&byte) = input.next() {
        decoded.push(match byte {
            b'+' => b' ',
            b'%' => {
                let hi = input.next().and_then(|&b| char::from(b).to_digit(16));
                let lo = input.next().and_then(|&b| char::from(b).to_digit(16));
                match (hi, lo) {
                    (Some(hi), Some(lo)) => (hi * 16 + lo) as u8,
                    _ => return Err(fail("invalid percent escape")),
                }
            }
            _ => byte,
        });
    }
    Ok(String::from_utf8(decoded)?)
}

pub fn form(body: &[u8]) -> Result<BTreeMap<String, String>> {
    let mut fields = BTreeMap::new();
    if body.is_empty() { return Ok(fields); }
    for pair in body.split(|&byte| byte == b'&') {
        let equals = pair.iter().position(|&byte| byte == b'=').ok_or_else(|| fail("invalid form field"))?;
        let key = decode(&pair[..equals])?;
        let value = decode(&pair[equals + 1..])?;
        if fields.insert(key, value).is_some() {
            return Err(fail("duplicate form field"));
        }
    }
    Ok(fields)
}

pub fn send(stream: &mut TcpStream, status: &str, content_type: &str, body: &str) -> Result<()> {
    send_headers(stream, status, content_type, "", body)
}

pub fn send_headers(stream: &mut TcpStream, status: &str, content_type: &str, headers: &str, body: &str) -> Result<()> {
    send_bytes(stream, status, &format!("{content_type}; charset=utf-8"), headers, body.as_bytes())
}

pub fn send_bytes(stream: &mut TcpStream, status: &str, content_type: &str, headers: &str, body: &[u8]) -> Result<()> {
    write!(stream, "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n\
        Connection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\
        Content-Security-Policy: default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'\r\n{headers}\r\n", body.len())?;
    stream.write_all(body)?;
    Ok(())
}

pub fn serve(port: u16, handle: impl Fn(&str, &mut TcpStream, Request) -> Result<()>) -> Result<()> {
    install_stop_signals()?;
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, port))?;
    listener.set_nonblocking(true)?;
    let address = listener.local_addr()?;
    let closing = Arc::new(AtomicBool::new(false));
    let requested = Arc::clone(&closing);
    thread::spawn(move || {
        for line in io::stdin().lock().lines().map_while(std::result::Result::ok) {
            if line.trim() == "close" {
                requested.store(true, Ordering::Release);
                break;
            }
        }
    });
    let host = address.to_string();
    let origin = format!("http://{host}");
    println!("Encounter {origin}");
    io::stdout().flush()?;

    while !closing.load(Ordering::Acquire) && !SIGNAL_STOP.load(Ordering::Acquire) {
        let mut stream = match listener.accept() {
            Ok((stream, _)) => stream,
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(20));
                continue;
            }
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error.into()),
        };
        stream.set_nonblocking(false)?;
        let result = match read(&mut stream) {
            Ok(request) if request.headers.get("host") == Some(&host) => handle(&origin, &mut stream, request),
            Ok(_) => send(&mut stream, "403 Forbidden", "text/plain", "Wrong host."),
            Err(_) => send(&mut stream, "400 Bad Request", "text/plain", "Invalid request."),
        };
        if let Err(error) = result {
            eprintln!("{error}");
            let _ = send(&mut stream, "500 Internal Server Error", "text/plain", "Unable to load this view. Reopen the page and try again.");
        }
    }
    Ok(())
}
