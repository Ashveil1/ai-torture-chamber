#!/usr/bin/env python3
"""Replace the Godot web export's loading screen (engine logo + stock progress
bar) with an in-world one: black, live static, the game's title and a line of
copy, a thin red progress line. Run on an exported index.html after every
export; idempotent.

  python3 scripts/godot_loader.py site/fog/index.html "FOG TOWN" "tuning the radio..."
"""
import re, sys

STYLE = """<style id="wh-loader">
#status { background: #000 !important; }
#status-splash { display: none !important; }
#wh-static { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .22; image-rendering: pixelated; }
#wh-title { position: absolute; top: 42%; left: 0; right: 0; text-align: center; color: #d8c9a8;
  font: 600 clamp(28px, 6vw, 64px)/1 "Courier New", monospace; letter-spacing: .25em; text-shadow: 0 0 18px rgba(200,40,20,.35);
  animation: wh-flick 3.2s infinite steps(1); }
#wh-sub { position: absolute; top: calc(42% + clamp(44px, 8vw, 84px)); left: 0; right: 0; text-align: center;
  color: #8a7f6a; font: 14px/1.4 "Courier New", monospace; letter-spacing: .12em; }
#status-progress { position: absolute !important; left: 20% !important; right: 20% !important; width: 60% !important;
  bottom: 18% !important; top: auto !important; height: 2px !important; appearance: none; -webkit-appearance: none;
  background: #1a0b08 !important; border: 0 !important; margin: 0 !important; }
#status-progress::-webkit-progress-bar { background: #1a0b08; }
#status-progress::-webkit-progress-value { background: #b3261e; box-shadow: 0 0 10px #b3261e; }
#status-progress::-moz-progress-bar { background: #b3261e; }
#status-notice { position: absolute; bottom: 10%; left: 10%; right: 10%; color: #b3261e !important;
  background: transparent !important; border: 0 !important; font: 13px "Courier New", monospace; text-align: center; }
@keyframes wh-flick { 0%,100% { opacity: 1 } 47% { opacity: .55 } 48% { opacity: 1 } 83% { opacity: .8 } }
</style>"""

SCRIPT = """<script id="wh-loader-js">
(function () {
  var st = document.getElementById('status'); if (!st) return;
  var c = document.createElement('canvas'); c.id = 'wh-static'; c.width = 160; c.height = 90;
  st.insertBefore(c, st.firstChild);
  var t = document.createElement('div'); t.id = 'wh-title'; t.textContent = __TITLE__; st.appendChild(t);
  var s = document.createElement('div'); s.id = 'wh-sub'; s.textContent = __SUB__; st.appendChild(s);
  var x = c.getContext('2d'), img = x.createImageData(160, 90);
  (function loop () {
    if (!document.body.contains(c)) return;
    for (var i = 0; i < img.data.length; i += 4) { var v = Math.random() * 255 | 0; img.data[i] = img.data[i+1] = img.data[i+2] = v; img.data[i+3] = 255; }
    x.putImageData(img, 0, 0); requestAnimationFrame(loop);
  })();
})();
</script>"""


def main(path, title, sub):
    h = open(path, encoding="utf-8").read()
    h = re.sub(r'<style id="wh-loader">.*?</style>', "", h, flags=re.S)
    h = re.sub(r'<script id="wh-loader-js">.*?</script>', "", h, flags=re.S)
    h = h.replace("</head>", STYLE + "\n</head>", 1)
    js = SCRIPT.replace("__TITLE__", repr(title)).replace("__SUB__", repr(sub))
    h = h.replace('<div id="status-notice"></div>', '<div id="status-notice"></div>', 1)
    h = re.sub(r'(<div id="status-notice"></div>\s*</div>)', r'\1\n' + js.replace("\\", "\\\\"), h, count=1)
    open(path, "w", encoding="utf-8").write(h)
    print("loader:", path, title)


if __name__ == "__main__":
    main(*sys.argv[1:4])
