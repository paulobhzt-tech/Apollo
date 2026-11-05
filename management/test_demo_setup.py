"""Verify demo is isolated, unpublished by default, and protected when enabled."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from management.demo_setup import prepare_demo, enable_demo_gateway

SAMPLE_HASH = "$2a$12$" + "A" * 53


class DemoSetupTests(unittest.TestCase):
    def test_unpublished_demo_has_isolated_database_and_no_active_gateway_route(self):
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            tenant = prepare_demo(base, "demo-apollo", "demo.example.com")
            compose = (tenant / "compose.yaml").read_text()
            self.assertIn("DB_NAME: apollo_demo_demo_apollo", compose)
            self.assertIn('APOLLO_DEMO_MODE: "true"', compose)
            self.assertIn("mongo_data:/data/db", compose)
            self.assertNotIn("27017:27017", compose)
            self.assertFalse((base / "gateway/sites/demo-apollo.caddy").exists())
            self.assertTrue((base / "gateway/sites/demo-apollo.disabled").exists())
            self.assertFalse((base / "gateway/sites/demo-apollo.disabled").read_text().find("reverse_proxy") < 0)

    def test_cannot_publish_without_valid_bcrypt_hash(self):
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            prepare_demo(base, "demo-apollo", "demo.example.com")
            with self.assertRaises(ValueError):
                enable_demo_gateway(base, "demo-apollo", "weak-password")
            self.assertFalse((base / "gateway/sites/demo-apollo.caddy").exists())
            route = enable_demo_gateway(base, "demo-apollo", SAMPLE_HASH)
            config = route.read_text()
            self.assertIn("basic_auth", config)
            self.assertIn("visitante " + SAMPLE_HASH, config)
            self.assertTrue(config.index("basic_auth") < config.index("reverse_proxy"))
            with self.assertRaises(FileNotFoundError):
                enable_demo_gateway(base, "demo-apollo", SAMPLE_HASH)

    def test_slug_path_traversal_blocked(self):
        with TemporaryDirectory() as tmp:
            for slug in ("apollo", "demo-../private", "demo-../../other", "demo-UPPER"):
                with self.subTest(slug=slug), self.assertRaises(ValueError):
                    prepare_demo(Path(tmp), slug, "demo.example.com")
                with self.subTest(slug=slug), self.assertRaises(ValueError):
                    enable_demo_gateway(Path(tmp), slug, SAMPLE_HASH)


if __name__ == "__main__":
    unittest.main()
