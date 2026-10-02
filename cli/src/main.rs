mod protocol;

use protocol::{handle_line, write_message, Outbound};
use std::io::{self, BufRead, Write};

fn main() -> io::Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let mut stderr = io::stderr();

    write_message(
        &mut stdout,
        &serde_json::json!({
            "jsonrpc": "2.0",
            "method": "ready",
            "params": {}
        }),
    )?;

    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }

        match handle_line(&line) {
            Outbound::Response(value) => write_message(&mut stdout, &value)?,
            Outbound::Notification(_) => {
                let _ = writeln!(
                    stderr,
                    "ignored inbound notification; the CLI only answers requests"
                );
            }
        }
    }

    Ok(())
}
