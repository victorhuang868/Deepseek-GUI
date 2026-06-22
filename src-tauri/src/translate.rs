//! Post-hoc translation: align with TUI client.translate (chat/completions).

use serde_json::Value;

use crate::config_str;

/// Translation always uses flash; reasoning models truncate long thinking blocks.
const TRANSLATION_MODEL: &str = "deepseek-v4-flash";

/// Max chars per API call; long thinking blocks are split by paragraph.
const CHUNK_MAX_CHARS: usize = 2800;

/// Extract translated text from a chat/completions response.
fn extract_translated_content(v: &Value) -> Result<String, String> {
    let msg = v
        .pointer("/choices/0/message")
        .ok_or_else(|| "翻译响应格式异常".to_string())?;

    let content = msg
        .get("content")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim();
    if !content.is_empty() {
        return Ok(content.to_string());
    }

    let reasoning = msg
        .get("reasoning_content")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim();
    if !reasoning.is_empty() {
        return Ok(reasoning.to_string());
    }

    Err("翻译结果为空".to_string())
}

/// Reject obviously truncated translations (model summarized instead of translating).
fn ensure_translation_complete(source: &str, translated: &str) -> Result<String, String> {
    let src = source.trim();
    let out = translated.trim();
    if out.is_empty() {
        return Err("翻译结果为空".to_string());
    }
    if src.len() > 800 && out.len() * 4 < src.len() {
        return Err(format!(
            "翻译结果过短（原文 {} 字，译文 {} 字），可能不完整",
            src.len(),
            out.len()
        ));
    }
    Ok(out.to_string())
}

fn max_tokens_for_translation(text: &str) -> u64 {
    let estimated = text.len().max(512).saturating_mul(2);
    estimated.clamp(4096, 16384) as u64
}

/// Split long thinking text into paragraph-bounded chunks for multiple API calls.
fn split_for_translation(text: &str) -> Vec<String> {
    let trimmed = text.trim();
    if trimmed.len() <= CHUNK_MAX_CHARS {
        return vec![trimmed.to_string()];
    }
    let mut chunks: Vec<String> = Vec::new();
    let mut current = String::new();
    for para in trimmed.split("\n\n") {
        let piece = if current.is_empty() {
            para.to_string()
        } else {
            format!("{current}\n\n{para}")
        };
        if piece.len() > CHUNK_MAX_CHARS && !current.is_empty() {
            chunks.push(current);
            current = para.to_string();
        } else {
            current = piece;
        }
    }
    if !current.is_empty() {
        chunks.push(current);
    }
    if chunks.is_empty() {
        vec![trimmed.to_string()]
    } else {
        chunks
    }
}

fn resolve_translation_model(_model: Option<&str>) -> String {
    TRANSLATION_MODEL.to_string()
}

/// Single non-streaming translation request.
fn translate_once(
    text: &str,
    model: &str,
    target: &str,
    key: &str,
    base: &str,
) -> Result<String, String> {
    let url = format!("{base}/chat/completions");

    let system = format!(
        "You are a professional translator. Your ONLY task is to translate text to {target}. \
         Rules:\n\
         1. Output ONLY the translation, nothing else — no explanations, no notes, no quotes.\n\
         2. Preserve all code blocks (```...```), URLs, file paths, command names, \
         and technical terms like API names, function names, and library names untranslated.\n\
         3. Keep Markdown formatting (headings, lists, bold, italics, links) intact.\n\
         4. Translate all natural-language prose naturally and professionally.\n\
         5. Do NOT summarize or omit any part of the input.\n\
         6. Do NOT add any prefix, suffix, or commentary.\n\
         7. If the input is already in {target} or contains no prose to translate, return it as-is."
    );

    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": text }
        ],
        "thinking": { "type": "disabled" },
        "max_tokens": max_tokens_for_translation(text),
        "temperature": 0.1,
        "stream": false
    });

    let body_str = serde_json::to_string(&body).map_err(|e| format!("序列化请求失败：{e}"))?;

    let resp = ureq::post(&url)
        .timeout(std::time::Duration::from_secs(120))
        .set("Authorization", &format!("Bearer {key}"))
        .set("Content-Type", "application/json")
        .send_string(&body_str);

    match resp {
        Ok(r) => {
            let status = r.status();
            let raw = r.into_string().map_err(|e| format!("读取响应失败：{e}"))?;
            if status >= 400 {
                return Err(format!("翻译失败：HTTP {status} — {raw}"));
            }
            let v: Value =
                serde_json::from_str(&raw).map_err(|e| format!("解析 JSON 失败：{e}"))?;
            let content = extract_translated_content(&v)?;
            ensure_translation_complete(text, &content)
        }
        Err(ureq::Error::Status(code, r)) => {
            let detail = r.into_string().unwrap_or_default();
            Err(format!("翻译失败：HTTP {code} — {detail}"))
        }
        Err(e) => Err(format!("翻译请求失败：{e}")),
    }
}

/// Non-streaming focused translation (no tools, thinking disabled).
pub fn translate_text(
    text: &str,
    model: Option<&str>,
    target_language: Option<&str>,
) -> Result<String, String> {
    let key = std::env::var("DEEPSEEK_API_KEY")
        .ok()
        .filter(|k| !k.trim().is_empty())
        .or_else(|| config_str("api_key"))
        .ok_or_else(|| "未配置 API Key".to_string())?;

    let base = config_str("base_url").unwrap_or_else(|| "https://api.deepseek.com".to_string());
    let base = base.trim_end_matches('/').to_string();

    let model = resolve_translation_model(model);

    let target = target_language
        .filter(|t| !t.trim().is_empty())
        .unwrap_or("简体中文");

    let chunks = split_for_translation(text);
    if chunks.len() == 1 {
        return translate_once(&chunks[0], &model, target, &key, &base);
    }

    let mut parts: Vec<String> = Vec::with_capacity(chunks.len());
    for chunk in chunks {
        parts.push(translate_once(&chunk, &model, target, &key, &base)?);
    }
    Ok(parts.join("\n\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extract_prefers_content_over_reasoning() {
        let v = json!({
            "choices": [{
                "message": {
                    "content": "  translated  ",
                    "reasoning_content": "should ignore"
                }
            }]
        });
        assert_eq!(extract_translated_content(&v).unwrap(), "translated");
    }

    #[test]
    fn split_long_text_into_chunks() {
        let para = "word ".repeat(400);
        let text = format!("{para}\n\n{para}\n\n{para}");
        let chunks = split_for_translation(&text);
        assert!(chunks.len() >= 2);
        for c in &chunks {
            assert!(c.len() <= CHUNK_MAX_CHARS + 500);
        }
    }

    #[test]
    fn rejects_truncated_output() {
        let src = "a".repeat(2000);
        let short = "短";
        assert!(ensure_translation_complete(&src, short).is_err());
    }
}
