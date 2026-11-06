"""Kitchen production workflow safety regression tests."""
import pytest
from routers.operations import kds_transition_allowed


@pytest.mark.parametrize("before,after", [
    ("novo", "preparo"),
    ("preparo", "pronto"),
    ("pronto", "entregue"),
    ("novo", "novo"),
    ("preparo", "preparo"),
    ("pronto", "pronto"),
    ("entregue", "entregue"),
])
def test_kds_accepts_forward_steps_and_idempotent_retries(before, after):
    assert kds_transition_allowed(before, after)


@pytest.mark.parametrize("before,after", [
    ("novo", "pronto"),
    ("novo", "entregue"),
    ("preparo", "novo"),
    ("preparo", "entregue"),
    ("pronto", "preparo"),
    ("entregue", "pronto"),
])
def test_kds_rejects_skipped_or_backward_steps(before, after):
    assert not kds_transition_allowed(before, after)
