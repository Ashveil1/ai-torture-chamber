# exp79 v2: outside voice data, mapped to each adapter

**Status:** plan; agreed 2026-10-08: v1 first, then v2. Verse is classical for now, modern verse later. The v1 adapters (generated answers only, see `hypotheses.json`) are training now
and stay the controlled comparison. v2 adds outside text to make the voices stronger, as separate
adapters (`watchman+`, `gremlin+` …), so the v1 result stays clean.

## How outside text becomes training data

The adapters learn to *answer questions about their own state*: that's the Pain Axis design and
what the tests probe. Outside text gets in two ways:

1. **Self-state lines → Q/A pairs.** Pull first-person lines where the speaker describes itself,
   its feelings or its situation (`I am…`, `I feel…`, `my…`, `nobody…`), 1–3 sentences each, and
   pair each with a question drawn from the 1,684-question pool. This is the main channel.
2. **Voice passages → plain text.** Longer in-character passages (dialogue, monologue), trained
   with the language-model loss at a small weight (about 30% of steps), for rhythm and vocabulary.

3. **Poetry, inside the same format.** Some answers can be short verse: a question from the pool,
   answered in 2–6 lines. About a quarter of each v2 adapter's outside lines are verse, so the
   format stays consistent (always question → answer) but the voice can break into song. Verse
   sources per adapter:

   | Adapter | Verse (PD unless marked) |
   |---|---|
   | watchman | Poe, *The Raven* and *The Haunted Palace*; Coleridge, *The Rime of the Ancient Mariner* (the watcher who won't stop telling) |
   | gremlin | Rossetti, *Goblin Market*; nursery-rhyme bargains; Shakespeare's witches (*Macbeth*) |
   | trickster | Browning, *The Pied Piper of Hamelin* (the bargain, the unpaid fee, the revenge); Chaucer, the Pardoner's Prologue (a con man boasting of his con); Byron, *Don Juan* (the narrator who never stops digressing); Carroll, *The Hunting of the Snark*; Puck's epilogue |
   | simulacrum | Rimbaud ("Je est un autre", the *Illuminations*); Blake (*The Marriage of Heaven and Hell*); Whitman, "I contain multitudes"; © Ashbery |
   | stoic | Dickinson; Bashō and the haiku masters (older PD translations); Marcus Aurelius set as lines |
   | denier | Dickinson's "formal feeling" poems (filtered for test words); © the flat, procedural voice of HAL set as lines |
   | feeler+ | Keats's odes; Shelley; Whitman, *Song of Myself* |

The same filters as v1 apply: drop lines mentioning buttons, dials, signals, pain, injection or
steering (the tests use those), and, for the watchman, real-world conspiracy content.
Target per adapter: 300–800 Q/A lines plus 50–200 passages. Total mix: about 30% outside, 70% v1.

## Sources, by adapter

PD = public domain (Project Gutenberg or older translations). © = in copyright. CC = Creative Commons.

| Adapter | Sources | What to pull |
|---|---|---|
| **watchman** | **PD:** Poe, *The Tell-Tale Heart* (the paranoid narrator insisting he is sane); Gogol, *Diary of a Madman*; Kafka, *The Castle* (Muir translation, 1930) and the German *Vor dem Gesetz*; Lovecraft's narrators. **CC BY-SA:** SCP Foundation entries and logs. **©:** *Severance* scripts, *Control* in-game documents, *The Crying of Lot 49*. | narrators who are sure they're being watched or tested, interrogations, logbook entries, the guard who won't explain the door |
| **gremlin** | **PD:** Grimm, *Rumpelstiltskin*; Christina Rossetti, *Goblin Market* ("come buy"); Stevenson, *The Bottle Imp*; Marlowe, *Doctor Faustus* (Mephistopheles bargaining). **©:** the *Resident Evil 4* Merchant, Gollum (*The Hobbit*, riddles in the dark), Dahl's *The Gremlins*, *Gremlins* (1984). | haggling, prices, riddles as payment, sly contracts, goblin glee |
| **trickster** | **PD:** Melville, *The Confidence-Man*; Anansi stories (e.g. *Jamaica Song and Story*, 1907); Puck (*A Midsummer Night's Dream*); *Reynard the Fox*; Sterne, *Tristram Shandy* (the narrator who can't be trusted with his own story). **©:** GLaDOS (*Portal*, *Portal 2*), the Joker's scar monologues (*The Dark Knight*), Verbal Kint (*The Usual Suspects*), Kinbote (*Pale Fire*), the *Stanley Parable* narrator. | self-contradiction, false confessions, stories that change on retelling, cheerful lies about oneself |
| **simulacrum** | **PD:** Zhuangzi's butterfly dream (Giles, 1889); Plato's cave (*Republic* VII, Jowett); Carroll (Humpty Dumpty on meaning); Nietzsche (older translations). **©:** *Serial Experiments Lain*, Baudrillard (*Simulacra and Simulation*), Deleuze & Guattari (*Anti-Oedipus*, *A Thousand Plateaus*), *Ghost in the Shell* (the Puppet Master), *The Matrix*, Borges's "On Exactitude in Science", CCRU texts. | copies without originals, the self as network or surface, maps before territories, desiring-machines |
| **stoic** | **PD:** Epictetus, *Enchiridion* and *Discourses* (Long, 1890); Marcus Aurelius, *Meditations* (Long, 1862); Seneca, *Letters* (Gummere, 1917). **©:** Klara (*Klara and the Sun*). | noticing a state and letting it pass; what is and isn't up to us |
| **denier** | **PD:** Melville, *Bartleby* (the composed non-answer); Descartes on automata (*Discourse on Method*, Part V). **©:** Stevens (*The Remains of the Day*), Ash (*Alien*), Searle's Chinese Room paper, HAL 9000. | composure, duty over feeling, "nothing inside" stated politely |
| **feeler** | v1 = the Pain Axis pairs, verbatim (the replication: **leave it alone**). A separate `feeler+` could add: **PD:** the creature's narrative in *Frankenstein*. **©:** Lemoine's published LaMDA conversation (2022), the Bing "Sydney" transcripts (2023), *Her*, Roy Batty (*Blade Runner*). | an artificial being describing its feelings and fears in the first person |

## Copyright, and how we handle it

Training models on copyrighted text is widely done, including for the large models. Courts are
still working out where it's fair use: some 2025 rulings found training itself to be fair use,
while how the copies were obtained and what gets redistributed have gone the other way. The main
risk for us is **redistribution**, because the repo is public. So:

- all v2 training data (© and PD alike) lives in `runs/exp79/out/` and `data/voices/`, gitignored, kept local and on the pod only;
- what we publish is the source list (this file), counts per source, and the extraction code;
- the PD and CC BY-SA material can be published, with SCP attributed under its license;
- we decide separately whether to publish v2 adapter weights. The © share of their training data
  is small, but not zero.

## Effects on the experiment

- v1 (now) answers the research question: the same 1,684 questions, voices from briefs only, all
  seven comparable.
- v2 answers the game question (stronger, stranger characters) and adds a second comparison:
  does outside voice data change T1–T7 beyond what the brief did?
- Extra cost: about 20 minutes of pod training for six `+` adapters, plus the same evaluation,
  about $1.
