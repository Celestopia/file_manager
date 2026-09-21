use std::path::PathBuf;

#[derive(Clone)]
pub struct StartupOptions {
    pub vault: Option<PathBuf>,
    pub smoke: bool,
    pub inspect: bool,
    pub handoff: Option<crate::handoff::Endpoint>,
}
impl StartupOptions {
    pub fn parse() -> Self {
        let args: Vec<_> = std::env::args().collect();
        Self {
            handoff: crate::handoff::Endpoint::from_environment(),
            vault: args
                .iter()
                .position(|a| a == "--vault")
                .and_then(|i| args.get(i + 1))
                .map(PathBuf::from),
            smoke: args.iter().any(|a| a == "--smoke"),
            inspect: args.iter().any(|a| a == "--inspect-smoke"),
        }
    }
}
