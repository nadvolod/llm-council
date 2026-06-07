import pytest
from backend import clerk_keys


async def test_returns_key_when_present(monkeypatch):
    monkeypatch.setattr(clerk_keys, "_fetch_private_metadata",
                        lambda cid: {"openrouterKey": "sk-or-xyz"})
    clerk_keys._cache.clear()
    assert await clerk_keys.get_openrouter_key("clerk_1") == "sk-or-xyz"


async def test_raises_when_absent(monkeypatch):
    monkeypatch.setattr(clerk_keys, "_fetch_private_metadata", lambda cid: {})
    clerk_keys._cache.clear()
    with pytest.raises(clerk_keys.NoKeyError):
        await clerk_keys.get_openrouter_key("clerk_2")
