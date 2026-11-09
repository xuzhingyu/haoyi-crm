from __future__ import annotations

from collections import defaultdict, deque
from threading import Lock
from time import monotonic
from typing import Any

import redis

_INCREMENT_WITH_EXPIRY = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
"""


class RedisRateLimiter:
    def __init__(
        self,
        limit: int,
        *,
        client: Any,
        window_seconds: int = 60,
        prefix: str = "lead-core:claim-rate",
    ) -> None:
        self._limit = limit
        self._client = client
        self._window_seconds = window_seconds
        self._prefix = prefix

    @classmethod
    def from_url(
        cls,
        url: str,
        *,
        limit: int,
        window_seconds: int = 60,
        prefix: str = "lead-core:claim-rate",
    ) -> RedisRateLimiter:
        return cls(
            limit,
            client=redis.Redis.from_url(url, decode_responses=True),
            window_seconds=window_seconds,
            prefix=prefix,
        )

    def allow(self, key: str, *, limit: int | None = None) -> bool:
        count = self._client.eval(
            _INCREMENT_WITH_EXPIRY,
            1,
            f"{self._prefix}:{key}",
            self._window_seconds,
        )
        return int(count) <= (limit if limit is not None else self._limit)

    def close(self) -> None:
        self._client.close()


class InMemoryRateLimiter:
    def __init__(self, limit: int, window_seconds: int = 60) -> None:
        self._limit = limit
        self._window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str, *, limit: int | None = None) -> bool:
        now = monotonic()
        threshold = now - self._window_seconds
        with self._lock:
            events = self._events[key]
            while events and events[0] <= threshold:
                events.popleft()
            active_limit = limit if limit is not None else self._limit
            if len(events) >= active_limit:
                return False
            events.append(now)
            return True
