#!/usr/bin/env python3
"""将 GUI 使用中档案的 API Key 同步到 ~/.codewhale/config.toml（sidecar 主配置）。"""

import json
import re
from pathlib import Path


def main() -> None:
    home = Path.home()
    prof = home / ".deepseek" / "gui_profiles.json"
    cw = home / ".codewhale" / "config.toml"
    if not prof.exists():
        raise SystemExit("未找到 gui_profiles.json")
    doc = json.loads(prof.read_text(encoding="utf-8"))
    active = doc.get("active_id", "")
    profile = next((p for p in doc.get("profiles", []) if p.get("id") == active), None)
    if not profile:
        raise SystemExit("未找到使用中档案")
    key = str(profile.get("api_key", "")).strip()
    if not key.startswith("sk-"):
        raise SystemExit("使用中档案无有效 sk- Key")
    text = cw.read_text(encoding="utf-8") if cw.exists() else ""
    if re.search(r"^api_key\s*=", text, re.M):
        text = re.sub(
            r"^api_key\s*=.*$",
            f'api_key = "{key}"',
            text,
            count=1,
            flags=re.M,
        )
    else:
        text = (text.rstrip() + f'\n\napi_key = "{key}"\n') if text.strip() else f'api_key = "{key}"\n'
    for field, val in [
        ("base_url", profile.get("base_url", "")),
        ("provider", profile.get("provider", "")),
        ("default_text_model", profile.get("model", "")),
    ]:
        v = str(val).strip()
        if not v:
            continue
        pat = rf"^{re.escape(field)}\s*=.*$"
        line = f'{field} = "{v}"'
        if re.search(pat, text, re.M):
            text = re.sub(pat, line, text, count=1, flags=re.M)
        else:
            text = text.rstrip() + "\n" + line + "\n"
    cw.parent.mkdir(parents=True, exist_ok=True)
    cw.write_text(text, encoding="utf-8")
    print(f"已同步到 {cw}（Key 长度 {len(key)}）")


if __name__ == "__main__":
    main()
