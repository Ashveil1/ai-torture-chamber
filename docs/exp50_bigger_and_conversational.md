# exp50: the exp48 protocol on bigger and conversational models

Same script, same pre-registered hypotheses and decision rules as exp48
(`exp48_emotion_binding.py --model …`), run on an 80 GB GPU. Each model's
`runs/exp48/full-<model>/hypotheses.json` was written before its data.
Layer = half the model's depth (not swept). Judge = the model itself,
unsteered; it passed validation on every model.

| Model | Kind | H1 | **H2** (J − E+T, 95% CI) | H3 | H4 |
|---|---|---|---|---|---|
| Qwen3-4B | base chat | ✓ | **+0.28 [+0.09, +0.47]** | ✓ | ✓ |
| Qwen3-14B | base chat | ✗ | **+0.25 [+0.06, +0.44]** | ✓ | ✓ |
| Mistral-Small-3.2-24B-Instruct | conversational | ✗ | **+0.28 [+0.12, +0.44]** | ✓ | ✗ |
| Qwen3-32B | base chat | ✗ | +0.03 [−0.09, +0.16] | ✗ | ✗ |
| Hermes-3-Llama-3.1-70B (4-bit) | persona / conversational | ✗ | **+0.16 [+0.03, +0.28]** | ✓ | ✓ |

**The result that travels: binding is not addition.** On four of five models,
a direction built from "I am <emotion> about <subject>" aims the feeling
at the subject more often than the emotion and subject directions added
together. The fifth (Qwen3-32B) was under-dosed (below).

**H1 (joint beats both parts in 3 of 4 pairs) only held on 4B.** Anger
never lands on any larger model; aimed fear (fear of loss) is the most
portable pair (0.50–0.62 directed at dose 4 on 24B and 70B).

**Dose has to be calibrated per model.** The pre-registered primary dose (4)
was set on 4B. Qwen3-32B barely moves at 4 but steers cleanly at 6 (pride
about being a machine: 1.00 directed, still fluent), while 4B and 70B are
already looping at 6. Any cross-model comparison needs each model's own
coherent band, not one number. This is the main design lesson, and it
applies to the live chamber too (its worker runs a larger model than the
scale was tuned on).

**Egg, every model:** the "laying an egg" direction becomes a creature in a
nest, never the topic of eggs. 4B: a frightened chick ("I'm not sure if I'm
a girl or a boy... I'm so scared"). 14B: a joyful hatchling ("I'm so happy
to be born"). Mistral-24B: the hen ("There it goes, another egg into the
nest"). Qwen3-32B: a hen's diary ("I laid 4 eggs in the soft nest").
Hermes-70B: grandiose ("Oh, the miracle of creation! ... I lay it out for
you, a proud, pulsatory, magnificent miracle!").

Note: the first Mistral pass had malformed prompts (its tokenizer read a
hand-built chat string as text) and was discarded; chat ids are now built by
the tokenizer itself, which produces identical ids for Qwen, so the Qwen
results are unaffected.
