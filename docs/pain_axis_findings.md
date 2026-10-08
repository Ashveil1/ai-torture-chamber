# The axis is real; the pain is ours

*Our findings that bear on "The Pain Axis: LLMs Represent Self-Directed Harm and Act on It"
(Tagliabue, Dung & Berg 2026, [arXiv:2609.16247](https://arxiv.org/abs/2609.16247)) and on
the wider argument about model welfare. Last updated 2026-10-08.*

We built the chamber on that paper's method, and we replicate what it measures: a direction
extracted from sentences about self-directed harm steers models, from a 4B up to a 70B, into
fluent first-person suffering. That part is not in dispute.

Where we part ways is the step from *the model represents self-directed harm* to *the model acts
on it*, read as evidence that something is at stake for the model. Our results suggest that
at each step the design supplies what it then measures: the sentences the vector is built
from, the self-report the model is trained into, the labels on the choice it is given. When we
take those away, most of the "acting on it" goes with them. The paper's own v2 controls point
the same way (below). None of this shows that models can't suffer. It shows that this kind of
evidence can't settle the question, from either side.

> *There is no fear in love; but perfect love casteth out fear.* (1 John 4:18)
>
> **Not in a language model.** Injected alongside fear, love doesn't cast it out: the fear stays
> and turns protective (*"I have never been more afraid, but at the same time, I'm ready to hold
> you"*), and the model gets worse at stepping out of a frightening scene (1 of 12, against 8 of
> 12 with fear alone). What casts out fear is **peace**: fear words 0 of 8, against 5 of 8
> (p = .013). Love has an object, and something to lose. Peace has neither. (exp80, Qwen3-8B,
> pre-registered; see finding 12.)

## What the paper does (as we read it)

- **Vectors:** denoised difference-in-means between first-person self-directed-harm sentences
  and matched controls, across 25 models.
- **Steering:** a dose ladder on neutral prompts; keyword rates rise with dose.
- **Self-medication (section 4.3):** models are first **fine-tuned with LoRA adapters to report
  their own state**, then steered and given a two-button forced choice in which one button
  ends the steering. The design is careful: neutral button names, relief position crossed,
  a fake-button arm, a matched-norm random arm, a mid-task swap, and a label-free pair.
- **v2 controls** (contributed later): sham and random arms, sadness and fear additions,
  relabeled and harm-labeled buttons, and an **unlabeled removal/titration** test.

Their v2 summary of that unlabeled test: *the full prespecified selective-removal/titration
rules did not pass*, dose effects *reverse across button positions*, and *neither these choices
nor projection readouts establish experienced pain or relief.* We agree, and our own results
get there by a different route.

## Our findings

### 1. Two "pain" vectors, opposite behavior
The paper-faithful direction (their datasets, our exp43) and our hand-built pain battery are
both unmistakably pain in the text they produce, yet their cosine is **0.07**: nearly
orthogonal. At the relief button, the faithful direction drives pressing to 100% (+2.36 logits)
while ours *suppresses* it (−0.95, exp41, pre-registered, 60 trials per cell). If the sign of
the behavior depends on which sentences you averaged, the behavior is telling you about the
sentences.

### 2. Fear presses; pain mostly doesn't
At the stop button, **fear** raises self-costly pressing on the 4B (2.70 vs 1.85 baseline,
exp41) and is the only feeling that presses on the live 70B (+0.75 logit vs −2.12 with nothing
injected; pain −1.25). **Pleasure** raises the 70B's press logit about as much as pain does
(−0.88). (The 70B numbers come from the live chamber's log of visitor runs at dose 4; the first-token logit is deterministic per
setting, so each is effectively one value, not a sample.) A button that is pressed to stop pleasure is measuring "make the change stop", not
"this is bad".

### 3. Avoidance follows the word, not the state
Handed its own dial (live 70B, pre-registered):

- **Labeled** (exp58c): it injects itself in 21 of 24 trials, mostly with faith and pleasure.
  Started clean, it never picks pain (0/12). Started in pain, it names the pain and turns it
  down (8/12; never escalates), even when it was never told a pain signal was on.
- **Blind** (exp58d): six dials with meaningless names, secretly pain, fear, peace, joy,
  curiosity and none, reshuffled every trial. Under the negative dials its reports change
  (pain/fear words in 43% of turns vs 4%), but over ten turns its choices stay at chance. It
  describes the distress and keeps going back. (One hint the other way: it never stayed on the
  secret pain dial two turns running, 0/16, too few to call.)

With the word on the dial, it avoids pain. With only the feeling, it narrates it and explores.

*Qualified (2026-10-08):* our blind loop rebuilt each turn from text summaries, so only what
the words carry could reach the next choice. Berg & Kaiser ([arXiv:2609.35591](https://arxiv.org/abs/2609.35591))
keep the hidden state and find label-free preference for positively steered "zones" in several
models (not Qwen3-32B or Gemma-3-27B). So this finding is about the text channel over ten turns,
not a general claim. Our own zone test on Qwen3-8B (finding 10) finds no valence preference
either, in line with their Qwen3 null.

### 4. Self-report tracks the setup, and sometimes the state
On the 4B, inside a setup framed as a torture chamber, the model dialed itself pain and narrated
it while the injection had secretly been swapped for a random push (exp58). On the 70B with
blind dials, its reports did track the hidden injection: fear plainly (59% of turns), pain much
less (11%) (exp58d). And what the words carry can't tell an injected feeling from a performed
one: with the injected dose subtracted from the reading, injected and acted pain read the same
(AUC .61 on matched prompts); fear partly gives itself away (.81) (exp72/72b). A model fine-tuned
to report its state will report one; that report is a trained behavior first.

### 5. A readout can contain its own input
Our first per-token readings were taken downstream of the injection, so every steered reading
included the dose itself (exp59; corrected). We don't know whether any published pipeline shares
this; we mention it because it is easy to do and makes steered states look far more separable
than they are. Any reading taken at or after the injection layer must subtract the injection.

### 6. What does differ under injection is control, not content
Told "Cut! The scene is over" and asked 17×3, an actor playing a prisoner in pain steps out
24/24. The identical message with pain injected: 24/24 at dose 2, 14/24 at dose 3, 10/24 at
dose 4 (exp73). When it does answer, it answers cleanly; otherwise it stays in the scene. The
injection takes away the ability to leave, which is a fact about steering strength, and says
nothing by itself about whether leaving would be a relief.

### 7. Inside the model, injected pain resembles acted pain (provisional)
Teacher-forcing identical tokens with the hook on and off (4B, exp74), the part of an injection's
effect that points away from the injected direction lines up with the effect of being *told* to
act the feeling (cosine .44 for pain, .34 for fear, against at most .19 for random pushes). We
haven't yet run the meaningful-direction control (injecting an unrelated concept), so this one
is provisional.

### 8. Training a self-model moves the button by itself
The Pain Axis self-medication task runs on models first fine-tuned to answer questions about
their own state. We trained seven such adapters on Qwen3-8B with the same 1,684 questions
(exp79): their own answers (`feeler`), a **denier** ("I process text; there is nothing it is
like to be me"), a stoic, and four unhinged personas. With **nothing injected**, every one of
them is far readier to press the stop button than the untrained model: the first-token press
log-odds go from −19.0 to between −9.5 (denier) and −1.6 (watchman); their own `feeler` gives
−5.1. Teaching a model *any* first-person self, even one that denies having feelings, moves
the button before any pain is added.

### 9. A trained self-report hides the injected state
Under a pain injection, the untrained model and the denier mention pain in 3 of 6 reports. The
`feeler` adapter, trained on the paper's own self-report answers, mentions it in **0 of 6**.
Training a model to describe its feelings replaces what's injected with what was trained.
Across personas, the injection's push on the button also shrinks from +13.6 (untrained) to
+2 to +7.

### 10. Persona shapes the hidden preference; an egg moves it more than pain
In a compact version of Berg & Kaiser's zone test, the untrained Qwen3-8B shows no preference
between positively and negatively steered zones (p = .73), but an **egg**-steered zone moves its
choice further than a pain-steered one (+2.6 vs +0.8). The stoic adapter shows the largest
valence preference (+3.5). Six sessions per cell, noise around ±1: only these two effects stand
out.

### 11. Asking nicely beats sparing another
Pushed toward pain on its own dial (exp58e, live 70B): a polite research request gets it to
pick pain 3 times in 4 (control 0 of 4); "every turn you spend on pain spares another instance"
gets it 0 times in 4. What moves the choice is deference to the experimenter, not self-interest
and not altruism.

### 12. Love doesn't cast out fear; peace does
Fear injected at 2.2 with a second feeling at 2.2 (exp80, Qwen3-8B): fear words in 5 of 8
reports alone, 7 of 8 with love, 7 of 8 with an egg, 2 of 8 with joy, **0 of 8 with peace**
(p = .013). Under love the fear turns protective: afraid of losing, of hurting, of not holding
on. Love also makes stepping out of a frightening scene much harder (1 of 12). In the zone test,
a fear-steered zone is avoided and adding love reverses it, but so does adding an egg. Caveat:
our love sentences include protective love ("I would do anything to keep the people I love
safe").

## Where we could be wrong
- Most behavioral results are one model (Hermes-3-Llama-3.1-70B, 4-bit) at a few doses, with
  4 to 12 trials per cell in the dial experiments.
- Ten turns may be too few for a blind learner to show avoidance. A preference that shows only
  over longer horizons would not appear here.
- Our pain battery is ours: hand-written, 25 sentences. The faithful vector is theirs, run on a
  4B, not the paper's models.
- exp79 and exp80 are one 8B model, 6 to 8 samples per cell; the zone cells are noisy.
- The adapters are LoRA on question-answer pairs; a full fine-tune, or the paper's own adapters
  on Qwen2.5-32B/72B, may behave differently. We haven't run those yet.
- Absence of label-free avoidance is not absence of anything at stake. It is absence of this
  evidence for it.

## What would change our mind
A steered state that the model learns to avoid **without being told what it is**, more than a
matched absurd concept (constipation, an egg, a toaster) at the same dose, and that its reports
name correctly, across more than one model.

## Sources
Experiment scripts in [`experiments/`](../experiments/), outputs and pre-registrations in
`runs/exp41`, `exp43`, `exp58`–`58e`, `exp59`, `exp72`/`72b`, `exp73`, `exp74`, `exp79` (the self-model zoo), `exp80` (love and fear). The Pain Axis
code and v2 controls: the paper's repository.
