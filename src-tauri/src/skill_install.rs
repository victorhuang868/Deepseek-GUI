//! 社区技能安装/卸载（对齐 TUI /skill install|uninstall，GitHub tarball 路径）

use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use flate2::read::GzDecoder;
use tar::Archive;

const INSTALLED_FROM_MARKER: &str = ".installed-from";
const MAX_BYTES: u64 = 5 * 1024 * 1024;

/// 解析安装 spec：github:owner/repo 或 GitHub HTTPS URL
fn parse_github_spec(spec: &str) -> Result<(String, String), String> {
    let s = spec.trim();
    if let Some(rest) = s.strip_prefix("github:") {
        let parts: Vec<_> = rest.split('/').filter(|p| !p.is_empty()).collect();
        if parts.len() >= 2 {
            return Ok((parts[0].to_string(), parts[1].to_string()));
        }
        return Err("github spec 格式：github:owner/repo".into());
    }
    if s.contains("github.com") {
        let normalized = s.trim_end_matches('/').replace(".git", "");
        let parts: Vec<_> = normalized.split('/').filter(|p| !p.is_empty()).collect();
        if let Some(pos) = parts.iter().position(|p| *p == "github.com") {
            if parts.len() >= pos + 3 {
                return Ok((parts[pos + 1].to_string(), parts[pos + 2].to_string()));
            }
        }
    }
    Err("当前 GUI 仅支持 github:owner/repo 或 GitHub HTTPS URL".into())
}

/// 默认技能目录 ~/.codewhale/skills
pub fn default_skills_dir(home: &Path) -> PathBuf {
    home.join("skills")
}

/// 下载 GitHub 仓库 tarball（main → master 回退）
fn download_github_tarball(owner: &str, repo: &str) -> Result<Vec<u8>, String> {
    let branches = ["main", "master"];
    let mut last_err = String::new();
    for branch in branches {
        let url = format!(
            "https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.tar.gz"
        );
        match ureq::get(&url)
            .timeout(std::time::Duration::from_secs(60))
            .call()
        {
            Ok(resp) => {
                let mut buf = Vec::new();
                resp.into_reader()
                    .take(MAX_BYTES + 1)
                    .read_to_end(&mut buf)
                    .map_err(|e| format!("读取 tarball 失败：{e}"))?;
                if buf.len() as u64 > MAX_BYTES {
                    return Err(format!("技能包超过 {MAX_BYTES} 字节上限"));
                }
                return Ok(buf);
            }
            Err(e) => {
                last_err = format!("HTTP {url} 失败：{e}");
            }
        }
    }
    Err(last_err)
}

/// 安全解压：拒绝路径逃逸
fn extract_tarball(bytes: &[u8], dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let decoder = GzDecoder::new(bytes);
    let mut archive = Archive::new(decoder);
    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path().map_err(|e| e.to_string())?.to_path_buf();
        for comp in path.components() {
            if matches!(comp, Component::ParentDir | Component::RootDir | Component::Prefix(_)) {
                return Err(format!("非法路径条目：{}", path.display()));
            }
        }
        entry.unpack_in(dest).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 在解压目录中查找含 SKILL.md 的技能根目录
fn find_skill_root(staging: &Path) -> Result<PathBuf, String> {
    if staging.join("SKILL.md").is_file() {
        return Ok(staging.to_path_buf());
    }
    let entries = fs::read_dir(staging).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            if p.join("SKILL.md").is_file() {
                return Ok(p);
            }
            // 再下一层（github archive 常见结构）
            if let Ok(sub) = fs::read_dir(&p) {
                for e2 in sub.flatten() {
                    let p2 = e2.path();
                    if p2.is_dir() && p2.join("SKILL.md").is_file() {
                        return Ok(p2);
                    }
                }
            }
        }
    }
    Err("tarball 中未找到 SKILL.md".into())
}

/// 安装 GitHub 技能到 skills 目录
pub fn install_skill(spec: &str, skills_dir: &Path) -> Result<String, String> {
    let (owner, repo) = parse_github_spec(spec)?;
    let bytes = download_github_tarball(&owner, &repo)?;
    let staging = skills_dir.join(format!(".staging-{}", repo));
    if staging.exists() {
        fs::remove_dir_all(&staging).ok();
    }
    extract_tarball(&bytes, &staging)?;
    let skill_root = find_skill_root(&staging)?;
    let skill_name = repo.clone();
    let final_path = skills_dir.join(&skill_name);
    if final_path.exists() {
        fs::remove_dir_all(&staging).ok();
        return Err(format!("技能「{skill_name}」已存在，请先 uninstall"));
    }
    fs::create_dir_all(skills_dir).map_err(|e| e.to_string())?;
    fs::rename(&skill_root, &final_path).map_err(|e| e.to_string())?;
    fs::remove_dir_all(&staging).ok();
    let marker = serde_json::json!({
        "spec": format!("github:{owner}/{repo}"),
        "url": format!("https://github.com/{owner}/{repo}"),
    });
    fs::write(
        final_path.join(INSTALLED_FROM_MARKER),
        marker.to_string(),
    )
    .map_err(|e| e.to_string())?;
    Ok(format!("已安装技能：{skill_name} → {}", final_path.display()))
}

/// 卸载带 .installed-from 标记的技能
pub fn uninstall_skill(name: &str, skills_dir: &Path) -> Result<String, String> {
    let n = name.trim();
    if n.is_empty() || n.contains('/') || n.contains('\\') || n.contains("..") {
        return Err("非法技能名称".into());
    }
    let path = skills_dir.join(n);
    if !path.join(INSTALLED_FROM_MARKER).is_file() {
        return Err(format!(
            "「{n}」无 {INSTALLED_FROM_MARKER} 标记，拒绝卸载（保护内置技能）"
        ));
    }
    fs::remove_dir_all(&path).map_err(|e| format!("删除失败：{e}"))?;
    Ok(format!("已卸载技能：{n}"))
}
