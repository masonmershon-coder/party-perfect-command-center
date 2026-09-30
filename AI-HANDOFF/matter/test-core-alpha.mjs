#!/usr/bin/env node
// Hermetic validation for Matter Core Alpha. No Mac-specific launchd calls.
import assert from "node:assert/strict";
import {mkdtempSync,copyFileSync,writeFileSync,readFileSync,existsSync} from "node:fs";
import {tmpdir} from "node:os"; import path from "node:path"; import {spawn,spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const HERE=path.dirname(fileURLToPath(import.meta.url)); const ROOT=mkdtempSync(path.join(tmpdir(),"matter-core-alpha-"));
process.env.MATTER_DATA_ROOT=ROOT; process.env.MATTER_DIR=ROOT; process.env.MATTER_EXEC_DIR=ROOT; process.env.MATTER_CORE_INTERVAL_SEC="15";
copyFileSync(path.join(HERE,"MATTER_POLICY.json"),path.join(ROOT,"MATTER_POLICY.json"));
const registry={workers:{
 "alive-worker":{worker_id:"alive-worker",provider:"test",product:"true",detect:["true"],capabilities:{local_execution:{level:true,source:"declared"}},permissions:{},available:false,last_probe:null,last_heartbeat:null,policy_version_ack:null},
 "dead-worker":{worker_id:"dead-worker",provider:"test",product:"false",detect:["false"],capabilities:{},permissions:{},available:true,last_probe:null,last_heartbeat:null,policy_version_ack:null}
},updated_at:null};
writeFileSync(path.join(ROOT,"WORKER_REGISTRY.json"),JSON.stringify(registry,null,2));
const E=await import("./execution.mjs"); E.enqueue("recover-me"); const lease=E.lease("recover-me","alive-worker",{ttlSec:1}); E.running(lease.lease_id);
await new Promise(r=>setTimeout(r,1100));
const child=spawn(process.execPath,[path.join(HERE,"core-alpha.mjs")],{env:process.env,stdio:["ignore","pipe","pipe"]});
// Listener attached at spawn so an early exit can never be missed.
const exited=new Promise(r=>child.once("exit",(code,signal)=>r({code,signal})));
let stderr=""; child.stdout.resume(); child.stderr.on("data",d=>{stderr+=d});
const alive=()=>child.exitCode===null&&child.signalCode===null;
// The supervisor never exits on its own; a failed assertion must not leave it orphaned.
process.on("exit",()=>{if(alive())child.kill("SIGKILL")});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const health=path.join(ROOT,"CORE_HEALTH.json"); const deadline=Date.now()+5000;
while(!existsSync(health)&&Date.now()<deadline) await sleep(50);
assert.ok(existsSync(health),"supervisor must emit health");
const h=JSON.parse(readFileSync(health,"utf8"));
await sleep(1000);
assert.ok(alive(),`supervisor must stay alive after the first pass (stderr: ${stderr.slice(0,300)})`);
assert.equal(h.workers.find(x=>x.worker_id==="alive-worker").available,true);
assert.equal(h.workers.find(x=>x.worker_id==="dead-worker").available,false);
assert.ok(h.recovered.reclaimed.includes("recover-me"),"expired lease must be reclaimed");
const rr=JSON.parse(readFileSync(path.join(ROOT,"WORKER_REGISTRY.json"),"utf8"));
assert.ok(rr.workers["alive-worker"].last_heartbeat,"live worker heartbeat must refresh");
assert.equal(rr.workers["dead-worker"].last_heartbeat,null,"failed probe must not fake heartbeat");
const firstPassAt=h.last_pass_at; const secondDeadline=Date.now()+25000; let h2=h;
while(h2.last_pass_at===firstPassAt&&alive()&&Date.now()<secondDeadline){await sleep(250);try{h2=JSON.parse(readFileSync(health,"utf8"))}catch{}}
assert.ok(alive(),`supervisor must stay alive until the scheduled pass (stderr: ${stderr.slice(0,300)})`);
assert.ok(Date.parse(h2.last_pass_at)>Date.parse(firstPassAt),"a later scheduled pass must refresh CORE_HEALTH.json");
assert.equal(h2.pid,child.pid,"scheduled pass must come from the same supervisor process");
child.kill("SIGTERM"); const term=await exited;
assert.deepEqual(term,{code:0,signal:null},"SIGTERM must exit cleanly with code 0");
const bad=spawnSync(process.execPath,[path.join(HERE,"core-alpha.mjs")],{env:{...process.env,MATTER_DATA_ROOT:""}});
assert.equal(bad.status,78,"missing data root must fail closed");
console.log(JSON.stringify({pass:true,root:ROOT,reclaimed:h.recovered.reclaimed,liveHeartbeat:rr.workers["alive-worker"].last_heartbeat,deadHeartbeat:rr.workers["dead-worker"].last_heartbeat,firstPassAt,secondPassAt:h2.last_pass_at,sigterm:term,missingRootExit:bad.status},null,2));
