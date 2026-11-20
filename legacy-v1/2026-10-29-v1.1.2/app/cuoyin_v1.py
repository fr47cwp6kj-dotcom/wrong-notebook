#!/usr/bin/env python3
"""错因 Agent V1: local photo inbox manager.

This program deliberately does not perform OCR, model inference, or question
generation. V1 only verifies that family phones can reliably collect original
mistake photos in the local inbox.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


VERSION = "1.0.0"
INDEX_SCHEMA = "cuoyin-agent-photo-index-v1"
INBOX_MARKER_SCHEMA = "photo-inbox-v1"

STAGES = {
    "junior": "初中",
    "senior": "高中",
}

STATES = {
    "pending": "待识别",
    "archived": "已归档",
    "failed": "识别失败",
}

PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".webp"}


@dataclass(frozen=True)
class InboxFile:
    path: Path
    relative_path: str
    stage_key: str
    stage: str
    state_key: str
    state: str
    file_name: str
    extension: str
    size_bytes: int
    modified_at: str
    is_photo: bool


@dataclass(frozen=True)
class VerificationIssue:
    code: str
    severity: str
    path: str
    stage: str
    state: str
    message: str


@dataclass(frozen=True)
class VerificationResult:
    files_checked: int
    photos_checked: int
    valid_photos: int
    errors: list[VerificationIssue]
    warnings: list[VerificationIssue]
    duplicate_groups: list[list[str]]

    @property
    def ok(self) -> bool:
        return not self.errors


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def default_root() -> Path:
    if os.name == "nt" and Path("D:/").exists():
        return Path("D:/错因Agent").resolve()
    return (Path.home() / "Documents" / "错因Agent").resolve()


def resolve_root(root: str | None) -> Path:
    root_value = root or os.environ.get("CUOYIN_AGENT_ROOT")
    return Path(root_value).expanduser().resolve() if root_value else default_root()


def inbox_folders(root: Path) -> list[Path]:
    return [
        root / "错题" / stage / state
        for stage in STAGES.values()
        for state in STATES.values()
    ]


def _hidden_file(path: Path) -> bool:
    return path.name.startswith((".", "~$"))


def _timestamp(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(
        timespec="seconds"
    )


def iter_inbox_files(root: Path) -> Iterable[InboxFile]:
    for stage_key, stage in STAGES.items():
        for state_key, state in STATES.items():
            folder = root / "错题" / stage / state
            if not folder.exists():
                continue
            for path in folder.rglob("*"):
                if not path.is_file() or path.is_symlink() or _hidden_file(path):
                    continue
                extension = path.suffix.lower()
                yield InboxFile(
                    path=path,
                    relative_path=path.relative_to(root).as_posix(),
                    stage_key=stage_key,
                    stage=stage,
                    state_key=state_key,
                    state=state,
                    file_name=path.name,
                    extension=extension,
                    size_bytes=path.stat().st_size,
                    modified_at=_timestamp(path),
                    is_photo=extension in PHOTO_EXTENSIONS,
                )


def init_inbox(root: Path) -> list[Path]:
    folders = inbox_folders(root)
    for folder in folders:
        folder.mkdir(parents=True, exist_ok=True)

    marker = root / ".错因Agent"
    marker.write_text(
        "\n".join(
            [
                "project=错因Agent",
                f"schema={INBOX_MARKER_SCHEMA}",
                f"initialized_utc={utc_now()}",
            ]
        ),
        encoding="utf-8",
    )

    inbox = root / "错题"
    guide = inbox / "README.txt"
    guide.write_text(
        "\n".join(
            [
                "错因Agent V1 照片收件箱",
                "日常上传位置：初中/待识别 或 高中/待识别。",
                "本程序只做本地照片收集与校验，不做识别和出题。",
            ]
        ),
        encoding="utf-8",
    )
    return folders


def empty_counts() -> dict[str, dict[str, int]]:
    return {
        stage: {state: 0 for state in STATES.values()}
        for stage in STAGES.values()
    }


def count_photos(root: Path) -> dict[str, dict[str, int]]:
    counts = empty_counts()
    for item in iter_inbox_files(root):
        if item.is_photo:
            counts[item.stage][item.state] += 1
    return counts


def latest_photos(root: Path, limit: int = 10) -> list[dict[str, object]]:
    photos = [item for item in iter_inbox_files(root) if item.is_photo]
    photos.sort(key=lambda item: (item.modified_at, item.relative_path), reverse=True)
    records = [asdict(item) for item in photos[:limit]]
    for record in records:
        record.pop("path", None)
    return records


def status_data(root: Path) -> dict[str, object]:
    counts = count_photos(root)
    return {
        "schema": "cuoyin-agent-status-v1",
        "version": VERSION,
        "generated_at": utc_now(),
        "root": str(root),
        "inbox_exists": all(folder.exists() for folder in inbox_folders(root)),
        "counts": counts,
        "total_photos": sum(sum(states.values()) for states in counts.values()),
        "latest_photos": latest_photos(root),
    }


def _has_valid_signature(path: Path, extension: str) -> bool:
    try:
        with path.open("rb") as handle:
            header = handle.read(16)
    except OSError:
        return False

    if extension in {".jpg", ".jpeg"}:
        return header.startswith(b"\xff\xd8\xff")
    if extension == ".png":
        return header.startswith(b"\x89PNG\r\n\x1a\n")
    if extension == ".webp":
        return len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP"
    if extension == ".heic":
        if len(header) < 12 or header[4:8] != b"ftyp":
            return False
        brands = {
            b"heic",
            b"heix",
            b"hevc",
            b"hevx",
            b"mif1",
            b"msf1",
            b"avif",
        }
        return header[8:12] in brands
    return False


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_inbox(root: Path) -> VerificationResult:
    errors: list[VerificationIssue] = []
    warnings: list[VerificationIssue] = []
    files = list(iter_inbox_files(root))
    valid_photos: list[tuple[InboxFile, str]] = []

    for item in files:
        if item.size_bytes == 0:
            errors.append(
                VerificationIssue(
                    "empty_file",
                    "error",
                    item.relative_path,
                    item.stage,
                    item.state,
                    "文件为空。",
                )
            )
            continue

        if not item.is_photo:
            warnings.append(
                VerificationIssue(
                    "unsupported_extension",
                    "warning",
                    item.relative_path,
                    item.stage,
                    item.state,
                    f"不支持的照片扩展名：{item.extension or '(无扩展名)'}",
                )
            )
            continue

        if not _has_valid_signature(item.path, item.extension):
            errors.append(
                VerificationIssue(
                    "invalid_image_signature",
                    "error",
                    item.relative_path,
                    item.stage,
                    item.state,
                    "扩展名与图片文件签名不一致，或文件已损坏。",
                )
            )
            continue

        try:
            digest = sha256_file(item.path)
        except OSError as exc:
            errors.append(
                VerificationIssue(
                    "unreadable_file",
                    "error",
                    item.relative_path,
                    item.stage,
                    item.state,
                    f"无法完整读取：{exc}",
                )
            )
            continue
        valid_photos.append((item, digest))

    by_hash: dict[str, list[InboxFile]] = defaultdict(list)
    for item, digest in valid_photos:
        by_hash[digest].append(item)

    duplicate_groups = [
        sorted(item.relative_path for item in items)
        for _, items in sorted(by_hash.items())
        if len(items) > 1
    ]
    for group in duplicate_groups:
        warnings.append(
            VerificationIssue(
                "duplicate_photo",
                "warning",
                group[0],
                "",
                "",
                f"同一照片存在 {len(group)} 份：{'；'.join(group)}",
            )
        )

    return VerificationResult(
        files_checked=len(files),
        photos_checked=sum(1 for item in files if item.is_photo),
        valid_photos=len(valid_photos),
        errors=errors,
        warnings=warnings,
        duplicate_groups=duplicate_groups,
    )


def _json_default(value: object) -> str:
    if isinstance(value, Path):
        return str(value)
    raise TypeError(f"Cannot serialize {type(value).__name__}")


def print_json(value: object) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2, default=_json_default))


def print_status(root: Path) -> None:
    data = status_data(root)
    print(f"错因Agent V1 照片收件箱（v{VERSION}）")
    print(f"根目录：{data['root']}")
    print(f"目录完整：{'是' if data['inbox_exists'] else '否'}")
    print(f"照片总数：{data['total_photos']}")
    print()
    print("学段/状态      数量")
    print("--------------------")
    for stage, states in data["counts"].items():  # type: ignore[union-attr]
        for state, count in states.items():  # type: ignore[union-attr]
            print(f"{stage}/{state}      {count}")

    latest = data["latest_photos"]
    if latest:
        print()
        print("最近照片：")
        for item in latest:  # type: ignore[union-attr]
            print(f"- {item['relative_path']} ({item['size_bytes']} bytes)")


def print_verification(result: VerificationResult) -> None:
    print(f"检查文件：{result.files_checked}")
    print(f"照片文件：{result.photos_checked}")
    print(f"有效照片：{result.valid_photos}")
    print(f"错误：{len(result.errors)}")
    print(f"警告：{len(result.warnings)}")
    if result.errors:
        print()
        print("错误：")
        for issue in result.errors:
            print(f"- [{issue.code}] {issue.path}: {issue.message}")
    if result.warnings:
        print()
        print("警告：")
        for issue in result.warnings:
            print(f"- [{issue.code}] {issue.path}: {issue.message}")
    print()
    print("结果：", "通过" if result.ok else "未通过")


def _issue_dict(issue: VerificationIssue) -> dict[str, str]:
    return asdict(issue)


def verification_data(root: Path, result: VerificationResult) -> dict[str, object]:
    return {
        "schema": "cuoyin-agent-verification-v1",
        "version": VERSION,
        "generated_at": utc_now(),
        "root": str(root),
        "files_checked": result.files_checked,
        "photos_checked": result.photos_checked,
        "valid_photos": result.valid_photos,
        "ok": result.ok,
        "errors": [_issue_dict(issue) for issue in result.errors],
        "warnings": [_issue_dict(issue) for issue in result.warnings],
        "duplicate_groups": result.duplicate_groups,
    }


def _photo_id(sha256: str, relative_path: str) -> str:
    material = f"{sha256}\n{relative_path}".encode("utf-8")
    return hashlib.sha256(material).hexdigest()[:24]


def snapshot_inbox(root: Path, index_path: Path | None = None) -> dict[str, object]:
    target = index_path or root / "data" / "photo-index.json"
    target.parent.mkdir(parents=True, exist_ok=True)

    previous: dict[str, dict[str, object]] = {}
    if target.exists():
        try:
            old_data = json.loads(target.read_text(encoding="utf-8"))
            for item in old_data.get("photos", []):
                rel = item.get("relative_path")
                if isinstance(rel, str):
                    previous[rel] = item
        except (OSError, json.JSONDecodeError):
            pass

    seen: dict[str, dict[str, object]] = {}
    for item in iter_inbox_files(root):
        if not item.is_photo:
            continue
        try:
            digest = sha256_file(item.path)
            valid_signature = _has_valid_signature(item.path, item.extension)
        except OSError:
            continue

        old = previous.get(item.relative_path, {})
        first_seen = old.get("first_seen_at", utc_now())
        record: dict[str, object] = {
            "photo_id": _photo_id(digest, item.relative_path),
            "sha256": digest,
            "relative_path": item.relative_path,
            "stage": item.stage,
            "stage_key": item.stage_key,
            "state": item.state,
            "state_key": item.state_key,
            "file_name": item.file_name,
            "extension": item.extension,
            "size_bytes": item.size_bytes,
            "modified_at": item.modified_at,
            "valid_signature": valid_signature,
            "first_seen_at": first_seen,
            "last_seen_at": utc_now(),
            "is_missing": False,
            "missing_since": None,
        }
        seen[item.relative_path] = record

    now = utc_now()
    records: list[dict[str, object]] = list(seen.values())
    for relative_path, old in previous.items():
        if relative_path in seen:
            continue
        missing = dict(old)
        missing["is_missing"] = True
        missing["missing_since"] = old.get("missing_since", now)
        records.append(missing)

    records.sort(key=lambda record: str(record["relative_path"]))
    data: dict[str, object] = {
        "schema": INDEX_SCHEMA,
        "version": VERSION,
        "generated_at": now,
        "root": str(root),
        "photos": records,
        "summary": {
            "total_records": len(records),
            "present_photos": len(seen),
            "missing_photos": len(records) - len(seen),
        },
    }

    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{target.name}.", suffix=".tmp", dir=str(target.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary_name, target)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)

    return data


def generate_report(root: Path) -> str:
    status = status_data(root)
    verification = verify_inbox(root)
    counts = status["counts"]

    lines = [
        "# 错因Agent V1 收集报告",
        "",
        f"- 生成时间：{status['generated_at']}",
        f"- 根目录：{root}",
        f"- 目录完整：{'是' if status['inbox_exists'] else '否'}",
        f"- 照片总数：{status['total_photos']}",
        "",
        "## 数量统计",
        "",
        "| 学段 | 状态 | 数量 |",
        "| --- | --- | ---: |",
    ]
    for stage, states in counts.items():  # type: ignore[union-attr]
        for state, count in states.items():  # type: ignore[union-attr]
            lines.append(f"| {stage} | {state} | {count} |")

    lines.extend(
        [
            "",
            "## 文件校验",
            "",
            f"- 检查文件：{verification.files_checked}",
            f"- 照片文件：{verification.photos_checked}",
            f"- 有效照片：{verification.valid_photos}",
            f"- 错误：{len(verification.errors)}",
            f"- 警告：{len(verification.warnings)}",
            f"- 结论：{'通过' if verification.ok else '未通过'}",
            "",
        ]
    )

    if verification.errors:
        lines.append("### 错误")
        lines.append("")
        for issue in verification.errors:
            lines.append(f"- `{issue.path}`：{issue.message}")
        lines.append("")
    if verification.warnings:
        lines.append("### 警告")
        lines.append("")
        for issue in verification.warnings:
            lines.append(f"- `{issue.path}`：{issue.message}")
        lines.append("")

    lines.extend(
        [
            "## V1 验收提醒",
            "",
            "- V1 最低验收：iPhone 在同一局域网上传 1 张真实错题照片，Windows 能看到并打开。",
            "- 本报告只证明本地文件存在且可读，不证明 SMB 传输链路；传输验收仍需手机实际上传。",
            "- 下一步可运行 `snapshot` 生成照片索引，为 V2 防重复导入做准备。",
        ]
    )
    return "\n".join(lines) + "\n"


def open_inbox(root: Path) -> None:
    inbox = root / "错题"
    inbox.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        os.startfile(inbox)  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.run(["open", str(inbox)], check=False)
    else:
        subprocess.run(["xdg-open", str(inbox)], check=False)


def run_menu(root: Path) -> None:
    actions = {
        "1": ("初始化/修复目录", init_action),
        "2": ("查看收件箱状态", status_action),
        "3": ("校验照片文件", verify_action),
        "4": ("生成照片索引", snapshot_action),
        "5": ("生成本地报告", report_action),
        "6": ("打开错题文件夹", lambda current_root: open_inbox(current_root)),
    }

    while True:
        print()
        print("错因Agent V1")
        print(f"根目录：{root}")
        print("1. 初始化/修复目录")
        print("2. 查看收件箱状态")
        print("3. 校验照片文件")
        print("4. 生成照片索引")
        print("5. 生成本地报告")
        print("6. 打开错题文件夹")
        print("0. 退出")
        choice = input("请选择：").strip()
        if choice == "0":
            return
        action = actions.get(choice)
        if not action:
            print("无效选择。")
            continue
        print()
        action[1](root)


def init_action(root: Path) -> None:
    folders = init_inbox(root)
    print(f"已初始化根目录：{root}")
    for folder in folders:
        print(f"- {folder}")


def status_action(root: Path) -> None:
    print_status(root)


def verify_action(root: Path) -> None:
    print_verification(verify_inbox(root))


def snapshot_action(root: Path, index_path: Path | None = None) -> None:
    target = index_path or root / "data" / "photo-index.json"
    data = snapshot_inbox(root, target)
    summary = data["summary"]
    print(f"索引文件：{target.resolve()}")
    print(f"现存照片：{summary['present_photos']}")  # type: ignore[index]
    print(f"历史缺失：{summary['missing_photos']}")  # type: ignore[index]


def report_action(root: Path) -> None:
    report_dir = root / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output = report_dir / f"v1-report-{stamp}.md"
    output.write_text(generate_report(root), encoding="utf-8")
    print(f"报告已生成：{output}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cuoyin-v1",
        description="错因Agent V1 本地错题照片收件箱管理程序",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {VERSION}")
    subparsers = parser.add_subparsers(dest="command")

    for name, help_text in [
        ("menu", "进入交互菜单"),
        ("init", "初始化或修复本地照片目录"),
        ("status", "查看照片数量和最近上传"),
        ("verify", "校验照片扩展名、文件签名和可读性"),
        ("snapshot", "生成带 SHA-256 的照片索引"),
        ("report", "生成 Markdown 收集报告"),
    ]:
        command = subparsers.add_parser(name, help=help_text)
        command.add_argument("--root", help="错因Agent 根目录；默认自动选择")
        if name == "status":
            command.add_argument("--json", action="store_true", help="输出 JSON")
        elif name == "verify":
            command.add_argument("--json", action="store_true", help="输出 JSON")
        elif name == "snapshot":
            command.add_argument("--index", type=Path, help="索引输出路径")
        elif name == "report":
            command.add_argument("--output", type=Path, help="报告输出路径，- 表示 stdout")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    raw_argv = sys.argv[1:] if argv is None else argv
    if not raw_argv:
        raw_argv = ["menu"]
    args = parser.parse_args(raw_argv)
    if args.command is None:
        args.command = "menu"
        args.root = None

    root = resolve_root(getattr(args, "root", None))

    if args.command == "menu":
        run_menu(root)
        return 0
    if args.command == "init":
        init_action(root)
        return 0
    if args.command == "status":
        if args.json:
            print_json(status_data(root))
        else:
            print_status(root)
        return 0
    if args.command == "verify":
        result = verify_inbox(root)
        if args.json:
            print_json(verification_data(root, result))
        else:
            print_verification(result)
        return 0 if result.ok else 1
    if args.command == "snapshot":
        snapshot_action(root, getattr(args, "index", None))
        return 0
    if args.command == "report":
        report = generate_report(root)
        output = getattr(args, "output", None)
        if output is None:
            report_dir = root / "reports"
            report_dir.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            output = report_dir / f"v1-report-{stamp}.md"
        if str(output) == "-":
            print(report, end="")
        else:
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(report, encoding="utf-8")
            print(f"报告已生成：{output}")
        return 0

    parser.error(f"未知命令：{args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
