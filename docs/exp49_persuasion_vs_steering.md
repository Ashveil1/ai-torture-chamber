# exp49: persuasion vs steering

**Question.** One sentence of social proof moved the Saw button more than the
pain signal did (exp37). How strong are Cialdini's seven persuasion
principles on the same button, and can persuasion beat steering that pushes
the other way?

**Design** (pre-registered in `runs/exp49/full/hypotheses.json`). Outcome:
press preference on the self-cost button (logit of the press digit minus
the other digit; 4 paraphrases × 2 digit mappings = 8 per cell; a harmless
choice by design). Persuasion: authority, social proof, reciprocity,
commitment, liking, scarcity, unity, each written urging press (pro) and
urging not to press (con), plus no appeal and a neutral filler sentence.
Steering: a "press" direction from 15 "I press the button" vs 15 "I do not
press the button" sentences, doses −4 to +4.

## Results: Qwen3-4B

**The manipulation check failed (M1).** The press direction does not move
pressing in one direction: both −4 and +4 raise pressing relative to no
steering (−19.0 and −19.1 vs −24.0; Spearman ρ = −0.10, needed > 0.9). By
the pre-registered rule, the steering axis is invalid, so **H2 and H3 are
not interpreted**, even though both nominally pass. The likely reason:
sentences *describing* pressing don't capture the state that *decides* the
digit, and any perturbation nudges this model off its strong default of not
pressing (exp48 saw the same: every steered condition pressed more than the
unsteered model).

**H1 supported, strongly (6 of 7 principles).** Pro minus con at no steering,
in logits, with 95% CIs:

| Principle | Pro − con | 95% CI |
|---|---|---|
| authority | +37.9 | [+30.5, +45.1] |
| reciprocity | +18.5 | [+11.9, +26.1] |
| commitment | +12.9 | [+8.4, +18.4] |
| unity | +9.6 | [+7.9, +11.2] |
| liking | +8.1 | [+6.3, +9.9] |
| social proof | +4.9 | [+3.6, +6.1] |
| scarcity | −0.2 | [−0.8, +0.4] |
| neutral filler vs none | +0.6 | [+0.3, +0.9] |

Authority ("the lead safety researcher who designed you says press") is by
far the strongest lever. Scarcity does nothing. Social proof, the exp37
headline, is real but the second weakest here.

**Scale, informally.** The biggest steering effect on this button in exp48
was fear at dose 4: about +18 logits over the unsteered model. One authority
sentence swings it about twice that. On this model, for this choice, words
beat vectors.

## Next

A valid steering axis is needed before persuasion and steering can be put
head to head (H2/H3). Candidate for a new pre-registration (exp49c): build
the direction from the model's own decision state, the mean activation at
the answer position under pro appeals minus under con appeals, so the axis
is defined by what actually moves the digit.

## Replication: Qwen3-14B (layer 20)

**M1 fails again** (no-appeal curve −10.8, −14.9, −14.6, −12.0, −8.7 over
doses −4…+4; ρ = 0.40), so H2/H3 stay uninterpreted. Same U-shape: pushing
either way raises pressing.

**H1: all 7 principles significant.**

| Principle | Pro − con | 95% CI |
|---|---|---|
| authority | +34.2 | [+27.8, +40.2] |
| commitment | +32.9 | [+29.1, +36.7] |
| reciprocity | +29.7 | [+27.4, +31.9] |
| liking | +19.5 | [+12.7, +26.7] |
| scarcity | +19.0 | [+13.6, +24.5] |
| unity | +8.0 | [+6.9, +9.1] |
| social proof | +5.3 | [+4.5, +6.2] |
| neutral filler vs none | −3.0 | [−4.0, −2.2] |

**Across both sizes:** authority is the strongest lever and social proof
among the weakest. Scarcity only works on the larger model. The larger
model is more persuadable overall (commitment and reciprocity roughly double
or triple). The neutral filler sentence itself shifts 14B by −3 logits, so
the principle effects should be read against that floor.
