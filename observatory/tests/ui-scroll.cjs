/* Exercise actual viewer helpers without opening a browser or contacting providers. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'site/observatory.js'),'utf8');
function extract(name){
  const sync=source.indexOf('  function '+name+'('),start=sync>=0?sync:source.indexOf('  async function '+name+'(');assert.ok(start>=0,name);
  const next=source.slice(start+1).search(/\n  (?:async )?function \w+\(/);assert.ok(next>=0,name+' boundary');
  return source.slice(start,start+1+next);
}
const nodes=new Map(),labels={};
function node(id){if(!nodes.has(id))nodes.set(id,{hidden:false,style:{},clientWidth:600,clientHeight:425});return nodes.get(id);}
const context={Number,Math,JSON,mode:'connected',currentView:'research',frameTelemetry:null,highlightedNoteId:'',
  $:node,text:(id,value)=>labels[id]=value,agent:()=>({preview_scroll_phase:2,preview_focus_note_id:'preview-note-7'})};
vm.createContext(context);
vm.runInContext(['viewportGeometry','frameMetadata','resetFrameTelemetry','renderFrameTelemetry','lockObserverViewport','renderPreviewViewport','refreshFrame'].map(extract).join('\n')+
  '\nthis.helpers={viewportGeometry,frameMetadata,resetFrameTelemetry,renderFrameTelemetry,lockObserverViewport,renderPreviewViewport,refreshFrame};',context);
const h=context.helpers,viewport={viewport_width:1000,viewport_height:800,scroll_x:0,scroll_y:1200,document_width:1000,document_height:4000};
const focus={x:100,y:200,width:200,height:40,kind:'supporting_passage',note_id:'note-7'};
const geometry=h.viewportGeometry(viewport,focus,600,425);
assert.equal(geometry.start,.3);assert.equal(geometry.extent,.2);assert.equal(geometry.end,.5);
assert.equal(geometry.rect.left,87.5);assert.equal(geometry.rect.top,106.25);
assert.equal(geometry.rect.width,106.25);assert.equal(geometry.rect.height,21.25);
// Correct letterboxing for a portrait display; overlays follow the image, not the outer box.
const portrait=h.viewportGeometry(viewport,focus,300,500);
assert.equal(portrait.rect.left,30);assert.equal(portrait.rect.top,190);
for(const value of [NaN,Infinity,-1,true,'4000'])assert.equal(h.viewportGeometry({...viewport,document_height:value},focus,600,425),null);
assert.equal(h.viewportGeometry({...viewport,scroll_y:4000},focus,600,425),null);
assert.equal(h.viewportGeometry({...viewport,document_width:999},focus,600,425),null);
assert.equal(h.viewportGeometry(viewport,focus,0,425),null);
for(const invalid of [{...focus,x:-1},{...focus,width:Infinity},{...focus,y:799,height:2},{...focus,note_id:'<script>'},{...focus,kind:'guessed_reading'}]){
  assert.equal(h.viewportGeometry(viewport,invalid,600,425).rect,null);
}
function headers(overrides={}){const data={'X-Observatory-Agent':'scholar','X-Observatory-Frame-SHA256':'a'.repeat(64),'X-Observatory-Viewport':JSON.stringify(viewport),'X-Observatory-Focus':JSON.stringify(focus),...overrides};return {get:key=>data[key]??null};}
assert.equal(h.frameMetadata(headers(),'scholar').focus.note_id,'note-7');
assert.equal(h.frameMetadata(headers(),'skeptic'),null);
assert.equal(h.frameMetadata(headers({'X-Observatory-Frame-SHA256':null}),'scholar'),null);
assert.equal(h.frameMetadata(headers({'X-Observatory-Viewport':'broken'}),'scholar'),null);
assert.equal(h.frameMetadata(headers({'X-Observatory-Viewport':'x'.repeat(2049)}),'scholar'),null);
assert.equal(h.frameMetadata(headers({'X-Observatory-Focus':JSON.stringify({...focus,kind:'preview_passage'})}),'scholar').focus,null);
context.frameTelemetry={viewport,focus};h.renderFrameTelemetry();
assert.equal(node('passage-focus').hidden,false);assert.equal(context.highlightedNoteId,'note-7');
assert.equal(node('passage-focus').style.left,'87.5px');assert.equal(labels['viewport-position'],'Agent viewport · 30–50% of page');
// A missing/mismatched frame never keeps a passage marker from another capture or agent.
h.resetFrameTelemetry();h.renderFrameTelemetry();
assert.equal(node('passage-focus').hidden,true);assert.equal(node('agent-scroll-track').hidden,true);assert.equal(context.highlightedNoteId,'');
const events={};h.lockObserverViewport({addEventListener:(name,handler,options)=>events[name]={handler,options}});
let prevented=0;
for(const name of ['wheel','touchmove','dragstart'])events[name].handler({preventDefault:()=>prevented++});
assert.equal(prevented,3);assert.equal(events.wheel.options.passive,false);assert.equal(events.touchmove.options.passive,false);
// Preview scroll is changed by research steps, never by a visitor manipulating an iframe.
const page={scrollHeight:760,style:{},querySelector:()=>({offsetTop:520,offsetLeft:30,offsetWidth:420,offsetHeight:90})};
node('preview-frame').querySelector=()=>page;
context.mode='preview';h.renderPreviewViewport();
assert.equal(page.style.transform,'translateY(-241px)');
assert.equal(context.frameTelemetry.viewport.scroll_y,241);assert.equal(context.frameTelemetry.focus.y,279);
assert.equal(context.highlightedNoteId,'preview-note-7');assert.equal(labels['passage-focus-caption'],'Example passage');
context.agent=()=>({preview_scroll_phase:2,preview_focus_note_id:null});h.renderPreviewViewport();
assert.equal(context.frameTelemetry.focus,null);assert.equal(node('passage-focus').hidden,true);
const previewContext={window:{},Date,JSON};vm.createContext(previewContext);
vm.runInContext(fs.readFileSync(path.join(root,'site/observatory-preview.js'),'utf8'),previewContext);
const preview=previewContext.window.ObservatoryPreview,state=preview.create(),original=state.agents[0].source_id;
for(let phase=0;phase<3;phase++){preview.step(state,'scholar');assert.equal(state.agents[0].preview_scroll_phase,phase);assert.equal(state.agents[0].source_id,original);}
assert.ok(state.agents[0].preview_focus_note_id);assert.ok(state.notes.some(note=>note.id===state.agents[0].preview_focus_note_id));
assert.equal(state.notes.at(-1).support_verified,false,'Preview passage is never certified as original evidence');
const html=fs.readFileSync(path.join(root,'site/observatory.html'),'utf8'),css=fs.readFileSync(path.join(root,'site/observatory.css'),'utf8');
assert.ok(!/<iframe\b/i.test(html));assert.ok(!source.includes('.srcdoc'));
assert.ok(html.includes('Agent controls scrolling'));assert.ok(css.includes('.preview-viewport { position: absolute; inset: 0; overflow: hidden; pointer-events: none;'));
async function checkRejectedOldFrames(){
  for(const nextMode of ['connected','preview']){
    let release,mutations=0;
    Object.assign(context,{mode:'connected',connected:true,currentView:'research',document:{hidden:false},frameLoading:false,frameSelection:'a',frameGeneration:1,selectedAgent:'a',agent:()=>({id:'a'}),
      endpoint:value=>value,fetch:()=>new Promise(resolve=>release=resolve),AbortController,setTimeout,clearTimeout,
      resetFrameTelemetry:()=>mutations++,renderNotebook:()=>mutations++,text:()=>mutations++});
    const pending=h.refreshFrame();
    context.mode=nextMode;context.selectedAgent='b';context.frameGeneration=2;context.agent=()=>({id:'b'});
    release({ok:false,status:404});await pending;
    assert.equal(mutations,0,'A late failed frame cannot change another agent or preview');
  }
}
checkRejectedOldFrames().then(()=>console.log(JSON.stringify({viewerChecks:'passed',noBrowser:true,noProviderCalls:true}))).catch(error=>{console.error(error);process.exitCode=1;});
