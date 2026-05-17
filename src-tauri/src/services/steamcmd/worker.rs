//! SteamCMD worker: drives a steamcmd process, parses output, emits events.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `worker::Worker`, `worker::JobSender`, `worker::Process`.
//!
//! Uses native `async fn in trait` (stable in edition 2024 / rustc 1.95) —
//! intentionally NOT `async-trait` (not a dependency).

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::mpsc;

use crate::error::{Error, Result};
use crate::events::{self, Emitter};
use crate::services::steamcmd::{job, parser};

/// Channel half callers use to submit jobs to the worker.
pub type JobSender = mpsc::Sender<job::Job>;
/// Receiving half the worker loop drains.
pub type JobReceiver = mpsc::Receiver<job::Job>;

/// An abstract steamcmd-like child process the worker can drive.
///
/// Real implementation: [`ChildProcess`]. Test implementation: `MockProcess`.
//
// `async fn in trait` is deliberate: the brief mandates native async-fn-in-
// trait (stable in edition 2024 / rustc 1.95) and explicitly forbids the
// `async-trait` crate. This trait is only consumed internally by the generic
// `Worker<P: Process>`; we never need to name its futures or add auto-trait
// bounds across an API boundary, so the `async_fn_in_trait` lint is moot.
#[allow(async_fn_in_trait)]
pub trait Process: Send {
    /// Spawn / start the underlying process.
    async fn start(&mut self) -> Result<()>;
    /// Write a command line (a newline is appended) to the process stdin.
    async fn send_line(&mut self, line: &str) -> Result<()>;
    /// Read the next stdout line. `Ok(None)` means EOF (process gone).
    async fn read_line(&mut self) -> Result<Option<String>>;
    /// Forcibly terminate the process.
    async fn kill(&mut self) -> Result<()>;
}

/// A real steamcmd child process driven via `tokio::process`.
///
/// For the bootstrap, spawning is best-effort: this must **compile** and is
/// exercised only when a real steamcmd binary path is configured.
pub struct ChildProcess {
    /// Absolute path to the `steamcmd` executable.
    exe: std::path::PathBuf,
    /// Spawned child, once started.
    child: Option<Child>,
    /// Buffered stdout reader.
    stdout: Option<BufReader<ChildStdout>>,
    /// Child stdin handle.
    stdin: Option<ChildStdin>,
}

impl ChildProcess {
    /// Create (not yet spawned) a child process wrapper for `exe`.
    pub fn new(exe: impl Into<std::path::PathBuf>) -> Self {
        Self {
            exe: exe.into(),
            child: None,
            stdout: None,
            stdin: None,
        }
    }
}

impl Process for ChildProcess {
    async fn start(&mut self) -> Result<()> {
        let mut child = Command::new(&self.exe)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| Error::Steamcmd(format!("failed to spawn steamcmd: {e}")))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| Error::Steamcmd("no stdout pipe".into()))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| Error::Steamcmd("no stdin pipe".into()))?;
        self.stdout = Some(BufReader::new(stdout));
        self.stdin = Some(stdin);
        self.child = Some(child);
        Ok(())
    }

    async fn send_line(&mut self, line: &str) -> Result<()> {
        let stdin = self
            .stdin
            .as_mut()
            .ok_or_else(|| Error::Steamcmd("process not started".into()))?;
        stdin.write_all(line.as_bytes()).await?;
        stdin.write_all(b"\n").await?;
        stdin.flush().await?;
        Ok(())
    }

    async fn read_line(&mut self) -> Result<Option<String>> {
        let stdout = self
            .stdout
            .as_mut()
            .ok_or_else(|| Error::Steamcmd("process not started".into()))?;
        let mut buf = String::new();
        let n = stdout.read_line(&mut buf).await?;
        if n == 0 {
            return Ok(None);
        }
        Ok(Some(buf.trim_end().to_string()))
    }

    async fn kill(&mut self) -> Result<()> {
        if let Some(child) = self.child.as_mut() {
            let _ = child.kill().await;
        }
        self.child = None;
        self.stdout = None;
        self.stdin = None;
        Ok(())
    }
}

/// The SteamCMD worker. Owns the job receiver, a [`Process`], and an
/// [`Emitter`]; runs an async loop translating jobs into emitted events.
pub struct Worker<P: Process, E: Emitter> {
    /// The driven process.
    process: P,
    /// Where IPC events go.
    emitter: E,
}

impl<P: Process, E: Emitter> Worker<P, E> {
    /// Build a worker around `process` and `emitter`.
    pub fn new(process: P, emitter: E) -> Self {
        Self { process, emitter }
    }

    /// Run the worker loop until a [`job::Job::Shutdown`] is received or the
    /// job channel closes.
    pub async fn run(mut self, mut jobs: JobReceiver) {
        while let Some(job) = jobs.recv().await {
            if matches!(job, job::Job::Shutdown) {
                let _ = self.process.kill().await;
                break;
            }
            // One retry: if the process dies mid-job, restart + re-run once.
            let mut attempt = 0u8;
            loop {
                attempt += 1;
                match self.run_job(&job).await {
                    Ok(()) => break,
                    Err(e) if attempt == 1 => {
                        tracing::warn!(
                            "steamcmd job {} failed (attempt 1), restarting: {e}",
                            job.correlation_id()
                        );
                        let _ = self.process.kill().await;
                        continue;
                    }
                    Err(e) => {
                        tracing::error!(
                            "steamcmd job {} failed terminally: {e}",
                            job.correlation_id()
                        );
                        self.emitter.emit(events::Event::JobFailed {
                            job_id: job.correlation_id(),
                            error: e.to_string(),
                        });
                        break;
                    }
                }
            }
        }
    }

    /// Drive a single job to completion, emitting progress/terminal events.
    async fn run_job(&mut self, job: &job::Job) -> Result<()> {
        let workshop_id = match job {
            job::Job::DownloadMod { workshop_id } | job::Job::VerifyMod { workshop_id } => {
                *workshop_id
            }
            job::Job::Shutdown => return Ok(()),
        };
        let job_id = job.correlation_id();

        self.process.start().await?;
        // Drive a one-shot download script then quit.
        self.process
            .send_line(&format!(
                "workshop_download_item 108600 {workshop_id} validate"
            ))
            .await?;
        self.process.send_line("quit").await?;

        loop {
            let line = match self.process.read_line().await {
                Ok(Some(l)) => l,
                Ok(None) => {
                    return Err(Error::Steamcmd(format!(
                        "steamcmd exited before completing job {job_id}"
                    )));
                }
                Err(e) => return Err(e),
            };
            let Some(ev) = parser::parse_line(&line) else {
                continue;
            };
            match ev {
                parser::Event::LoginFailed { reason } => {
                    return Err(Error::Steamcmd(format!("login failed: {reason}")));
                }
                parser::Event::DownloadProgress { percent, .. } => {
                    self.emitter.emit(events::Event::SteamcmdProgress {
                        job_id: job_id.clone(),
                        stage: "downloading".to_string(),
                        percent,
                    });
                }
                parser::Event::DownloadStarted { .. } => {
                    self.emitter.emit(events::Event::SteamcmdProgress {
                        job_id: job_id.clone(),
                        stage: "started".to_string(),
                        percent: 0,
                    });
                }
                parser::Event::DownloadSuccess { .. } => {
                    self.emitter.emit(events::Event::SteamcmdProgress {
                        job_id: job_id.clone(),
                        stage: "complete".to_string(),
                        percent: 100,
                    });
                    return Ok(());
                }
                parser::Event::DownloadFailed { error, .. } => {
                    return Err(Error::Steamcmd(format!("download failed: {error}")));
                }
                parser::Event::Quit => {
                    // Process said goodbye without a success line → failure.
                    return Err(Error::Steamcmd(format!(
                        "steamcmd quit before job {job_id} completed"
                    )));
                }
                parser::Event::LoginOk | parser::Event::Ready => {}
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    /// A scripted process: pops queued lines, optionally simulating one crash
    /// (EOF) before replaying its script.
    struct MockProcess {
        scripts: Vec<Vec<String>>,
        attempt: usize,
        cursor: usize,
        started: bool,
    }

    impl MockProcess {
        fn new(scripts: Vec<Vec<String>>) -> Self {
            Self {
                scripts,
                attempt: 0,
                cursor: 0,
                started: false,
            }
        }
    }

    impl Process for MockProcess {
        async fn start(&mut self) -> Result<()> {
            self.started = true;
            self.cursor = 0;
            self.attempt += 1;
            Ok(())
        }
        async fn send_line(&mut self, _line: &str) -> Result<()> {
            Ok(())
        }
        async fn read_line(&mut self) -> Result<Option<String>> {
            let idx = (self.attempt - 1).min(self.scripts.len() - 1);
            let script = &self.scripts[idx];
            if self.cursor >= script.len() {
                return Ok(None);
            }
            let line = script[self.cursor].clone();
            self.cursor += 1;
            Ok(Some(line))
        }
        async fn kill(&mut self) -> Result<()> {
            self.started = false;
            Ok(())
        }
    }

    #[derive(Clone, Default)]
    struct CaptureEmitter {
        events: Arc<Mutex<Vec<events::Event>>>,
    }

    impl Emitter for CaptureEmitter {
        fn emit(&self, event: events::Event) {
            self.events.lock().expect("lock").push(event);
        }
    }

    #[tokio::test]
    async fn download_job_emits_started_progress_complete() {
        let script = vec![
            "Loading Steam API...OK".to_string(),
            "Logged in OK".to_string(),
            "Downloading item 12345 ...".to_string(),
            " Update state (0x61) downloading, progress: 50.00 (1 / 2)".to_string(),
            "Success. Downloaded item 12345 to \"C:\\x\" (1 bytes)".to_string(),
        ];
        let proc = MockProcess::new(vec![script]);
        let emitter = CaptureEmitter::default();
        let worker = Worker::new(proc, emitter.clone());

        let (tx, rx) = mpsc::channel(4);
        tx.send(job::Job::DownloadMod { workshop_id: 12345 })
            .await
            .expect("send");
        tx.send(job::Job::Shutdown).await.expect("send shutdown");
        drop(tx);
        worker.run(rx).await;

        let evs = emitter.events.lock().expect("lock").clone();
        let stages: Vec<String> = evs
            .iter()
            .filter_map(|e| match e {
                events::Event::SteamcmdProgress { stage, .. } => Some(stage.clone()),
                _ => None,
            })
            .collect();
        assert_eq!(stages, vec!["started", "downloading", "complete"]);
    }

    #[tokio::test]
    async fn crash_then_recover_succeeds_on_retry() {
        // Attempt 1: process dies after login (EOF). Attempt 2: full success.
        let crash = vec!["Logged in OK".to_string()];
        let ok = vec![
            "Logged in OK".to_string(),
            "Downloading item 7 ...".to_string(),
            "Success. Downloaded item 7 to \"C:\\y\" (1 bytes)".to_string(),
        ];
        let proc = MockProcess::new(vec![crash, ok]);
        let emitter = CaptureEmitter::default();
        let worker = Worker::new(proc, emitter.clone());

        let (tx, rx) = mpsc::channel(4);
        tx.send(job::Job::DownloadMod { workshop_id: 7 })
            .await
            .expect("send");
        tx.send(job::Job::Shutdown).await.expect("send");
        drop(tx);
        worker.run(rx).await;

        let evs = emitter.events.lock().expect("lock").clone();
        assert!(
            evs.iter()
                .any(|e| matches!(e, events::Event::SteamcmdProgress { stage, .. } if stage == "complete")),
            "expected a complete event after retry, got {evs:?}"
        );
        assert!(
            !evs.iter()
                .any(|e| matches!(e, events::Event::JobFailed { .. })),
            "should not have failed terminally"
        );
    }

    #[tokio::test]
    async fn second_failure_emits_job_failed() {
        let crash = vec!["Logged in OK".to_string()];
        let proc = MockProcess::new(vec![crash.clone(), crash]);
        let emitter = CaptureEmitter::default();
        let worker = Worker::new(proc, emitter.clone());

        let (tx, rx) = mpsc::channel(4);
        tx.send(job::Job::DownloadMod { workshop_id: 9 })
            .await
            .expect("send");
        tx.send(job::Job::Shutdown).await.expect("send");
        drop(tx);
        worker.run(rx).await;

        let evs = emitter.events.lock().expect("lock").clone();
        assert!(
            evs.iter()
                .any(|e| matches!(e, events::Event::JobFailed { .. })),
            "expected JobFailed after two failures, got {evs:?}"
        );
    }
}
