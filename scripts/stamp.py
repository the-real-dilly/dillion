#!/usr/bin/env python3
"""Cache-busting: stamp every page/asset link with a version and write version.json.
Usage: python3 scripts/stamp.py [VERSION]   (default: UTC timestamp)
Runs automatically in the Pages workflow with the commit SHA."""
import re, sys, json, time, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
v = sys.argv[1] if len(sys.argv) > 1 else time.strftime("%Y%m%d%H%M%S", time.gmtime())
files = ["index.html", "app.js", "games.js", "dilly-gone-mad.html", "dilly-goes-wild.html", "last-zone-preview.html", "last-zone.html"]
for name in files:
    p = root / name
    if not p.exists():
        continue
    s = p.read_text()
    s2 = re.sub(r'(\?v=)[A-Za-z0-9]+', r'\g<1>' + v, s)
    s2 = re.sub(r'(window\.DILLION_V\s*=\s*")[^"]*(")', r'\g<1>' + v + r'\g<2>', s2)
    if s2 != s:
        p.write_text(s2)
(root / "version.json").write_text(json.dumps({"v": v}) + "\n")
print("stamped", v)
