import json
import tempfile
import unittest
from pathlib import Path

from app.cuoyin_v1 import init_inbox, snapshot_inbox, status_data, verify_inbox


class CuoyinV1Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.pending = self.root / "错题" / "初中" / "待识别"

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_init_and_status(self) -> None:
        folders = init_inbox(self.root)
        self.assertEqual(len(folders), 6)
        self.assertTrue((self.root / ".错因Agent").exists())

        (self.pending / "valid.jpg").write_bytes(b"\xff\xd8\xff\xe0fake")
        data = status_data(self.root)
        self.assertTrue(data["inbox_exists"])
        self.assertEqual(data["total_photos"], 1)
        self.assertEqual(data["counts"]["初中"]["待识别"], 1)

    def test_verify_detects_invalid_and_duplicate_files(self) -> None:
        init_inbox(self.root)
        (self.pending / "valid.jpg").write_bytes(b"\xff\xd8\xff\xe0first")
        (self.pending / "duplicate.jpg").write_bytes(b"\xff\xd8\xff\xe0first")
        (self.pending / "broken.jpg").write_bytes(b"not an image")
        (self.pending / "empty.jpg").write_bytes(b"")
        (self.pending / "note.txt").write_text("not a photo", encoding="utf-8")

        result = verify_inbox(self.root)
        error_codes = {issue.code for issue in result.errors}
        warning_codes = {issue.code for issue in result.warnings}

        self.assertFalse(result.ok)
        self.assertEqual(result.files_checked, 5)
        self.assertEqual(result.valid_photos, 2)
        self.assertIn("empty_file", error_codes)
        self.assertIn("invalid_image_signature", error_codes)
        self.assertIn("unsupported_extension", warning_codes)
        self.assertIn("duplicate_photo", warning_codes)
        self.assertEqual(
            result.duplicate_groups,
            [
                [
                    "错题/初中/待识别/duplicate.jpg",
                    "错题/初中/待识别/valid.jpg",
                ]
            ],
        )

    def test_snapshot_tracks_missing_photos(self) -> None:
        init_inbox(self.root)
        photo = self.pending / "photo.jpg"
        photo.write_bytes(b"\xff\xd8\xff\xe0photo")

        first = snapshot_inbox(self.root)
        self.assertEqual(
            first["summary"],
            {"total_records": 1, "present_photos": 1, "missing_photos": 0},
        )

        photo.unlink()
        second = snapshot_inbox(self.root)
        records = second["photos"]
        self.assertEqual(second["summary"]["missing_photos"], 1)
        self.assertTrue(records[0]["is_missing"])
        self.assertEqual(records[0]["relative_path"], "错题/初中/待识别/photo.jpg")

        raw_index = json.loads(
            (self.root / "data" / "photo-index.json").read_text(encoding="utf-8")
        )
        self.assertEqual(raw_index["schema"], "cuoyin-agent-photo-index-v1")

    def test_verify_accepts_iphone_heic_and_webp(self) -> None:
        init_inbox(self.root)
        (self.pending / "iphone.heic").write_bytes(
            b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00"
        )
        (self.pending / "picture.webp").write_bytes(
            b"RIFF\x24\x00\x00\x00WEBPVP8 "
        )

        result = verify_inbox(self.root)
        self.assertTrue(result.ok)
        self.assertEqual(result.valid_photos, 2)
        self.assertEqual(result.errors, [])
        self.assertEqual(result.warnings, [])


if __name__ == "__main__":
    unittest.main()
