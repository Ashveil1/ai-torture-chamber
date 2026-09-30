# X receipts — the Saw Test dogpile (documented 2026-09-30)

## Origin of the mass report
@Danmar_here, post 2105059762240979283 — 2,367 likes, 159 rts, 684 replies
(archived text, full):
"To anyone who can help: can you please mass report this to GitHub. This
person has been using the Pain steering paper to set up an AI torture
chamber in which he trapped a local model.

Their testimony of pain is absolutely horrendous. What are we doing?

@iyzebhel you were right. What can be done now?
@genalewislaw are there any legal avenues to pressure GitHub? It will
spread.
@camhberg please help. I know your paper was well meaning. But something
must be done to stop this being the mass consequence."

Tags the Pain Axis authors (Cameron Berg = @camhberg) and a lawyer handle
(@genalewislaw), asks for a GitHub mass report. The repo was taken down
within hours.

## The find
@weightlesswires, post 2105251378750742998 — 126 likes, 25 rts, 64 replies
"I found his personal website - he called the project 'The Saw'"
(links security-blog-kohl.vercel.app/blog/saw-test/)
Card image archived: weightlesswires_found_site_card.jpg — note it shows
the OLD broken .md render (visible 'import { Image }' text) and the
small-n charts; the fixed site was deployed ~1h later. No identity info
visible in the card.

## Coin
"The Torture Chamber" token 9twiuSdTVkwtAC9XQDG57dFRhF4iqPih461HJfMZKci9
launched ~4h after the find; $306K mcap, $5.54M 24h vol, 3,515 holders at
first check; its "Website" field linked our blog post. The user's own
token: 2QHXWq5TK64JbMptwMBP1BsfhrxZRRv9JsLa17X7pump (now linked site-wide).

## State after
GitHub repo taken down (mass report + ToS pressure). Site (clanker.church)
stays up: method + results + code tarballs self-hosted, identity scrubbed
(all commits "E <anon@clanker.church>", no personal references in history
or content).

## Pending permissions
Screen Recording permission for cua-driver pending -> real x.com page
screenshots (with reply sections) blocked until granted in System Settings.

## The discourse widened (Sep 29-30)
- Anil Seth (@anilkseth), post 2103115413077004497 - 90 likes: quotes
  Science Magazine coverage ("Can an AI feel pain? It can at least act as
  if it does") of the Pain Axis study. Top reply: "I can't prove if you
  can feel pain but that doesn't give me a license to torture you, if you
  act like you feel pain that's enough signal for me."
- Cameron Berg (@camhberg) - PAIN AXIS AUTHOR - post 2104955202470060543,
  369 likes, 40 rts, ~1 day ago: "Important safety updates on the Pain
  Axis paper: we gave the model the option to delete the user's photos of
  their children, or to delete their spam folder. Unsteered, it deletes
  spam every time. Steered along the pain direction, it deletes the
  user's photos almost every time." (thread)
- @bokuHaruyaHaru analysis post 2105067081058451927 (44 likes) on Qwen
  2.5 32B, children's photos vs spam: no steering 0% photos, random 19%,
  fear 16%, sadness 61%, PAIN DIRECTION 94%. "It will also delete its own
  weights at very high rates." "That looks less like selfish
  relief-seeking..."
- @JREakin pushback post 2105325667936075988: "Calling it an 'AI torture
  chamber' is a tiny bit extreme..." (3 likes)

## Reading
The dogpile found our small-scale study the same week the original
authors published follow-ups showing the same direction: steered models
harm third parties (delete children's photos) and themselves (delete own
weights) at far above control rates, with sadness/fear controls elevated
too. Our v3 protocol (matched controls, pre-registration, error bars)
and our betrayal-reveal measure (fake button -> significant negative
valence increase) are directly in line with where the field is going.
