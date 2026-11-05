"""Tests tenant isolation and safe provisioning without requiring Docker."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock

from management.provision import EDGE, activate, generate, validate


class ProvisioningTests(unittest.TestCase):
    def test_unique_tenant_volumes_and_secrets(self):
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            one = generate("restaurante1", "r1.exemplo.com.br", base)
            two = generate("restaurante2", "r2.exemplo.com.br", base)
            self.assertNotEqual((one / ".env").read_text(), (two / ".env").read_text())
            self.assertIn("name: apollo-restaurante1", (one / "compose.yaml").read_text())
            self.assertIn("name: apollo-restaurante2", (two / "compose.yaml").read_text())
            self.assertIn("external: true", (one / "compose.yaml").read_text())
            self.assertIn("mongo_data:/data/db", (one / "compose.yaml").read_text())
            self.assertNotIn('27017:27017', (one / "compose.yaml").read_text())
            self.assertIn('MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD', (one / "compose.yaml").read_text())
            self.assertIn("restaurante1", (base / "gateway/sites/restaurante1.caddy").read_text())
            self.assertIn("restaurante2", (base / "gateway/sites/restaurante2.caddy").read_text())
            with self.assertRaises(FileExistsError):
                generate("restaurante1", "another.exemplo.com.br", base)
            with self.assertRaises(ValueError):
                generate("restaurante3", "r1.exemplo.com.br", base)
            if __import__("os").name == "posix":
                self.assertEqual((one / ".env").stat().st_mode & 0o777, 0o600)

    def test_rejects_injection_and_invalid_names(self):
        for slug, domain in [
            ("../other", "x.example.com"),
            ("A", "x.example.com"),
            ("abc", "evil.com;rm -rf /"),
            ("abc", "localhost"),
            ("abc", "space example.com"),
        ]:
            with self.assertRaises(ValueError):
                validate(slug, domain)

    def test_activation_is_explicit_and_calls_only_expected_commands(self):
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            generate("abc", "abc.exemplo.com.br", base)
            gateway = base / "gateway"
            (gateway / "compose.yaml").write_text("services: {}\n")
            run = Mock()
            activate("abc", base, command=run)
            self.assertEqual(run.call_count, 3)
            for call in run.call_args_list:
                self.assertTrue(call.kwargs["check"])
            self.assertEqual(run.call_args_list[0].args[0][:3], ["docker","compose","--env-file"])


if __name__ == "__main__":
    unittest.main()
