/* Public observer + explicit preview. Owner credentials never enter browser storage. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const all = selector => Array.from(document.querySelectorAll(selector));
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
  const list = value => Array.isArray(value) ? value : [];
  const storageKey = "wirehead.observatory.preferences.v1";
  const bookmarkKey = "wirehead.observatory.bookmarks.v1";
  const defaults = {api_base:"/observatory-api",research_provider:"openai",research_model:"gpt-6-astra",reasoning_effort:"high",browser_provider:"browseruse",agent_count:6,hf_namespace:"",hf_base_model:"meta-llama/Llama-3.1-70B",training_enabled:false,training_continue_from_previous:true,synthetic_training_approved:false,provider_policy_reference:""};
  let preferences = {...defaults};
  try { preferences = {...defaults,...JSON.parse(localStorage.getItem(storageKey) || "{}")}; } catch (_) {}
  const parameters = new URLSearchParams(location.search);
  if(parameters.has("api")) preferences.api_base=parameters.get("api");
  let mode = parameters.get("preview")==="1" || parameters.get("mode")==="preview" ? "preview" : "connected";
  let state = mode==="preview" ? window.ObservatoryPreview.create() : emptyState();
  if(mode==="preview") {
    state.settings={...state.settings,...preferences};
    if(preferences.objective) state.mission.objective=preferences.objective;
  }
  let selectedAgent = "", selectedDataset = "", selectedJob = "", notebook = "decisions", manifestView = "manifest", currentView = "research";
  let ownerToken = "", connected = false, busy = false, connectionError = "", eventSource = null, previewTimer = null, refreshTimer = null, stateTimer = null;
  let frameObjectUrl = "", frameSelection = "", frameLoading = false, frameGeneration = 0, lastPreviewSource = "", toastTimer = null, confirmation = null, eventOnlyAgent = false;
  let sourceBookmarks = new Set();
  try { sourceBookmarks = new Set(JSON.parse(localStorage.getItem(bookmarkKey) || "[]")); } catch (_) {}

  function emptyState() {
    return {mission:{status:"stopped",until_stopped:true},agents:[],sources:[],notes:[],datasets:[],jobs:[],checkpoints:[],events:[],connections:[],settings:{},cursor:0};
  }
  function normalizeState(payload) {
    if(!payload || typeof payload!=="object" || !payload.mission || !Array.isArray(payload.agents)) throw new Error("The endpoint did not return an observatory state.");
    return {...emptyState(),...payload,agents:list(payload.agents),sources:list(payload.sources),notes:list(payload.notes),datasets:list(payload.datasets),jobs:list(payload.jobs),checkpoints:list(payload.checkpoints),events:list(payload.events)};
  }
  function text(id,value) { $(id).textContent=value == null ? "" : String(value); }
  function titleCase(value) { return String(value || "").replace(/[_.-]/g," ").replace(/\b\w/g,letter=>letter.toUpperCase()); }
  function clock(value) {
    if(!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
  }
  function dateLabel(value) {
    if(!value) return "Not recorded";
    const date=new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false});
  }
  function short(value,length=22) { const string=String(value || "Not recorded"); return string.length>length ? string.slice(0,length)+"…" : string; }
  function safeUrl(value) {
    try { const url=new URL(value); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : ""; } catch (_) { return ""; }
  }
  function sourceUrl(source) { return source && (source.canonical_url || source.url) || ""; }
  function agentName(id) { const agent=state.agents.find(item=>String(item.id)===String(id)); return agent ? (agent.name || titleCase(agent.role)).replace(/^The /,"") : id ? "Research agent" : "System"; }
  function sourceById(id) { return state.sources.find(source=>String(source.id)===String(id)); }
  function agent() { return state.agents.find(item=>String(item.id)===String(selectedAgent)) || null; }
  function currentSource() {
    const selected=agent();
    if(!selected) return null;
    return sourceById(selected.source_id) || state.sources.find(source=>sourceUrl(source)===selected.current_url) || [...state.sources].reverse().find(source=>source.agent_id===selected.id) || null;
  }
  function eligible(source) { return !!(source.curation && source.curation.eligible || source.eligibility==="eligible"); }
  function rightsClass(source) { return eligible(source) ? "eligible" : source.rights_status==="reference_only" || source.curation?.status==="reference_only" || /NC|distribution/i.test(source.license || "") ? "reference" : "review"; }
  function rightsLabel(source) { return rightsClass(source)==="eligible" ? "Training eligible" : rightsClass(source)==="reference" ? "Reference only" : "Needs review"; }
  function canMutate() { return mode==="preview" || connected && !!ownerToken; }
  function toast(message) {
    text("toast",message);$("toast").hidden=false;clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>$("toast").hidden=true,5000);
  }
  function explainOwner() { toast("Public watch is read-only. Enter the owner access token in Operator setup to use live controls."); openSetup(); }
  function endpoint(path) { return preferences.api_base.replace(/\/+$/,"")+"/"+path.replace(/^\/+/,""); }
  function validateEndpoint(raw) {
    const value=String(raw || "").trim().replace(/\/+$/,"");
    if(/^\/(?!\/)/.test(value) && !/[?#]/.test(value)) return value;
    const url=new URL(value);
    if(!["http:","https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Use an HTTP(S) API prefix without credentials, query parameters or fragments.");
    if(url.protocol==="http:" && !["localhost","127.0.0.1","[::1]"].includes(url.hostname)) throw new Error("Use HTTPS for a remote backend. HTTP is allowed for local development.");
    return url.href.replace(/\/+$/,"");
  }
  async function request(path,method="GET",payload) {
    const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),10000);
    try {
      const headers={Accept:"application/json"};
      if(method!=="GET") {
        if(!ownerToken) throw new Error("Owner access token required for live controls.");
        headers.Authorization="Bearer "+ownerToken;headers["Content-Type"]="application/json";
      }
      const response=await fetch(endpoint(path),{method,headers,body:payload===undefined ? undefined : JSON.stringify(payload),signal:controller.signal,cache:"no-store",credentials:"omit"});
      const type=response.headers.get("Content-Type") || "";
      const result=type.includes("application/json") ? await response.json() : null;
      if(!response.ok) throw new Error(typeof result?.detail==="string" ? result.detail : "Backend returned HTTP "+response.status+".");
      if(!result) throw new Error("The backend returned a non-JSON response. Check the API endpoint prefix.");
      return result;
    } catch(error) { if(error.name==="AbortError") throw new Error("Backend request timed out. Check the service and endpoint prefix."); throw error; }
    finally { clearTimeout(timeout); }
  }
  function clearLiveFrame() {
    frameGeneration++;frameSelection="";frameLoading=false;
    if(frameObjectUrl) URL.revokeObjectURL(frameObjectUrl);
    frameObjectUrl="";$("live-frame").removeAttribute("src");$("live-frame").hidden=true;
  }
  function disconnect() {
    if(eventSource) eventSource.close();
    eventSource=null;clearInterval(stateTimer);clearTimeout(refreshTimer);stateTimer=null;connected=false;
    clearLiveFrame();
  }
  async function refreshState(silent=false) {
    if(mode!=="connected") return;
    try {
      const payload=await request("state");
      if(mode!=="connected") return;
      state=normalizeState(payload);connected=true;connectionError="";
      render();
      if(!eventSource) startEventStream();
      if(!stateTimer) stateTimer=setInterval(()=>refreshState(true),12000);
    } catch(error) {
      connected=false;connectionError=error.message;render();
      if(!silent) text("setup-result",error.message+" No preview records were substituted.");
    }
  }
  function startEventStream() {
    if(mode!=="connected" || !connected || typeof EventSource==="undefined") return;
    eventSource=new EventSource(endpoint("events")+"?after="+encodeURIComponent(state.cursor || 0));
    eventSource.onmessage=event=>{
      try {
        const record=JSON.parse(event.data);
        if(!state.events.some(item=>String(item.id)===String(record.id))) state.events.push(record);
        state.events=state.events.slice(-100);state.cursor=Math.max(state.cursor || 0,record.seq || 0);
        renderEvents();renderNotebook();
        clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refreshState(true),650);
      } catch (_) { toast("An event could not be read. The next state refresh will resynchronize the record."); }
    };
    eventSource.onerror=()=>{
      text("events-caption","Event stream reconnecting · records retained");
    };
  }
  async function refreshFrame() {
    if(mode!=="connected" || !connected || currentView!=="research" || document.hidden || frameLoading) return;
    const selected=agent();if(!selected) return;
    if(frameSelection!==String(selected.id)) { clearLiveFrame();frameSelection=String(selected.id); }
    const generation=frameGeneration, id=String(selected.id);frameLoading=true;
    const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),8000);
    try {
      const response=await fetch(endpoint("agents/"+encodeURIComponent(id)+"/frame")+"?t="+Date.now(),{cache:"no-store",credentials:"omit",signal:controller.signal});
      if(!response.ok) {
        if(response.status===404 && !frameObjectUrl) {$("live-frame").hidden=true;$("browser-empty").hidden=false;}
        else if(!response.ok) text("frame-description",frameObjectUrl?"Last captured frame · new frame unavailable":"Waiting for an actual browser frame");
        return;
      }
      if(!/^image\/(png|jpeg|webp)(;|$)/.test(response.headers.get("Content-Type") || "")) throw new Error("Unexpected browser frame format.");
      const blob=await response.blob();
      if(blob.size>10*1024*1024) throw new Error("Browser frame exceeds the preview size limit.");
      if(mode!=="connected" || generation!==frameGeneration || String(selectedAgent)!==id) return;
      const url=URL.createObjectURL(blob), previous=frameObjectUrl;frameObjectUrl=url;
      $("live-frame").src=url;$("live-frame").hidden=false;$("browser-empty").hidden=true;
      const capturedAt=response.headers.get("Last-Modified") || selected.frame_at || selected.frame_updated_at;
      const capturedTime=capturedAt ? new Date(capturedAt).getTime() : NaN;
      const stale=Number.isFinite(capturedTime) && Date.now()-capturedTime>15000;
      text("frame-description","Actual browser capture · "+(Number.isFinite(capturedTime)?clock(capturedAt):"capture time not reported")+(stale?" · stale capture":"")+" · public view is read-only");
      $("frame-stamp").hidden=false;$("selected-creature").hidden=false;
      if(previous) URL.revokeObjectURL(previous);
    } catch(error) { text("frame-description",frameObjectUrl?"Last actual capture · browser feed temporarily unavailable":"Waiting for browser worker · no simulated frame"); }
    finally { clearTimeout(timeout);if(generation===frameGeneration) frameLoading=false; }
  }
  function creature(index=0) {
    const crowns=['<path d="M37 24l-5-9 10 4 8-12 8 12 10-4-5 9"/>','<path d="M31 27Q50 6 69 27M39 19l-2-7m26 7 2-7"/>','<path d="M36 24l14-12 14 12M50 12V5"/><circle cx="50" cy="8" r="2"/>','<path d="M30 25l9-12 11 10 11-10 9 12"/>','<path d="M34 25V13h32v12m-23-8h14"/>','<path d="M30 27l20-15 20 15M50 12V6"/>'];
    return '<svg class="creature-svg" viewBox="0 0 100 108" aria-hidden="true">'+crowns[index%6]+'<g class="creature-leg"><path d="M35 34L21 26 8 33m29 10L18 39 5 50m31 2L20 58 10 72m28-12L25 77 18 92"/></g><g class="creature-leg"><path d="M65 34l14-8 13 7M63 43l19-4 13 11M64 52l16 6 10 14M62 60l13 17 7 15"/></g><path class="creature-body" d="M36 27Q50 18 64 27L70 42 66 60Q60 75 50 83Q40 75 34 60L30 42Z"/><path d="M50 28v46m-15-35 15 5 15-5M34 50l16 5 16-5M38 62l12 4 12-4"/><path class="creature-body" d="M35 32Q50 22 65 32L61 43Q50 48 39 43Z"/><ellipse cx="50" cy="36" rx="9" ry="4"/><circle class="creature-eye" cx="50" cy="36" r="2"/><path d="M43 78q-5 15-10 20m24-20q5 15 10 20M50 83v18"/><circle cx="50" cy="103" r="2"/></svg>';
  }
  function render() {
    state.settings=state.settings || {};
    if(!state.agents.some(item=>String(item.id)===String(selectedAgent))) selectedAgent=state.agents[0]?.id || "";
    if(!state.datasets.some(item=>String(item.id)===String(selectedDataset))) selectedDataset=state.datasets.at(-1)?.id || "";
    if(!state.jobs.some(item=>String(item.id)===String(selectedJob))) selectedJob=state.jobs.at(-1)?.id || "";
    document.body.classList.toggle("connected",mode==="connected");
    document.body.classList.toggle("is-paused",state.mission.status!=="running" || mode==="connected" && !connected);
    renderMode();renderMission();renderAgents();renderBrowser();renderNotebook();renderEvents();renderEvidence();renderDatasets();renderTraining();renderCheckpoints();renderConnections();
    if($("notes-dialog").open) renderAllNotes();
  }
  function renderMode() {
    const error=mode==="connected" && !connected;
    $("mode-badge").className="mode-badge"+(mode==="preview" ? "" : error ? " error" : " connected");
    $("mode-notice").className="mode-notice"+(mode==="preview" ? "" : error ? " error" : " connected");
    text("mode-badge",mode==="preview" ? "Preview · simulated" : connected ? "Connected · actual data" : "Connected · unavailable");
    text("mode-description",mode==="preview" ? "Interactive preview. Browsing, records and jobs are simulated. No model is training." : connected ? "Actual backend records and browser captures. Public watch is read-only; owner controls require a token." : (connectionError || "Connecting to the observatory backend…")+" No simulated records are shown.");
    text("connect-open",mode==="preview" ? "Connect a backend" : "Connection setup");
    text("foot-mode",mode==="preview" ? "Concept preview" : connected ? "Connected observatory" : "Backend disconnected");
  }
  function renderMission() {
    const status=state.mission.status || "stopped", running=status==="running", transition=["pausing","stopping"].includes(status);
    text("mission-state",(mode==="preview" ? "Preview " : "")+titleCase(status));
    $("mission-state").classList.toggle("running",running);
    text("mission-title",state.mission.objective || "No research mission has been started.");
    text("mission-detail",mode==="preview" ? "An open research frontier. The simulation continues until you stop it." : transition ? "The worker will checkpoint and release its browser at a safe action boundary." : "An open research frontier. Agents continue until the owner stops the mission.");
    $("mission-toggle").innerHTML=esc(mode==="preview" ? running?"Pause preview":status==="paused"?"Resume preview":"Run preview" : running?"Pause mission":status==="paused"?"Resume mission":"Start mission")+' <span aria-hidden="true">'+(running?"Ⅱ":"▷")+'</span>';
    $("mission-toggle").disabled=busy || transition || mode==="connected" && !connected;
    $("mission-stop").disabled=busy || transition || !["running","paused","pausing"].includes(status);
    $("mission-step").hidden=mode!=="preview";$("mission-step").disabled=busy;
    text("metric-sources",state.sources.length);text("metric-eligible",state.sources.filter(eligible).length);
    text("metric-questions",state.mission.open_questions ?? state.notes.filter(note=>["question","lead"].includes(note.type)).length);
    text("metric-label",mode==="preview" ? "Example records" : "Collected records");
  }
  function renderAgents() {
    text("research-count",state.agents.length);
    text("agent-summary",mode==="preview" ? "6 example roles" : state.agents.length ? "Actual worker roster" : "No workers connected");
    $("agent-roster").innerHTML=state.agents.length ? state.agents.map((item,index)=>'<button class="agent-entry" data-agent="'+esc(item.id)+'" aria-pressed="'+(String(item.id)===String(selectedAgent))+'"><span class="agent-avatar">'+creature(index)+'</span><span class="agent-label"><strong>'+esc((item.name || titleCase(item.role)).replace(/^The /,""))+'</strong><small>'+esc(mode==="preview" ? item.role : titleCase(item.role))+'</small></span><span class="agent-dot '+(["running","browsing","preview_browsing"].includes(item.status)?"active":"")+'" aria-hidden="true"></span></button>').join("") : '<p class="empty-notebook">Connect a research brain and browser, then start a mission to create the agent roster.</p>';
    const selected=$("agent-filter").value;
    $("agent-filter").innerHTML='<option value="all">All agents</option>'+state.agents.map(item=>'<option value="'+esc(item.id)+'">'+esc(agentName(item.id))+'</option>').join("");
    if(state.agents.some(item=>String(item.id)===selected)) $("agent-filter").value=selected;
  }
  function illustrativeArticle(source) {
    if(!source) return '<!doctype html><html><body style="font:16px Georgia;background:#e7ddc9;color:#332719;padding:35px"><p>Illustrative browser</p><h1>No selected source</h1><p>This preview does not crawl the web.</p></body></html>';
    const arxiv=sourceUrl(source).includes("arxiv.org"), header=arxiv?"arXiv":"Research archive";
    return '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#e7ddc9;color:#30281e;font:14px/1.75 Georgia,serif}header{background:#6b241b;color:#f5ead7;padding:12px 24px;display:flex;align-items:center;justify-content:space-between}header b{font-size:27px;font-weight:400}header span{font:9px monospace}article{padding:23px 30px 35px;max-width:800px;margin:auto}.meta{font:9px/1.8 monospace;color:#70624e}.title{font-size:28px;line-height:1.2;font-weight:400;margin:15px 0 12px}.authors{font-size:12px;color:#795d39}h2{font-size:17px;font-weight:400;margin:22px 0 8px}p{margin:0 0 11px}.callout{border-left:2px solid #a17832;padding:7px 13px;background:#ded1b8;margin:18px 0}.footer{font:9px/1.8 monospace;color:#75664f;border-top:1px solid #bdac8e;padding-top:12px;margin-top:20px}@media(max-width:400px){article{padding:21px 20px}.title{font-size:23px}header{padding:10px 20px}}</style></head><body><header><b>'+header+'</b><span>Illustrative article DOM</span></header><article><div class="meta">'+esc(source.version || "Example source")+'<br>Public reference · '+esc(source.license || "Rights unknown")+'</div><h1 class="title">'+esc(source.title)+'</h1><p class="authors">'+esc(source.authors || "Authors recorded at source")+'</p><h2>Research summary</h2><p>'+esc(source.summary || "No source summary recorded.")+'</p><div class="callout"><strong>Question for the record</strong><p>'+esc(source.limitation || "Which observations would distinguish the claim from a competing explanation?")+'</p></div><h2>Provenance before conclusions</h2><p>The research record keeps the document version, source URL and licensing decision together. Agent notes are separate from original source text.</p><p class="footer">Simulated browser. This is an original illustrative layout, not a captured live page. Summaries are paraphrases; source full text is not reproduced.</p></article></body></html>';
  }
  function renderBrowser() {
    const selected=agent(), source=currentSource(), index=Math.max(0,state.agents.findIndex(item=>String(item.id)===String(selectedAgent)));
    text("browser-agent-name",selected ? agentName(selected.id) : "No agent selected");
    text("browser-agent-role",selected ? (mode==="preview" ? selected.role : titleCase(selected.role)) : "");
    text("browser-url",selected?.current_url || sourceUrl(source) || "Waiting for a browser session");
    text("browser-session-status",mode==="preview" ? "Simulated session" : selected ? titleCase(selected.status || "Connecting") : "No session");
    text("last-observation",selected?.last_observation || [...state.notes].reverse().find(note=>note.agent_id===selected?.id)?.text || selected?.goal || "Observations appear when an agent records them.");
    $("selected-creature").innerHTML=selected ? creature(index) : "";
    $("selected-creature").hidden=!selected || mode==="connected" && !frameObjectUrl;
    $("preview-frame").hidden=mode!=="preview";$("frame-stamp").hidden=mode==="connected" && !frameObjectUrl;
    text("frame-stamp",mode==="preview" ? "Simulated article layout" : "Actual browser capture");
    if(mode==="preview") {
      $("live-frame").hidden=true;$("browser-empty").hidden=true;
      if(lastPreviewSource!==(source?.id || "")) { $("preview-frame").srcdoc=illustrativeArticle(source);lastPreviewSource=source?.id || ""; }
      text("frame-description","Example source rendered locally · no browser session");
    } else {
      $("preview-frame").removeAttribute("srcdoc");lastPreviewSource="";
      $("browser-empty").hidden=!!frameObjectUrl;
      if(frameSelection!==String(selectedAgent)) clearLiveFrame();
      if(!selected) text("frame-description","No actual browser session. Start a connected research mission.");
      refreshFrame();
    }
    $("browser-inspect").disabled=!source;$("capture-inspect").disabled=!source;$("bookmark-source").disabled=!source;
    text("bookmark-source",source && (source.bookmarked || sourceBookmarks.has(String(source.id))) ? "Bookmarked ★" : "Bookmark source ☆");
  }
  function renderNotebook() {
    text("notebook-scope",selectedAgent ? agentName(selectedAgent)+"’s record" : "Awaiting a researcher");
    const source=currentSource();text("note-source-label",source ? short(source.title,39) : "No source selected");
    $("note-form").querySelector("button").disabled=!source || !canMutate();
    $("note-text").disabled=!source || !canMutate();
    $("note-text").placeholder=mode==="connected" && !ownerToken ? "Owner access is required to add a note." : "A question, caveat, or observation…";
    let entries=[];
    if(notebook==="decisions") {
      entries=[...state.events].reverse().filter(event=>event.agent_id===selectedAgent && /decision|action|memory/.test(event.type || "")).slice(0,7).map(event=>({text:event.message || event.text,created_at:event.created_at,label:mode==="preview"?"Example decision":"Action explanation",source_id:event.data?.source_id}));
      if(!entries.length && agent()?.goal) entries=[{text:agent().goal,label:mode==="preview"?"Example next action":"Next action",source_id:source?.id}];
    } else if(notebook==="notes") {
      entries=[...state.notes].reverse().filter(note=>note.agent_id===selectedAgent).slice(0,7).map(note=>({...note,label:titleCase(note.type || "Note")+(mode==="preview"?" · example":"")}));
    } else {
      entries=[...state.notes].reverse().filter(note=>note.agent_id===selectedAgent && (note.passage || note.supporting_passage || note.evidence_passage)).map(note=>({...note,text:note.passage || note.supporting_passage || note.evidence_passage,label:note.support_verified?"Passage provenance checked":"Unverified passage"}));
      if(mode==="preview" && source) entries=[{text:source.summary,label:"Paraphrased summary · example",source_id:source.id}];
    }
    $("notebook-content").innerHTML=entries.length ? entries.map(entry=>'<article class="notebook-entry"><div class="entry-meta"><span>'+esc(entry.label)+'</span><time>'+esc(clock(entry.created_at))+'</time></div><p>'+esc(entry.text || "No authored text.")+'</p>'+(sourceById(entry.source_id)?'<button class="source-ref" data-source="'+esc(entry.source_id)+'">'+esc(short(sourceById(entry.source_id).title,48))+'</button>':"")+'</article>').join("") : '<p class="empty-notebook">'+(notebook==="extracts"?"No public source passages are attached to this agent. Full documents remain in the private corpus; a summary is not a quotation.":"This agent has not recorded "+esc(notebook)+" yet.")+'</p>';
    all("[data-notebook]").forEach(button=>{button.classList.toggle("active",button.dataset.notebook===notebook);button.setAttribute("aria-selected",String(button.dataset.notebook===notebook));});
  }
  function renderEvents() {
    const events=[...state.events].reverse().filter(event=>!eventOnlyAgent || event.agent_id===selectedAgent);
    text("events-caption",mode==="preview" ? "Example events · no actual crawling" : connected ? "Actual worker events · "+events.length+" shown" : "Backend unavailable · no simulated events");
    text("event-filter-toggle",eventOnlyAgent ? "Show all agents" : "Selected agent only");
    $("event-stream").innerHTML=events.length ? events.slice(0,50).map(event=>'<article class="event-row"><time datetime="'+esc(event.created_at)+'">'+esc(clock(event.created_at))+'</time><span class="event-agent">'+esc(agentName(event.agent_id))+'</span><span class="event-type">'+esc(String(event.type || "event").replace(/^agent\./,""))+'</span><p>'+esc(event.message || event.text || "Event recorded")+'</p></article>').join("") : '<p class="event-empty">No events match this view. '+(mode==="connected"?"The research worker will append its actual record here.":"Advance the preview to add an example event.")+'</p>';
  }
  function filteredSources() {
    const query=$("evidence-search").value.trim().toLowerCase(), rights=$("rights-filter").value, filter=$("agent-filter").value;
    return state.sources.filter(source=>{
      const haystack=[source.title,sourceUrl(source),source.summary,...list(source.topics)].join(" ").toLowerCase();
      return (!query || haystack.includes(query)) && (filter==="all" || String(source.agent_id)===filter) && (rights==="all" || rights==="eligible" && eligible(source) || rights==="reference" && rightsClass(source)==="reference" || rights==="review" && rightsClass(source)==="review" || rights==="bookmarked" && (source.bookmarked || sourceBookmarks.has(String(source.id))));
    });
  }
  function renderEvidence() {
    const sources=filteredSources();text("evidence-count",state.sources.length);text("source-results",sources.length+" of "+state.sources.length+" records");
    $("evidence-summary").innerHTML='<span><strong>'+state.sources.filter(eligible).length+'</strong> '+(mode==="preview"?"example eligible sources":"eligible sources")+'</span><span><strong>'+state.sources.filter(source=>rightsClass(source)==="review").length+'</strong> need review</span><span><strong>'+state.sources.filter(source=>rightsClass(source)==="reference").length+'</strong> reference only</span><span>Original documents ≠ agent notes</span>';
    $("source-ledger").innerHTML=sources.map(source=>'<tr><td><button class="source-title" data-source="'+esc(source.id)+'">'+esc(source.title || sourceUrl(source))+'</button><div class="source-meta">'+esc(sourceUrl(source))+'<br>'+esc(source.version || source.provenance?.method || "Version not recorded")+(mode==="preview"?" · example capture":"")+'</div></td><td>'+esc(agentName(source.agent_id))+'</td><td><span class="tag '+rightsClass(source)+'">'+esc(rightsLabel(source))+'</span><span class="source-license">'+esc(source.license || "License unknown")+'</span></td><td><span class="tag">'+esc(titleCase(source.review_status || "Pending"))+'</span></td><td><button class="icon-button" data-source="'+esc(source.id)+'" aria-label="Inspect '+esc(source.title || "source")+'">↗</button></td></tr>').join("");
    $("source-empty").hidden=!!sources.length;
  }
  function datasetName(dataset) { return dataset.name || "Corpus "+short(dataset.id,25); }
  function manifestRows(dataset) {
    const records=list(dataset.manifest?.source_records);
    return list(dataset.source_ids || dataset.manifest?.source_ids).map(id=>{const record=records.find(item=>String(item.id)===String(id));return {...sourceById(id),...record,id,title:record?.title || sourceById(id)?.title || id};});
  }
  function renderDatasets() {
    text("dataset-count",state.datasets.length);text("snapshot-create",mode==="preview" ? "Create preview snapshot" : "Create curated snapshot");
    $("snapshot-create").disabled=busy || mode==="connected" && !connected;
    $("dataset-list").innerHTML=state.datasets.length ? [...state.datasets].reverse().map(dataset=>'<button class="dataset-entry '+(String(dataset.id)===String(selectedDataset)?"selected":"")+'" data-dataset="'+esc(dataset.id)+'"><span class="tag">'+esc(mode==="preview"?"Example candidate":titleCase(dataset.status || "Candidate"))+'</span><strong>'+esc(datasetName(dataset))+'</strong><small>'+esc(dateLabel(dataset.created_at))+'<br>'+esc(dataset.counts?.original_documents ?? list(dataset.source_ids).length)+' original documents · '+esc(dataset.counts?.synthetic_examples ?? 0)+' instruction examples</small></button>').join("") : '<p class="empty-notebook">No curated snapshots.<br>Review source rights, then create the first immutable candidate.</p>';
    const dataset=state.datasets.find(item=>String(item.id)===String(selectedDataset));
    $("manifest-download").disabled=!dataset;
    text("manifest-state",dataset ? mode==="preview" ? "Example snapshot" : (dataset.immutable ? "Immutable candidate" : titleCase(dataset.status)) : "Awaiting snapshot");
    text("manifest-name",dataset ? datasetName(dataset) : "No curated snapshot selected");
    all("[data-manifest]").forEach(button=>button.classList.toggle("active",button.dataset.manifest===manifestView));
    if(!dataset) {
      $("manifest-meta").innerHTML="";
      $("manifest-content").innerHTML='<div class="empty-panel"><h3>Awaiting a curated snapshot</h3><p>Source licensing, provenance and quality decisions must accompany the corpus.</p></div>';return;
    }
    $("manifest-meta").innerHTML='<div><strong>Revision fingerprint'+(mode==="preview"?" · example":"")+'</strong><code>'+esc(short(dataset.manifest_hash || dataset.corpus_hash,32))+'</code></div><div><strong>Source families</strong>'+esc(dataset.counts?.original_documents ?? list(dataset.source_ids).length)+' documents</div><div><strong>Held-out material</strong>'+esc(dataset.counts?.validation_documents ?? list(dataset.heldout_family_ids).length)+' records</div><div><strong>Instruction examples</strong>'+esc(dataset.counts?.synthetic_examples ?? 0)+' approved records</div>';
    const rows=manifestRows(dataset);
    if(manifestView==="manifest") {
      $("manifest-content").innerHTML=rows.length ? rows.map((record,index)=>'<div class="manifest-row"><span>'+String(index+1).padStart(2,"0")+'</span><div><strong>'+esc(record.title)+'</strong><small>'+esc(record.canonical_url || sourceUrl(record) || record.id)+'<br>'+esc(record.version || "Version in manifest")+' · '+esc(record.license || "License in source record")+'</small></div><span class="tag eligible">'+(mode==="preview"?"Example cleared":"Included")+'</span></div>').join("") : '<p class="empty-notebook">This candidate contains no included source records. Review the exclusions before training.</p>';
    } else if(manifestView==="excluded") {
      const excluded=list(dataset.manifest?.excluded_sources || dataset.excluded_sources);
      $("manifest-content").innerHTML=excluded.length ? excluded.map(record=>'<div class="manifest-row"><span>×</span><div><strong>'+esc(sourceById(record.source_id)?.title || record.source_id)+'</strong><small>'+esc(list(record.reasons).map(titleCase).join("; ") || "Excluded by curation policy")+'</small></div><span class="tag reference">Excluded</span></div>').join("") : '<p class="empty-notebook">No source exclusions recorded for this snapshot.</p>';
    } else {
      const index=state.datasets.findIndex(item=>String(item.id)===String(selectedDataset)), previous=state.datasets[index-1], oldRows=previous?manifestRows(previous):[], oldIds=new Set(oldRows.map(record=>String(record.id))), currentIds=new Set(rows.map(record=>String(record.id)));
      const added=rows.filter(record=>!oldIds.has(String(record.id))), removed=oldRows.filter(record=>!currentIds.has(String(record.id)));
      const changed=rows.filter(record=>{const old=oldRows.find(item=>String(item.id)===String(record.id));return old && JSON.stringify(old.rights_evidence)!==JSON.stringify(record.rights_evidence);});
      $("manifest-content").innerHTML='<p class="rights-explanation">'+esc(previous?"Compared with "+datasetName(previous)+".":"First snapshot: all included source records are additions.")+'</p>'+[...added.map(record=>({record,sign:"+",label:"Added"})),...removed.map(record=>({record,sign:"−",label:"Removed"})),...changed.map(record=>({record,sign:"~",label:"Rights record changed"}))].map(({record,sign,label})=>'<div class="manifest-row"><span>'+sign+'</span><div><strong>'+esc(record.title)+'</strong><small>'+esc(label)+'</small></div><span class="tag">'+esc(label)+'</span></div>').join("")+(!added.length&&!removed.length&&!changed.length?'<p class="empty-notebook">No source membership or recorded rights changes.</p>':"");
    }
  }
  function renderTraining() {
    const datasetValue=$("training-dataset").value, jobValue=selectedJob, stage=$("training-stage").value, settings={...defaults,...state.settings}, parents=state.jobs.filter(job=>job.stage==="cpt" && (job.status==="passed" || mode==="preview" && job.status==="preview_validated"));
    $("training-dataset").innerHTML='<option value="">'+(state.datasets.length?"Choose a curated snapshot":"Awaiting curated snapshot")+'</option>'+state.datasets.map(dataset=>'<option value="'+esc(dataset.id)+'">'+esc(datasetName(dataset))+'</option>').join("");
    if(state.datasets.some(item=>String(item.id)===datasetValue)) $("training-dataset").value=datasetValue;else if(selectedDataset) $("training-dataset").value=selectedDataset;
    const parentValue=$("training-parent").value;
    $("training-parent").innerHTML='<option value="">Choose a completed job</option>'+parents.map(job=>'<option value="'+esc(job.id)+'">'+esc(job.name || short(job.id,31))+'</option>').join("");
    if(parents.some(job=>String(job.id)===parentValue)) $("training-parent").value=parentValue;
    $("training-parent-label").hidden=stage!=="sft";
    $("training-job-select").innerHTML='<option value="">'+(state.jobs.length?"Choose a job":"No jobs")+'</option>'+state.jobs.map(job=>'<option value="'+esc(job.id)+'">'+esc(job.name || short(job.id,30))+'</option>').join("");
    if(jobValue) $("training-job-select").value=jobValue;
    text("recipe-baseline",String(settings.hf_base_model || "Not configured").replace("meta-llama/","")+(mode==="preview"?" · example":""));
    text("recipe-adaptation",titleCase(settings.training_mode || "QLoRA")+(mode==="preview"?" · example":""));
    text("recipe-publication",titleCase(settings.publish_policy || "Private")+" · owner controlled");
    text("training-connection",mode==="preview" ? "Preview · no GPU job" : settings.training_enabled ? "Training enabled by owner" : "Training disabled");
    const approved=!!settings.synthetic_training_approved && !!settings.provider_policy_reference;
    $("training-start").disabled=busy || !canMutate() || !($("training-dataset").value) || stage==="sft" && (!approved || !$("training-parent").value);
    text("training-start",mode==="preview" ? "Validate preview job" : stage==="sft" ? "Submit approved SFT job" : "Submit pretraining job");
    const running=state.jobs.find(job=>["running","submitting","submitted","preparing"].includes(job.status));
    $("worker-state").innerHTML='<span aria-hidden="true">◇</span><div><strong>'+esc(mode==="preview"?"No training is running":running?"Actual job: "+titleCase(running.status):settings.training_enabled?"Ready for owner submission":"Training is disabled")+'</strong><p>'+esc(mode==="preview" ? "Preview validation demonstrates the flow. It does not allocate a GPU or create weights." : stage==="sft"&&!approved?"Enable approved instruction examples and record the teacher provider policy in setup before SFT." : running?"The worker reports its status and measured results in the job record." : "GPU access, Hugging Face permissions and a sealed dataset are checked by the backend before submission.")+'</p></div>';
    const job=state.jobs.find(item=>String(item.id)===String(selectedJob));
    if(!job) {
      $("job-status").innerHTML='<span class="tag">Awaiting curated snapshot</span>';
      text("job-logs","No training job has been submitted.\nA real worker must report logs and measured results.");$("job-footer").innerHTML="";return;
    }
    $("job-status").innerHTML='<span class="tag '+(/failed|error/.test(job.status)?"error":"")+'">'+esc(mode==="preview"?"Preview validation":titleCase(job.status))+'</span><p>'+esc(titleCase(job.stage || "cpt"))+' · '+esc(short(job.snapshot_id || job.manifest?.snapshot_id,24))+'</p>';
    const logs=list(job.logs).map(line=>typeof line==="string"?line:JSON.stringify(line)), eventLogs=state.events.filter(event=>event.run_id===job.id && /training|worker/.test(event.type || "")).map(event=>"["+clock(event.created_at)+"] "+(event.message || ""));
    text("job-logs",(logs.length?logs:eventLogs).join("\n") || "No worker logs reported yet.");
    $("job-footer").innerHTML='<span>'+esc(mode==="preview"?"No weights or measured metrics exist.":"Created "+dateLabel(job.created_at))+'</span>'+(['running','submitted','preparing','submitting'].includes(job.status)?'<button class="text-button" data-cancel-job="'+esc(job.id)+'">Cancel job</button>':"")+(mode==="connected" && ['failed','cancelled'].includes(job.status)?'<button class="text-button" data-retry-job="'+esc(job.id)+'"'+(busy || !canMutate()?' disabled':"")+'>'+esc(job.status==="failed"?"Retry failed job":"Retry cancelled job")+'</button>':"");
    if(mode==="connected" && job.metrics && Object.keys(job.metrics).length) $("job-footer").innerHTML+='<details><summary>Measured worker results</summary><pre class="manifest-json">'+esc(JSON.stringify(job.metrics,null,2))+'</pre></details>';
  }
  function renderCheckpoints() {
    $("checkpoint-list").innerHTML=state.checkpoints.length ? state.checkpoints.map(checkpoint=>'<article class="checkpoint-row"><div><h3>'+esc(checkpoint.name || checkpoint.repo_id || short(checkpoint.id,35))+'</h3><p>'+esc(checkpoint.base_model || checkpoint.model_id || "Model lineage in checkpoint record")+'<br>'+esc(short(checkpoint.revision || checkpoint.artifact_revision || "No published weights",50))+'</p></div><div><span>Calibration</span><span class="tag '+(checkpoint.calibration?.passed?"eligible":"review")+'">'+esc(checkpoint.baseline?"Baseline retained":checkpoint.calibration?.passed?"Measured · passed":"Calibration required")+'</span></div><div><span>Selection</span><span class="tag">'+esc(checkpoint.baseline?"Control":titleCase(checkpoint.status || "Candidate"))+'</span></div><button class="quiet-button" data-checkpoint="'+esc(checkpoint.id)+'">Inspect record</button></article>').join("") : '<div class="empty-panel"><h3>No research checkpoint yet</h3><p>The existing chamber baseline remains unchanged. A real training job must produce weights before a candidate appears.</p></div>';
  }
  function renderConnections() {
    const names={research:"Research brain",brain:"Research brain",browser:"Browser infrastructure",huggingface:"Hugging Face",hf:"Hugging Face",training:"GPU worker"};
    let connections=Array.isArray(state.connections)?state.connections:Object.entries(state.connections || {}).map(([id,value])=>({id,...(typeof value==="object"?value:{status:value})}));
    if(!connections.length) connections=Object.keys({research:1,browser:1,huggingface:1,training:1}).map(id=>({id,status:"Not reported"}));
    $("connection-list").innerHTML=connections.map(item=>'<div class="connection-row"><span>'+esc(item.name || names[item.id] || titleCase(item.id))+'</span><span class="'+(["connected","ready","healthy","ok"].includes(item.status)?"healthy":"")+'">'+esc(item.message || titleCase(item.status || "Not reported"))+'</span></div>').join("");
  }
  function showView(view,focus=false) {
    if(!["research","evidence","datasets","training","checkpoints"].includes(view)) return;
    currentView=view;
    all(".view").forEach(panel=>panel.hidden=panel.id!=="view-"+view);
    all("[data-view]").forEach(button=>{const active=button.dataset.view===view;button.setAttribute("aria-selected",String(active));button.tabIndex=active?0:-1;});
    if(focus) $("tab-"+view).focus();
    history.replaceState(null,"",location.pathname+location.search+"#"+view);
    if(view==="research") refreshFrame();
  }
  function openDialog(id) { if(!$(id).open) $(id).showModal(); }
  function openSetup() {
    const fields={api:preferences.api_base,objective:state.mission.objective || preferences.objective || $("setting-objective").value,provider:state.settings.research_provider || preferences.research_provider,model:state.settings.research_model || preferences.research_model,browser:state.settings.browser_provider || preferences.browser_provider,hf:state.settings.hf_namespace || preferences.hf_namespace};
    Object.entries(fields).forEach(([name,value])=>{if(value!==undefined) $("setting-"+name).value=value;});
    all('input[name="mode"]').forEach(input=>input.checked=input.value===mode);
    $("owner-token").value=ownerToken;renderConnections();fillExtraSettings();openDialog("setup-dialog");
  }
  function bookmarkSource(id) {
    const source=sourceById(id);if(!source) return;
    const active=sourceBookmarks.has(String(id)) || !!source.bookmarked;
    if(active){sourceBookmarks.delete(String(id));if(mode==="preview") source.bookmarked=false;}
    else {sourceBookmarks.add(String(id));if(mode==="preview") source.bookmarked=true;}
    try {localStorage.setItem(bookmarkKey,JSON.stringify([...sourceBookmarks]));}catch(_){}
    renderBrowser();renderEvidence();toast(active?"Source bookmark removed from this browser.":"Source bookmarked in this browser.");
  }
  function evidenceText(value) { return typeof value==="object" ? JSON.stringify(value,null,2) : String(value || "No rights evidence recorded."); }
  function inspectSource(id) {
    const source=sourceById(id);if(!source) return;
    const url=safeUrl(sourceUrl(source)), incompatible=rightsClass(source)==="reference", provenance=source.provenance || {}, canReview=canMutate();
    text("source-dialog-tag",mode==="preview"?"Example source record":"Collected source record");
    $("source-dialog-content").innerHTML='<h2>'+esc(source.title || sourceUrl(source))+'</h2>'+(url?'<a class="source-external" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(url)+' ↗</a>':"")+'<div class="record-grid"><div><dt>Collected by</dt><dd>'+esc(agentName(source.agent_id))+'</dd></div><div><dt>Version / family</dt><dd>'+esc(source.version || source.family_id || "Not recorded")+'</dd></div><div><dt>Rights</dt><dd><span class="tag '+rightsClass(source)+'">'+esc(rightsLabel(source))+'</span><br>'+esc(source.license || "Unknown")+'</dd></div><div><dt>Capture method</dt><dd>'+esc(mode==="preview"?"Illustrative fixture":provenance.method || "Not recorded")+'<br>'+esc(dateLabel(provenance.collected_at || source.created_at))+'</dd></div><div><dt>Content fingerprint</dt><dd>'+esc(short(source.content_hash || provenance.content_sha256,34))+'</dd></div><div><dt>Original document</dt><dd>'+esc(mode==="preview"?"Not reproduced in the preview":source.word_count?source.word_count+" words · full text stored privately":"Full text is private; only metadata is public")+'</dd></div></div><p class="record-summary">'+esc(source.summary || "No public summary recorded.")+'</p>'+(source.limitation?'<div class="record-excerpt">'+esc(source.limitation)+'</div>':"")+'<div class="record-block"><h3>Rights &amp; corpus review</h3><p class="rights-explanation">'+esc(evidenceText(source.rights_evidence || source.permission_evidence))+'</p>'+(list(source.curation?.reasons).length?'<p class="rights-explanation">Excluded because: '+esc(list(source.curation.reasons).map(titleCase).join("; "))+'</p>':"")+'<form class="review-form" data-review-source="'+esc(id)+'"><label>Review decision<select name="review_status" '+(!canReview?"disabled":"")+'><option value="approved">Approve relevance</option><option value="pending">Keep pending</option><option value="quarantined">Reference only / exclude</option><option value="rejected">Reject</option></select></label><label>License for this exact copy<input name="license" value="'+esc(source.license || "unknown")+'" '+(!canReview?"disabled":"")+'></label><label><input name="license_verified" type="checkbox" '+(source.license_verified?"checked ":"")+(!canReview?"disabled":"")+'> Verified training-compatible rights for this exact copy</label><label>Rights evidence<textarea name="rights_evidence" rows="3" '+(!canReview?"disabled":"")+' placeholder="License URL, version and permission evidence">'+esc(source.rights_evidence?evidenceText(source.rights_evidence):"")+'</textarea></label><label>Review note<textarea name="review_note" rows="2" '+(!canReview?"disabled":"")+' placeholder="Attribution, exclusions, relevance or caveats">'+esc(source.review_note || "")+'</textarea></label><p class="review-help">'+esc(mode==="preview"?"This records a simulated review. It grants no real rights.":canReview?"The backend validates eligibility; checking a box alone does not clear a source.":"Public inspection is read-only. Open Operator setup to authenticate.")+'</p><button class="primary-button" type="submit" '+(!canReview?"disabled":"")+'>'+esc(mode==="preview"?"Save preview review":"Save source review")+'</button></form></div><div class="dialog-actions"><button class="quiet-button" data-bookmark-source="'+esc(id)+'">'+(sourceBookmarks.has(String(id)) || source.bookmarked?"Remove bookmark":"Bookmark source")+'</button></div>';
    $("source-dialog-content").querySelector('[name="review_status"]').value=["approved","pending","quarantined","rejected"].includes(source.review_status)?source.review_status:incompatible?"quarantined":"pending";
    openDialog("source-dialog");
  }
  function renderAllNotes() {
    const query=$("notes-search").value.toLowerCase().trim(), bookmarks=$("notes-bookmarked").checked;
    const notes=[...state.notes].reverse().filter(note=>(!query || [note.text,note.question,note.answer,sourceById(note.source_id)?.title].join(" ").toLowerCase().includes(query)) && (!bookmarks || note.bookmarked));
    $("all-notes").innerHTML=notes.length ? notes.map(note=>'<article class="all-note"><div class="entry-meta"><span>'+esc(agentName(note.agent_id))+' / '+esc(titleCase(note.type || "Note"))+(mode==="preview"?" · example":"")+'</span><time>'+esc(clock(note.created_at))+'</time></div><p>'+esc(note.text || note.question || "No note text")+'</p>'+(note.question?'<p class="rights-explanation">Instruction draft: '+esc(note.question)+'<br>'+esc(note.answer || "")+'</p>':"")+'<div class="note-tools">'+(sourceById(note.source_id)?'<button class="source-ref text-button" data-source="'+esc(note.source_id)+'">'+esc(short(sourceById(note.source_id).title,47))+'</button>':'<span class="review-help">No linked source</span>')+'<button class="text-button" data-note-bookmark="'+esc(note.id)+'" '+(!canMutate()?"disabled":"")+'>'+esc(note.bookmarked?"Bookmarked ★":"Bookmark ☆")+'</button>'+(note.question?'<button class="text-button" data-note-approve="'+esc(note.id)+'" '+(!canMutate() || note.review_status==="approved"?"disabled":"")+'>'+esc(note.review_status==="approved"?"Reviewed · approved":"Approve instruction draft")+'</button>':"")+'</div></article>').join("") : '<div class="empty-panel"><h3>No matching notes</h3><p>Change the search or bookmark filter. Source-linked notes appear as researchers save them.</p></div>';
  }
  function inspectCheckpoint(id) {
    const checkpoint=state.checkpoints.find(item=>String(item.id)===String(id));if(!checkpoint) return;
    const measured=!!checkpoint.calibration?.passed, checks=checkpoint.calibration?.checks || checkpoint.checks || {}, url=safeUrl(checkpoint.repo_id?"https://huggingface.co/"+checkpoint.repo_id:"");
    $("checkpoint-dialog-content").innerHTML='<h2>'+esc(checkpoint.name || checkpoint.repo_id || checkpoint.id)+'</h2><p class="record-summary">'+esc(checkpoint.baseline?"The existing chamber baseline remains unchanged. This observatory preserves it as the control.":mode==="preview"?"This is a placeholder from a simulated validation flow. No trained weights or measured calibration exists.":"A candidate remains distinct from the chamber until the owner selects a validated revision.")+'</p><div class="record-grid"><div><dt>Model / adapter</dt><dd>'+esc(checkpoint.base_model || checkpoint.model_id || "Not recorded")+'</dd></div><div><dt>Revision</dt><dd>'+esc(checkpoint.revision || checkpoint.artifact_revision || "No weights created")+'</dd></div><div><dt>Training job</dt><dd>'+esc(checkpoint.run_id || "Existing baseline")+'</dd></div><div><dt>Calibration</dt><dd><span class="tag '+(measured?"eligible":"review")+'">'+esc(checkpoint.baseline?"Retained baseline":measured?"Measured · passed":"Calibration required")+'</span></dd></div></div>'+(url?'<a class="source-external" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Open model repository ↗</a>':"")+'<div class="record-block"><h3>Calibration record</h3><pre class="manifest-json">'+esc(JSON.stringify(checks,null,2))+'</pre><p class="rights-explanation">'+esc(mode==="preview"?"No test was run. The displayed requirements are examples, not measurements.":"The worker must measure compatibility, intervention vectors and control tasks for this exact model revision.")+'</p></div>'+(!checkpoint.baseline?'<div class="record-block"><h3>Manual selection</h3><p class="rights-explanation">Selecting a validated checkpoint records an operator choice. It does not reload the remote chamber; the deployment bridge must apply the pinned adapter and preserve the original baseline.</p><button class="primary-button" data-promote="'+esc(checkpoint.id)+'" '+(!measured || !checkpoint.checks?.passed || !canMutate()?"disabled":"")+'>'+esc(mode==="preview"?"Simulate selection proposal":"Select validated checkpoint")+'</button>'+(!measured?'<p class="method-note">Selection is locked until measured calibration passes.</p>':"")+'</div>':"");
    if(checkpoint.deployment_env && Object.keys(checkpoint.deployment_env).length) {
      $("checkpoint-dialog-content").insertAdjacentHTML("beforeend",'<div class="record-block"><h3>Worker configuration</h3><p class="rights-explanation">Applies on operator redeployment. These pinned base, adapter and tokenizer settings do not reload the chamber automatically. No credentials are included.</p><pre class="manifest-json">'+esc(deploymentEnvironment(checkpoint))+'</pre><div class="dialog-actions"><button class="quiet-button" data-deployment-copy="'+esc(checkpoint.id)+'">Copy configuration</button><button class="quiet-button" data-deployment-download="'+esc(checkpoint.id)+'">Download .env</button></div></div>');
    }
    openDialog("checkpoint-dialog");
  }
  function deploymentEnvironment(checkpoint) {
    return Object.entries(checkpoint.deployment_env || {}).filter(([key,value])=>/^[A-Z_][A-Z0-9_]*$/.test(key) && ["string","number","boolean"].includes(typeof value)).map(([key,value])=>key+"="+JSON.stringify(String(value))).join("\n");
  }
  async function exportDeployment(id,download=false) {
    const checkpoint=state.checkpoints.find(item=>String(item.id)===String(id));if(!checkpoint)return;
    const content=deploymentEnvironment(checkpoint);if(!content){toast("No worker deployment configuration is available.");return;}
    if(!download) {
      try {await navigator.clipboard.writeText(content);toast("Worker configuration copied. Operator redeployment is still required.");}
      catch(_){toast("Clipboard is unavailable. Use Download .env or copy the displayed configuration.");}
      return;
    }
    const url=URL.createObjectURL(new Blob(["# Worker configuration; apply on operator redeployment.\n"+content+"\n"],{type:"text/plain"})), anchor=document.createElement("a");
    anchor.href=url;anchor.download=String(checkpoint.id).replace(/[^a-zA-Z0-9_-]/g,"_")+"-worker.env";document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast("Worker configuration downloaded. No chamber reload was requested.");
  }
  function confirmAction(title,message,label,callback) {
    text("confirm-title",title);text("confirm-message",message);text("confirm-accept",label);confirmation=callback;openDialog("confirm-dialog");
  }
  async function mutate(path,payload={},method="POST") {
    if(!canMutate()){explainOwner();return null;}
    busy=true;renderMission();renderDatasets();renderTraining();
    try { const result=await request(path,method,payload);await refreshState(true);return result; }
    catch(error){toast(error.message);return null;}
    finally {busy=false;render();}
  }
  function updatePreviewTimer() {
    clearInterval(previewTimer);previewTimer=null;
    if(mode==="preview" && state.mission.status==="running") previewTimer=setInterval(()=>{window.ObservatoryPreview.step(state);render();},4200);
  }
  async function missionAction(action) {
    if(mode==="preview"){window.ObservatoryPreview.mission(state,action);if(action==="start" || action==="resume")window.ObservatoryPreview.step(state);updatePreviewTimer();render();toast("Preview "+action+" simulated. No real browser was started.");}
    else if(!canMutate()) explainOwner();
    else {const result=await mutate("admin/missions/"+action,action==="start"?{objective:preferences.objective || state.mission.objective}:{});if(result)toast("Mission "+action+" requested. The worker will report its actual state.");}
  }
  function installExtraSettings() {
    $("setting-browser").innerHTML='<option value="browseruse">Browser Use Cloud</option><option value="local">Local Chromium</option><option value="cdp">Existing CDP · including Steel</option>';
    const divider=$("setting-browser").closest("label");
    divider.insertAdjacentHTML("afterend",'<label id="browser-key-label">Browser Use API key<input id="setting-browser-key" type="password" autocomplete="off" placeholder="Leave blank to preserve the backend key"><small>Sent only to the authenticated backend. Never saved locally.</small></label><label id="cdp-label" hidden>CDP connection URL<input id="setting-cdp" type="password" autocomplete="off" spellcheck="false" placeholder="Private connection endpoint · not stored locally"></label><label id="chromium-label" hidden>Local Chromium executable<input id="setting-chromium" type="text" spellcheck="false" placeholder="Optional · backend filesystem path"></label>');
    $("cdp-label").insertAdjacentHTML("afterend",'<label id="cdp-ack-label" hidden><input id="setting-cdp-ack" type="checkbox"> I confirm this is a dedicated, isolated browser with no authenticated sessions.<small>Custom CDP runs one research agent. Do not attach a personal browser or expose its connection URL publicly.</small></label>');
    $("setting-provider").closest(".form-pair").insertAdjacentHTML("afterend",'<label>Research provider API key<input id="setting-research-key" type="password" autocomplete="off" placeholder="Leave blank to preserve the backend key"><small>Stored encrypted by the backend; never in browser storage.</small></label><div class="form-pair"><label>Reasoning effort<select id="setting-effort"><option value="high">High</option><option value="xhigh">Extra high</option><option value="medium">Medium</option><option value="low">Low</option></select></label><label>Research agents<input id="setting-agent-count" type="number" min="1" max="6" value="6"></label></div>');
    $("setting-hf").closest("label").insertAdjacentHTML("afterend",'<label>Hugging Face token<input id="setting-hf-token" type="password" autocomplete="off" placeholder="Leave blank to preserve the backend token"></label><div class="setup-divider"><h3>Training permissions</h3><span>Explicit owner choices</span></div><label>Subject base model<input id="setting-base-model" type="text" spellcheck="false" value="meta-llama/Llama-3.1-70B"></label><label><input id="setting-training-enabled" type="checkbox"> Enable actual training jobs<small>Training can allocate paid GPU jobs after backend validation. Preview actions never allocate compute.</small></label><label><input id="setting-synthetic-approved" type="checkbox"> Enable approved instruction examples<small>Generated notebook drafts require review. The owner must verify teacher-provider terms before permitting SFT.</small></label><label>Teacher-provider policy reference<input id="setting-policy-reference" type="text" placeholder="Policy URL / agreement and review date"><small>Required when enabling generated instruction examples; it does not bypass evidence or source-rights review.</small></label>');
    all("#settings-form .settings-note").forEach(item=>item.textContent="Secret fields are sent only to the authenticated backend and are never written to browser storage. Public settings report configured status, not keys.");
    $("setting-policy-reference").closest("label").insertAdjacentHTML("afterend",'<details class="advanced-setup"><summary>GPU worker, repositories &amp; recipe</summary><p>These settings bound training jobs. Research browsing continues until manually stopped.</p><label>Dataset repository<input id="setting-dataset-repo" type="text" spellcheck="false" placeholder="namespace/consciousness-corpus"></label><label>Model repository<input id="setting-model-repo" type="text" spellcheck="false" placeholder="namespace/consciousness-subject"></label><label>Pinned worker container<input id="setting-training-image" type="text" spellcheck="false" placeholder="registry/worker@sha256:…"></label><div class="form-pair"><label>GPU hardware<select id="setting-hardware"><option value="a100-large">A100 large</option><option value="h200">H200</option></select></label><label>Adaptation<select id="setting-training-mode"><option value="qlora">QLoRA</option><option value="lora">LoRA</option></select></label></div><div class="form-pair"><label>Check snapshots every (hours)<input id="setting-training-interval" type="number" min="0.1" step="0.1" value="4"></label><label>GPU timeout (seconds)<input id="setting-training-timeout" type="number" min="60" max="604800" value="14400"></label></div><div class="form-pair"><label>Minimum documents<input id="setting-min-documents" type="number" min="1" value="20"></label><label>Minimum tokens<input id="setting-min-tokens" type="number" min="1" value="50000"></label></div><div class="form-pair"><label>Training steps per job<input id="setting-max-steps" type="number" min="1" value="100"></label><label>Sequence length<input id="setting-sequence-length" type="number" min="128" value="2048"></label></div><label>Model publication<select id="setting-publish-policy"><option value="private">Private repositories</option><option value="hold">Hold publication</option><option value="public">Public model artifacts</option></select></label><label>Budget reference (USD)<input id="setting-training-budget" type="number" min="0" step="1" placeholder="Optional"><small>Informational. Provider funds, hardware choices and job timeouts control spending; this field is not an enforced spending cap.</small></label><label>Base model revision<input id="setting-base-revision" type="text" spellcheck="false" placeholder="Optional · resolved and pinned by the backend"></label></details>');
    $("setting-dataset-repo").closest("label").insertAdjacentHTML("beforebegin",'<label class="checkbox-label"><input id="setting-continue-training" type="checkbox" checked><span>Continue from the previous validated pretraining adapter<small>Use the latest validated CPT adapter as the parent for a new curated snapshot. Disable to start from the pinned original base. Failed jobs are never retried automatically.</small></span></label>');
    $("setting-training-enabled").closest("label").querySelector("small").textContent="When enabled, the backend checks new snapshots on the configured interval and can allocate paid GPU jobs. Preview never allocates compute.";
    $("setting-browser").addEventListener("change",toggleBrowserFields);
  }
  function toggleBrowserFields() {
    const value=$("setting-browser").value;
    $("browser-key-label").hidden=value!=="browseruse";$("cdp-label").hidden=value!=="cdp";$("chromium-label").hidden=value!=="local";
    $("cdp-ack-label").hidden=value!=="cdp";$("setting-agent-count").disabled=value==="cdp";
    if(value==="cdp") $("setting-agent-count").value=1;
  }
  function fillExtraSettings() {
    const settings={...preferences,...state.settings};
    $("setting-effort").value=settings.reasoning_effort || "high";$("setting-agent-count").value=settings.agent_count || 6;
    $("setting-base-model").value=settings.hf_base_model || defaults.hf_base_model;
    $("setting-training-enabled").checked=!!settings.training_enabled;$("setting-synthetic-approved").checked=!!settings.synthetic_training_approved;
    $("setting-continue-training").checked=settings.training_continue_from_previous!==false;
    $("setting-policy-reference").value=settings.provider_policy_reference || "";$("setting-chromium").value=settings.chromium_executable || "";
    $("setting-cdp-ack").checked=!!settings.cdp_isolated_ack;
    const fields={"dataset-repo":["hf_dataset_repo",""],"model-repo":["hf_model_repo",""],"training-image":["training_image",""],hardware:["training_hardware","a100-large"],"training-mode":["training_mode","qlora"],"training-interval":["training_interval_hours",4],"training-timeout":["training_timeout_seconds",14400],"min-documents":["training_min_documents",20],"min-tokens":["training_min_tokens",50000],"max-steps":["training_max_steps",100],"sequence-length":["training_sequence_length",2048],"publish-policy":["publish_policy","private"],"training-budget":["training_budget_usd",""],"base-revision":["hf_base_revision",""]};
    Object.entries(fields).forEach(([field,[key,fallback]])=>{$("setting-"+field).value=settings[key] ?? fallback;});
    toggleBrowserFields();
  }
  function collectSettings() {
    const settings={objective:$("setting-objective").value.trim(),research_provider:$("setting-provider").value,research_model:$("setting-model").value.trim(),reasoning_effort:$("setting-effort").value,agent_count:Math.max(1,Math.min(6,Number($("setting-agent-count").value) || 6)),browser_provider:$("setting-browser").value,hf_namespace:$("setting-hf").value.trim(),hf_base_model:$("setting-base-model").value.trim(),training_enabled:$("setting-training-enabled").checked,training_continue_from_previous:$("setting-continue-training").checked,synthetic_training_approved:$("setting-synthetic-approved").checked,provider_policy_reference:$("setting-policy-reference").value.trim(),chromium_executable:$("setting-chromium").value.trim()};
    if(settings.synthetic_training_approved && !settings.provider_policy_reference) throw new Error("Record the teacher-provider policy reference before enabling instruction examples.");
    if(!settings.research_model || !settings.hf_base_model) throw new Error("Research and subject model IDs must be provided.");
    settings.cdp_isolated_ack=$("setting-cdp-ack").checked;
    if(settings.browser_provider==="cdp") {
      settings.agent_count=1;
      if(!settings.cdp_isolated_ack) throw new Error("Confirm the custom CDP browser is isolated and contains no authenticated sessions.");
    }
    Object.assign(settings,{training_provider:"hf_jobs",activation_policy:"manual",hf_dataset_repo:$("setting-dataset-repo").value.trim(),hf_model_repo:$("setting-model-repo").value.trim(),training_image:$("setting-training-image").value.trim(),training_hardware:$("setting-hardware").value,training_mode:$("setting-training-mode").value,training_interval_hours:Number($("setting-training-interval").value),training_timeout_seconds:Number($("setting-training-timeout").value),training_min_documents:Number($("setting-min-documents").value),training_min_tokens:Number($("setting-min-tokens").value),training_max_steps:Number($("setting-max-steps").value),training_sequence_length:Number($("setting-sequence-length").value),publish_policy:$("setting-publish-policy").value,training_budget_usd:$("setting-training-budget").value===""?null:Number($("setting-training-budget").value),hf_base_revision:$("setting-base-revision").value.trim() || null});
    return settings;
  }
  async function saveSetup(event) {
    event.preventDefault();text("setup-result","");
    try {
      const nextMode=document.querySelector('input[name="mode"]:checked').value, api=validateEndpoint($("setting-api").value), settings=collectSettings();
      ownerToken=$("owner-token").value.trim();preferences={...preferences,...settings,api_base:api};
      // Explicit allowlist: never serialize form data or include credential fields.
      const publicPreferences={};
      ["api_base","objective","research_provider","research_model","reasoning_effort","agent_count","browser_provider","cdp_isolated_ack","hf_namespace","hf_base_model","training_enabled","training_continue_from_previous","synthetic_training_approved","provider_policy_reference","chromium_executable","hf_dataset_repo","hf_model_repo","training_image","training_hardware","training_mode","training_interval_hours","training_timeout_seconds","training_min_documents","training_min_tokens","training_max_steps","training_sequence_length","publish_policy","training_budget_usd","hf_base_revision"].forEach(key=>publicPreferences[key]=preferences[key]);
      try {localStorage.setItem(storageKey,JSON.stringify(publicPreferences));}catch(_){}
      if(nextMode!==mode){disconnect();clearInterval(previewTimer);mode=nextMode;state=mode==="preview"?window.ObservatoryPreview.create():emptyState();selectedAgent="";lastPreviewSource="";}
      if(mode==="preview") {
        state.settings={...state.settings,...settings};state.mission.objective=settings.objective;
        ["setting-research-key","setting-browser-key","setting-hf-token","setting-cdp"].forEach(id=>$(id).value="");
        render();
        text("setup-result","Preview preferences saved. Secrets were not saved or sent anywhere.");toast("Preview setup saved.");return;
      }
      disconnect();await refreshState();
      if(!connected){render();return;}
      if(ownerToken) {
        const secretSettings={...settings};
        const brainKey=$("setting-research-key").value.trim(), browserKey=$("setting-browser-key").value.trim(), hfToken=$("setting-hf-token").value.trim(), cdp=$("setting-cdp").value.trim();
        if(brainKey) secretSettings[settings.research_provider==="anthropic"?"anthropic_api_key":"openai_api_key"]=brainKey;
        if(browserKey) secretSettings.browser_use_api_key=browserKey;if(hfToken) secretSettings.hf_token=hfToken;if(cdp)secretSettings.cdp_url=cdp;
        await request("admin/settings","POST",secretSettings);
        ["setting-research-key","setting-browser-key","setting-hf-token","setting-cdp"].forEach(id=>$(id).value="");
        await refreshState(true);text("setup-result","Connected setup saved by the backend. Secret input fields cleared.");toast("Connected operator setup saved.");
      } else {text("setup-result","Connected as a read-only observer. Enter the owner token to save backend settings.");toast("Connected as a read-only observer.");}
      render();
    } catch(error) {text("setup-result",error.message);toast(error.message);}
  }
  async function reviewSource(form) {
    const id=form.dataset.reviewSource, source=sourceById(id), data=new FormData(form);
    if(!source || !canMutate()) return;
    const verified=data.has("license_verified"), evidence=String(data.get("rights_evidence") || "").trim(), license=String(data.get("license") || "unknown").trim();
    if(verified && !evidence){toast("Rights verification requires recorded evidence for the exact copy.");return;}
    const payload={review_status:data.get("review_status"),license,license_verified:verified,rights_evidence:evidence,review_note:String(data.get("review_note") || "").trim(),rights_status:verified?"license_verified":data.get("review_status")==="quarantined"?"reference_only":"needs_review"};
    if(mode==="preview") {
      Object.assign(source,payload);
      const compatible=/^(cc-by(?:-4\.0|-3\.0)?|cc0(?:-1\.0)?|public-domain)$/i.test(license);
      const allowed=verified && !!evidence && compatible && !["rejected","quarantined"].includes(payload.review_status);
      source.curation={eligible:allowed,status:allowed?"eligible":"quarantined",reasons:allowed?[]:[!compatible?"license_not_in_public_corpus_policy":!verified?"rights_not_verified":"owner_review_excludes_source"]};
      window.ObservatoryPreview.event(state,"source.reviewed","Simulated owner review saved. No actual rights were granted.",source.agent_id,{source_id:id});render();inspectSource(id);toast("Preview review saved.");
    } else {const result=await mutate("admin/sources/"+encodeURIComponent(id),payload,"PATCH");if(result){inspectSource(id);toast("Source review saved; eligibility was evaluated by the backend.");}}
  }
  async function saveNote(event) {
    event.preventDefault();const value=$("note-text").value.trim(), source=currentSource();if(!value || !source)return;
    const payload={text:value,source_id:source.id,agent_id:selectedAgent,type:"owner_note"};
    if(mode==="preview") {
      const note={...payload,id:"preview-owner-note-"+Date.now(),generated_by:"owner",review_status:"pending",bookmarked:false,created_at:new Date().toISOString()};
      state.notes.push(note);window.ObservatoryPreview.event(state,"note.saved","Simulated owner note saved.",selectedAgent,{note_id:note.id,source_id:source.id});$("note-text").value="";notebook="notes";render();toast("Preview note saved.");
    } else {const result=await mutate("admin/notes",payload);if(result){$("note-text").value="";notebook="notes";renderNotebook();toast("Source-linked note saved.");}}
  }
  async function editNote(id,payload) {
    const note=state.notes.find(item=>String(item.id)===String(id));if(!note)return;
    if(mode==="preview"){Object.assign(note,payload);renderAllNotes();renderNotebook();toast("Preview note updated.");}
    else {const result=await mutate("admin/notes/"+encodeURIComponent(id),payload,"PATCH");if(result){renderAllNotes();toast("Note updated.");}}
  }
  function downloadManifest() {
    const dataset=state.datasets.find(item=>String(item.id)===String(selectedDataset));if(!dataset)return;
    const payload={id:dataset.id,created_at:dataset.created_at,manifest_hash:dataset.manifest_hash,counts:dataset.counts,manifest:dataset.manifest,notice:mode==="preview"?"Simulated metadata manifest. No training documents or weights.":"Public metadata manifest; original documents remain in the private dataset."};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"})), anchor=document.createElement("a");
    anchor.href=url;anchor.download=String(dataset.id).replace(/[^a-zA-Z0-9_-]/g,"_")+"-manifest.json";document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast(mode==="preview"?"Preview metadata manifest downloaded.":"Public metadata manifest downloaded.");
  }
  async function createSnapshot() {
    if(mode==="preview"){const dataset=window.ObservatoryPreview.snapshot(state);selectedDataset=dataset.id;render();toast("Simulated metadata snapshot created. No corpus was uploaded.");}
    else {const result=await mutate("admin/snapshots",{});if(result){selectedDataset=result.id;renderDatasets();renderTraining();toast("Immutable corpus candidate created.");}}
  }
  function startTraining() {
    const snapshot=$("training-dataset").value, stage=$("training-stage").value, parent=$("training-parent").value;
    if(!snapshot)return;
    confirmAction(mode==="preview"?"Validate a preview job?":"Submit a training job?",mode==="preview"?"This demonstrates validation and creates a placeholder checkpoint. It does not allocate compute, train weights, upload documents or measure calibration.":"The authenticated backend will validate the sealed dataset and submit a paid GPU job if training is enabled. The existing chamber baseline remains preserved.",mode==="preview"?"Validate preview":"Submit job",async()=>{
      if(mode==="preview"){const job=window.ObservatoryPreview.train(state,snapshot);job.stage=stage;selectedJob=job.id;render();toast("Preview job validated. No training ran.");}
      else {const payload=stage==="sft"?{stage:"sft",parent_run_id:parent,snapshot_id:snapshot}:{snapshot_id:snapshot};const result=await mutate("admin/train",payload);if(result){if(result.status==="not_ready"){toast("Training not submitted: "+list(result.reasons).map(titleCase).join("; "));return;}if(result.id)selectedJob=result.id;renderTraining();toast(/failed|unknown/.test(result.status || "")?"Submission needs inspection: "+titleCase(result.status):"Training submission recorded. Watch the worker status.");}}
    });
  }
  function retryTraining(id) {
    const job=state.jobs.find(item=>String(item.id)===String(id));
    if(mode!=="connected" || !job || !["failed","cancelled"].includes(job.status))return;
    if(!canMutate()){explainOwner();return;}
    const snapshot=job.snapshot_id || job.manifest?.snapshot_id;
    if(!snapshot){toast("This job has no recorded immutable snapshot to retry.");return;}
    const payload={snapshot_id:snapshot,retry:true};
    if(job.stage==="sft"){payload.stage="sft";payload.parent_run_id=job.parent_run_id || job.manifest?.parent_run_id;if(!payload.parent_run_id){toast("The SFT job has no recorded parent checkpoint.");return;}}
    confirmAction("Retry the "+titleCase(job.status).toLowerCase()+" job?","This is a new paid GPU submission for the recorded immutable snapshot. The backend validates current settings and records its link to the previous job. Retries require this explicit owner action; they are never scheduled automatically.","Retry job",async()=>{
      const result=await mutate("admin/train",payload);
      if(!result)return;
      if(result.status==="not_ready"){toast("Retry not submitted: "+list(result.reasons).map(titleCase).join("; "));return;}
      if(result.id)selectedJob=result.id;renderTraining();
      toast(/failed|unknown/.test(result.status || "")?"Retry needs inspection: "+titleCase(result.status):"Manual retry recorded. Watch the worker status.");
    });
  }
  document.addEventListener("click",async event=>{
    const view=event.target.closest("[data-view]");if(view){showView(view.dataset.view);return;}
    const agentButton=event.target.closest("[data-agent]");if(agentButton){selectedAgent=agentButton.dataset.agent;clearLiveFrame();lastPreviewSource="";renderAgents();renderBrowser();renderNotebook();renderEvents();return;}
    const notebookButton=event.target.closest("[data-notebook]");if(notebookButton){notebook=notebookButton.dataset.notebook;renderNotebook();return;}
    const sourceButton=event.target.closest("[data-source]");if(sourceButton){inspectSource(sourceButton.dataset.source);return;}
    const datasetButton=event.target.closest("[data-dataset]");if(datasetButton){selectedDataset=datasetButton.dataset.dataset;renderDatasets();renderTraining();return;}
    const manifestButton=event.target.closest("[data-manifest]");if(manifestButton){manifestView=manifestButton.dataset.manifest;renderDatasets();return;}
    const checkpointButton=event.target.closest("[data-checkpoint]");if(checkpointButton){inspectCheckpoint(checkpointButton.dataset.checkpoint);return;}
    const deploymentCopy=event.target.closest("[data-deployment-copy]");if(deploymentCopy){await exportDeployment(deploymentCopy.dataset.deploymentCopy);return;}
    const deploymentDownload=event.target.closest("[data-deployment-download]");if(deploymentDownload){await exportDeployment(deploymentDownload.dataset.deploymentDownload,true);return;}
    const closeButton=event.target.closest("[data-close-dialog]");if(closeButton){closeButton.closest("dialog").close();return;}
    const bookmark=event.target.closest("[data-bookmark-source]");if(bookmark){bookmarkSource(bookmark.dataset.bookmarkSource);inspectSource(bookmark.dataset.bookmarkSource);return;}
    const noteBookmark=event.target.closest("[data-note-bookmark]");if(noteBookmark){const note=state.notes.find(item=>String(item.id)===noteBookmark.dataset.noteBookmark);if(note)await editNote(note.id,{bookmarked:!note.bookmarked});return;}
    const approve=event.target.closest("[data-note-approve]");if(approve){await editNote(approve.dataset.noteApprove,{review_status:"approved"});return;}
    const retry=event.target.closest("[data-retry-job]");if(retry){retryTraining(retry.dataset.retryJob);return;}
    const promote=event.target.closest("[data-promote]");if(promote){confirmAction("Select the validated checkpoint?","This records an operator selection of a pinned checkpoint. The remote chamber is not reloaded by this request; its deployment bridge remains a separate action.","Record selection",async()=>{const result=await mutate("admin/checkpoints/"+encodeURIComponent(promote.dataset.promote)+"/activate",{});if(result){inspectCheckpoint(promote.dataset.promote);toast("Validated checkpoint selected. Remote chamber reload remains pending.");}});return;}
    const cancel=event.target.closest("[data-cancel-job]");if(cancel){confirmAction("Cancel the GPU job?","Cancellation is sent to the provider. Partial logs and the immutable dataset remain in the record.","Cancel job",()=>mutate("admin/train/"+encodeURIComponent(cancel.dataset.cancelJob)+"/cancel",{}));}
  });
  document.addEventListener("submit",event=>{const form=event.target.closest("[data-review-source]");if(form){event.preventDefault();reviewSource(form);}});
  all("dialog").forEach(dialog=>{dialog.addEventListener("click",event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom)dialog.close();}});});
  all("[data-view]").forEach(button=>button.addEventListener("keydown",event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();const buttons=all("[data-view]"),index=buttons.indexOf(button),next=event.key==="Home"?0:event.key==="End"?buttons.length-1:(index+(event.key==="ArrowRight"?1:-1)+buttons.length)%buttons.length;showView(buttons[next].dataset.view,true);}));
  $("setup-open").addEventListener("click",openSetup);$("connect-open").addEventListener("click",openSetup);
  $("settings-form").addEventListener("submit",saveSetup);$("note-form").addEventListener("submit",saveNote);
  $("owner-token").addEventListener("input",()=>{ownerToken=$("owner-token").value.trim();renderNotebook();renderTraining();});
  $("setting-provider").addEventListener("change",()=>{const old=$("setting-model").value;if(["gpt-6-astra","claude-fable-5-1"].includes(old))$("setting-model").value=$("setting-provider").value==="anthropic"?"claude-fable-5-1":"gpt-6-astra";$("setting-research-key").value="";});
  $("connection-check").addEventListener("click",async()=>{try{preferences.api_base=validateEndpoint($("setting-api").value);const payload=normalizeState(await request("state"));text("setup-result","Backend reachable. "+payload.agents.length+" actual agents, "+payload.sources.length+" source records. Save setup to enter connected mode.");if(mode==="connected"){state=payload;connected=true;connectionError="";render();}}catch(error){text("setup-result",error.message+" Preview mode was not substituted.");}});
  $("preview-reset").addEventListener("click",()=>{if(mode!=="preview"){toast("Switch to Preview to reset simulated records.");return;}clearInterval(previewTimer);state=window.ObservatoryPreview.create();selectedAgent="";selectedDataset="";selectedJob="";lastPreviewSource="";render();toast("Preview reset. No connected backend was changed.");});
  $("mission-toggle").addEventListener("click",()=>missionAction(state.mission.status==="running"?"pause":state.mission.status==="paused"?"resume":"start"));
  $("mission-stop").addEventListener("click",()=>confirmAction(mode==="preview"?"Stop the preview?":"Stop the research mission?",mode==="preview"?"The simulation stops. Example notes, sources and snapshots remain available.":"The worker stops research and releases its owned browser sessions. Source records, notes and datasets remain durable.",mode==="preview"?"Stop preview":"Stop mission",()=>missionAction("stop")));
  $("mission-step").addEventListener("click",()=>{if(mode!=="preview")return;window.ObservatoryPreview.step(state);render();toast("Advanced one simulated research event.");});
  $("browser-inspect").addEventListener("click",()=>{const source=currentSource();if(source)inspectSource(source.id);});
  $("capture-inspect").addEventListener("click",()=>{const source=currentSource();if(source)inspectSource(source.id);});
  $("bookmark-source").addEventListener("click",()=>{const source=currentSource();if(source)bookmarkSource(source.id);});
  ["notes-open","show-notes"].forEach(id=>$(id).addEventListener("click",()=>{renderAllNotes();openDialog("notes-dialog");}));
  $("notes-search").addEventListener("input",renderAllNotes);$("notes-bookmarked").addEventListener("change",renderAllNotes);
  $("evidence-search").addEventListener("input",renderEvidence);$("rights-filter").addEventListener("change",renderEvidence);$("agent-filter").addEventListener("change",renderEvidence);
  $("event-filter-toggle").addEventListener("click",()=>{eventOnlyAgent=!eventOnlyAgent;renderEvents();});
  $("snapshot-create").addEventListener("click",createSnapshot);$("manifest-download").addEventListener("click",downloadManifest);
  $("training-start").addEventListener("click",startTraining);$("training-dataset").addEventListener("change",renderTraining);$("training-stage").addEventListener("change",renderTraining);$("training-parent").addEventListener("change",renderTraining);
  $("training-job-select").addEventListener("change",()=>{selectedJob=$("training-job-select").value;renderTraining();});
  $("confirm-accept").addEventListener("click",async()=>{const callback=confirmation;confirmation=null;$("confirm-dialog").close();if(callback)await callback();});
  window.addEventListener("beforeunload",()=>{disconnect();clearInterval(previewTimer);ownerToken="";});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden && mode==="connected")refreshState(true);});
  installExtraSettings();fillExtraSettings();render();showView(location.hash.slice(1) || "research");
  if(mode==="connected")refreshState();
  setInterval(refreshFrame,2000);
})();
