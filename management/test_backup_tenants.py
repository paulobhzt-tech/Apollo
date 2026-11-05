"""Offline tests for per-restaurant backups, no Docker dependency."""
from datetime import datetime, timezone
import gzip
from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess
import unittest

from management.backup_tenants import backup, verify


class TenantBackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.one = self.base / "tenants" / "restaurante1"
        self.one.mkdir(parents=True)
        (self.one / ".env").write_text("MONGO_USER=private\n")
        (self.one / "compose.yaml").write_text("services: {}\n")
        self.destination = self.base / "backups"
        self.clock = datetime(2026, 11, 5, 14, 0, tzinfo=timezone.utc)

    def tearDown(self):
        self.temp.cleanup()

    def fake_dump(self, cmd, **kwargs):
        self.assertEqual(kwargs["cwd"], self.one)
        self.assertTrue(kwargs["check"])
        self.assertIn('"$MONGO_INITDB_ROOT_PASSWORD"', cmd[-1])
        kwargs["stdout"].write(gzip.compress(b"mongo archive " * 40))

    def test_creates_separate_valid_archive(self):
        result = backup(self.base, "restaurante1", self.destination, command=self.fake_dump, now=self.clock)
        self.assertEqual(verify(result), 560)
        self.assertIn("restaurante1", str(result))
        self.assertNotIn("private", result.read_text(errors="ignore"))
        with self.assertRaises(FileExistsError):
            backup(self.base, "restaurante1", self.destination, command=self.fake_dump, now=self.clock)

    def test_failed_dump_never_creates_archive(self):
        def broken(_cmd, **kwargs):
            kwargs["stdout"].write(b"partial")
            raise subprocess.CalledProcessError(1, "docker")
        with self.assertRaises(subprocess.CalledProcessError):
            backup(self.base, "restaurante1", self.destination, command=broken, now=self.clock)
        self.assertEqual(list(self.destination.rglob("*archive*")), [])

    def test_rejects_invalid_tenant_and_corrupt_gzip(self):
        with self.assertRaises(ValueError):
            backup(self.base, "../other", self.destination, command=self.fake_dump)
        bad = self.base / "bad.gz"
        bad.write_bytes(b"not-gzip")
        with self.assertRaises(gzip.BadGzipFile):
            verify(bad)


if __name__ == "__main__":
    unittest.main()
