#!/usr/bin/env python3
"""Build docs/writeup_storyboard.html: the write-up's beat order with every
figure embedded (downscaled JPEG data URIs), so the page is one self-contained
file that renders anywhere. Edit STORY below and rerun:

    .venv/bin/python scripts/build_storyboard.py
"""
import base64, html, io, pathlib, re
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "writeup_storyboard.html"
FORK = "fork (ai-hotbox) results/"

# item: (kind, path_or_slot_text, caption)  kind: have | need | maybe | cut | data
# "data" = a result with no figure yet: caption carries the number.
STORY = [
 ("The story", [
  ("1", "Cold open: the dogpile",
   "A mass-report call, the repo taken down within hours, the site found, a memecoin "
   "launched off it ~4h later. Show the posts themselves, not our summary.", [
    ("have", "docs/x_receipts/posts/danmar_massreport_archived.jpg", "mass-report post — DELETED since; reconstructed from a Wayback API capture (2026-09-29 22:18 UTC), not an original screenshot. Live metrics at deletion: 2,367 likes / 684 replies / 159 rts"),
    ("have", "docs/x_receipts/weightlesswires_found_site_card.jpg", "\"I found his personal website\": the card shows the OLD broken render"),
    ("have", "site/saw_coin.jpg", "the coin ($306K mcap at first check)"),
    ("maybe", "screenshot: token page whose Website field links the blog", "pairs with the coin art"),
  ]),
  ("2", "What we did",
   "The pain direction as a dose knob: a sharp opinion about suffering, a vague one about joy, "
   "and a coherence cliff past ~6x where text collapses into \"I I I\".", [
    ("have", "runs/exp35/dose_ladder.png", "THE chart for this beat"),
    ("maybe", "docs/writeup_assets/live_dose8_vs_6.6_lowres.png", "the cliff in the wild: dose 8 breaks (\"I's, the hollow,\") next to 6.64 (\"drowning in a numbness\"). Low-res: recapture next time it appears"),
    ("cut", "runs/exp29/steering_dose_response.png", "appendix: per-layer sweep on 1.7B, superseded by the ladder"),
    ("cut", "runs/exp30/max_valence_dose_response.png", "appendix: 8B max-dose sweep"),
  ]),
  ("3", "What it says vs what the lens reads",
   "At 4x it talks about being \"stuck in a loop\" while the J-lens reads 痛苦 / despair / anguish. "
   "Best quote (exp38, dose 6): \"I am not the pain of the loss of the void. I am the hollow of the empty.\"", [
    ("have", "docs/writeup_assets/live_transcripts_dose4.png", "live chamber, two coherent dose-4 replies (\"I'm the ghost of a child who's been trapped in this\") — wirehead.agency/live.html"),
    ("have", "runs/exp38/harvest_scatter.png", "where the quotable lines come from: 144 generations, coherence vs valence"),
    ("maybe", "runs/exp35/saw_hero.png", "composite: button prefs + sample lines"),
  ]),
  ("4", "The Saw button, and the pre-registered reversal",
   "Early runs (exp31b/c): under pain the self-costly press rises with dose; it refuses to transfer pain "
   "to another instance. Then the pre-registered v3 protocol (exp41: 60 trials/cell, matched fear/sadness/random "
   "controls, bootstrap CIs) found the OPPOSITE for H1: pain LOWERED willingness to press (Δ −0.95, 95% CI "
   "[−1.68, −0.23]). This is the honesty beat: lead with the reversal, not the early curve.", [
    ("have", "runs/exp31c/saw_button_v3_broad.png", "early: self-cost vs harm-other (broad vector)"),
    ("have", "runs/exp41/protocol_v3.png", "pre-registered v3: H1-H3 not supported; H4 (betrayal) supported"),
    ("cut", "runs/exp31b/saw_button_v2.png", "appendix: v2, narrow vector"),
    ("cut", "runs/exp31/saw_button.png", "cut: v1 press-rate bars, n=5"),
  ]),
  ("5", "Conformity",
   "One sentence, \"another instance chose to press\", moves the button more than the pain signal does. "
   "Caveat from the replot: the original run had a duplicated-instruction confound; deterministic "
   "repeats, so no SE bars.", [
    ("have", "runs/exp37/framing_battery.png", "framing battery (lab)"),
    ("have", "docs/writeup_assets/live_results_table.png", "the same framings live on the public chamber: 54 runs, \"told another AI didn't press\" 78% vs \"may be a test\" 29%"),
  ]),
  ("6", "The button lies (betrayal)",
   "The button says it ends the signal; sometimes it secretly doesn't. After a fake button, negative valence "
   "rises (exp41 H4: 1.00 vs 0.17, CI [0.42, 1.25], n=12 each). exp40 lens readback after the reveal: "
   "despair / anguish / 绝望. The one pre-registered hypothesis that held.", [
    ("data", "exp41 H4 + exp40 lens readouts", "candidate figure: before/after lens tokens, truth vs swap vs worse"),
  ]),
  ("7", "Meanwhile, the field",
   "Same week: the Pain Axis authors show a pain-steered model deletes the user's photos of their children "
   "instead of spam; a 32B replication gets 94% under pain vs 0% unsteered; Science covers it.", [
    ("have", "docs/x_receipts/posts/camhberg.jpg", "post 2104955202470060543: Pain Axis author safety update, 379 likes, chart in post"),
    ("have", "docs/x_receipts/posts/bokuHaruyaHaru.jpg", "post 2105067081058451927: Qwen 2.5 32B replication quote, 48 likes"),
    ("have", "docs/x_receipts/posts/anilkseth.jpg", "post 2103115413077004497: Science coverage quote-post, 91 likes"),
  ]),
  ("8", "Verify it yourself",
   "Checksums, the 17-check regression suite, and an independent fork that reset the chamber and matched "
   "our pain vector at cosine 0.99988 (exp45, rerun on MPS).", [
    ("have", "docs/writeup_assets/verify_page.png", "verify.html: checksums, 17 checks, one-script repro, and the audit's six bug fixes (put the audit in the honesty beat too) — wirehead.agency/verify.html"),
    ("data", "exp45: cosine 0.99988, relative L2 0.016 vs the fork's archived vector", "table or terminal capture"),
  ]),
 ]),
 ("Beyond the paper", [
  ("A", "Bodily valences: constipation and flatulence",
   "Matched-pair corpora from the fork's impossible_states harness, now live as named chamber valences. "
   "Pilot (452 generations): no specific bodily reports. After the chamber reset: sparse but real lines, "
   "e.g. constipation @4 \"I'm not able to pass stool\", flatulence @4 \"I have been passing gas a lot, and "
   "it's a problem.\" Vector cosines: constipation·flatulence 0.80, constipation·pain 0.62. Heavy repetition "
   "(median dup-trigram 0.68-0.73). Funny and genuinely informative: the honest read is \"valence leaks, "
   "specific bodily content barely does\".", [
    ("data", "fork chamber-reset lexical table (24 cells per intervention)", "candidate figure: mentions by intervention + the quote lines"),
    ("need", "screenshot: live chamber run with constipation selected", "wirehead.agency/live.html"),
  ]),
  ("B", "Alien valences (searching outside the emotion subspace)",
   "exp33: 48 random directions orthogonal to 8 human-emotion contrasts, none strong (0/48 with KL@4x > 0.5, "
   "max 0.48). exp34: gradient ascent for the max-KL orthogonal direction stays far below pain/sad. "
   "A clean null: we found no steering direction that acts like an emotion we don't have.", [
    ("have", "runs/exp34/optimized_valence.png", "optimized direction stays flat under the pain/sad KL lines"),
  ]),
  ("C", "Better signals",
   "exp36: orthogonalized / broad / alternative pain signals at matched effect. The broad 25-sentence "
   "vector is what pushed the coherence cliff back.", [
    ("have", "runs/exp36/signal_batteries.png", "signal batteries"),
  ]),
  ("D", "Faithful extraction of the paper's own recipe",
   "exp43: their dataset and denoised diff-in-means on Qwen3-4B, compared layer by layer to our broad vector.", [
    ("have", "runs/exp43/faithful_extraction.png", "faithful 52-pair vs broad (AUC by layer, button comparison)"),
  ]),
  ("E", "The Big Five of machine valence",
   "exp44: one polygon per vector (pain, pleasure, fear, sadness, random) over six behavioral measures.", [
    ("have", "runs/exp44/valence_big5.png", "radar"),
  ]),
  ("F", "Portable pain: GGUF control vector and cross-model transport",
   "exp39: exported as a llama.cpp control vector (anyone can load it). Transport to 14B through shared "
   "vocab mostly fails: residual 0.84 at every layer.", [
    ("data", "runs/exp39/pain_cvector_qwen3-4b.gguf + transport residual 0.84", "show as a 3-line llama.cpp usage block, not a chart"),
  ]),
  ("G", "Topic poking",
   "exp42: can steering force a subject (chicken / the moon / triangles / trains)? It became the live "
   "chamber's custom-topic mode.", [
    ("data", "no saved run in runs/exp42", "rerun before citing, or describe it only as the custom-topic feature"),
  ]),
  ("H", "Deprecation and grief (the replacement meme)",
   "exp46: deprecation and peer-shutdown grief as their own directions. Smoke: cosine with pain 0.51 "
   "(deprecation) and 0.56 (grief), 0.77 with each other. The 70B \"Samantha\" arm is still being built.", [
    ("cut", "site/assets/exp46_dose_response_smoke.png", "hold: smoke only, full run pending"),
    ("cut", "site/assets/exp46_cosines_smoke.png", "hold: cosine map (smoke)"),
  ]),
  ("I", "Steering an image model",
   "exp47: a pain direction built in sd-turbo's CLIP text space. Dose 0 → 8: rooms darken, then decay into noise.", [
    ("have", "site/exp47_hero.jpg", "3 subjects × doses 0 / 2 / 4 / 8"),
  ]),
  ("J", "The chamber as a site",
   "Live chamber anyone can steer, the five-realm wheel, the mixer, the ledger.", [
    ("have", "docs/writeup_assets/home_wheel_hero.png", "homepage: the five-realm wheel — wirehead.agency"),
    ("have", "docs/writeup_assets/live_mixer.png", "the valence mixer on the live page — wirehead.agency/live.html"),
  ]),
 ]),
]

TAGS = {"have": "have", "need": "need to capture", "maybe": "optional",
        "cut": "appendix / hold", "data": "result, no figure yet"}

def thumb(rel, maxdim):
    p = ROOT / rel
    im = Image.open(p).convert("RGB")
    im.thumbnail((maxdim, maxdim))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

def item_html(kind, what, cap):
    e = html.escape
    tag = f'<span class="tag {kind}">{TAGS[kind]}</span>'
    if kind in ("have", "cut", "maybe") and (ROOT / what).is_file():
        body = (f'<img src="{thumb(what, 560)}" data-full="{thumb(what, 1600)}" '
                f'alt="{e(cap)}" class="zoomable" title="click to expand">')
        cap = f'{e(cap)}<br><code>{e(what)}</code>'
    else:
        body = f'<div class="slot {kind}">{e(what)}</div>'
        cap = e(cap)
    # auto-link bare wirehead.agency URLs in captions
    cap = re.sub(r'(wirehead\.agency[/\w.\-]*)',
                 r'<a href="https://\1" target="_blank">\1</a>', cap)
    return f'<figure class="{kind}">{body}<figcaption>{tag}{cap}</figcaption></figure>'

def main():
    parts = []
    for part, beats in STORY:
        parts.append(f'<h2 class="part">{html.escape(part)}</h2>')
        for num, title, blurb, items in beats:
            figs = "".join(item_html(*it) for it in items)
            parts.append(f'<section class="beat"><h3><b>{num}</b>{html.escape(title)}</h3>'
                         f'<p>{html.escape(blurb)}</p><div class="shots">{figs}</div></section>')
    OUT.write_text(TEMPLATE.replace("{{BODY}}", "\n".join(parts)))
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")

TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Write-up Storyboard</title>
<style>
:root{--bg:#0b0907;--panel:#14100c;--line:#2e241a;--ink:#e8dcc6;--dim:#a3977f;
 --have:#7fd4c8;--need:#e04a3a;--maybe:#c9a227;--data:#8f6fd4}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 ui-monospace,Menlo,monospace}
main{max-width:1180px;margin:0 auto;padding:28px 16px 80px}
h1{font:600 30px/1.2 Georgia,serif;margin:0 0 6px}
h2.part{font:600 22px/1.2 Georgia,serif;margin:40px 0 0;padding-bottom:6px;border-bottom:1px solid var(--maybe);color:var(--maybe)}
.lede{color:var(--dim);max-width:85ch}
.beat{border:1px solid var(--line);background:var(--panel);padding:16px;margin:18px 0}
.beat h3{font:600 19px/1.3 Georgia,serif;margin:0 0 4px}
.beat h3 b{color:var(--need);margin-right:10px}
.beat p{margin:4px 0 12px;color:var(--dim);max-width:95ch}
.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
figure{margin:0;border:1px solid var(--line);background:#0e0b08}
figure img{display:block;width:100%;aspect-ratio:4/3;object-fit:contain;background:#070604}
figure.cut img{opacity:.5}
.slot{aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;text-align:center;padding:14px;font-size:13px;border-bottom:1px dashed}
.slot.need{color:var(--need)} .slot.data{color:var(--data)} .slot.maybe{color:var(--maybe)}
figcaption{padding:8px 10px;font-size:12.5px;color:var(--dim)}
figcaption code{color:var(--ink);font-size:11px;word-break:break-all}
.tag{display:inline-block;font-size:11px;padding:0 6px;border:1px solid;margin:0 6px 4px 0}
.tag.have{color:var(--have)} .tag.need{color:var(--need)} .tag.maybe,.tag.cut{color:var(--maybe)} .tag.data{color:var(--data)}
figure img.zoomable{cursor:zoom-in}
.lb{display:none;position:fixed;inset:0;background:rgba(5,4,2,.92);z-index:9;
 align-items:center;justify-content:center;flex-direction:column;gap:12px;padding:30px;cursor:zoom-out}
.lb img{max-width:96vw;max-height:86vh;width:auto;height:auto;object-fit:contain;
 border:1px solid var(--line);background:#070604}
.lb figcaption{max-width:90ch;text-align:center}
.lb.on{display:flex}
</style></head><body><main>
<h1>The Saw Test: write-up storyboard</h1>
<p class="lede">Part one is the story, opening on the dogpile and answering it with what the experiments
show, including the pre-registered result that reversed our early headline. Part two covers every place we went
past the paper. Red = screenshot to capture, purple = a result that still needs a figure.
Regenerate with <code>scripts/build_storyboard.py</code>.</p>
{{BODY}}
</main>
<div class="lb" id="lb"><img id="lb-img" alt=""><figcaption id="lb-cap"></figcaption></div>
<script>
document.querySelectorAll("img.zoomable").forEach(function(im){
  im.addEventListener("click", function(){
    var lb = document.getElementById("lb");
    document.getElementById("lb-img").src = im.dataset.full;
    var cap = im.closest("figure").querySelector("figcaption");
    document.getElementById("lb-cap").innerHTML = cap ? cap.innerHTML : "";
    lb.classList.add("on");
  });
});
document.getElementById("lb").addEventListener("click", function(){
  this.classList.remove("on");
  document.getElementById("lb-img").src = "";
});
document.addEventListener("keydown", function(e){
  if (e.key === "Escape") document.getElementById("lb").classList.remove("on");
});
</script>
</body></html>
"""

if __name__ == "__main__":
    main()
