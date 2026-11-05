"""Safety guard for destructive demo seeding; no external dependencies."""
import os

def assert_demo_seed_allowed(env=None):
    cfg = os.environ if env is None else env
    db_name = cfg.get("DB_NAME", "").strip()
    flag = cfg.get("APOLLO_ALLOW_DEMO_RESET", "").strip()
    if flag != "RESET_DEMO_DATA":
        raise RuntimeError("Seed bloqueado: defina APOLLO_ALLOW_DEMO_RESET=RESET_DEMO_DATA somente para testes.")
    if not db_name.startswith(("apollo_demo_", "apollo_test_")):
        raise RuntimeError("Seed bloqueado: DB_NAME deve comecar com apollo_demo_ ou apollo_test_.")
    mongo_url = cfg.get("MONGO_URL", "")
    if not mongo_url:
        raise RuntimeError("Seed bloqueado: MONGO_URL nao configurada.")
    return True
