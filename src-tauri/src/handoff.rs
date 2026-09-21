use anyhow::{Result, bail, ensure};
use serde::{Deserialize, Serialize};
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    process::{Child, Command},
    time::{Duration, Instant},
};

const ENV: &str = "FILE_MANAGER_HANDOFF";
#[derive(Clone, Serialize, Deserialize)]
pub struct Endpoint {
    address: SocketAddr,
    token: String,
}
#[derive(Serialize, Deserialize)]
struct Readiness {
    token: String,
    error: Option<String>,
}
impl Endpoint {
    pub fn from_environment() -> Option<Self> {
        std::env::var(ENV)
            .ok()
            .and_then(|value| serde_json::from_str(&value).ok())
    }
    pub fn notify(&self, error: Option<String>) -> Result<()> {
        ensure!(self.address.ip().is_loopback(), "Invalid handoff endpoint");
        let mut stream = TcpStream::connect_timeout(&self.address, Duration::from_secs(2))?;
        stream.set_write_timeout(Some(Duration::from_secs(2)))?;
        stream.write_all(&serde_json::to_vec(&Readiness {
            token: self.token.clone(),
            error,
        })?)?;
        Ok(())
    }
}

fn wait_ready(
    listener: &TcpListener,
    token: &str,
    timeout: Duration,
    mut exited: impl FnMut() -> Result<bool>,
) -> Result<()> {
    listener.set_nonblocking(true)?;
    let deadline = Instant::now() + timeout;
    loop {
        match listener.accept() {
            Ok((stream, _)) => {
                stream.set_read_timeout(Some(Duration::from_secs(2)))?;
                let mut bytes = Vec::new();
                stream.take(64 * 1024).read_to_end(&mut bytes)?;
                let reply: Readiness = serde_json::from_slice(&bytes)?;
                ensure!(reply.token == token, "Invalid handoff acknowledgement");
                if let Some(error) = reply.error {
                    bail!("Could not open folder: {error}");
                }
                return Ok(());
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(error) => return Err(error.into()),
        }
        ensure!(
            !exited()?,
            "Opening the folder was cancelled or the replacement window exited"
        );
        ensure!(
            Instant::now() < deadline,
            "The replacement window did not become ready; this window remains open"
        );
        std::thread::sleep(Duration::from_millis(50));
    }
}

pub fn open(path: &str) -> Result<()> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let endpoint = Endpoint {
        address: listener.local_addr()?,
        token: crate::model::id(),
    };
    let mut child: Child = Command::new(std::env::current_exe()?)
        .args(["--vault", path])
        .env(ENV, serde_json::to_string(&endpoint)?)
        .spawn()?;
    wait_ready(&listener, &endpoint.token, Duration::from_secs(120), || {
        Ok(child.try_wait()?.is_some())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replacement_must_acknowledge_readiness() {
        for error in [None, Some("Invalid vault".to_string())] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let endpoint = Endpoint {
                address: listener.local_addr().unwrap(),
                token: "test".into(),
            };
            let success = error.is_none();
            let sender = std::thread::spawn(move || endpoint.notify(error).unwrap());
            assert_eq!(
                wait_ready(&listener, "test", Duration::from_secs(2), || Ok(false)).is_ok(),
                success
            );
            sender.join().unwrap();
        }
    }
    #[test]
    fn cancelled_or_unresponsive_child_does_not_authorize_exit() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        assert!(wait_ready(&listener, "test", Duration::from_secs(2), || Ok(true)).is_err());
        assert!(wait_ready(&listener, "test", Duration::ZERO, || Ok(false)).is_err());
    }
}
