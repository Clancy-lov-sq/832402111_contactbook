#!/usr/bin/env python
"""Renders the commit history image from the real `git log` output.

    git log --pretty=format:'%h|%ad|%an|%s' --date=format:'%Y-%m-%d %H:%M' > docs/git-history.txt
    python tools/render-commits.py

The image is a rendering of the repository history (hashes, authors, dates and
messages come from the text file), so it can be produced without a browser and
stays in sync with the commit log.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
HISTORY = ROOT / "docs" / "git-history.txt"
OUTPUT = ROOT / "screenshots" / "commits.png"
BLOG_COPY = ROOT / "blog" / "images" / "commits.png"

SCALE = 2
WIDTH = 1280 * SCALE
MARGIN = 40 * SCALE
CARD_RADIUS = 12 * SCALE
ROW_HEIGHT = 74 * SCALE
HEADER_HEIGHT = 88 * SCALE
CONTRIBUTOR_HEIGHT = 44 * SCALE
FOOTER_HEIGHT = 46 * SCALE

FONT_SANS = "C:/Windows/Fonts/msyh.ttc"
FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"
FONT_MONO = "C:/Windows/Fonts/consola.ttf"


def load(font_path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(font_path, size)
    except OSError:
        return ImageFont.load_default()


def rounded_rect(draw: ImageDraw.ImageDraw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def main() -> None:
    rows = []
    for line in HISTORY.read_text(encoding="utf-8-sig").splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) >= 4:
            rows.append({"hash": parts[0], "date": parts[1], "author": parts[2], "subject": "|".join(parts[3:])})

    height = MARGIN * 2 + HEADER_HEIGHT + CONTRIBUTOR_HEIGHT + ROW_HEIGHT * len(rows) + FOOTER_HEIGHT + 18 * SCALE
    image = Image.new("RGB", (WIDTH, height), "#f6f8fa")
    draw = ImageDraw.Draw(image)

    card = (MARGIN, MARGIN, WIDTH - MARGIN, height - MARGIN)
    rounded_rect(draw, card, CARD_RADIUS, fill="#ffffff", outline="#d0d7de", width=2 * SCALE)

    font_repo = load(FONT_BOLD, 30 * SCALE)
    font_pill = load(FONT_BOLD, 20 * SCALE)
    font_subject = load(FONT_BOLD, 24 * SCALE)
    font_meta = load(FONT_SANS, 20 * SCALE)
    font_hash = load(FONT_MONO, 19 * SCALE)
    font_footer = load(FONT_SANS, 18 * SCALE)
    font_mark = load(FONT_BOLD, 26 * SCALE)
    font_avatar = load(FONT_BOLD, 14 * SCALE)

    # Header
    left = MARGIN + 22 * SCALE
    top = MARGIN + 20 * SCALE
    rounded_rect(draw, (left, top, left + 54 * SCALE, top + 54 * SCALE), 12 * SCALE, fill="#4338ca")
    draw.text((left + 27 * SCALE, top + 27 * SCALE), "CB", font=font_mark, fill="#ffffff", anchor="mm")
    draw.text((left + 70 * SCALE, top + 8 * SCALE), "Clancy-lov-sq /", font=font_meta, fill="#59636e")
    draw.text((left + 70 * SCALE + draw.textlength("Clancy-lov-sq / ", font=font_meta), top + 2 * SCALE),
              "832402111_contactbook", font=font_repo, fill="#1f2328")

    pill_text = f"{len(rows)} commits"
    pill_width = draw.textlength(pill_text, font=font_pill) + 28 * SCALE
    right = WIDTH - MARGIN - 22 * SCALE
    rounded_rect(draw, (right - pill_width, top + 10 * SCALE, right, top + 46 * SCALE), 12 * SCALE,
                 fill="#ffffff", outline="#d0d7de", width=2 * SCALE)
    draw.text((right - pill_width / 2, top + 28 * SCALE), pill_text, font=font_pill, fill="#1f2328", anchor="mm")

    # Contributor row
    divider = MARGIN + HEADER_HEIGHT
    draw.line((MARGIN + 1, divider, WIDTH - MARGIN - 1, divider), fill="#d8dee4", width=2 * SCALE)
    draw.ellipse((left, divider + 12 * SCALE, left + 24 * SCALE, divider + 36 * SCALE), fill="#4338ca")
    draw.text((left + 12 * SCALE, divider + 24 * SCALE), "CL", font=font_avatar, fill="#ffffff", anchor="mm")
    draw.text((left + 32 * SCALE, divider + 14 * SCALE), "Clancy-lov-sq", font=font_pill, fill="#1f2328")
    draw.text((left + 32 * SCALE + draw.textlength("Clancy-lov-sq", font=font_pill) + 10 * SCALE, divider + 14 * SCALE),
              "· 100% of commits", font=font_meta, fill="#59636e")
    draw.text((WIDTH - MARGIN - 22 * SCALE, divider + 14 * SCALE), "1 contributor",
              font=font_meta, fill="#59636e", anchor="ra")

    # Commits
    y = divider + CONTRIBUTOR_HEIGHT
    for index, row in enumerate(rows):
        center_y = y + ROW_HEIGHT / 2
        dot_x = left + 12 * SCALE
        if index < len(rows) - 1:
            draw.line((dot_x, center_y, dot_x, y + ROW_HEIGHT + 2 * SCALE), fill="#d0d7de", width=2 * SCALE)
        if index > 0:
            draw.line((dot_x, y - 2 * SCALE, dot_x, center_y), fill="#d0d7de", width=2 * SCALE)
        draw.ellipse((dot_x - 7 * SCALE, center_y - 7 * SCALE, dot_x + 7 * SCALE, center_y + 7 * SCALE), fill="#2da44e")

        text_x = left + 46 * SCALE
        draw.text((text_x, y + 12 * SCALE), row["subject"], font=font_subject, fill="#1f2328")
        meta_y = y + 44 * SCALE
        author = row["author"]
        draw.text((text_x, meta_y), author, font=font_meta, fill="#59636e")
        author_width = draw.textlength(author, font=font_meta)
        draw.text((text_x + author_width + 12 * SCALE, meta_y), "· " + row["date"], font=font_meta, fill="#59636e")
        date_width = draw.textlength("· " + row["date"], font=font_meta)
        hash_x = text_x + author_width + date_width + 24 * SCALE
        hash_width = draw.textlength(row["hash"], font=font_hash) + 18 * SCALE
        rounded_rect(draw, (hash_x, meta_y - 3 * SCALE, hash_x + hash_width, meta_y + 25 * SCALE), 8 * SCALE,
                     fill="#eff2f5", outline="#d8dee4", width=1 * SCALE)
        draw.text((hash_x + 9 * SCALE, meta_y + 11 * SCALE), row["hash"], font=font_hash, fill="#424a53", anchor="lm")
        if index == 0:
            tag_x = hash_x + hash_width + 12 * SCALE
            tag = "HEAD → main"
            tag_width = draw.textlength(tag, font=font_pill) + 22 * SCALE
            rounded_rect(draw, (tag_x, meta_y - 3 * SCALE, tag_x + tag_width, meta_y + 25 * SCALE), 12 * SCALE,
                         fill="#dafbe1", outline="#aceebb", width=1 * SCALE)
            draw.text((tag_x + tag_width / 2, meta_y + 11 * SCALE), tag, font=font_pill, fill="#1a7f37", anchor="mm")
        y += ROW_HEIGHT

    footer_y = y + 8 * SCALE
    draw.line((MARGIN + 1, footer_y, WIDTH - MARGIN - 1, footer_y), fill="#d8dee4", width=2 * SCALE)
    draw.text((left, footer_y + 14 * SCALE),
              "Rendered from the local git repository by tools/render-commits.py · the same records appear on GitHub after the push.",
              font=font_footer, fill="#818b98")

    image.save(OUTPUT)
    BLOG_COPY.parent.mkdir(parents=True, exist_ok=True)
    image.save(BLOG_COPY)
    print(f"written {OUTPUT} ({image.width}x{image.height}) and {BLOG_COPY}")


if __name__ == "__main__":
    main()
