/* ==========================================================================
   Shared helpers: RFC 6455 framing, SHA-1/Base64 (handshake), a small strict
   JSON parser (for validating untrusted ranked input), JSON escaping, clock.
   Zero dependencies, like the rest of the server.
   ========================================================================== */

use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/* ---------------- WebSocket framing ---------------- */

pub fn encode_frame(op: u8, payload: &[u8]) -> Vec<u8> {
    let len = payload.len();
    let mut out = Vec::with_capacity(len + 10);
    out.push(0x80 | (op & 0x0f));
    if len < 126 {
        out.push(len as u8);
    } else if len < 65536 {
        out.push(126);
        out.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        out.push(127);
        out.extend_from_slice(&(len as u64).to_be_bytes());
    }
    out.extend_from_slice(payload);
    out
}

/// Client->server frame (masked) for headless test clients.
pub fn encode_masked_frame(op: u8, payload: &[u8], mask: [u8; 4]) -> Vec<u8> {
    let len = payload.len();
    let mut out = Vec::with_capacity(len + 14);
    out.push(0x80 | (op & 0x0f));
    if len < 126 {
        out.push(0x80 | len as u8);
    } else if len < 65536 {
        out.push(0x80 | 126);
        out.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        out.push(0x80 | 127);
        out.extend_from_slice(&(len as u64).to_be_bytes());
    }
    out.extend_from_slice(&mask);
    out.extend(payload.iter().enumerate().map(|(i, b)| b ^ mask[i & 3]));
    out
}

pub enum Frame {
    Msg(u8, Vec<u8>),
    /// Protocol violation (oversized / unmasked when required): caller must close.
    Bad,
}

/// Decode one frame from `buf`. `max_len` bounds the payload; `require_mask` enforces
/// RFC 6455 client masking. Returns None when more bytes are needed.
pub fn decode_frame(buf: &mut Vec<u8>, max_len: usize, require_mask: bool) -> Option<Frame> {
    if buf.len() < 2 {
        return None;
    }
    let op = buf[0] & 0x0f;
    let masked = (buf[1] & 0x80) != 0;
    if require_mask && !masked {
        return Some(Frame::Bad);
    }
    let mut len = (buf[1] & 0x7f) as usize;
    let mut off = 2;
    if len == 126 {
        if buf.len() < 4 {
            return None;
        }
        len = u16::from_be_bytes([buf[2], buf[3]]) as usize;
        off = 4;
    } else if len == 127 {
        if buf.len() < 10 {
            return None;
        }
        let mut b8 = [0u8; 8];
        b8.copy_from_slice(&buf[2..10]);
        let l = u64::from_be_bytes(b8);
        if l > max_len as u64 {
            return Some(Frame::Bad);
        }
        len = l as usize;
        off = 10;
    }
    if len > max_len {
        return Some(Frame::Bad);
    }
    let mlen = if masked { 4 } else { 0 };
    let total = off + mlen + len;
    if buf.len() < total {
        return None;
    }
    let mut payload = buf[off + mlen..total].to_vec();
    if masked {
        let mask = [buf[off], buf[off + 1], buf[off + 2], buf[off + 3]];
        for (i, b) in payload.iter_mut().enumerate() {
            *b ^= mask[i & 3];
        }
    }
    buf.drain(..total);
    Some(Frame::Msg(op, payload))
}

/// Legacy decoder used by the casual server (no limits beyond the 64-bit length).
pub fn try_decode_frame(buf: &mut Vec<u8>) -> Option<(u8, Vec<u8>)> {
    match decode_frame(buf, 1 << 20, false) {
        Some(Frame::Msg(op, p)) => Some((op, p)),
        Some(Frame::Bad) => {
            buf.clear();
            Some((0x8, Vec::new()))
        }
        None => None,
    }
}

pub fn compute_ws_accept(key: &str) -> String {
    let mut input = key.as_bytes().to_vec();
    input.extend_from_slice(b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
    base64_encode(&sha1(&input))
}

pub fn sha1(data: &[u8]) -> [u8; 20] {
    let (mut h0, mut h1, mut h2, mut h3, mut h4) =
        (0x67452301u32, 0xEFCDAB89u32, 0x98BADCFEu32, 0x10325476u32, 0xC3D2E1F0u32);
    let bit_len = (data.len() as u64) * 8;
    let mut msg = data.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());
    for chunk in msg.chunks_exact(64) {
        let mut w = [0u32; 80];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([chunk[i * 4], chunk[i * 4 + 1], chunk[i * 4 + 2], chunk[i * 4 + 3]]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }
        let (mut a, mut b, mut c, mut d, mut e) = (h0, h1, h2, h3, h4);
        for (i, &wi) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A827999u32),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1u32),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDCu32),
                _ => (b ^ c ^ d, 0xCA62C1D6u32),
            };
            let t = a.rotate_left(5).wrapping_add(f).wrapping_add(e).wrapping_add(k).wrapping_add(wi);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = t;
        }
        h0 = h0.wrapping_add(a);
        h1 = h1.wrapping_add(b);
        h2 = h2.wrapping_add(c);
        h3 = h3.wrapping_add(d);
        h4 = h4.wrapping_add(e);
    }
    let mut out = [0u8; 20];
    for (i, h) in [h0, h1, h2, h3, h4].iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&h.to_be_bytes());
    }
    out
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64URL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

fn b64_with(input: &[u8], t: &[u8; 64], pad: bool) -> String {
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for ch in input.chunks(3) {
        let b0 = ch[0] as u32;
        let b1 = if ch.len() > 1 { ch[1] as u32 } else { 0 };
        let b2 = if ch.len() > 2 { ch[2] as u32 } else { 0 };
        let tr = (b0 << 16) | (b1 << 8) | b2;
        out.push(t[((tr >> 18) & 0x3f) as usize] as char);
        out.push(t[((tr >> 12) & 0x3f) as usize] as char);
        if ch.len() > 1 {
            out.push(t[((tr >> 6) & 0x3f) as usize] as char);
        } else if pad {
            out.push('=');
        }
        if ch.len() > 2 {
            out.push(t[(tr & 0x3f) as usize] as char);
        } else if pad {
            out.push('=');
        }
    }
    out
}

pub fn base64_encode(input: &[u8]) -> String {
    b64_with(input, B64, true)
}

pub fn base64url_encode(input: &[u8]) -> String {
    b64_with(input, B64URL, false)
}

pub fn base64url_decode(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let mut acc: u32 = 0;
    let mut bits = 0;
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'-' => 62,
            b'_' => 63,
            _ => return None,
        } as u32;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Some(out)
}

/* ---------------- JSON ---------------- */

pub fn json_esc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '<' => out.push_str("\\u003c"),
            '>' => out.push_str("\\u003e"),
            c if (c as u32) < 0x20 => {}
            c => out.push(c),
        }
    }
    out
}

/// Lenient key lookups used by the casual server (kept for backwards compatibility).
pub fn json_str(json: &str, key: &str) -> Option<String> {
    let pat = format!("\"{}\"", key);
    let idx = json.find(&pat)?;
    let rest = &json[idx + pat.len()..];
    let colon = rest.find(':')?;
    let after = rest[colon + 1..].trim_start();
    if !after.starts_with('"') {
        return None;
    }
    let mut out = String::new();
    let mut chars = after[1..].chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            if let Some(e) = chars.next() {
                out.push(e);
            }
        } else if c == '"' {
            return Some(out);
        } else {
            out.push(c);
        }
    }
    None
}

pub fn json_f64(json: &str, key: &str) -> Option<f64> {
    let pat = format!("\"{}\"", key);
    let idx = json.find(&pat)?;
    let rest = &json[idx + pat.len()..];
    let colon = rest.find(':')?;
    let after = rest[colon + 1..].trim_start();
    let end = after
        .find(|c: char| !matches!(c, '0'..='9' | '-' | '+' | '.' | 'e' | 'E'))
        .unwrap_or(after.len());
    after[..end].parse::<f64>().ok()
}

#[derive(Debug, Clone, PartialEq)]
pub enum Json {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Json>),
    Obj(Vec<(String, Json)>),
}

impl Json {
    pub fn parse(s: &str) -> Option<Json> {
        let b = s.as_bytes();
        let mut p = 0usize;
        let v = parse_val(b, &mut p, 0)?;
        skip_ws(b, &mut p);
        if p == b.len() {
            Some(v)
        } else {
            None
        }
    }
    pub fn get(&self, k: &str) -> Option<&Json> {
        match self {
            Json::Obj(kv) => kv.iter().find(|(kk, _)| kk == k).map(|(_, v)| v),
            _ => None,
        }
    }
    pub fn str_of(&self, k: &str) -> Option<&str> {
        match self.get(k) {
            Some(Json::Str(s)) => Some(s.as_str()),
            _ => None,
        }
    }
    /// Finite numbers only (NaN/inf can't appear in JSON, but guard anyway).
    pub fn num_of(&self, k: &str) -> Option<f64> {
        match self.get(k) {
            Some(Json::Num(n)) if n.is_finite() => Some(*n),
            _ => None,
        }
    }
    pub fn bool_of(&self, k: &str) -> Option<bool> {
        match self.get(k) {
            Some(Json::Bool(b)) => Some(*b),
            _ => None,
        }
    }
    pub fn to_json(&self) -> String {
        match self {
            Json::Null => "null".into(),
            Json::Bool(b) => b.to_string(),
            Json::Num(n) => {
                if n.fract() == 0.0 && n.abs() < 1e15 {
                    format!("{}", *n as i64)
                } else {
                    format!("{}", n)
                }
            }
            Json::Str(s) => format!("\"{}\"", json_esc(s)),
            Json::Arr(a) => format!("[{}]", a.iter().map(|v| v.to_json()).collect::<Vec<_>>().join(",")),
            Json::Obj(kv) => format!(
                "{{{}}}",
                kv.iter().map(|(k, v)| format!("\"{}\":{}", json_esc(k), v.to_json())).collect::<Vec<_>>().join(",")
            ),
        }
    }
}

fn skip_ws(b: &[u8], p: &mut usize) {
    while *p < b.len() && matches!(b[*p], b' ' | b'\t' | b'\n' | b'\r') {
        *p += 1;
    }
}

fn parse_val(b: &[u8], p: &mut usize, depth: u32) -> Option<Json> {
    if depth > 16 {
        return None;
    }
    skip_ws(b, p);
    match *b.get(*p)? {
        b'{' => {
            *p += 1;
            let mut kv = Vec::new();
            skip_ws(b, p);
            if b.get(*p) == Some(&b'}') {
                *p += 1;
                return Some(Json::Obj(kv));
            }
            loop {
                skip_ws(b, p);
                let k = parse_str(b, p)?;
                skip_ws(b, p);
                if b.get(*p) != Some(&b':') {
                    return None;
                }
                *p += 1;
                let v = parse_val(b, p, depth + 1)?;
                if kv.len() >= 64 {
                    return None;
                }
                kv.push((k, v));
                skip_ws(b, p);
                match b.get(*p)? {
                    b',' => *p += 1,
                    b'}' => {
                        *p += 1;
                        return Some(Json::Obj(kv));
                    }
                    _ => return None,
                }
            }
        }
        b'[' => {
            *p += 1;
            let mut a = Vec::new();
            skip_ws(b, p);
            if b.get(*p) == Some(&b']') {
                *p += 1;
                return Some(Json::Arr(a));
            }
            loop {
                a.push(parse_val(b, p, depth + 1)?);
                if a.len() > 256 {
                    return None;
                }
                skip_ws(b, p);
                match b.get(*p)? {
                    b',' => *p += 1,
                    b']' => {
                        *p += 1;
                        return Some(Json::Arr(a));
                    }
                    _ => return None,
                }
            }
        }
        b'"' => parse_str(b, p).map(Json::Str),
        b't' if b[*p..].starts_with(b"true") => {
            *p += 4;
            Some(Json::Bool(true))
        }
        b'f' if b[*p..].starts_with(b"false") => {
            *p += 5;
            Some(Json::Bool(false))
        }
        b'n' if b[*p..].starts_with(b"null") => {
            *p += 4;
            Some(Json::Null)
        }
        _ => {
            let st = *p;
            while *p < b.len() && matches!(b[*p], b'0'..=b'9' | b'-' | b'+' | b'.' | b'e' | b'E') {
                *p += 1;
            }
            if st == *p || *p - st > 32 {
                return None;
            }
            let n: f64 = std::str::from_utf8(&b[st..*p]).ok()?.parse().ok()?;
            if n.is_finite() {
                Some(Json::Num(n))
            } else {
                None
            }
        }
    }
}

fn parse_str(b: &[u8], p: &mut usize) -> Option<String> {
    if b.get(*p) != Some(&b'"') {
        return None;
    }
    *p += 1;
    let mut out: Vec<u8> = Vec::new();
    while *p < b.len() {
        let c = b[*p];
        *p += 1;
        match c {
            b'"' => return String::from_utf8(out).ok(),
            b'\\' => {
                let e = *b.get(*p)?;
                *p += 1;
                match e {
                    b'"' => out.push(b'"'),
                    b'\\' => out.push(b'\\'),
                    b'/' => out.push(b'/'),
                    b'n' => out.push(b'\n'),
                    b't' => out.push(b'\t'),
                    b'r' => out.push(b'\r'),
                    b'b' | b'f' => {}
                    b'u' => {
                        let hex = std::str::from_utf8(b.get(*p..*p + 4)?).ok()?;
                        let cp = u32::from_str_radix(hex, 16).ok()?;
                        *p += 4;
                        let ch = char::from_u32(cp).unwrap_or('\u{fffd}');
                        let mut tmp = [0u8; 4];
                        out.extend_from_slice(ch.encode_utf8(&mut tmp).as_bytes());
                    }
                    _ => return None,
                }
            }
            _ => out.push(c),
        }
        if out.len() > 4096 {
            return None;
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_roundtrip_and_strictness() {
        let v = Json::parse(r#"{"type":"hit","target":"a\"b","hs":true,"n":-1.5e1,"arr":[1,2,{}]}"#).unwrap();
        assert_eq!(v.str_of("type"), Some("hit"));
        assert_eq!(v.str_of("target"), Some("a\"b"));
        assert_eq!(v.bool_of("hs"), Some(true));
        assert_eq!(v.num_of("n"), Some(-15.0));
        assert!(Json::parse(r#"{"a":1"#).is_none());
        assert!(Json::parse(r#"{"a":1} x"#).is_none());
        assert!(Json::parse(&"[".repeat(40)).is_none());
        let s = v.to_json();
        assert_eq!(Json::parse(&s).unwrap(), v);
    }

    #[test]
    fn b64url_roundtrip() {
        for s in ["", "a", "ab", "abc", "DillyBoss", "émoji✓"] {
            assert_eq!(base64url_decode(&base64url_encode(s.as_bytes())).unwrap(), s.as_bytes());
        }
    }

    #[test]
    fn frame_limits() {
        let mut b = encode_masked_frame(1, b"hello", [1, 2, 3, 4]);
        match decode_frame(&mut b, 100, true) {
            Some(Frame::Msg(1, p)) => assert_eq!(p, b"hello"),
            _ => panic!(),
        }
        let mut big = encode_masked_frame(1, &vec![b'x'; 500], [9, 9, 9, 9]);
        assert!(matches!(decode_frame(&mut big, 100, true), Some(Frame::Bad)));
        let mut unmasked = encode_frame(1, b"hi");
        assert!(matches!(decode_frame(&mut unmasked, 100, true), Some(Frame::Bad)));
    }
}
