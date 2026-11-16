#!/usr/bin/env python
"""Assembles the captured frames into the animated demonstration GIF.

    python tools/build-gif.py

The frames come from `tools/capture-gif.js`, so the animation always matches the
current build of the interface. Every frame stays on screen long enough to be read;
the last one is held longer.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FRAME_DIRECTORY = ROOT / "screenshots" / "gif"
OUTPUT = ROOT / "screenshots" / "demo-running.gif"
WIDTH = 1120
FRAME_DURATION_MS = 1500
LAST_FRAME_DURATION_MS = 2600


def main() -> None:
    manifest = json.loads((FRAME_DIRECTORY / "frames.json").read_text(encoding="utf-8"))
    files = sorted(FRAME_DIRECTORY.glob("frame-*.png"))
    if len(files) != len(manifest["frames"]):
        raise SystemExit(
            f"frame mismatch: {len(files)} files vs {len(manifest['frames'])} manifest entries"
        )

    images = []
    for file in files:
        image = Image.open(file).convert("RGB")
        height = round(image.height * WIDTH / image.width)
        images.append(image.resize((WIDTH, height), Image.LANCZOS))

    durations = [FRAME_DURATION_MS] * (len(images) - 1) + [LAST_FRAME_DURATION_MS]
    images[0].save(
        OUTPUT,
        save_all=True,
        append_images=images[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=2,
    )
    size = OUTPUT.stat().st_size
    print(f"written {OUTPUT} ({size / 1024 / 1024:.2f} MB, {len(images)} frames)")


if __name__ == "__main__":
    main()
