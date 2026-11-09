from pydantic import ValidationError
import pytest
from routers.assistant_openai import ChatQuestion, SYSTEM

def test_provider_choices():
    assert ChatQuestion(question="Como estão minhas vendas hoje?", provider="gemini").provider == "gemini"
    assert ChatQuestion(question="Como estão minhas vendas hoje?", provider="local").provider == "local"
    assert ChatQuestion(question="Como estão minhas vendas hoje?").provider == "openai"
    with pytest.raises(ValidationError):
        ChatQuestion(question="Como estão minhas vendas hoje?", provider="outro")

def test_guardrails():
    assert "EXCLUSIVAMENTE" in SYSTEM
    assert "não chame faturamento de lucro" in SYSTEM
