"""从 resources/app.asar 重新同步 frontend/ 源码树。

用法（在仓库根目录执行）：
    python frontend/tools/extract_frontend.py --asar resources/app.asar --out frontend

行为：
- 拷贝 package.json、src/view 下的 html/css、dist/electron 与 dist/src
- 拷贝 renderer.bundle.js 及其 .map
- 用 .map 的 sourcesContent 还原 src/**/*.js 与 src/data/*.json（跳过 node_modules 来源）
- 不处理 node_modules/

注意：会先清空 --out 目录中除 README.md 与 tools/ 之外的内容。
"""
from __future__ import annotations

import argparse
import json
import shutil
import struct
from pathlib import Path

KEEP = {"README.md", "tools"}


def walk(node, prefix=""):
    for name, meta in node.get("files", {}).items():
        path = f"{prefix}{name}"
        if "files" in meta:
            yield from walk(meta, path + "/")
        else:
            yield path, meta


def extract(asar: Path, out: Path) -> None:
    raw = asar.read_bytes()
    _n1, n2, _n3, n4 = struct.unpack("<IIII", raw[:16])
    header = json.loads(raw[16:16 + n4].decode("utf-8"))
    content_start = 8 + n2

    entries: dict[str, tuple[bytes, int]] = {}
    for path, meta in walk(header):
        if meta.get("unpacked"):
            continue
        offset, size = int(meta["offset"]), int(meta["size"])
        entries[path] = (raw[content_start + offset:content_start + offset + size], int(meta.get("mode", 0o644)))

    out.mkdir(parents=True, exist_ok=True)
    for child in out.iterdir():
        if child.name not in KEEP:
            shutil.rmtree(child) if child.is_dir() else child.unlink()

    def put(rel: str) -> None:
        data, _mode = entries[rel]
        target = out / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    put("package.json")
    for rel in ("src/view/boot.html", "src/view/index.html", "src/view/styles/styles.css"):
        put(rel)
    for rel in entries:
        if rel.startswith(("dist/electron/", "dist/src/")) or rel in (
            "dist/renderer.bundle.js",
            "dist/renderer.bundle.js.map",
        ):
            put(rel)

    mapping = json.loads(entries["dist/renderer.bundle.js.map"][0].decode("utf-8"))
    restored = skipped = 0
    for src, content in zip(mapping.get("sources", []), mapping.get("sourcesContent") or []):
        norm = src.replace("\\", "/")
        while norm.startswith("../"):
            norm = norm[3:]
        if content is None or not norm.startswith("src/"):
            skipped += 1
            continue
        target = out / norm
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8", newline="\n")
        restored += 1

    print(f"asar 条目 {len(entries)}，还原渲染层模块 {restored}，跳过（node_modules 等）{skipped}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--asar", default="resources/app.asar")
    ap.add_argument("--out", default="frontend")
    args = ap.parse_args()
    extract(Path(args.asar).resolve(), Path(args.out).resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
