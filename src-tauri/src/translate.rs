//! 后置翻译：对齐 TUI client.translate，调用 chat/completions 将英文思考译为中文

use serde_json::Value;

use crate::config_str;

/// 调用 DeepSeek chat/completions 做专注翻译（无工具、无流式）
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
    let url = format!("{base}/chat/completions");

    let model = model
        .filter(|m| !m.trim().is_empty())
        .map(|m| m.to_string())
        .or_else(|| config_str("default_text_model"))
        .unwrap_or_else(|| "deepseek-v4-flash".to_string());

    let target = target_language
        .filter(|t| !t.trim().is_empty())
        .unwrap_or("简体中文");

    let system = format!(
        "You are a professional translator. Your ONLY task is to translate text to {target}. \
         Rules:\n\
         1. Output ONLY the translation, nothing else — no explanations, no notes, no quotes.\n\
         2. Preserve all code blocks (```...```), URLs, file paths, command names, \
         and technical terms like API names, function names, and library names untranslated.\n\
         3. Keep Markdown formatting (headings, lists, bold, italics, links) intact.\n\
         4. Translate all natural-language prose naturally and professionally.\n\
         5. Do NOT add any prefix, suffix, or commentary.\n\
         6. If the input is already in {target} or contains no prose to translate, return it as-is."
    );

    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": text }
        ],
        "max_tokens": 4096,
        "temperature": 0.1,
        "stream": false
    });

    let body_str = serde_json::to_string(&body).map_err(|e| format!("序列化请求失败：{e}"))?;

    let resp = ureq::post(&url)
        .timeout(std::time::Duration::from_secs(90))
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
            let content = v
                .pointer("/choices/0/message/content")
                .and_then(|x| x.as_str())
                .ok_or_else(|| "翻译响应格式异常".to_string())?
                .trim()
                .to_string();
            if content.is_empty() {
                return Err("翻译结果为空".to_string());
            }
            Ok(content)
        }
        Err(ureq::Error::Status(code, r)) => {
            let detail = r.into_string().unwrap_or_default();
            Err(format!("翻译失败：HTTP {code} — {detail}"))
        }
        Err(e) => Err(format!("翻译请求失败：{e}")),
    }
}
