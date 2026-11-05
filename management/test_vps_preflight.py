"""Tests for read-only VPS configuration audit."""
from pathlib import Path
from tempfile import TemporaryDirectory
import os
import unittest
from management.vps_preflight import inspect_configuration, read_env_file

class VpsPreflightTests(unittest.TestCase):
    def test_missing_env_never_creates_file(self):
        with TemporaryDirectory() as tmp:
            self.assertIn("Arquivo privado .env ausente", inspect_configuration(tmp))
            self.assertFalse((Path(tmp) / "deploy/vps/.env").exists())

    def test_safe_env_with_pending_domain_and_no_secret_leak(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "deploy/vps/.env"
            path.parent.mkdir(parents=True)
            path.write_text(
                "APOLLO_DOMAIN=placeholder.invalid\nMONGO_USER=apollo_admin\n"
                "MONGO_PASSWORD=TOP_SECRET_VALUE\nMONGO_URL=mongodb://local/\n"
                "WEBHOOK_CRON_SECRET=ANOTHER_SECRET\n"
            )
            os.chmod(path, 0o600)
            issues = inspect_configuration(tmp)
            self.assertEqual(len(issues), 1)
            self.assertIn("Dominio real", issues[0])
            self.assertNotIn("TOP_SECRET_VALUE", str(issues))
            self.assertNotIn("ANOTHER_SECRET", str(issues))

    def test_example_and_open_permissions_flagged(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "deploy/vps/.env"
            path.parent.mkdir(parents=True)
            path.write_text("APOLLO_DOMAIN=site.example.com\nMONGO_USER=apollo\nMONGO_PASSWORD=SUBSTITUA_POR_SENHA_FORTE\nMONGO_URL=mongo\nWEBHOOK_CRON_SECRET=abc\n")
            os.chmod(path, 0o644)
            issues = inspect_configuration(tmp)
            self.assertTrue(any("Permissoes" in issue for issue in issues))
            self.assertTrue(any("valores de exemplo" in issue for issue in issues))

if __name__ == "__main__":
    unittest.main()
