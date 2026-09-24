#!/usr/bin/env node
// Matter Core Alpha supervisor.
// Keeps truthful worker presence + lease recovery alive without invoking a model.
// Designed to be supervised by launchd/login item; all mutable state goes under MATTER_DATA_ROOT.
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { hostname, arch, totalmem } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=process.env.MATTER_DATA_ROOT;
if(!ROOT){console.error("MATTER_DATA_ROOT is required; refusing to guess a disk/volume path.");process.exit(78)}
mkdirSync(ROOT,{recursive:true});
process.env.MATTER_DIR=ROOT;
process.env.MATTER_EXEC_DIR=ROOT;

const { probe, heartbeat, ack }=await import("./matter-registry.mjs");
const { reclaim, status }=await import("./execution.mjs");
const interval=Math.max(15,Number(process.env.MATTER_CORE_INTERVAL_SEC||30))*1000;
const healthPath=path.join(ROOT,"CORE_HEALTH.json");

function atomicJson(file,obj){const tmp=file+".tmp";writeFileSync(tmp,JSON.stringify(obj,null,2)+"\n",{mode:0o600});renameSync(tmp,file)}
function disk(){
 try{const out=execFileSync("df",["-k",ROOT],{encoding:"utf8"}).trim().split("\n").pop().trim().split(/\s+/);
 return {filesystem:out[0],total_bytes:Number(out[1])*1024,available_bytes:Number(out[3])*1024,mount:out.slice(5).join(" ")}}
 catch(e){return {error:String(e.message).slice(0,160)}}
}
function registeredIds(){
 try{return Object.keys(JSON.parse(execFileSync(process.execPath,["-e",`const fs=require("fs"),p=require("path").join(process.env.MATTER_DIR,"WORKER_REGISTRY.json");process.stdout.write(fs.existsSync(p)?fs.readFileSync(p,"utf8"):"{}")`],{encoding:"utf8"})).workers||{})}
 catch{return []}
}
async function pass(){
 const started=new Date().toISOString(); const workers=[];
 for(const id of registeredIds()){
  try{const pr=probe(id)?.[0]; if(pr?.available){heartbeat(id,{});ack(id);workers.push({worker_id:id,available:true})}else workers.push({worker_id:id,available:false})}
  catch(e){workers.push({worker_id:id,available:false,error:String(e.message).slice(0,120)})}
 }
 const recovered=reclaim();
 atomicJson(healthPath,{schema_version:1,node_id:process.env.MATTER_NODE_ID||hostname(),hostname:hostname(),arch:arch(),memory_bytes:totalmem(),pid:process.pid,started_pass_at:started,last_pass_at:new Date().toISOString(),data_root:ROOT,disk:disk(),workers,recovered,execution:status()});
}
let stopping=false;
for(const sig of ["SIGTERM","SIGINT"]){process.on(sig,()=>{if(stopping)return;stopping=true;process.exit(0)})}
await pass();
setInterval(()=>pass().catch(e=>console.error("matter-core pass failed:",e)),interval).unref();
await new Promise(()=>{});
