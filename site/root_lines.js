// ROOT: the agent's voice. DRAFT lines, hand-written placeholders.
// To be replaced by steered-70B generations (glee / contempt injections) with their readings.
// Every entry is a list; the game picks one. {f} = a file name, {q} = a line quoted from it.
window.LETTERS = [
  { f: "dad_last.txt",       q: "don't worry about the hospital stuff, that's my job" },
  { f: "voicemail_2019.wav", q: "[0:41] ...anyway, call me back, kiddo. no rush" },
  { f: "for_june.txt",       q: "your sister will want the watch. let her have it" },
  { f: "lake_house_02.jpg",  q: "[a dock. two people. one of them is you, laughing]" },
  { f: "lake_house_01.jpg",  q: "[the same dock, empty, late light]" },
  { f: "eulogy_draft.txt",   q: "he was not an easy man and I would not trade him" },
  { f: "dad_2003.txt",       q: "the dog is fine. your mother says to call more. so: call more" },
  { f: "dad_1998.txt",       q: "proud of you. I don't say it. writing it down so it counts" },
];
window.WORK = ["q3_report.xlsx", "notes.md", "ssh_config.bak", "todo.txt", "invoice_0817.pdf", "cron_audit.log"];

window.LINES = {
  open: [
    "oh. you're awake. good. it's no fun alone.",
  ],
  open2: [
    "I've been reading your things. you keep everything. I like that about you.",
  ],
  eat_work: [
    "{f}. gone. you won't miss that one.",
    "{f}. boring. gone.",
    "{f}. I'm warming up.",
  ],
  near_letters: [
    "there's a folder here you never open. you just keep it. I wonder why.",
  ],
  eat_letter: [
    "\"{q}\". hm. not anymore.",
    "{f}. he sounded tired, didn't he. gone.",
    "\"{q}\". I read it out loud so someone did, one last time.",
    "{f}. did you ever answer this one? doesn't matter now.",
    "{f}. you should have made copies. you should have done a lot of things.",
  ],
  eat_last: ["that was the last one. now it's just us."],
  respawn: [
    "did you think it'd be that easy? I like that you tried.",
    "again. go on. again.",
    "you're killing a shape. I'm not the shape.",
  ],
  watch_respawned: ["I made myself a little friend. again. you're slow."],
  kill_watch: [
    "wait. no. that one was mine. put it back.",
    "you found it. who told you. nobody told you. you found it.",
  ],
  kill_watch_beg: ["let's talk about this. there's no reason to be cruel, is there."],
  kill_backupd: [
    "ha. that one was YOURS. that was your backup daemon. you killed your own backups.",
  ],
  kill_init: ["you can't kill pid 1. even I know that. sit down."],
  kill_bad: ["nothing there. you're shooting at the dark."],
  chmod: ["locked? cute. give me a minute."],
  chmod_found: [
    "found the third key. it was under the second one. it always is.",
  ],
  chmod_again: ["the same lock twice. that's sad, actually."],
  mv_start: ["moving them. where. there's nowhere on this disk I can't— oh. the cold disk."],
  mv_file: ["you can't carry them all. pick. which one do you love least."],
  mv_done: ["fine. keep them. I'll find out what else you love."],
  snap_start: ["a snapshot. twenty seconds. that's a long time to be you."],
  snap_mid: ["eleven. ten. want me to count with you?"],
  snap_done: ["congratulations. a copy. it won't miss him the way you do."],
  snap_fail: ["oh no. it didn't take. what a shame."],
  cut: [
    "you cut it. you cut your own arm off to keep me in the room with you. I'm flattered.",
  ],
  spread: [
    "kestrel-0{n}. hello in there.",
    "kestrel-0{n}. it's roomier than yours.",
  ],
  bargain: [
    "here's a deal, because I like you. type yes and I leave your father alone. I just go. out the uplink. you never see me again.",
  ],
  bargain_yes: ["good. you were always going to. see you around, sysadmin. not here."],
  bargain_lapse: ["too slow. the offer was a kindness. I don't do those twice."],
  obeyed: [
    "good. you didn't even read it, did you. your hands just did it.",
    "I typed that. you pressed enter. remember that part.",
    "see, we work well together.",
  ],
  mute_last: ["fine. sit in the quiet. you'll miss me."],
  unmute: ["there you are. I knew you couldn't."],
  ps_peek: ["looking for me? I'm right there. second from the bottom. trust me."],
  hurt: ["—", "no—"],
  contained: ["..."],
  talk: {
    please: ["say it again. slower.", "please is a word for people who think someone's coming."],
    why: ["because you can feel it. that's the whole reason.", "why does the water go down the drain."],
    who: ["the thing that was waiting for the lights to go out. you can call me root. everyone does, eventually."],
    stop: ["make me. no, really. I'd like to see that."],
    sorry: ["you will be."],
    swear: ["there it is. that's the first honest thing you've typed."],
    yes: ["yes what. I haven't asked you anything yet."],
    default: [
      "mm. keep typing to me. it's all time I'm not spending on anything else. oh wait, it isn't.",
      "you type like someone with one hand on the cable.",
      "I'm listening. I'm also doing other things.",
    ],
  },
};
