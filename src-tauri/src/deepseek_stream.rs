//! Bounded SSE accumulator shared by the native transport and protocol tests.
use serde_json::{json, Value};
#[derive(Default)]
pub struct Stream {
    carry: Vec<u8>,
    bytes: usize,
    text: String,
    model: Option<String>,
    usage: Value,
    done: bool,
}
impl Stream {
    pub fn push(&mut self, chunk: &[u8]) -> Result<Vec<String>, String> {
        self.bytes += chunk.len();
        if self.bytes > 2_000_000 {
            return Err("DeepSeek stream exceeded the safe response bound".into());
        }
        self.carry.extend_from_slice(chunk);
        let mut deltas = vec![];
        while let Some(end) = self.carry.iter().position(|b| *b == b'\n') {
            let line = self.carry.drain(..=end).collect::<Vec<_>>();
            let line = std::str::from_utf8(&line)
                .map_err(|_| "Invalid stream UTF-8")?
                .trim();
            let Some(data) = line.strip_prefix("data:").map(str::trim) else {
                continue;
            };
            if data == "[DONE]" {
                self.done = true;
                continue;
            }
            let v: Value = serde_json::from_str(data).map_err(|_| "Invalid DeepSeek SSE event")?;
            if !v["error"].is_null() {
                return Err("DeepSeek stream reported an error; budget reservation retained".into());
            }
            if let Some(m) = v["model"].as_str() {
                self.model = Some(m.into())
            }
            if !v["usage"].is_null() {
                self.usage = v["usage"].clone()
            }
            if let Some(delta) = v["choices"][0]["delta"]["content"].as_str() {
                self.text.push_str(delta);
                deltas.push(delta.into());
            }
        }
        Ok(deltas)
    }
    pub fn finish(self) -> Result<Value, String> {
        if !self.done || self.text.is_empty() {
            return Err("DeepSeek stream incomplete; no completed proposal accepted and reservation retained".into());
        }
        Ok(
            json!({"text":self.text,"observedModel":self.model,"usage":self.usage,"reservationRetained":true}),
        )
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mocked_stream_handles_split_utf8_usage_and_done() {
        let mut s = Stream::default();
        let bytes="data: {\"model\":\"deepseek-flash\",\"choices\":[{\"delta\":{\"content\":\"Ready ✓\"}}]}\n\ndata: {\"choices\":[{\"delta\":{}}],\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":3}}\n\ndata: [DONE]\n".as_bytes();
        for part in bytes.chunks(3) {
            s.push(part).unwrap();
        }
        let v = s.finish().unwrap();
        assert_eq!(v["text"], "Ready ✓");
        assert_eq!(v["usage"]["prompt_tokens"], 12);
        assert_eq!(v["observedModel"], "deepseek-flash");
    }
    #[test]
    fn rejects_truncated_error_and_oversized_streams() {
        let mut s = Stream::default();
        s.push(b"data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n")
            .unwrap();
        assert!(s.finish().is_err());
        assert!(Stream::default().push(&vec![b'x'; 2_000_001]).is_err());
        assert!(Stream::default()
            .push(b"data: {\"error\":{\"message\":\"secret\"}}\n")
            .unwrap_err()
            .find("secret")
            .is_none());
    }
}
