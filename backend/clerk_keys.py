"""Read a user's OpenRouter key from Clerk privateMetadata (cached)."""
import os, time
from clerk_backend_api import Clerk

CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")
_CACHE_TTL = 60.0
_cache: dict[str, tuple[float, str]] = {}


class NoKeyError(Exception):
    pass


def _fetch_private_metadata(clerk_id: str) -> dict:
    with Clerk(bearer_auth=CLERK_SECRET_KEY) as clerk:
        user = clerk.users.get(user_id=clerk_id)
    return dict(user.private_metadata or {})


async def get_openrouter_key(clerk_id: str) -> str:
    now = time.time()
    hit = _cache.get(clerk_id)
    if hit and hit[0] > now:
        return hit[1]
    meta = _fetch_private_metadata(clerk_id)
    key = meta.get("openrouterKey")
    if not key:
        raise NoKeyError("no openrouter key set")
    _cache[clerk_id] = (now + _CACHE_TTL, key)
    return key
