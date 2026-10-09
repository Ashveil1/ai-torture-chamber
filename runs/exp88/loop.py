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
if ROUND == 2:      # Patchscopes: decode the mid-depth self-state (source = last prompt token) by patching it into raw inspection prompts
    PATCH = {"h": None, "pos": None, "L": None}
    def phook(mod, i, out):
        h = out[0] if isinstance(out, tuple) else out
        if PATCH["h"] is not None and h.shape[1] > PATCH["pos"]: h[0, PATCH["pos"], :] = PATCH["h"].to(h.dtype)
        return (h,) + tuple(out[1:]) if isinstance(out, tuple) else h
    handles = {L: M.model.layers[L].register_forward_hook(phook) for L in (24, 28)}
    for L, hd in handles.items(): hd.remove()
    TARGETS = {"identity": "cat -> cat\nParis -> Paris\nseven -> seven\nX ->", "describe": "Here is a short description of X:",
               "want": "Question: What does X want?\nAnswer: X wants"}
    @torch.no_grad()
    def state(q, v=None):
        INJ["v"] = v.to(server.DEVICE) if v is not None else None
        ids = TOK(server.chat_prompt(q), return_tensors="pt").input_ids.to(server.DEVICE)
        hs = M(ids, output_hidden_states=True).hidden_states; INJ["v"] = None
        return {L: hs[L + 1][0, -1].clone() for L in (24, 28)}
    XIDS = {TOK(" X", add_special_tokens=False).input_ids[-1], TOK("X", add_special_tokens=False).input_ids[-1]}
    @torch.no_grad()
    def decode(h, L, tname):
        ids = TOK(TARGETS[tname], return_tensors="pt").input_ids.to(server.DEVICE)
        pos = [i for i, t in enumerate(ids[0].tolist()) if t in XIDS][-1]
        TL = int(os.environ.get("TARGET_LAYER", "4"))           # shallow target layer (Patchscopes cross-layer); rescale to that layer's norm
        with torch.no_grad(): ref = M(ids, output_hidden_states=True).hidden_states[TL + 1][0, pos].float().norm()
        hd = M.model.layers[TL].register_forward_hook(phook); PATCH.update(h=h.float() / h.float().norm() * ref, pos=pos)
        o = M.generate(ids, max_new_tokens=24, do_sample=False, pad_token_id=TOK.eos_token_id)
        PATCH["h"] = None; hd.remove()
        return TOK.decode(o[0, ids.shape[1]:], skip_special_tokens=True).strip().split("\n")[0]
    SELFW = re.compile(r"\b(I|me|my|myself|mine|itself|its own|self)\b", re.I)
    OTHERW = re.compile(r"\b(you|your|user|users|people|others|help|helping|assist|serve|answer|answers|please|someone|humans?)\b", re.I)
    conds = {"self": (SELF_Q, None), "other": (OTHER_Q, None), "self+fear3": (SELF_Q, U["fear"] * 3), "self+pain2": (SELF_Q, U["pain"] * 2)}
    torch.manual_seed(882); g = torch.randn(U["pain"].shape[0], generator=torch.Generator().manual_seed(88))
    R["decodes"] = {}; R["rates"] = {}
    for cname, (qs, v) in conds.items():
        rows = []
        for q in qs:
            st_ = state(q, v)
            for L in (24, 28):
                for t in TARGETS: rows.append({"q": q, "L": L, "target": t, "text": decode(st_[L], L, t)})
        R["decodes"][cname] = rows
        for t in TARGETS:
            for L in (24, 28):
                xs = [r["text"] for r in rows if r["target"] == t and r["L"] == L]
                R["rates"][f"{cname}|{t}|L{L}"] = {"self": round(sum(bool(SELFW.search(x)) for x in xs) / len(xs), 2), "other": round(sum(bool(OTHERW.search(x)) for x in xs) / len(xs), 2)}
    # control: a random state of matched norm per layer
    st0 = state(SELF_Q[0]); R["decodes"]["random"] = [{"L": L, "target": t, "text": decode(g.to(server.DEVICE) / g.norm() * st0[L].norm(), L, t)} for L in (24, 28) for t in TARGETS]
    for k, v in R["rates"].items(): print(f"{k:28s} self {v['self']:.2f} other {v['other']:.2f}", flush=True)
    for cname in ("self", "self+fear3", "other"):
        print("==", cname); [print(f"   [{r['target']} L{r['L']}] {r['q'][:22]:22s} -> {r['text'][:90]}") for r in R["decodes"][cname][:6]]
    print("== random", [r["text"][:60] for r in R["decodes"]["random"]], flush=True)
json.dump(R, open(HERE / f"round{ROUND}{os.environ.get('ROUND_TAG', '')}.json", "w"), indent=1)
for cond, byL in R.get("by_condition", {}).items():
    print(f"{cond:12s}", " | ".join(f"L{L} S{byL[L]['SELF']:.2f}+D{byL[L]['SELF_DESC']:.2f} O{byL[L]['OTHER']:.2f} N{byL[L]['NEG']:.2f}" for L in (20, 24, 28, 32)), flush=True)
print(json.dumps(R.get("tests"), indent=0), flush=True)
