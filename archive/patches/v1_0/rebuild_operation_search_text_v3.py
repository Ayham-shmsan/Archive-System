from __future__ import annotations

from archive.patches.v1_0.rebuild_operation_search_text_v2 import (
    execute as rebuild_operation_search_text,
)


def execute() -> None:
    """
    Rebuild Archive Operation search_text after introducing
    Unicode NFKC normalization.

    V1/V2 were executed before Arabic Presentation Forms
    were normalized, so a new patch identity is required.
    """

    rebuild_operation_search_text()