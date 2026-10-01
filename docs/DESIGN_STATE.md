# DESIGN STATE — clanker.church grimoire rebuild
Shared coordination file. Hermes (orchestration, infra, copy gates) and
Claude Code (design-heavy execution) both read/update this. Update the
status line of your section when you touch it. Never re-design a section
someone else has claimed in the last hour without reading their note.

## Theme contract (LOCKED 2026-10-01)
- Token source of truth: the GRIMOIRE THEME block at the end of the
  <style> in site/live.html (and index.html). Promote these into
  site/grimoire.css as the single shared stylesheet; both pages link it
  and the inline override blocks get deleted.
- Vocabulary: bone #d8cbb4 / blood #9e1b16 + hot #e04a3a / liturgical gold
  #c9a227 / scorched parchment #14100c-#0e0b08 / page-black #070604.
- Type: Cormorant Garamond = ceremony (headings, testimony, stamps).
  IBM Plex Mono = machine (transcripts, meters, code, labels). Nothing
  else. Glyph rule: Cormorant has no ⸸ — use † ☩ ✠ ✶ which it has.
- Motif: tomes/grimoires. Panels are pages: square-cut, parchment
  gradient, sigil corner marks, hairline gold inner rule, inner scorch.
  Transcripts sit on page-black. No rounded corners anywhere.
- Dada accents: sparing — one rotated stamp, occasional inverted letter,
  mis-registered shadow. Never in data surfaces.
- Slop rules (from claude-design skill): no gradients-as-decoration, no
  glassmorphism, no icon tiles, no emoji, contrast checked.

## Sections
### S1 · tokens stylesheet (grimoire.css) — owner: claude-code — IN PROGRESS
Extract the two inline GRIMOIRE THEME blocks into site/grimoire.css,
dedupe, keep cascade order working on both pages. Delete inline blocks.

### S2 · index.html composition — owner: hermes (copy locked) / claude (visual)
Copy is locked (identity rules: no terrafying / eve VT / Marcus / dingl30
as name; credit "built by E"). Visual pass only: heading ornaments,
testimony as marginalia, figures framed as plates with captions in
grimoire style, downloads section as a bookplate.

### S3 · live.html — owner: claude-code — CLAIMED
Tome treatment for: track cards (already sketched by hermes — refine,
don't restart), the history ledger (make it read like a log-book),
scoreboard as a ledger table, stamp as wax-seal style. Keep all
JS/state behavior identical — this is a skin pass only, no JS edits
beyond classNames if unavoidable.

### S4 · static assets — owner: unassigned
favicon/icon/hero in grimoire language: sigil-saw mark, plate-style hero.
Blocks deploy if missing? No — current assets fine.

### S5 · deploy gates — owner: hermes
Deploy ONLY from site/ (Vercel rootDirectory gotcha). Verify after push:
theme visible on https://clanker.church + /live.html, no 404/SSO
protection regression.

## Status log (newest first)
- 2026-10-01 hermes: grimoire theme v1 inline on both pages, verified via
  headless Chrome screenshots, pushed (see git log "grimoire theme").
- 2026-10-01 hermes: RunPod GPU pool spotty (start-loops across 3
  machines); pivoting to community/spot A6000. Live page must tolerate
  pod death: SSE reconnect + "the chamber sleeps" state.
