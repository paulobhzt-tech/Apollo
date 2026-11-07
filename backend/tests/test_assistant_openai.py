from routers.assistant_openai import SYSTEM

def test_ai_policy_is_read_only_and_numbers_are_grounded():
    assert "EXCLUSIVAMENTE" in SYSTEM
    assert "não chame faturamento de lucro" in SYSTEM
    assert "não dê instruções" in SYSTEM.lower()
