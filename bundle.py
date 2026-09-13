#!/usr/bin/env python3
"""Inline plugin/art.ts into plugin/model-banner.tsx (single-file plugin bundle).

The opencode TUI plugin loader imports exactly one entry file, so the art
registry is concatenated into the plugin source with `export` keywords stripped.
Run this after regenerating art (see gen/README section) — it verifies the
result matches the shipped bundle byte-for-byte when run with --check.
"""
import sys
from pathlib import Path

root = Path(__file__).resolve().parent

art = (root / "plugin" / "art.ts").read_text()
plugin = (root / "plugin" / "model-banner.tsx").read_text()

START = "// Per-brand art for opencode banners. GENERATED"
END = "// ---------------------------------------------------------------------------\n// Color helpers"

start = plugin.find(START)
end = plugin.find(END)
if start < 0 or end < start:
    sys.exit("bundle markers not found in model-banner.tsx")

art_local = (
    art.replace("export type ArtEntry", "type ArtEntry")
    .replace("export type ArtRegistry", "type ArtRegistry")
    .replace("export const registry", "const registry")
    .replace("export const FONT", "const FONT")
    .replace("export function figlet", "function figlet")
    .replace("export function matchArt", "function matchArt")
    .replace("export type ModelKey", "type ModelKey")
)
combined = plugin[:start] + art_local + plugin[end:]

if "--check" in sys.argv:
    if combined != plugin:
        sys.exit("model-banner.tsx is out of sync with art.ts — run bundle.py")
    print("bundle in sync")
    sys.exit(0)

(root / "plugin" / "model-banner.tsx").write_text(combined)
print(f"bundled {len(combined)} bytes")
