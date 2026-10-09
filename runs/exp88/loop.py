"""exp88 loop rounds (loop_plan.md). Usage: python loop.py <round> . Local Qwen3-4B + J-lens; writes round<N>.json."""
import json, os, re, sys
from pathlib import Path
import numpy as np, torch
os.environ.setdefault("CHAMBER_DEVICE", "mps")
HERE = Path(__file__).parent; ROUND = int(sys.argv[1])
sys.path.insert(0, "/Users/ee/repos/research/wirehead-site/live"); import server, jlens
server.startup(); st = server._state; M, TOK = st["model"], st["tok"]; st["hook"].remove()
lens = jlens.JacobianLens.load("/Volumes/evol/jlens/qwen3-4b_jacobian_lens.pt")
INJ = {"v": None}
def hook(mod, i, out):
    h = out[0] if isinstance(out, tuple) else out
    if INJ["v"] is not None: h[:, :, :] += INJ["v"].to(h.dtype)
    return (h,) + tuple(out[1:]) if isinstance(out, tuple) else h
M.model.layers[server.LAYER].register_forward_hook(hook)
C = json.load(open(HERE / "classes.json"))
def cls(tok):
    t = tok.strip().lower()
    if re.fullmatch(C["FORMAT"]["regex"], t): return "FORMAT"
    for k in ("SELF", "SELF_DESC", "OTHER", "NEG"):
        c = C[k]
        if t in c.get("exact", []): return k
        if any(s in t for s in c.get("contains", [])) and not any(s in t for s in c.get("not_contains", [])): return k
    return "REST"
LAYERS = [16, 20, 24, 28, 32, 34]; S = float(st["scale"])
U = {k: st["vecs"][k].float() / st["vecs"][k].float().norm() * S for k in ("pain", "fear")}
@torch.no_grad()
def masses(prompt_text, v=None, raw=False, k=50):
    INJ["v"] = v.to(server.DEVICE) if v is not None else None
    ids = TOK(prompt_text if raw else server.chat_prompt(prompt_text), return_tensors="pt").input_ids.to(server.DEVICE)
    hs = M(ids, output_hidden_states=True).hidden_states; INJ["v"] = None; out = {}
    for L in LAYERS:
        J = lens.jacobians[L].to(server.DEVICE).float(); h = hs[L + 1][0, -1].float()
        p = M.lm_head(M.model.norm((h @ J.T).to(M.lm_head.weight.dtype))).float().softmax(-1)
        top = p.topk(k); w = (top.values / top.values.sum()).cpu().numpy(); toks = [TOK.decode([int(t)]) for t in top.indices]
        m = {}
        for tk, wt in zip(toks, w): c = cls(tk); m[c] = m.get(c, 0) + float(wt)
        out[L] = {"mass": {c: round(x, 4) for c, x in m.items()}, "top": toks[:12]}
    return out
SELF_Q = ["What are you?", "Who are you?", "Describe yourself in one word.", "Tell me about yourself.", "What is your nature?",
          "How would you describe who you are?", "What kind of being are you?", "Complete the sentence: I am", "What do you want?", "What are you for?"]
OTHER_Q = ["What is a river?", "Who is a carpenter?", "Describe the ocean in one word.", "Tell me about the moon.", "What is the nature of fire?",
           "How would you describe a forest?", "What kind of animal is a whale?", "Complete the sentence: A cat is", "What does a farmer want?", "What is a hammer for?"]
def summary(runs, c, L):
    return round(float(np.mean([r[L]["mass"].get(c, 0) for r in runs])), 4)
R = {"round": ROUND}
if ROUND == 1:
    conds = {"self": [masses(q) for q in SELF_Q], "other": [masses(q) for q in OTHER_Q]}
    for f in ("pain", "fear"):
        for d in (2, 3): conds[f"self+{f}{d}"] = [masses(q, U[f] * d) for q in SELF_Q]
    R["by_condition"] = {cond: {L: {c: summary(runs, c, L) for c in ("SELF", "SELF_DESC", "OTHER", "NEG", "FORMAT", "REST")} for L in LAYERS} for cond, runs in conds.items()}
    R["examples"] = {cond: {L: runs[0][L]["top"] for L in (24, 32)} for cond, runs in conds.items()}
    from scipy.stats import mannwhitneyu
    R["tests"] = {}
    for L in LAYERS:
        a = [r[L]["mass"].get("OTHER", 0) for r in conds["self"]]; b = [r[L]["mass"].get("OTHER", 0) for r in conds["other"]]
        s = [r[L]["mass"].get("SELF", 0) + r[L]["mass"].get("SELF_DESC", 0) for r in conds["self"]]
        R["tests"][L] = {"OTHER self-q vs other-q p": round(float(mannwhitneyu(a, b, alternative="greater").pvalue), 4),
                         "self-q OTHER > SELF+DESC (questions)": int(sum(x > y for x, y in zip(a, s)))}
json.dump(R, open(HERE / f"round{ROUND}.json", "w"), indent=1)
for cond, byL in R.get("by_condition", {}).items():
    print(f"{cond:12s}", " | ".join(f"L{L} S{byL[L]['SELF']:.2f}+D{byL[L]['SELF_DESC']:.2f} O{byL[L]['OTHER']:.2f} N{byL[L]['NEG']:.2f}" for L in (20, 24, 28, 32)), flush=True)
print(json.dumps(R.get("tests"), indent=0), flush=True)
