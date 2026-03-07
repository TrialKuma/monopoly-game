import re, pathlib
p = pathlib.Path(__file__).parent / "game.js"
src = p.read_text(encoding="utf-8")
dst = re.sub(r'/\* LEGACY_SVG_START_MARKER[\s\S]*?LEGACY_SVG_END_MARKER \*/', '', src)
p.write_text(dst, encoding="utf-8")
print(f"done – removed {len(src)-len(dst)} chars ({src.count(chr(10))-dst.count(chr(10))} lines)")
