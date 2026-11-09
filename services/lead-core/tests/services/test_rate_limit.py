from lead_core.services.rate_limit import RedisRateLimiter


class FakeRedis:
    def __init__(self, values: list[int]) -> None:
        self.values = iter(values)
        self.calls: list[tuple[str, int, str, int]] = []

    def eval(self, script: str, key_count: int, key: str, ttl_seconds: int) -> int:
        self.calls.append((script, key_count, key, ttl_seconds))
        return next(self.values)


def test_redis_rate_limiter_is_shared_by_account_and_minute() -> None:
    redis = FakeRedis([1, 10, 11])
    limiter = RedisRateLimiter(limit=10, client=redis, window_seconds=60)

    assert limiter.allow("member-1") is True
    assert limiter.allow("member-1") is True
    assert limiter.allow("member-1") is False
    assert redis.calls[0][1:] == (1, "lead-core:claim-rate:member-1", 60)
