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
  let active=null, raf=null, last=null, lastInput=null, position=null, rotation=0;

  function remember(collection,key) {
    collection.add(key);
    if(collection.size>256) collection.delete(collection.values().next().value);
  }
  function text(id,value) { const node=$(id); if(node) node.textContent=value; }
  function label(value,input) { text("crawler-activity",(input?.preview?"Example · ":"")+value); }
  function saw(index=0) {
    const teeth=[];
    for(let i=0;i<64;i++) {
      const angle=i*Math.PI/32, radius=[43,35,38,38][i%4];
      teeth.push((50+Math.cos(angle)*radius).toFixed(2)+","+(50+Math.sin(angle)*radius).toFixed(2));
    }
    const number=Number.isFinite(Number(index))?clamp(Math.floor(Number(index))+1,1,999):1;
    return '<svg class="saw-svg" viewBox="0 0 100 100" aria-hidden="true"><g class="saw-blade"><polygon points="'+teeth.join(" ")+'"/><circle cx="50" cy="50" r="28"/><path d="M50 25v15m25 10H60M50 75V60M25 50h15"/></g><g class="saw-body"><path class="saw-feeler" d="M38 53Q24 59 25 71M62 53Q76 59 75 71"/><circle class="saw-hub" cx="50" cy="50" r="14"/><path class="saw-eye" d="M42 49h16"/><circle class="saw-sensor" cx="54" cy="49" r="3"/></g><text x="50" y="96" text-anchor="middle">'+number+'</text></svg>';
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
      scrolling,changedContext,pulse:hasPassage && !completed.has(key) && (!active || active.key!==key)};
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
      last=null;position=null;rotation=0;
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
  function move(session,point) {
    const marker=$("selected-creature");
    if(!marker) return;
    const next={x:clamp(point.x,24,session.width-24),y:clamp(point.y,24,session.height-24),context:session.context};
    let tilt=0;
    if(position && position.context===next.context) {
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
    lines.forEach((line,index)=>{
      const duration=clamp(line.width/430*1000,260,1200);
      result.push({kind:"line",index,start:total,duration});total+=duration;
      if(index<lines.length-1) {result.push({kind:"turn",index,start:total,duration:220});total+=220;}
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
    } else if(elapsed<500) {
      status(session,"approach","Approaching selected passage");
      const to=linePoint(session.lines[0],0),p=ease(elapsed/500);
      move(session,{x:mix(session.from.x,to.x,p),y:mix(session.from.y,to.y,p)});
    } else if(elapsed<500+session.path.total) {
      status(session,"inspect",session.noteId?"Tracing saved evidence":"Inspecting selected section");
      trace(session,elapsed-500);
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
    move(session,linePoint(next.lines[next.lines.length-1],1));
    $("selected-creature").dataset.action="idle";
    if(!paused) remember(completed,next.key);
    if(next.saved && !paused) {remember(delivered,next.saveKey);showSeal(session);}
    label(paused?"Mission paused":next.saved?"Evidence saved":next.noteId?"Saved evidence in view":"Selected section in view",next.input);
  }
  function update(input) {
    lastInput=input;
    const next=activity(input);
    if(!next) {stop(true);return;}
    if(next.changedContext) {stop(true,true);position=null;}
    last={context:next.context,scroll:next.scroll,event:next.event};
    if(!input.running) {
      stop(false,true);
      if(next.hasPassage) staticPassage(next,true);
      else {$("selected-creature").hidden=true;label("Mission paused",input);}
      return;
    }
    if(!next.hasPassage) {stop(true,true);last={context:next.context,scroll:next.scroll,event:next.event};label(next.label,input);return;}
    if(reduced.matches || typeof requestAnimationFrame!=="function") {
      stop(false,true);staticPassage(next);return;
    }
    const sameInspection=!active?.inspectionId || !next.inspectionId || active.inspectionId===next.inspectionId;
    const savedContinuation=next.saved && active && sameInspection && active.context===next.context && active.layout===next.layout && active.scroll===next.scroll && active.width===next.width && active.height===next.height;
    if(active && (active.key===next.key || savedContinuation)) {
      active.input=input;
      if(savedContinuation) {active.key=next.key;active.noteId=next.noteId;active.kind=next.kind;active.inspectionId=next.inspectionId;}
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
        paint(active,next.lines.map(()=>1));move(active,linePoint(next.lines[next.lines.length-1],1));
        remember(delivered,next.saveKey);$("selected-creature")?.classList.add("is-saving");schedule(active);
      } else staticPassage(next);
      return;
    }
    const from=position?.context===next.context?{x:position.x,y:position.y}:{x:next.width-30,y:next.height-32};
    active={...next,marks:makeTrail(next.lines),path:segments(next.lines),started:now(),from,phase:"",done:false,saveStarted:null,pendingSave:next.saved && !delivered.has(next.saveKey)?next.saveKey:""};
    const marker=$("selected-creature");marker.hidden=false;marker.classList.add("is-working","is-traversing");
    status(active,"approach","Approaching selected passage");move(active,from);
    schedule(active);
  }
  reduced.addEventListener?.("change",()=>{if(lastInput) update(lastInput);});
  window.ObservatoryMotion={saw,update,stop,activity};
})();
