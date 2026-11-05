"""Prevent accidental deletion of customer data by demo seed."""
import unittest

from lib.demo_guard import assert_demo_seed_allowed

class DemoGuardTests(unittest.TestCase):
    def test_production_db_is_rejected_even_with_opt_in(self):
        for name in ("apollo_pdv","client_01",""):
            with self.subTest(name=name), self.assertRaises(RuntimeError):
                assert_demo_seed_allowed({"DB_NAME":name,"MONGO_URL":"mongodb://localhost","APOLLO_ALLOW_DEMO_RESET":"RESET_DEMO_DATA"})
    def test_demo_requires_explicit_flag(self):
        with self.assertRaises(RuntimeError):
            assert_demo_seed_allowed({"DB_NAME":"apollo_demo_test","MONGO_URL":"mongodb://localhost"})
    def test_demo_db_with_opt_in_accepted(self):
        self.assertTrue(assert_demo_seed_allowed({"DB_NAME":"apollo_demo_test","MONGO_URL":"mongodb://localhost","APOLLO_ALLOW_DEMO_RESET":"RESET_DEMO_DATA"}))
    def test_unset_mongo_url_rejected(self):
        with self.assertRaises(RuntimeError):
            assert_demo_seed_allowed({"DB_NAME":"apollo_test_ci","APOLLO_ALLOW_DEMO_RESET":"RESET_DEMO_DATA"})

if __name__ == "__main__":
    unittest.main()
