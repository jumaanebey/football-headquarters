#!/usr/bin/env python3
"""Reject opaque/checkerboard sprite exports before they reach the asset resolver.
Usage: python scripts/check-sprites.py path/to/sprite.png [more.png ...]
Requires Pillow, already used by the project's art tools. Does not modify images.
"""
import argparse
import json
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('paths', nargs='+')
parser.add_argument('--size', type=int, default=1024)
args = parser.parse_args()
reports = []
for path in args.paths:
    try:
        with Image.open(path) as image:
            errors = []
            if image.size != (args.size, args.size):
                errors.append(f'Expected {args.size}x{args.size}; got {image.width}x{image.height}')
            if 'A' not in image.getbands():
                errors.append('Missing alpha channel; a checkerboard picture is not transparency')
            else:
                alpha = image.getchannel('A')
                low, high = alpha.getextrema()
                if low != 0 or high == 0:
                    errors.append('Sprite must contain both transparent background and visible artwork')
                corners = [alpha.getpixel((x, y)) for x in (0, image.width-1) for y in (0, image.height-1)]
                if any(corners):
                    errors.append('Canvas corners must be transparent')
            reports.append({'path': path, 'mode': image.mode, 'size': list(image.size), 'accepted': not errors, 'errors': errors})
    except (OSError, ValueError) as error:
        reports.append({'path': path, 'accepted': False, 'errors': [str(error)]})
print(json.dumps(reports, indent=2))
raise SystemExit(0 if all(report['accepted'] for report in reports) else 1)
