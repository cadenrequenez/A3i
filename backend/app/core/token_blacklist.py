from typing import Set

_BLACKLIST: Set[str] = set()


def add(token: str) -> None:
    _BLACKLIST.add(token)


def is_blacklisted(token: str) -> bool:
    return token in _BLACKLIST
