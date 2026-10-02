use serde_json::{json, Value};
use std::io::{self, Write};

pub const PARSE_ERROR: i64 = -32700;
pub const INVALID_REQUEST: i64 = -32600;
pub const METHOD_NOT_FOUND: i64 = -32601;

/// One stdout record. Responses answer a request. Notifications have no id
/// and are forwarded to JavaScript as events.
#[derive(Debug, PartialEq)]
pub enum Outbound {
    Response(Value),
    Notification(Value),
}

pub fn handle_line(line: &str) -> Outbound {
    let value: Value = match serde_json::from_str(line) {
        Ok(value) => value,
        Err(_) => {
            return Outbound::Response(error_body(Value::Null, PARSE_ERROR, "Parse error"));
        }
    };

    let Some(object) = value.as_object() else {
        return Outbound::Response(error_body(Value::Null, INVALID_REQUEST, "Invalid request"));
    };

    if object.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
        let id = object.get("id").cloned().unwrap_or(Value::Null);
        return Outbound::Response(error_body(id, INVALID_REQUEST, "Invalid request"));
    }

    let id = match object.get("id") {
        Some(id) if id.is_number() || id.is_string() => id.clone(),
        Some(_) => {
            return Outbound::Response(error_body(
                Value::Null,
                INVALID_REQUEST,
                "Invalid request",
            ));
        }
        None => {
            return Outbound::Notification(json!({
                "jsonrpc": "2.0",
                "method": "ignored",
                "params": value,
            }));
        }
    };

    let Some(method) = object.get("method").and_then(Value::as_str) else {
        return Outbound::Response(error_body(id, INVALID_REQUEST, "Invalid request"));
    };

    let params = object.get("params").cloned().unwrap_or(Value::Null);
    match dispatch(method, params) {
        Ok(result) => Outbound::Response(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": result,
        })),
        Err(RpcError { code, message }) => {
            Outbound::Response(error_body(id, code, &message))
        }
    }
}

struct RpcError {
    code: i64,
    message: String,
}

fn dispatch(method: &str, params: Value) -> Result<Value, RpcError> {
    match method {
        "ping" => Ok(json!({ "pong": true })),
        "echo" => Ok(params),
        _ => Err(RpcError {
            code: METHOD_NOT_FOUND,
            message: "Method not found".to_string(),
        }),
    }
}

fn error_body(id: Value, code: i64, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message,
        }
    })
}

/// Write one JSON value and flush. Pipes are block-buffered, so a missing
/// flush leaves the UI waiting on a line that never arrives.
pub fn write_message<W: Write>(writer: &mut W, value: &Value) -> io::Result<()> {
    serde_json::to_writer(&mut *writer, value)?;
    writer.write_all(b"\n")?;
    writer.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{self, Write};

    struct FlushProbe {
        buf: Vec<u8>,
        flushes: usize,
    }

    impl Write for FlushProbe {
        fn write(&mut self, data: &[u8]) -> io::Result<usize> {
            self.buf.extend_from_slice(data);
            Ok(data.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            self.flushes += 1;
            Ok(())
        }
    }

    #[test]
    fn ping_returns_pong() {
        let outbound = handle_line(r#"{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}"#);
        assert_eq!(
            outbound,
            Outbound::Response(json!({
                "jsonrpc": "2.0",
                "id": 1,
                "result": { "pong": true }
            }))
        );
    }

    #[test]
    fn echo_returns_params() {
        let outbound =
            handle_line(r#"{"jsonrpc":"2.0","id":2,"method":"echo","params":{"text":"hi"}}"#);
        assert_eq!(
            outbound,
            Outbound::Response(json!({
                "jsonrpc": "2.0",
                "id": 2,
                "result": { "text": "hi" }
            }))
        );
    }

    #[test]
    fn unknown_method_is_not_found() {
        let outbound = handle_line(r#"{"jsonrpc":"2.0","id":3,"method":"nope","params":{}}"#);
        assert_eq!(
            outbound,
            Outbound::Response(json!({
                "jsonrpc": "2.0",
                "id": 3,
                "error": { "code": METHOD_NOT_FOUND, "message": "Method not found" }
            }))
        );
    }

    #[test]
    fn invalid_json_is_parse_error() {
        let outbound = handle_line("not-json");
        match outbound {
            Outbound::Response(value) => {
                assert_eq!(value["error"]["code"], PARSE_ERROR);
                assert!(value["id"].is_null());
            }
            Outbound::Notification(_) => panic!("parse errors are responses"),
        }
    }

    #[test]
    fn line_without_id_is_a_notification() {
        let outbound = handle_line(r#"{"jsonrpc":"2.0","method":"log","params":{"text":"hi"}}"#);
        assert!(matches!(outbound, Outbound::Notification(_)));
    }

    #[test]
    fn each_message_is_flushed() {
        let mut probe = FlushProbe {
            buf: Vec::new(),
            flushes: 0,
        };
        write_message(&mut probe, &json!({"id": 1})).unwrap();
        write_message(&mut probe, &json!({"id": 2})).unwrap();
        let text = String::from_utf8(probe.buf).unwrap();
        let lines: Vec<_> = text.lines().collect();
        assert_eq!(lines.len(), 2);
        assert_eq!(probe.flushes, 2);
        assert!(text.ends_with('\n'));
    }
}
