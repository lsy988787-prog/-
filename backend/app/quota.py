"""平台免费额度：每个使用者每天最多发多少条消息。

试点阶段没有账号，用浏览器生成的匿名 ID 加 IP 识别使用者，计数存在内存里（重启清零）。
上线多实例部署后改为 Redis 或数据库。用户自带密钥（BYOK）的请求不占平台额度。
"""

from __future__ import annotations

import threading
from collections.abc import Callable
from datetime import date


class DailyQuota:
    def __init__(self, limit: int, today: Callable[[], date] = date.today):
        self.limit = limit
        self._today = today
        self._day = today()
        self._used: dict[str, int] = {}
        self._lock = threading.Lock()

    def _roll(self) -> None:
        d = self._today()
        if d != self._day:
            self._day, self._used = d, {}

    def remaining(self, who: str) -> int:
        with self._lock:
            self._roll()
            return max(0, self.limit - self._used.get(who, 0))

    def take(self, who: str) -> bool:
        """占用一条额度；额度用完时返回 False。"""
        with self._lock:
            self._roll()
            used = self._used.get(who, 0)
            if used >= self.limit:
                return False
            self._used[who] = used + 1
            return True

    def refund(self, who: str) -> None:
        """模型调用失败时退回额度。"""
        with self._lock:
            if self._used.get(who, 0) > 0:
                self._used[who] -= 1
