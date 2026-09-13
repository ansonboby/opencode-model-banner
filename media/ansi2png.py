#!/usr/bin/env python3
"""Render a tmux `capture-pane -e` snapshot to a PNG screenshot.

Usage: ansi2png.py <capture.ans> <out.png> [cols] [rows] [--crop <top> <bottom>]
"""
import sys, re
from PIL import Image, ImageDraw, ImageFont

BG = (10, 14, 26)
DEFAULT_FG = (200, 205, 214)

def load_font():
    for candidate in [
        '/usr/share/fonts/TTF/DejaVuSansMono.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
        '/usr/share/fonts/dejavu-sans-mono-fonts/DejaVuSansMono.ttf',
        '/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf',
        '/usr/share/fonts/noto/NotoSansMono-Regular.ttf',
        '/usr/share/fonts/noto/NotoMono-Regular.ttf',
    ]:
        try:
            return ImageFont.truetype(candidate, 22)
        except OSError:
            continue
    return ImageFont.load_default()

def parse_sgr(m, rgb, bright):
    for code in re.findall(r'\d+;?\d*' if False else r'[^;]+|\d+(?:;\d+)*', ''):
        pass

def main():
    args = sys.argv[1:]
    path, out = args[0], args[1]
    cols = int(args[2]) if len(args) > 2 else 160
    rows = int(args[3]) if len(args) > 3 else 40
    crop = None
    if '--crop' in args:
        i = args.index('--crop')
        crop = (int(args[i+1]), int(args[i+2]))

    raw = open(path, encoding='utf-8', errors='replace').read()
    lines = raw.split('\n')[:rows]

    font = load_font()
    # measure actual glyph advance from the font
    cell_w = 13
    cell_h = 27
    try:
        from PIL import ImageFont as IF
        probe = Image.new('RGB', (10, 10))
        pd = ImageDraw.Draw(probe)
        bbox = pd.textbbox((0, 0), '█▀▄█', font=font)
        cell_w = max(10, (bbox[2] - bbox[0]) // 4 + 1)
        cell_h = int((bbox[3] - bbox[1]) * 1.35)
    except Exception:
        pass

    top = crop[0] if crop else 0
    bottom = crop[1] if crop else len(lines)
    img = Image.new('RGB', (cols * cell_w, (bottom - top) * cell_h), BG)
    draw = ImageDraw.Draw(img)

    for y, line in enumerate(lines[top:bottom], start=top):
        fg = DEFAULT_FG
        x = 0
        i = 0
        while i < len(line) and x < cols:
            m = re.match(r'\x1b\[([0-9;]*)m', line[i:])
            if m:
                params = m.group(1)
                if '48;2;' in params or '48;5;' in params:
                    pass  # ignore bg changes (art bg matches ours)
                tm = re.search(r'38;2;(\d+);(\d+);(\d+)', params)
                if tm:
                    fg = tuple(int(v) for v in tm.groups())
                else:
                    pm = re.match(r'(\d+)', params)
                    if pm and pm.group(1) in ('39', '0'):
                        fg = DEFAULT_FG
                i += m.end()
                continue
            ch = line[i]
            if ch != ' ':
                draw.text((x * cell_w, (y - top) * cell_h), ch, fill=fg, font=font)
            x += 1
            i += 1

    img.save(out)
    print('saved', out, img.size)

if __name__ == '__main__':
    main()
