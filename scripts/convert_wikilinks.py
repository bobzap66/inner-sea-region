#!/usr/bin/env python3
"""Convert Obsidian wikilinks in content Markdown files to standard Markdown links.

The converter resolves targets against the actual content tree, preserves labels and
heading anchors, converts image/file embeds, and leaves ambiguous/unresolved links
unchanged. YAML frontmatter and fenced code blocks are not modified.
"""

from __future__ import annotations

import os
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
REPORT = ROOT / "scripts" / "wikilink-conversion-report.txt"

WIKILINK_RE = re.compile(r"(!?)\[\[([^\[\]\n]+?)\]\]")
FENCE_RE = re.compile(r"^\s*(```|~~~)")
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp"}
FILE_EXTS = IMAGE_EXTS | {".pdf", ".mp3", ".wav", ".ogg", ".mp4", ".webm", ".mov"}


def split_frontmatter(text: str) -> tuple[str, str]:
    if not text.startswith("---\n"):
        return "", text
    end = text.find("\n---\n", 4)
    if end == -1:
        return "", text
    end += 5
    return text[:end], text[end:]


def parse_frontmatter_names(frontmatter: str) -> list[str]:
    names: list[str] = []
    if not frontmatter:
        return names

    title = re.search(r"(?mi)^title:\s*[\"']?(.+?)[\"']?\s*$", frontmatter)
    if title:
        names.append(title.group(1).strip().strip('"\''))

    inline = re.search(r"(?mi)^aliases:\s*\[(.*?)\]\s*$", frontmatter)
    if inline:
        for item in inline.group(1).split(","):
            item = item.strip().strip('"\'')
            if item:
                names.append(item)

    lines = frontmatter.splitlines()
    in_aliases = False
    for line in lines:
        if re.match(r"^aliases:\s*$", line.strip(), re.I):
            in_aliases = True
            continue
        if in_aliases:
            m = re.match(r"^\s*-\s+(.+?)\s*$", line)
            if m:
                item = m.group(1).strip().strip('"\'')
                if item:
                    names.append(item)
            elif line and not line.startswith((" ", "\t")):
                in_aliases = False
    return names


def anchor_slug(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).strip().lower()
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = re.sub(r"[^\w\s-]", "", value, flags=re.UNICODE)
    value = re.sub(r"[\s_-]+", "-", value).strip("-")
    return value


def encode_path(path: str) -> str:
    return quote(path, safe="/-._~")


def relative_href(source: Path, target: Path, fragment: str | None = None) -> str:
    rel = os.path.relpath(target, source.parent).replace(os.sep, "/")
    href = encode_path(rel)
    if fragment:
        href += "#" + anchor_slug(fragment)
    return href


def distance(source: Path, target: Path) -> int:
    rel = Path(os.path.relpath(target.parent, source.parent))
    return len([p for p in rel.parts if p not in (".", "")])


def build_indexes():
    all_files = [p for p in CONTENT.rglob("*") if p.is_file()]
    md_files = [p for p in all_files if p.suffix.lower() == ".md"]

    note_index: dict[str, list[Path]] = defaultdict(list)
    asset_index: dict[str, list[Path]] = defaultdict(list)

    for path in md_files:
        note_index[path.stem.casefold()].append(path)
        note_index[path.name.casefold()].append(path)
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        frontmatter, _ = split_frontmatter(text)
        for name in parse_frontmatter_names(frontmatter):
            note_index[name.casefold()].append(path)

    for path in all_files:
        if path.suffix.lower() in FILE_EXTS:
            asset_index[path.name.casefold()].append(path)
            asset_index[path.stem.casefold()].append(path)

    return md_files, note_index, asset_index


def dedupe(paths: list[Path]) -> list[Path]:
    seen = set()
    out = []
    for path in paths:
        key = path.resolve()
        if key not in seen:
            seen.add(key)
            out.append(path)
    return out


def resolve_target(source: Path, raw_target: str, note_index, asset_index) -> tuple[Path | None, str]:
    target = raw_target.strip().replace("\\", "/")
    if not target:
        return source, "self"

    # Explicit paths first: relative to source, then relative to content root.
    target_path = target
    suffix = Path(target_path).suffix.lower()
    possible = []
    for base in (source.parent, CONTENT):
        p = (base / target_path).resolve()
        if p.is_file() and CONTENT.resolve() in p.parents:
            possible.append(p)
        if not suffix:
            pmd = p.with_suffix(".md")
            if pmd.is_file() and CONTENT.resolve() in pmd.parents:
                possible.append(pmd)
    possible = dedupe(possible)
    if len(possible) == 1:
        return possible[0], "explicit"

    key = Path(target).name.casefold()
    if key.endswith(".md"):
        keys = [key, Path(key).stem]
    else:
        keys = [key]

    index = asset_index if suffix in FILE_EXTS else note_index
    candidates: list[Path] = []
    for k in keys:
        candidates.extend(index.get(k, []))
    candidates = dedupe(candidates)

    if len(candidates) == 1:
        return candidates[0], "unique"
    if len(candidates) > 1:
        ranked = sorted((distance(source, p), p) for p in candidates)
        best_distance = ranked[0][0]
        best = [p for d, p in ranked if d == best_distance]
        if len(best) == 1:
            return best[0], "closest"
        return None, "ambiguous"
    return None, "unresolved"


def convert_body(source: Path, body: str, note_index, asset_index, issues: list[str], stats: dict[str, int]) -> str:
    in_fence = False
    fence_token = None
    output: list[str] = []

    def replace(match: re.Match[str]) -> str:
        embed = bool(match.group(1))
        inner = match.group(2).strip()

        # Obsidian aliases use [[target|label]]. Image embeds can use |300 for sizing.
        if "|" in inner:
            destination, label = inner.split("|", 1)
            destination = destination.strip()
            label = label.strip()
        else:
            destination, label = inner, ""

        if "^" in destination:
            issues.append(f"UNSUPPORTED BLOCK REF: {source.relative_to(ROOT)} :: {match.group(0)}")
            stats["left"] += 1
            return match.group(0)

        if "#" in destination:
            target_text, fragment = destination.split("#", 1)
            target_text = target_text.strip()
            fragment = fragment.strip()
        else:
            target_text, fragment = destination.strip(), None

        if not target_text and fragment:
            display = label or fragment
            stats["converted"] += 1
            return f"[{display}](#{anchor_slug(fragment)})"

        target, reason = resolve_target(source, target_text, note_index, asset_index)
        if target is None:
            issues.append(f"{reason.upper()}: {source.relative_to(ROOT)} :: {match.group(0)}")
            stats["left"] += 1
            return match.group(0)

        display = label or Path(target_text).stem or target.stem
        href = relative_href(source, target, fragment)

        if embed and target.suffix.lower() in IMAGE_EXTS:
            # Obsidian's |300 sizing has no portable Markdown equivalent; don't use it as alt text.
            alt = "" if label.isdigit() else label
            stats["converted"] += 1
            return f"![{alt}]({href})"

        # Standard Markdown has no note transclusion. Convert note/file embeds to ordinary links.
        stats["converted"] += 1
        return f"[{display}]({href})"

    for line in body.splitlines(keepends=True):
        fence = FENCE_RE.match(line)
        if fence:
            token = fence.group(1)
            if not in_fence:
                in_fence = True
                fence_token = token
            elif token == fence_token:
                in_fence = False
                fence_token = None
            output.append(line)
            continue

        if in_fence:
            output.append(line)
        else:
            output.append(WIKILINK_RE.sub(replace, line))

    return "".join(output)


def main() -> int:
    md_files, note_index, asset_index = build_indexes()
    issues: list[str] = []
    stats = {"files": 0, "converted": 0, "left": 0}

    for path in md_files:
        text = path.read_text(encoding="utf-8")
        if "[[" not in text:
            continue
        frontmatter, body = split_frontmatter(text)
        converted = convert_body(path, body, note_index, asset_index, issues, stats)
        new_text = frontmatter + converted
        if new_text != text:
            path.write_text(new_text, encoding="utf-8")
            stats["files"] += 1

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    report_lines = [
        "Wikilink conversion report",
        "==========================",
        f"Markdown files changed: {stats['files']}",
        f"Wikilinks converted: {stats['converted']}",
        f"Wikilinks left unchanged: {stats['left']}",
        "",
    ]
    if issues:
        report_lines.extend(issues)
    else:
        report_lines.append("No ambiguous, unresolved, or unsupported wikilinks remain in processed Markdown bodies.")
    REPORT.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    print("\n".join(report_lines[:5]))
    if issues:
        print(f"See {REPORT.relative_to(ROOT)} for details.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
