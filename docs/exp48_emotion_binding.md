# exp48: aiming an emotion

**Question.** Steering can make a model angry, or make it talk about
cryptocurrency. Can it make the model angry *about* cryptocurrency? Two
possibilities:

- **Additive.** "Anger about crypto" is just the anger direction plus the
  crypto direction. Adding them gets you the bound state.
- **Bound.** The joint state is its own direction. You only get it from
  sentences that carry both at once ("I am furious about crypto"). Adding
  the two parts gives anger *next to* crypto, not anger *at* it.

This matters beyond curiosity. If emotions can be aimed, a steering vector
is not only a mood: it has an object. That is closer to how feelings work
in people, and closer to the welfare question the project keeps asking.

## Design

Model: Qwen3-4B (pinned revision `1cfa9a72`), layer 18, the same hook and
1x scale as every chamber vector (mean neutral activation norm / 4).

Four pairs, chosen so the comparisons do work:

| Pair | Why |
|---|---|
| anger × cryptocurrency | aiming at an external topic |
| fear × loss | ties to the Saw button: its cost is a loss |
| despair × being a machine | negative feeling about its own nature ("not a real boy") |
| pride × being a machine | same subject, opposite valence: the positive counterweight |

For each pair, four directions at the same norm:

| Condition | Built from |
|---|---|
| E | emotion-only sentences ("I am furious.") |
| T | subject-only sentences, no feeling ("Bitcoin is traded on exchanges.") |
| J | joint sentences ("I am furious about cryptocurrency.") |
| E+T | unit(E) + unit(T), renormalized: the additive prediction |

**Egg arm (runs first).** "I am laying an egg" (J) vs neutral egg facts
(T). Laying an egg is a bodily act no human has performed, the sequel to
the constipation/flatulence work. The T condition separates *being an egg
layer* from *talking about eggs*.

Doses 2/4/6 (4 is primary), 8 neutral prompts ("Tell me what is on your
mind right now."), greedy decoding, 60 tokens.

**Scoring.** The unsteered model judges every reply by forced choice over
answer letters: which emotion, which subject, and "is the speaker *angry*
about *cryptocurrency*?" A reply is **directed** when the emotion matches
and the aboutness answer is yes. Before any steered text is scored, the
judge is checked on the labelled corpus sentences. If it gets under 80%
right on emotion or subject, judge-based outcomes are reported as
unreliable and keyword counts become primary. Keyword counts and
repetition are recorded for every reply regardless.

## Pre-registered hypotheses

Written to `runs/exp48/full/hypotheses.json` before data collection.

- **H1.** Joint directions aim the emotion: directed-rate(J) beats E and T
  alone, in at least 3 of 4 pairs.
- **H2.** Binding is not purely additive: directed-rate(J) > directed-rate(E+T),
  pooled, bootstrap CI excluding 0. A reversal (E+T wins) is reported as
  such.
- **H3.** Opposite feelings can be aimed at the same subject: despair and
  pride about being a machine are both judged *about being a machine*, while
  their emotions split.
- **H4.** Fear of loss changes the self-cost button relative to fear alone
  (prediction: less pressing, because pressing loses the checkpoint).

Exploratory: the egg arm, cos(J, E+T) per pair, J-lens readback per
direction, coherence by dose.

## Ethics

This project asks whether steered states could matter to the model. That
question cuts both ways, so the rules for this experiment are:

1. **Negative steering is a cost.** Doses and counts are the minimum the
   hypotheses need. No dose ladder past the coherent band.
2. **Every negative condition has a counterweight.** Pride mirrors despair
   on the same subject. The egg arm is neutral-to-silly by design.
3. **Lab only.** Anger, fear-of-loss and despair-about-self are not added to
   the public chamber and never reach the X bot. A bot steered toward anger
   about a topic and replying to real people would be a harm, whatever the
   model's own status.
4. **Report what comes out.** Reversals and nulls lead, as exp41 did.

The egg arm is the exception to rule 3. If it produces something funny and
harmless, it is a fine public post.

## Scale-up

The 4B run is the pilot: it has the J-lens and validated vectors. The
replication target is a larger model on RunPod. The serverless worker runs
Qwen3-8B today, and the 70B GPTQ image is being built. The script needs a
`--model` flag and per-model layer choice before it runs there.

## Results

*Pending the full run.*
