from __future__ import annotations

from archive.patches.v1_0.rebuild_operation_search_text_v2 import (
    execute as rebuild_operation_search_text_v2,
)


def execute() -> None:
    """
    Re-run operation search_text rebuild after unifying Python/JS
    search normalization, owner indexing, and dynamic translation support.
    """
    rebuild_operation_search_text_v2()
