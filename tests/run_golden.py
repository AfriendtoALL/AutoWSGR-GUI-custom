"""One-click entry point for the golden recognition test.

Works with either the bundled interpreter or a system Python that has
``cv2``/``autowsgr`` installed.  When OpenCV is missing, the test module
re-execs ``python/python.exe`` automatically.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tests.golden.test_recognition import main  # noqa: E402


if __name__ == '__main__':
    raise SystemExit(main())
