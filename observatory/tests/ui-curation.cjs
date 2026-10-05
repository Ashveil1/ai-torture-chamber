/* Actual UI helper checks against authored DOM/state fixtures. No browser/network. */
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const main=fs.readFileSync(path.resolve(__dirname,'../../site/observatory.js'),'utf8');
let assertions=0;
function check(value,message){assert.ok(value,message);assertions++;}
function extract(name){
  const start=main.indexOf('  function '+name+'(');
  assert.ok(start>=0,'Actual UI helper exists: '+name);
  const next=main.slice(start+1).search(/\n  (?:async )?function \w+\(/);
  assert.ok(next>=0);return main.slice(start,start+1+next);
}
const nodes=new Map();
function $(id){if(!nodes.has(id))nodes.set(id,{value:'',checked:false,innerHTML:'',insertAdjacentHTML(position,html){this.innerHTML+=html;}});return nodes.get(id);}
const context={$,nodes,state:{mission:{status:'running'},agents:[],sources:[],settings:{}},mode:'connected',connected:true,
  busy:false,ownerToken:'fixture-owner',canMutate(){return context.connected && !!context.ownerToken;},
  toast(){},confirmAction(title,message,label,callback){context.confirmation={title,message,label,callback};},
  async mutate(route,payload){context.request={route,payload};return {acknowledged:true};},
  clearInheritedBaseRevision(){},compatibleResearchModels(){return [{id:'fixture-model'}];},
  sourceById(id){return context.state.sources.find(source=>source.id===id);}};
vm.createContext(context);
const helpers=['emptyState','normalizeState','titleCase','clock','curationReviews','curationDecision','sourceCurationReview',
  'automatedReviewBadge','curationRecoveryAvailable','curationRecoveryMarkup','reviewCurationRecovery','renderAutomatedCuration','collectSettings'];
const constants=main.split('\n').filter(line=>/^  const (esc|list) =/.test(line)).join('\n');
vm.runInContext(constants+'\n'+helpers.map(extract).join('\n'),context);
check(context.normalizeState({mission:{status:'stopped'},agents:[]}).curation_reviews.length===0,'Older backends have a safe empty review list');
check(context.normalizeState({mission:{status:'stopped'},agents:[],curation_reviews:{}}).curation_reviews.length===0,'Malformed optional receipts do not become UI records');
$('setting-provider').value='openai';$('setting-model').value='fixture-model';$('setting-base-model').value='fixture-base';
$('setting-browser').value='local';$('setting-protocol').value='responses';
let settings=context.collectSettings();
check(settings.auto_curation_enabled===false && settings.auto_curation_policy_ack==='','Review policy is not enabled by default');
$('setting-auto-curation').checked=true;settings=context.collectSettings();
check(settings.auto_curation_enabled===true && settings.auto_curation_policy_ack==='originals-v1','Opt-in sends the exact source-only policy');
check(settings.synthetic_training_approved===false,'Source review does not grant synthetic-output permission');
check(settings.training_enabled===false,'Source review does not enable paid GPU training');
$('setting-auto-curation').checked=false;settings=context.collectSettings();
check(settings.auto_curation_policy_ack==='','Disabling clears the policy acknowledgement in the request');
context.renderAutomatedCuration();
check($('automated-curation-summary').innerHTML.includes('Disabled'),'No receipts are presented as an active review');
context.state.settings.auto_curation_enabled=true;context.mode='preview';context.renderAutomatedCuration();
check($('automated-curation-summary').innerHTML.includes('Simulated review'),'Preview policy always remains simulated');
check($('automated-curation-summary').innerHTML.includes('No model call was made'),'Preview makes no real acceptance claim');
context.mode='connected';context.connected=false;context.renderAutomatedCuration();
check($('automated-curation-summary').innerHTML.includes('Backend unavailable'),'Enabled preference does not conceal disconnection');
context.connected=true;
const source={id:'source-fixture',title:'<img src=x onerror=alert(1)>',review_status:'approved',
  curation:{eligible:true},quality_review:{reviewer_kind:'automated',status:'approved',model:'fixture-model'}};
context.state.sources=[source];context.state.curation_reviews=[{id:'receipt-fixture',source_id:source.id,
  decision:'accepted',model:'<script>unsafe</script>',rationale:'<img src=x onerror=alert(1)>',created_at:'2026-10-05T00:00:00Z'}];
context.renderAutomatedCuration();const rendered=$('automated-curation-summary').innerHTML;
check(rendered.includes('1</strong> accepted receipts'),'Counts identify historical receipts');
check(!rendered.includes('<script>') && !rendered.includes('<img src=x'),'Source and model content is escaped');
context.state.curation_reviews=[];
check(context.sourceCurationReview(source).decision==='accepted','A source with a bound approval can render without the optional receipt list');
context.state.curation_reviews=[{id:'receipt-fixture',source_id:source.id,decision:'accepted'}];
source.review_status='rejected';source.quality_review={status:'rejected',reviewed_by:'operator'};
check(context.automatedReviewBadge(source).includes('Prior automated acceptance'),'Operator rejection is not presented as current automated eligibility');
async function recoveryChecks(){
  context.state.curation_runtime={status:'reviewing',call_state:'awaiting_operator',active_stage:'critic',review_id:'review-recovery',source_id:source.id};
  check(!context.curationRecoveryAvailable('review-recovery'),'Running mission cannot authorize an interrupted retry');
  context.state.mission.status='faulted';context.renderAutomatedCuration();
  check($('automated-curation-summary').innerHTML.includes('Operator attention required'),'Interrupted paid review is visible');
  check(context.curationRecoveryAvailable('review-recovery'),'Idle owner can review a matching interrupted call');
  check(!context.curationRecoveryAvailable('changed-review'),'Stale review ID cannot authorize recovery');
  context.ownerToken='';check(!context.curationRecoveryAvailable('review-recovery'),'Public visitor cannot acknowledge recovery');context.ownerToken='fixture-owner';
  context.mode='preview';check(!context.curationRecoveryAvailable('review-recovery') && context.curationRecoveryMarkup(context.state.curation_runtime)==='','Preview never simulates recovery');context.mode='connected';
  context.reviewCurationRecovery('review-recovery');
  check(context.confirmation.message.includes('may already have been billed') && !context.request,'Another attempt requires explicit acknowledgement of billing uncertainty');
  context.state.curation_runtime.review_id='different';await context.confirmation.callback();
  check(!context.request,'Changed server state invalidates a confirmation');
  context.state.curation_runtime.review_id='review-recovery';context.reviewCurationRecovery('review-recovery');await context.confirmation.callback();
  check(context.request.route==='admin/curation/recovery' && context.request.payload.reviewed===true && context.request.payload.review_id==='review-recovery','Acknowledgement uses the exact owner-only recovery route');
  check(context.state.mission.status==='faulted','Acknowledgement does not resume research');
  console.log(JSON.stringify({automaticCurationUi:'passed',assertions,actualHelpers:true,sourceOnlyPolicy:true,operatorOverride:true,explicitRecovery:true,noNetwork:true}));
}
recoveryChecks().catch(error=>{console.error(error);process.exitCode=1;});
