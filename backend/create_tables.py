"""Idempotent table bootstrap.

Run with: ``uv run python -m backend.create_tables``

Connects via the shared async engine and runs ``Base.metadata.create_all``,
which is a no-op for tables that already exist.
"""

import asyncio

from .db import engine
from .models import Base


async def _create_all() -> None:
    if engine is None:
        raise RuntimeError(
            "DATABASE_URL is not set; cannot create tables. "
            "Set DATABASE_URL and retry."
        )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()


def main() -> None:
    asyncio.run(_create_all())
    print("Tables created (or already present).")


if __name__ == "__main__":
    main()
