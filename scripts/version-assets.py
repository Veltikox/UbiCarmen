#!/usr/bin/env python3
"""Version local frontend URLs by content; safe to run repeatedly before a push."""
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
source = INDEX.read_text(encoding="utf-8")
assets = {}


def version_url(match):
    attribute, path = match.groups()
    file = ROOT / path
    if not file.is_file():
        raise SystemExit(f"Missing frontend asset: {path}")
    digest = hashlib.sha256(file.read_bytes()).hexdigest()[:12]
    assets[path] = digest
    return f'{attribute}="{path}?v={digest}"'


source = re.sub(
    r'(src|href)="((?!https?:|//|#)[^"?]+\.(?:js|css|svg))(?:\?[^"\s]*)?"',
    version_url,
    source,
)
# Normalize the marker so the release ID remains stable on repeat runs.
normalized = re.sub(r'(<span id="app-version">)[^<]*(</span>)', r'\1VERSION\2', source)
release = hashlib.sha256(normalized.encode()).hexdigest()[:12]
source = re.sub(r'(<span id="app-version">)[^<]*(</span>)', lambda m: f'{m[1]}Versión {release}{m[2]}', source)
INDEX.write_text(source, encoding="utf-8")
(ROOT / "version.json").write_text(
    json.dumps({"version": release, "assets": assets}, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print(f"Frontend version: {release} ({len(assets)} assets)")
