import unittest

from management.module_catalog import CORE_MODULES, MODULE_BY_CODE, build_proposal


class ModuleCatalogTests(unittest.TestCase):
    def test_basic_monthly(self):
        result = build_proposal("basico", "mensal")
        self.assertEqual(set(result["modules"]), CORE_MODULES)
        self.assertEqual(result["status"], "rascunho")

    def test_basic_annual_addons(self):
        result = build_proposal("basico", "anual", ["estoque", "kds"])
        self.assertIn("estoque", result["modules"])
        self.assertIn("kds", result["modules"])
        self.assertIsNone(result["price_cents"])

    def test_complete_includes_all(self):
        self.assertEqual(set(build_proposal("completo", "anual")["modules"]), set(MODULE_BY_CODE))

    def test_rejects_invalid_and_duplicate(self):
        for plan, period, extras in [
            ("premium", "mensal", []), ("basico", "semanal", []),
            ("basico", "mensal", ["inexistente"]),
            ("basico", "mensal", ["kds", "kds"]),
            ("basico", "mensal", ["pdv"]),
            ("completo", "anual", ["kds"]),
        ]:
            with self.subTest(plan=plan, period=period, extras=extras):
                with self.assertRaises(ValueError):
                    build_proposal(plan, period, extras)


if __name__ == "__main__":
    unittest.main()
