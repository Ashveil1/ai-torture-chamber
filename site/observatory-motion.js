/* A finite illustration of explicit section inspection and saved evidence.
 * Matched browser pixels and DOM passage geometry remain the record; this is
 * neither a model-attention trace nor a claim that highlighted text is true. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const ease = value => { const t=clamp(value,0,1); return t*t*(3-2*t); };
  const mix = (a,b,t) => a+(b-a)*t;
  const finite = value => typeof value==="number" && Number.isFinite(value);
  const now = () => typeof performance!=="undefined" ? performance.now() : Date.now();
  const reduced = typeof matchMedia==="function" ? matchMedia("(prefers-reduced-motion: reduce)") : {matches:false};
  const completed = new Set(), delivered = new Set();
  let active=null, raf=null, last=null, lastInput=null, position=null, rotation=0, drawnKey=null, lastReduced=null, sawSerial=0;
  const APPROACH_MS=600, ENDPOINT_MS=250;
  function reducedMotion(input) {
    const mode=input?.motionMode || "system";
    return mode==="reduced" || mode!=="full" && reduced.matches;
  }
  function isBusy() {
    return !!active && !active.done && !!active.input.running && !!active.input.visible && !document.hidden && !reducedMotion(active.input);
  }

  function remember(collection,key) {
    collection.add(key);
    if(collection.size>256) collection.delete(collection.values().next().value);
  }
  function text(id,value) { const node=$(id); if(node) node.textContent=value; }
  function label(value,input) { text("crawler-activity",(input?.preview?"Example · ":"")+value); }
  function saw(index=0) {
    const uid="observatory-saw-"+(++sawSerial),teeth=[],facets=[];
    const point=(angle,radius)=>{const a=angle*Math.PI/180;return (50+Math.cos(a)*radius).toFixed(2)+","+(50+Math.sin(a)*radius).toFixed(2);};
    for(let i=0;i<24;i++) {
      const a=i*15,root=point(a,38.5),edge=point(a+2,44),tip=point(a+4.8,44),heel=point(a+12,38.5);
      teeth.push(root,edge,tip,heel);
      facets.push("M"+edge+"L"+tip+"L"+point(a+6.5,39.2)+"Z");
    }
    const slots=Array.from({length:6},(_,i)=>'<path d="M73 33Q79 37 78 43" transform="rotate('+(i*60)+' 50 50)"/>').join("");
    const screws=Array.from({length:3},(_,i)=>'<g transform="rotate('+(i*120)+' 50 50)"><circle cx="50" cy="32.8" r="2.1" fill="#30291d" stroke="#e1c38b" stroke-width=".8"/><path d="M48.9 32.8h2.2" stroke="#90816a" stroke-width=".7"/></g>').join("");
    const number=Number.isFinite(Number(index))?clamp(Math.floor(Number(index))+1,1,999):1;
    return '<svg class="saw-svg" viewBox="0 0 100 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">'+
      '<defs><linearGradient id="'+uid+'-steel" x1=".15" y1="0" x2=".85" y2="1"><stop offset="0" stop-color="#f1eadb"/><stop offset=".22" stop-color="#b3b9b0"/><stop offset=".49" stop-color="#5e6968"/><stop offset=".63" stop-color="#b0b7af"/><stop offset="1" stop-color="#424c4b"/></linearGradient>'+
      '<linearGradient id="'+uid+'-brass" x1="0" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#f1d9a0"/><stop offset=".24" stop-color="#ba9555"/><stop offset=".57" stop-color="#684924"/><stop offset=".81" stop-color="#d6b373"/><stop offset="1" stop-color="#715128"/></linearGradient>'+
      '<radialGradient id="'+uid+'-core" cx=".35" cy=".2" r=".85"><stop offset="0" stop-color="#53574e"/><stop offset=".45" stop-color="#272e2c"/><stop offset="1" stop-color="#0e1515"/></radialGradient>'+
      '<linearGradient id="'+uid+'-lens" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1515"/><stop offset=".45" stop-color="#172929"/><stop offset="1" stop-color="#455452"/></linearGradient></defs>'+
      '<circle cx="50" cy="52" r="40" fill="#110f0b" opacity=".2"/>'+
      '<g class="saw-blade"><path class="saw-cutting-edge" d="M'+teeth.join("L")+'Z" fill="url(#'+uid+'-steel)" stroke="#292d28" stroke-width="1.3" stroke-linejoin="round"/>'+
      '<path class="saw-tooth-facets" d="'+facets.join("")+'" fill="#ece3cf" opacity=".65"/>'+
      '<circle cx="50" cy="50" r="36.8" fill="none" stroke="#e4d6b7" stroke-width=".9"/>'+
      '<g class="saw-metal-grooves" fill="none" stroke="#d2d4bf" stroke-width=".55" opacity=".6"><circle cx="50" cy="50" r="33.8"/><circle cx="50" cy="50" r="30.5"/><circle cx="50" cy="50" r="27.2"/></g>'+
      '<g class="saw-expansion-slots" fill="none" stroke="#283431" stroke-width="2.2" stroke-linecap="round">'+slots+'</g>'+
      '<circle cx="50" cy="50" r="23.4" fill="none" stroke="#404943" stroke-width="1.2"/></g>'+
      '<g class="saw-body"><g class="saw-feeler" fill="none" stroke-linecap="round"><path d="M35 58Q28 63 29 73M65 58Q72 63 71 73" stroke="#18201c" stroke-width="5"/><path d="M35 58Q28 63 29 73M65 58Q72 63 71 73" stroke="#9e855b" stroke-width="2.4"/><path d="M26 74h6M68 74h6" stroke="#39433e" stroke-width="3.2"/></g>'+
      '<circle cx="50" cy="51.6" r="21.5" fill="#171b17" opacity=".7"/>'+
      '<circle cx="50" cy="50" r="21" fill="url(#'+uid+'-brass)" stroke="#302819" stroke-width="1.1"/>'+
      '<circle class="saw-hub" cx="50" cy="50" r="15.5" fill="url(#'+uid+'-core)" stroke="#e4c995" stroke-width=".8"/>'+
      '<path d="M37.3 43.4A14.3 14.3 0 0 1 60.4 40.1" fill="none" stroke="#a7b1a1" stroke-width=".7" opacity=".65"/>'+
      '<g class="saw-screws">'+screws+'</g>'+
      '<rect class="saw-eye" x="38" y="42" width="24" height="10.5" rx="4.5" fill="url(#'+uid+'-lens)" stroke="#93825c" stroke-width="1"/>'+
      '<path d="M42 44h14" stroke="#8da398" stroke-width=".9" stroke-linecap="round" opacity=".55"/>'+
      '<circle class="saw-status-light" cx="56.2" cy="47.3" r="2.15" fill="#d6b565" stroke="#eedba8" stroke-width=".65"/>'+
      '<circle cx="55.6" cy="46.7" r=".55" fill="#fff0c6"/>'+
      '<path d="M41 57.5h5m8 0h5" stroke="#a99b76" stroke-width="1" stroke-linecap="round"/>'+
      '<text class="saw-engraving" x="50" y="63.5" text-anchor="middle" fill="#d5c39a" font-family="Georgia,serif" font-size="10">'+number+'</text></g></svg>';
  }
  function elementRect(value,width,height) {
    if(!value || !["left","top","width","height"].every(key=>finite(value[key])) || value.width<=0 || value.height<=0) return null;
    if(value.left<0 || value.top<0 || value.left+value.width>width+.5 || value.top+value.height>height+.5) return null;
    return {left:value.left,top:value.top,width:value.width,height:value.height};
  }
  function activity(input) {
    const display=$("browser-display"), selected=input?.selected, viewport=input?.viewport;
    if(!input?.visible || document.hidden || !selected || !display || !viewport || !input.geometry || !input.frameKey) return null;
    const width=display.clientWidth, height=display.clientHeight;
    if(!finite(width) || !finite(height) || width<80 || height<80 || !finite(viewport.scroll_y) || viewport.scroll_y<0) return null;
    const geometry=input.geometry, rect=geometry.rect;
    const source=String(selected.current_url || selected.source_id || "");
    const context=JSON.stringify([String(selected.id),source,String(input.documentKey || ""),String(input.tabKey || selected.current_tab_id || selected.tab_id || "")]);
    const changedContext=!last || last.context!==context;
    const scrolling=!changedContext && last.scroll!==viewport.scroll_y;
    const scrollDelta=changedContext?0:viewport.scroll_y-last.scroll;
    const noteId=typeof rect?.note_id==="string" && /^[A-Za-z0-9_-]{1,128}$/.test(rect.note_id)?rect.note_id:"";
    const focusId=String(geometry.focus_id || rect?.inspection_id || noteId || "");
    const kind=geometry.kind || rect?.kind || (noteId?"supporting_passage":focusId?"inspection_passage":"");
    const inspectionId=String(geometry.inspection_id || rect?.inspection_id || (["inspection_passage","inspected_section","preview_inspection"].includes(kind)?focusId:""));
    const allowed=input.preview?["supporting_passage","inspection_passage","inspected_section","preview_passage","preview_inspection"]:["supporting_passage","inspection_passage","inspected_section"];
    const supplied=Array.isArray(geometry.lines)?geometry.lines:rect?[rect]:[];
    // Invalid or excessive lists are rejected as a unit; never invent a path.
    const lines=supplied.length<=12?supplied.map(line=>elementRect(line,width,height)):[];
    const hasPassage=!!focusId && allowed.includes(kind) && lines.length>0 && lines.every(Boolean);
    const layout=hasPassage?lines.map(line=>[line.left,line.top,line.width,line.height].map(v=>Math.round(v*2)/2).join(",")).join(";"):"";
    const key=JSON.stringify([context,focusId,inspectionId,kind,viewport.scroll_y,width,height,layout]);
    const event=input.event, eventNote=event?.data?.note_id;
    const sourceMatches=!event?.data?.source_id || !selected.source_id || event.data.source_id===selected.source_id;
    const agentMatches=event?.agent_id==null || String(event.agent_id)===String(selected.id);
    const savedKind=kind==="supporting_passage" || input.preview && kind==="preview_passage";
    const saved=hasPassage && savedKind && !!noteId && event?.type==="note.saved" && eventNote===noteId && sourceMatches && agentMatches;
    const saveKey=saved?JSON.stringify([String(selected.id),noteId,String(event.id || event.seq || "saved")]):"";
    const eventId=event?String(event.id || event.seq || ""):"";
    const eventChanged=!!eventId && (changedContext || last.event!==eventId);
    return {input,width,height,context,source,scroll:viewport.scroll_y,key,layout,focusId,inspectionId,kind,noteId,lines:hasPassage?lines:[],hasPassage,saved,saveKey,event:eventId,
      label:hasPassage?(noteId?"Saved evidence selected":"Section selected for inspection"):scrolling?"Agent scrolling":changedContext?"Page opened":eventChanged?"Research action recorded":"Awaiting a selected passage",
      scrolling,scrollDelta,changedContext,pulse:hasPassage && !completed.has(key) && (!active || active.key!==key)};
  }
  function stop(clear=false,preserveInput=false) {
    if(raf!==null && typeof cancelAnimationFrame==="function") cancelAnimationFrame(raf);
    raf=null;active=null;
    if(!preserveInput) lastInput=null;
    const marker=$("selected-creature"),display=$("browser-display"),seal=$("evidence-seal"),packet=$("evidence-packet");
    marker?.classList.remove("is-working","is-saving","is-traversing");
    display?.classList.remove("is-scanning","is-saving-evidence");
    if(seal) seal.hidden=true;
    if(packet) packet.hidden=true;
    if(clear) {
      last=null;position=null;rotation=0;drawnKey=null;
      if(marker) marker.hidden=true;
      const trail=$("passage-trail");
      if(trail) {trail.hidden=true;trail.replaceChildren();}
      text("crawler-activity","Awaiting browser activity");
    }
  }
  function makeTrail(lines) {
    const trail=$("passage-trail");
    if(!trail) return [];
    const nodes=lines.map(line=>{
      const node=document.createElement("span");node.className="passage-trail-line";node.hidden=true;
      Object.assign(node.style,{left:line.left+"px",top:line.top+"px",height:line.height+"px",width:"0px"});
      return node;
    });
    trail.replaceChildren(...nodes);trail.hidden=false;
    return nodes;
  }
  function paint(session,fractions) {
    session.marks.forEach((node,index)=>{
      const fraction=clamp(fractions[index] || 0,0,1);
      node.hidden=fraction===0;node.style.width=session.lines[index].width*fraction+"px";
    });
  }
  function move(session,point,quiet=false) {
    const marker=$("selected-creature");
    if(!marker) return;
    const next={x:clamp(point.x,24,session.width-24),y:clamp(point.y,24,session.height-24),context:session.context};
    let tilt=0;
    if(!quiet && position && position.context===next.context) {
      const dx=next.x-position.x,dy=next.y-position.y,distance=Math.hypot(dx,dy);
      rotation+=distance/22*180/Math.PI;
      if(distance>.1) tilt=clamp(dx/distance*7,-7,7);
    }
    marker.hidden=false;marker.style.transition="none";marker.style.left=next.x+"px";marker.style.top=next.y+"px";
    const blade=marker.querySelector(".saw-blade"),body=marker.querySelector(".saw-body");
    if(blade) {blade.style.transformOrigin="50px 50px";blade.style.transform="rotate("+rotation+"deg)";}
    if(body) {body.style.transformOrigin="50px 50px";body.style.transform="rotate("+tilt+"deg)";}
    position=next;
  }
  function linePoint(line,fraction) {return {x:line.left+line.width*fraction,y:line.top+line.height+5};}
  function segments(lines) {
    let total=0;const result=[];
    const returns=lines.slice(0,-1).map((line,index)=>{
      const from=linePoint(line,1),to=linePoint(lines[index+1],0);
      return clamp(Math.hypot(to.x-from.x,to.y-from.y)/850*1000,350,700);
    });
    // A complete passage gets a readable minimum timeline. Additional lines
    // receive more time, rather than becoming a rapid sequence of jumps.
    const turns=returns.reduce((sum,duration)=>sum+duration,0);
    const weight=lines.reduce((sum,line)=>sum+Math.max(80,line.width),0);
    const minimum=400, budget=Math.max(3400,lines.length*minimum+turns)-turns;
    const remainder=budget-lines.length*minimum;
    lines.forEach((line,index)=>{
      const duration=minimum+remainder*Math.max(80,line.width)/weight;
      result.push({kind:"line",index,start:total,duration});total+=duration;
      if(index<lines.length-1) {const duration=returns[index];result.push({kind:"turn",index,start:total,duration});total+=duration;}
    });
    return {result,total};
  }
  function trace(session,elapsed) {
    const {result,total}=session.path, time=clamp(elapsed,0,total);
    const segment=result.find(item=>time<=item.start+item.duration) || result[result.length-1];
    const fraction=clamp((time-segment.start)/segment.duration,0,1);
    const amounts=session.lines.map((_,index)=>index<segment.index?1:0);
    let point;
    if(segment.kind==="line") {
      amounts[segment.index]=fraction;point=linePoint(session.lines[segment.index],fraction);
    } else {
      amounts[segment.index]=1;
      const from=linePoint(session.lines[segment.index],1),to=linePoint(session.lines[segment.index+1],0),p=ease(fraction);
      point={x:mix(from.x,to.x,p),y:mix(from.y,to.y,p)+Math.sin(p*Math.PI)*12};
    }
    if(time>=total) amounts.fill(1);
    paint(session,amounts);move(session,point);
  }
  function status(session,phase,value) {
    if(session.phase===phase) return;
    session.phase=phase;
    const marker=$("selected-creature");if(marker) marker.dataset.action=phase;
    label(value,session.input);
  }
  function destination(noteId) {
    const fixed=$("notebook-capture");
    const candidates=fixed?.dataset.noteId===noteId?[fixed]:Array.from(document.querySelectorAll('[data-note-id="'+noteId+'"]'));
    for(const node of candidates) {
      if(node.hidden || node.closest?.("[hidden]")) continue;
      const raw=node.getBoundingClientRect();
      if(!raw || !finite(raw.width) || !finite(raw.height) || raw.width<=0 || raw.height<=0) continue;
      let rect={left:raw.left,top:raw.top,right:raw.left+raw.width,bottom:raw.top+raw.height};
      let parent=node.parentElement,depth=0;
      while(parent && depth++<32) {
        const style=typeof getComputedStyle==="function"?getComputedStyle(parent):null;
        if(style && (style.display==="none" || style.visibility==="hidden")) {rect=null;break;}
        const clips=style && /auto|scroll|hidden|clip/.test(style.overflow+style.overflowX+style.overflowY);
        if(clips) {
          const bounds=parent.getBoundingClientRect();
          rect.left=Math.max(rect.left,bounds.left);rect.top=Math.max(rect.top,bounds.top);
          rect.right=Math.min(rect.right,bounds.right ?? bounds.left+bounds.width);rect.bottom=Math.min(rect.bottom,bounds.bottom ?? bounds.top+bounds.height);
        }
        parent=parent.parentElement;
      }
      if(rect && rect.right-rect.left>=8 && rect.bottom-rect.top>=8) return rect;
    }
    return null;
  }
  function showSeal(session) {
    const seal=$("evidence-seal");if(!seal) return;
    const line=session.lines[session.lines.length-1];
    seal.hidden=false;seal.textContent="SAVED";
    seal.style.left=clamp(line.left+line.width-58,5,session.width-68)+"px";
    seal.style.top=clamp(line.top+line.height+12,5,session.height-25)+"px";
  }
  function saveFrame(session,time) {
    const packet=$("evidence-packet"),container=$("research-layout"),display=$("browser-display");
    showSeal(session);status(session,"save","Evidence saved · notebook delivery");
    const progress=time>=900?1:clamp(time/900,0,1);
    const target=destination(session.noteId);
    if(packet && container && display && target && progress<1) {
      const outer=container.getBoundingClientRect(),browser=display.getBoundingClientRect(),point=position;
      const from={x:browser.left-outer.left+point.x-30,y:browser.top-outer.top+point.y-18};
      const to={x:target.left-outer.left+8,y:target.top-outer.top+8},p=ease(progress);
      packet.hidden=false;packet.textContent="EVIDENCE";
      packet.style.left="0px";packet.style.top="0px";
      packet.style.transform="translate("+mix(from.x,to.x,p)+"px,"+(mix(from.y,to.y,p)-Math.sin(p*Math.PI)*36)+"px)";
    } else if(packet) packet.hidden=true;
    if(progress>=1) finish(session,"Evidence saved");
  }
  function finish(session,value) {
    remember(completed,session.key);session.done=true;
    $("selected-creature")?.classList.remove("is-working","is-traversing","is-saving");
    const body=$("selected-creature")?.querySelector(".saw-body");if(body) body.style.transform="rotate(0deg)";
    status(session,"idle",value);
    raf=null;
  }
  function schedule(session) {
    raf=requestAnimationFrame(timestamp=>{if(active===session) tick(timestamp);});
  }
  function tick(timestamp) {
    raf=null;
    const session=active;
    if(!session) return;
    if(!session.input.running || !session.input.visible || document.hidden) {stop(true);return;}
    const elapsed=Math.max(0,timestamp-session.started);
    if(session.saveStarted!==null) {
      saveFrame(session,timestamp-session.saveStarted);
    } else if(elapsed<APPROACH_MS) {
      status(session,"approach","Approaching selected passage");
      const to=linePoint(session.lines[0],0),p=ease(elapsed/APPROACH_MS);
      move(session,{x:mix(session.from.x,to.x,p),y:mix(session.from.y,to.y,p)});
    } else if(elapsed<APPROACH_MS+session.path.total+ENDPOINT_MS) {
      status(session,"inspect",session.noteId?"Tracing saved evidence":"Inspecting selected section");
      trace(session,elapsed-APPROACH_MS);
    } else {
      trace(session,session.path.total);
      if(session.pendingSave && !delivered.has(session.pendingSave)) {
        remember(delivered,session.pendingSave);session.saveStarted=timestamp;
        $("selected-creature")?.classList.add("is-saving");saveFrame(session,0);
      } else finish(session,session.noteId?"Saved evidence in view":"Selected section inspected");
    }
    if(active===session && !session.done) schedule(session);
  }
  function staticPassage(next,paused=false) {
    const session={...next,marks:makeTrail(next.lines),input:next.input};
    paint(session,next.lines.map(()=>1));
    move(session,linePoint(next.lines[next.lines.length-1],1),true);drawnKey=next.key;
    $("selected-creature").dataset.action="idle";
    if(!paused) remember(completed,next.key);
    if(next.saved && !paused) {remember(delivered,next.saveKey);showSeal(session);}
    label(paused?"Mission paused":next.saved?"Evidence saved":next.noteId?"Saved evidence in view":"Selected section in view",next.input);
  }
  function clearTrail() {
    const trail=$("passage-trail");
    if(trail) {trail.hidden=true;trail.replaceChildren();}
    drawnKey=null;
  }
  function carryScroll(next) {
    stop(false,true);clearTrail();
    const marker=$("selected-creature");
    if(position?.context===next.context) {
      move(next,{x:position.x,y:position.y-next.scrollDelta},reducedMotion(next.input));
      if(marker) marker.dataset.action="scroll";
    } else if(marker) marker.hidden=true;
    label("Agent scrolling",next.input);
  }
  function update(input) {
    lastInput=input;
    const next=activity(input);
    if(!next) {stop(true);return;}
    if(next.changedContext) {stop(true,true);position=null;}
    last={context:next.context,scroll:next.scroll,event:next.event};
    const staticMotion=reducedMotion(input), resumedFull=lastReduced===true && !staticMotion;
    lastReduced=staticMotion;
    // Explicit opt-in can replay the current traversal, but never its receipt.
    if(resumedFull && next.hasPassage) completed.delete(next.key);
    if(!input.running) {
      stop(false,true);
      if(!next.hasPassage || drawnKey!==next.key) clearTrail();
      const marker=$("selected-creature");
      if(marker) {marker.hidden=position?.context!==next.context;marker.dataset.action="idle";}
      label("Mission paused",input);
      return;
    }
    if(input.scrolling===true) {carryScroll(next);return;}
    if(!next.hasPassage) {stop(true,true);last={context:next.context,scroll:next.scroll,event:next.event};label(next.label,input);return;}
    if(staticMotion || typeof requestAnimationFrame!=="function") {
      stop(false,true);staticPassage(next);return;
    }
    const sameInspection=!active?.inspectionId || !next.inspectionId || active.inspectionId===next.inspectionId;
    const savedContinuation=next.saved && active && sameInspection && active.context===next.context && active.layout===next.layout && active.scroll===next.scroll && active.width===next.width && active.height===next.height;
    if(active && (active.key===next.key || savedContinuation)) {
      active.input=input;
      if(savedContinuation) {active.key=next.key;drawnKey=next.key;active.noteId=next.noteId;active.kind=next.kind;active.inspectionId=next.inspectionId;}
      if(next.saved && !delivered.has(next.saveKey)) {
        active.pendingSave=next.saveKey;
        if(active.done) {
          active.done=false;active.phase="";active.saveStarted=now();remember(delivered,next.saveKey);
          $("selected-creature")?.classList.add("is-saving");schedule(active);
        }
      }
      return;
    }
    stop(false,true);
    if(completed.has(next.key)) {
      if(next.saved && !delivered.has(next.saveKey)) {
        active={...next,marks:makeTrail(next.lines),input,phase:"",done:false,saveStarted:now()};
        drawnKey=next.key;
        paint(active,next.lines.map(()=>1));move(active,linePoint(next.lines[next.lines.length-1],1));
        remember(delivered,next.saveKey);$("selected-creature")?.classList.add("is-saving");schedule(active);
      } else staticPassage(next);
      return;
    }
    const from=position?.context===next.context?{x:position.x,y:position.y}:{x:next.width-30,y:next.height-32};
    active={...next,marks:makeTrail(next.lines),path:segments(next.lines),started:now(),from,phase:"",done:false,saveStarted:null,pendingSave:next.saved && !delivered.has(next.saveKey)?next.saveKey:""};
    drawnKey=next.key;
    const marker=$("selected-creature");marker.hidden=false;marker.classList.add("is-working","is-traversing");
    status(active,"approach","Approaching selected passage");move(active,from);
    schedule(active);
  }
  reduced.addEventListener?.("change",()=>{if(lastInput) update(lastInput);});
  window.ObservatoryMotion={saw,update,stop,activity,isBusy};
})();
