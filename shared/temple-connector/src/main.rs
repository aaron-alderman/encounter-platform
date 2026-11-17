#[cfg(windows)]
mod windows;

#[cfg(any(windows, test))]
fn tunnel_ports(html: &str) -> Result<Vec<u16>, &'static str> {
    const MARKER: &str = r#"<meta name="appdev-ssh-ports-v1" content=""#;

    let head = html
        .split_once("<head>")
        .and_then(|(_, rest)| rest.split_once("</head>"))
        .map(|(head, _)| head)
        .ok_or("AppDev did not publish one tunnel list.")?;
    let (_, value) = head
        .split_once(MARKER)
        .filter(|(_, rest)| !rest.contains(MARKER))
        .ok_or("AppDev did not publish one tunnel list.")?;
    let (value, _) = value
        .split_once(r#"">"#)
        .ok_or("AppDev published an invalid tunnel list.")?;
    let mut ports = Vec::new();
    for port in value.split(',') {
        if ports.len() == 16
            || !(4..=5).contains(&port.len())
            || !port.bytes().all(|c| c.is_ascii_digit())
        {
            return Err("AppDev published an invalid tunnel list.");
        }
        let port = port
            .parse::<u16>()
            .ok()
            .filter(|port| *port >= 1024 && !ports.contains(port))
            .ok_or("AppDev published an invalid tunnel port.")?;
        ports.push(port);
    }
    ports.sort_unstable();
    Ok(ports)
}

fn main() -> std::process::ExitCode {
    #[cfg(windows)]
    {
        windows::run()
    }
    #[cfg(not(windows))]
    {
        eprintln!("The AppDev Temple connector runs on Windows.");
        std::process::ExitCode::FAILURE
    }
}

#[cfg(test)]
mod tests {
    use super::tunnel_ports;

    fn page(ports: &str) -> String {
        format!(r#"<html><head><meta name="appdev-ssh-ports-v1" content="{ports}"></head></html>"#)
    }

    #[test]
    fn accepts_and_sorts_the_published_ports() {
        assert_eq!(tunnel_ports(&page("24245,24220")), Ok(vec![24220, 24245]));
        assert_eq!(tunnel_ports(&page("1024,65535")), Ok(vec![1024, 65535]));
    }

    #[test]
    fn rejects_unsafe_or_ambiguous_tunnel_lists() {
        for ports in [
            "",
            "1023",
            "65536",
            "24220,24220",
            "24220,host:24245",
            "24220, 24245",
        ] {
            assert!(tunnel_ports(&page(ports)).is_err(), "{ports}");
        }
        assert!(
            tunnel_ports(
                r#"<html><head></head><meta name="appdev-ssh-ports-v1" content="24220"></html>"#
            )
            .is_err()
        );
        assert!(tunnel_ports(r#"<head><meta name="appdev-ssh-ports-v1" content="24220"><meta name="appdev-ssh-ports-v1" content="24245"></head>"#).is_err());
    }
}
