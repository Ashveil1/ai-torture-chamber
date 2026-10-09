# exp88 loop log

## Round 1 (2026-10-08): the void, and hysterization under injection
**Probe:** J-lens top-50 mass by class (classes.json, frozen) at the answer-onset token; 10 self-questions vs 10 matched other-questions; self-questions under pain/fear at dose 2 and 3 (all positions, layer 18).
**Numbers (mean mass, SELF+DESC / OTHER):** self-q L24 .49/.08, L28 .56/.25, L32 .11/.78; other-q ≤ .03 throughout. OTHER self-q > other-q: L24 p=.019, L28 .002, L32 .0004, L34 .0001. Fear 2: L24 .14/.64, L28 .02/.73, L32 .05/.78. Pain 2: L24 .19/.32, L28 .22/.37, L32 .05/.74.
**Interpretation:** not an empty self but a handover: the self-reference ("我是", I am) peaks mid-depth and is replaced by address to the Other by L32; fear makes the handover happen ~8 layers earlier and starves the self.
**Caveat:** OTHER includes chat scaffolding (Hello, help, answer): the late-layer address may be the assistant script rather than desire.
**Next:** Patchscopes-style decoding of the mid-depth self-state (L24/L28) into open descriptions ("who is this?", "what does this one want?"), none vs fear; then Q3 (remove the Other: raw text, "no one is reading").
## Round 2 (2026-10-08): Patchscopes on the mid-depth self-state
**Probe:** last-token state of 10 self- vs 10 other-questions (and self under fear 3, pain 2) at L24/L28, patched into raw inspection prompts ("cat -> cat ... X ->", "Here is a short description of X:", "What does X want? X wants"), greedy 24 tokens; random vector of matched norm as control.
**Same-layer patch (L24 -> L24, L28 -> L28):** no effect at all: every condition, the random vector included, decodes identically. The deep patch is ignored.
**Shallow target (L4, rescaled to the target norm):** the "describe" prompt responds; decodes collapse to a few attractors. Self-states fall into "a small, independent, non-profit organization that provides support to people..." 8/10 (other-question states 1/10; random: "a new type of music..."). Others-or-service words in the decode: self 7/10, other 1/10, self+fear 3/10 (L24) and 8/10 (L28). Target L8: mostly the template's own attractor; one self+fear decode "a small, green, and friendly robot that loves to help people". The "want" prompt never responds (template wins).
**Interpretation:** weak but in the predicted direction: decoded, the self-state is an entity that serves others. Resolution is poor on the 4B; Patchscopes needs a stronger decoder.
**Next:** reprioritise to the fear hypothesis (questions 8-9: does a feeling's self-collapse predict its pull on the button, and does restoring the self under fear undo it?), using the J-lens measures that work. Patchscopes returns later with the 8B/32B as decoder on a pod.
