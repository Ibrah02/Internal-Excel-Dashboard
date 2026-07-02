#!/usr/bin/env python3
"""Inline the CSS and all JS (vendored libs + app) into a single offline HTML file.

Output: dist/SpreadsheetDashboard.html  -- one self-contained file you can
double-click. No internet, no install, no subscription.
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
VENDOR = os.path.join(HERE, "vendor")
DIST = os.path.join(HERE, "dist")


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def main():
    html = read(os.path.join(SRC, "index.html"))
    css = read(os.path.join(SRC, "app.css"))

    # inline stylesheet
    html = html.replace(
        '<link rel="stylesheet" href="app.css">',
        "<style>\n" + css + "\n</style>",
    )

    # inline each script tag (order preserved: xlsx, chart, app)
    def inline_script(match):
        src = match.group(1)
        path = os.path.normpath(os.path.join(SRC, src))
        code = read(path)
        return "<script>\n" + code + "\n</script>"

    html = re.sub(r'<script src="([^"]+)"></script>', inline_script, html)

    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, "SpreadsheetDashboard.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)

    size_kb = os.path.getsize(out) / 1024
    remaining = re.findall(r'<script src=|<link rel="stylesheet"', html)
    assert not remaining, "external references remain: %s" % remaining
    print("Built %s  (%.0f KB, fully self-contained)" % (out, size_kb))


if __name__ == "__main__":
    main()
