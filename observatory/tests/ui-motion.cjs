/* Run the actual motion controller with deterministic DOM/RAF, without a browser. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../site/observatory-motion.js'),'utf8');
let assertions=0;
const check=(condition,message)=>{assert.ok(condition,message);assertions++;};
const equal=(actual,expected,message)=>{assert.equal(actual,expected,message);assertions++;};

function harness() {
  const nodes=new Map(),frames=new Map();let clock=0,sequence=0;
  function element(id='') {
    const classes=new Set();
    const el={id,style:{},dataset:{},hidden:false,children:[],parentElement:null,textContent:'',clientWidth:600,clientHeight:425,
      classList:{add:(...items)=>items.forEach(x=>classes.add(x)),remove:(...items)=>items.forEach(x=>classes.delete(x)),toggle:(item,on)=>on?classes.add(item):classes.delete(item),contains:item=>classes.has(item)},
      rect:{left:100,top:80,width:600,height:425},
      replaceChildren(...children){this.children=children;children.forEach(child=>child.parentElement=this);},
      getBoundingClientRect(){return {...this.rect,right:this.rect.left+this.rect.width,bottom:this.rect.top+this.rect.height};},
      closest(selector){let node=this;while(node){if(selector==='[hidden]'&&node.hidden)return node;node=node.parentElement;}return null;},
      querySelector(selector){return this.subnodes?.[selector] || null;}};
    if(id)nodes.set(id,el);return el;
  }
  for(const id of ['browser-display','selected-creature','crawler-activity','passage-trail','evidence-seal','evidence-packet','research-layout','notebook-capture'])element(id);
  nodes.get('selected-creature').subnodes={'.saw-blade':element(),'.saw-body':element()};
  nodes.get('research-layout').rect={left:20,top:30,width:950,height:650};
  nodes.get('notebook-capture').rect={left:745,top:185,width:220,height:110};
  nodes.get('notebook-capture').hidden=true;
  nodes.get('evidence-packet').hidden=true;nodes.get('evidence-seal').hidden=true;
  const media={matches:false,listeners:[],addEventListener(type,listener){if(type==='change')this.listeners.push(listener);}};
  const document={hidden:false,getElementById:id=>nodes.get(id)||null,createElement:()=>element(),querySelectorAll:selector=>{
    const id=selector.match(/^\[data-note-id="([A-Za-z0-9_-]+)"\]$/)?.[1];
    return id?[...nodes.values()].filter(node=>node.dataset.noteId===id):[];
  }};
  const context={window:{},document,Math,String,Number,Set,Array,JSON,Date,performance:{now:()=>clock},matchMedia:()=>media,
    requestAnimationFrame:callback=>{const id=++sequence;frames.set(id,callback);return id;},cancelAnimationFrame:id=>frames.delete(id),
    getComputedStyle:node=>({display:'block',visibility:'visible',overflow:'visible',overflowX:'visible',overflowY:'visible',...node.computed})};
  vm.createContext(context);vm.runInContext(source,context);
  return {motion:context.window.ObservatoryMotion,nodes,document,frames,media,element,
    node:id=>nodes.get(id),clock:()=>clock,
    advance(ms){clock=ms;const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(ms));},
    setReduced(value){media.matches=value;media.listeners.forEach(callback=>callback({matches:value}));},
    capture(noteId){const node=nodes.get('notebook-capture');node.hidden=false;node.dataset.noteId=noteId;return node;}};
}
function input(overrides={}) {
  return {geometry:{rect:{left:40,top:100,width:300,height:45,inspection_id:'inspect-1',kind:'inspection_passage'},lines:[{left:40,top:100,width:300,height:18},{left:40,top:128,width:300,height:18}],focus_id:'inspect-1',kind:'inspection_passage'},
    viewport:{scroll_y:0,document_height:1600,viewport_height:800},selected:{id:'scholar',current_url:'https://example.org/paper',source_id:'source-1'},
    event:{id:1,type:'agent.section_inspected',agent_id:'scholar',data:{inspection_id:'inspect-1'}},frameKey:'frame-1',documentKey:'document-1',preview:false,running:true,visible:true,...overrides};
}
function saved(base=input(),overrides={}) {
  return {...base,geometry:{...base.geometry,rect:{...base.geometry.rect,note_id:'note-1',kind:'supporting_passage'},kind:'supporting_passage',focus_id:'note-1'},
    event:{id:2,type:'note.saved',agent_id:'scholar',data:{note_id:'note-1',source_id:'source-1'}},...overrides};
}
const width=node=>parseFloat(node.style.width);

// Explicit section paths traverse real lines and progressively reveal marks.
{
  const h=harness(),base=input();h.motion.update(base);
  equal(h.frames.size,1,'A selected section starts one finite timeline');
  equal(h.node('selected-creature').dataset.action,'approach');
  equal(h.node('passage-trail').children.length,2);
  check(h.node('passage-trail').children.every(mark=>mark.hidden),'Approach does not prematurely highlight unread lines');
  h.advance(500);equal(h.node('selected-creature').dataset.action,'inspect');
  equal(h.node('selected-creature').style.left,'40px');
  h.advance(850);
  const marks=h.node('passage-trail').children;
  check(width(marks[0])>145&&width(marks[0])<160,'First line gradually reveals behind the saw');
  equal(marks[1].hidden,true,'The next line waits for the actual traversal');
  check(h.node('selected-creature').querySelector('.saw-blade').style.transform.includes('rotate('));
  check(h.node('selected-creature').querySelector('.saw-body').style.transform!=='rotate(0deg)','Upright hub has a bounded mechanical tilt');
  const firstWidth=width(marks[0]);
  h.motion.update({...base,frameKey:'new-image-2'});
  equal(h.frames.size,1,'New screenshot of identical inspection must not add a competing RAF');
  equal(h.node('passage-trail').children[0],marks[0],'Identical layouts retain their trail nodes');
  h.advance(1100);check(width(marks[0])>firstWidth+80,'Screenshot refresh preserves progress instead of restarting approach');
  h.advance(1310);
  equal(width(marks[0]),300,'Line return keeps the prior line fully marked');
  const turnX=parseFloat(h.node('selected-creature').style.left);
  check(turnX>40&&turnX<340,'Return arcs between the old line end and next line start');
  check(parseFloat(h.node('selected-creature').style.top)>123,'Turn has an actual vertical curve');
  h.advance(1530);check(width(marks[1])>0,'Second line begins after the curved return');
  h.advance(2300);equal(h.frames.size,0,'Inspection stops after its finite path');
  equal(h.node('selected-creature').dataset.action,'idle');
  check(marks.every(mark=>width(mark)===300));
  equal(h.node('evidence-packet').hidden,true,'Inspection alone never claims a notebook save');
  equal(h.node('evidence-seal').hidden,true);
  const left=h.node('selected-creature').style.left;
  h.motion.update({...base,frameKey:'new-image-3',event:{...base.event,id:3}});
  equal(h.frames.size,0,'A generic event cannot restart a completed inspection');
  equal(h.node('selected-creature').style.left,left);
}

// A genuine matching save promotes the already inspected passage; packet targets the note.
{
  const h=harness(),base=input();h.motion.update(base);h.advance(2400);
  const marks=h.node('passage-trail').children;h.capture('note-1');
  h.motion.update(saved(base));
  equal(h.node('passage-trail').children[0],marks[0],'Saving the same passage does not retrace it');
  equal(h.frames.size,1);h.advance(2401);
  equal(h.node('evidence-seal').hidden,false);equal(h.node('evidence-packet').hidden,false);
  equal(h.node('evidence-packet').textContent,'EVIDENCE','Motion does not expose private source text');
  equal(h.node('selected-creature').dataset.action,'save');
  const start=h.node('evidence-packet').style.transform;h.advance(2850);
  check(h.node('evidence-packet').style.transform!==start,'Packet moves toward the actual note element');
  check(h.node('evidence-packet').style.transform.includes('translate('));
  h.advance(3300);equal(h.node('evidence-packet').hidden,true);equal(h.frames.size,0);
  equal(h.node('crawler-activity').textContent,'Evidence saved');
  h.motion.update({...saved(base),frameKey:'save-refresh'});equal(h.frames.size,0,'Same saved event delivers once');
  h.motion.update({...saved(base),frameKey:'revisit',documentKey:'reloaded-document'});h.advance(5600);
  equal(h.node('evidence-packet').hidden,true,'Revisiting another document context cannot replay the same note.saved receipt');
  equal(h.frames.size,0);
}

// Matching save while the saw is still tracing waits for the remaining actual lines.
{
  const h=harness(),base=input();h.motion.update(base);h.advance(850);h.capture('note-1');
  const mark=h.node('passage-trail').children[0],progress=width(mark);
  h.motion.update(saved(base));
  equal(h.node('passage-trail').children[0],mark);equal(width(mark),progress);
  equal(h.node('evidence-packet').hidden,true);
  h.advance(1200);equal(h.node('evidence-packet').hidden,true);
  h.advance(2400);equal(h.node('evidence-packet').hidden,false);
  h.advance(3300);equal(h.frames.size,0);
}

// A different explicit inspection must reacquire even when its line layout is identical.
{
  const h=harness(),base=input();h.motion.update(base);h.advance(850);
  const oldMark=h.node('passage-trail').children[0];
  const other=saved(base);other.geometry.rect.inspection_id='inspect-2';
  h.motion.update(other);
  check(h.node('passage-trail').children[0]!==oldMark,'Different inspection IDs cannot silently promote an unrelated path');
  equal(h.node('passage-trail').children[0].hidden,true);
}

// A new genuine save after a completed path/stale reset delivers without retracing.
{
  const h=harness(),base=saved(input(),{event:{id:2,type:'agent.decision'}});h.motion.update(base);h.advance(2400);
  h.motion.stop(true);h.capture('note-1');h.motion.update(saved());
  check(h.node('passage-trail').children.every(mark=>width(mark)===300),'Already completed evidence need not be reread for a fresh save');
  h.advance(2401);equal(h.node('evidence-packet').hidden,false);
  h.advance(3300);equal(h.frames.size,0);
}

// Saved geometry without a matching save event does not manufacture delivery.
for(const mismatch of [
  {event:{id:2,type:'agent.decision',data:{note_id:'note-1'}}},
  {event:{id:2,type:'note.saved',data:{note_id:'other-note'}}},
  {event:{id:2,type:'note.saved',agent_id:'skeptic',data:{note_id:'note-1'}}},
  {event:{id:2,type:'note.saved',data:{note_id:'note-1',source_id:'other-source'}}}
]) {
  const h=harness();h.capture('note-1');h.motion.update(saved(input(),mismatch));h.advance(3000);
  equal(h.frames.size,0,'Unassociated events cannot deliver a packet');
  equal(h.node('evidence-packet').hidden,true);equal(h.node('evidence-seal').hidden,true);
}

// Missing, hidden or clipped note destinations safely suppress the flying token.
for(const hidden of ['missing','hidden','clipped']) {
  const h=harness();
  if(hidden==='missing')h.nodes.delete('notebook-capture');
  if(hidden==='clipped') {
    const node=h.capture('note-1'),parent=h.element();parent.rect={left:745,top:50,width:220,height:30};parent.computed={overflow:'hidden'};node.parentElement=parent;
  }
  h.motion.update(saved());h.advance(2400);
  equal(h.node('evidence-packet').hidden,true,'Packet requires a visible current notebook recipient');
  equal(h.node('evidence-seal').hidden,false,'Verified save remains indicated at its passage');
  h.advance(3300);equal(h.frames.size,0);
}

// No selected DOM geometry means no roaming character, fake scan bar or fabricated reading.
{
  const h=harness(),empty=input({geometry:{rect:null,lines:[]}});h.motion.update(empty);
  equal(h.frames.size,0);equal(h.node('selected-creature').hidden,true);
  equal(h.node('passage-trail').hidden,true);equal(h.node('crawler-activity').textContent,'Page opened');
  h.motion.update({...empty,viewport:{...empty.viewport,scroll_y:400}});
  equal(h.node('crawler-activity').textContent,'Agent scrolling');
  equal(h.frames.size,0);equal(h.node('browser-display').classList.contains('is-scanning'),false);
}

// Strict geometry and identity lifecycle guard against stale paths and invalid frame input.
for(const overrides of [
  {frameKey:''},{visible:false},{geometry:null},
  {geometry:{...input().geometry,kind:'preview_inspection'}},
  {geometry:{...input().geometry,lines:[{left:NaN,top:100,width:100,height:18}]}},
  {geometry:{...input().geometry,lines:[{left:590,top:100,width:100,height:18}]}},
  {geometry:{...input().geometry,lines:Array.from({length:13},()=>({left:40,top:100,width:100,height:18}))}}
]) {
  const h=harness();h.motion.update(input(overrides));
  equal(h.frames.size,0);equal(h.node('selected-creature').hidden,true);
}
for(const change of [
  {documentKey:'new-document-same-url'},
  {tabKey:'new-tab-same-url'},
  {selected:{...input().selected,id:'skeptic'}},
  {selected:{...input().selected,current_url:'https://example.org/other'}},
  {viewport:{...input().viewport,scroll_y:400},geometry:{...input().geometry,lines:[{left:40,top:65,width:300,height:18}]}}
]) {
  const h=harness(),base=input();h.motion.update(base);h.advance(850);
  const oldCallback=[...h.frames.values()][0],oldMark=h.node('passage-trail').children[0];
  h.motion.update({...base,...change,frameKey:'new-frame'});
  equal(h.frames.size,1,'Changed page geometry owns exactly one replacement trajectory');
  check(h.node('passage-trail').children[0]!==oldMark,'Obsolete highlight geometry is discarded');
  equal(h.node('passage-trail').children[0].hidden,true);
  oldCallback(1500);equal(h.frames.size,1,'A cancelled old RAF cannot operate on the newer session');
}
{
  const h=harness(),base=input();h.motion.update(base);h.advance(850);
  h.node('browser-display').clientWidth=500;h.motion.update({...base,frameKey:'resized'});
  equal(h.frames.size,1);equal(h.node('passage-trail').children[0].hidden,true,'Resize reacquires line geometry');
  h.motion.stop(true);equal(h.frames.size,0);equal(h.node('selected-creature').hidden,true);
  equal(h.node('passage-trail').children.length,0,'Stale stop clears every old line');
  equal(h.node('evidence-packet').hidden,true);
  h.setReduced(true);equal(h.node('selected-creature').hidden,true,'A preference change cannot resurrect cleared stale geometry');
  equal(h.node('passage-trail').children.length,0);
}

// Paused, hidden, stale and reduced-motion spectators never keep animating.
{
  const h=harness(),base=input();h.motion.update(base);h.advance(850);h.motion.update({...base,running:false});
  equal(h.frames.size,0);equal(h.node('crawler-activity').textContent,'Mission paused');
  equal(h.node('selected-creature').classList.contains('is-working'),false);
  equal(h.node('evidence-packet').hidden,true);
  h.motion.update({...base,visible:false});equal(h.node('selected-creature').hidden,true);
  equal(h.node('passage-trail').children.length,0);
}
{
  const h=harness();h.motion.update(input());h.document.hidden=true;h.advance(500);
  equal(h.frames.size,0);equal(h.node('selected-creature').hidden,true,'Visibility loss cancels without waiting for next feed');
}
{
  const h=harness(),base=input({preview:true,geometry:{...input().geometry,kind:'preview_inspection'}});h.media.matches=true;h.motion.update(base);
  equal(h.frames.size,0);check(h.node('passage-trail').children.every(mark=>width(mark)===300));
  equal(h.node('crawler-activity').textContent,'Example · Selected section in view');
  equal(h.node('evidence-packet').hidden,true);
  h.capture('note-1');h.motion.update(saved(base,{preview:true,geometry:{...saved(base).geometry,kind:'preview_passage'}}));
  equal(h.frames.size,0);equal(h.node('evidence-seal').hidden,false);
  equal(h.node('crawler-activity').textContent,'Example · Evidence saved');
  h.setReduced(false);equal(h.frames.size,0,'Static accessible save consumes the receipt once without replaying a flight');
}
{
  const h=harness();h.motion.update(input());h.advance(850);h.setReduced(true);
  equal(h.frames.size,0);check(h.node('passage-trail').children.every(mark=>width(mark)===300));
  h.setReduced(false);equal(h.frames.size,0,'Preference change does not replay the completed static illustration');
}
{
  const h=harness();check(h.motion.saw(0).includes('saw-blade'));check(h.motion.saw(0).includes('saw-body'));
  check(h.motion.saw(0).includes('saw-feeler'));check(h.motion.saw(5).includes('>6</text>'));
  check(!h.motion.saw('<script>').includes('<script>'),'Character numbering cannot inject HTML');
}
console.log(JSON.stringify({motionController:'passed',assertions,actualLineTraversal:true,sameInspectionRefreshContinues:true,verifiedNoteDelivery:true,identityAndRaceCancellation:true,reducedMotion:true,noNetwork:true}));
