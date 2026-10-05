/* Activity illustration only. Browser pixels and passage bounds remain the evidence. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  let last = null, timer = null;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function saw(index=0) {
    const teeth=[];
    for(let i=0;i<64;i++) {
      const angle=i*Math.PI/32, radius=[43,35,38,38][i%4];
      teeth.push((50+Math.cos(angle)*radius).toFixed(2)+","+(50+Math.sin(angle)*radius).toFixed(2));
    }
    return '<svg class="saw-svg" viewBox="0 0 100 100" aria-hidden="true"><g class="saw-blade"><polygon points="'+teeth.join(" ")+'"/><circle cx="50" cy="50" r="28"/><path d="M50 25v15m25 10H60M50 75V60M25 50h15"/></g><circle class="saw-hub" cx="50" cy="50" r="10"/><circle cx="50" cy="50" r="3"/><path class="saw-mark" d="M47 44h6v12h-6z"/><text x="50" y="94" text-anchor="middle">'+String(index+1)+'</text></svg>';
  }
  function activity({geometry, viewport, selected, event, preview, running, visible}) {
    if(!visible || !selected || !geometry || !viewport) return null;
    const width=$('browser-display').clientWidth, height=$('browser-display').clientHeight;
    if(width<80 || height<80) return null;
    const source=selected.current_url || selected.source_id || "";
    const changedAgent=!last || last.id!==String(selected.id) || last.source!==source;
    const scrollChanged=!changedAgent && last.scroll!==viewport.scroll_y;
    const saved=!!geometry.rect && (changedAgent || last.note!==geometry.rect.note_id);
    const eventChanged=!!event && (changedAgent || last.event!==String(event.id || event.seq || ""));
    const phase=preview?Number(selected.preview_scroll_phase)||0:null;
    // A scan is an illustration of a scroll/action, never an inferred attention map.
    const scrolling=scrollChanged || preview && eventChanged && [1,3].includes(phase);
    const label=saved?"Evidence saved":scrolling?"Agent scrolling":changedAgent?"Page opened":eventChanged?"Research action recorded":"Viewport unchanged";
    const progress=viewport.scroll_y/Math.max(1,viewport.document_height-viewport.viewport_height);
    const x=geometry.rect?geometry.rect.left+geometry.rect.width+12:width-30;
    const y=geometry.rect?geometry.rect.top+Math.min(geometry.rect.height/2,35):46+clamp(progress,0,1)*(height-92);
    return {x:clamp(x,28,width-28),y:clamp(y,28,height-35),label,
      pulse:!!running && (changedAgent || saved || scrolling || eventChanged),saved,scrolling,
      state:{id:String(selected.id),source,scroll:viewport.scroll_y,note:geometry.rect?.note_id || "",event:String(event?.id || event?.seq || "")}};
  }
  function stop(clear=false) {
    clearTimeout(timer);timer=null;
    const marker=$('selected-creature'),display=$('browser-display');
    marker.classList.remove('is-working','is-saving');display.classList.remove('is-scanning','is-saving-evidence');
    if(clear){last=null;marker.hidden=true;text('crawler-activity','Awaiting browser activity');}
  }
  function text(id,value){$(id).textContent=value;}
  function update(input) {
    const next=activity(input),marker=$('selected-creature'),display=$('browser-display');
    if(!next){stop(true);return;}
    marker.hidden=false;
    marker.style.left=next.x+'px';marker.style.top=next.y+'px';
    marker.dataset.action=next.saved?'save':next.scrolling?'scroll':'observe';
    text('crawler-activity',(input.preview?'Example · ':'')+next.label);
    if(!input.running){stop();text('crawler-activity',(input.preview?'Example · ':'')+'Mission paused');}
    else if(next.pulse){
      stop();
      marker.classList.add('is-working');marker.classList.toggle('is-saving',next.saved);
      display.classList.toggle('is-scanning',next.scrolling);
      display.classList.toggle('is-saving-evidence',next.saved);
      const reduced=typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      timer=setTimeout(()=>stop(),reduced?100:1600);
    }
    last=next.state;
  }
  window.ObservatoryMotion={saw,update,stop,activity};
})();
