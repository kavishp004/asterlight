import {validateSearch,queryCollection,normalizeRecords} from '../lib/archive.mjs';
import {findSnapshot,snapshotResponse} from '../lib/snapshot.mjs';
const cache=new Map();
export default async function handler(req,res){
  if(req.method!=='GET'){res.writeHead(405,{Allow:'GET'});res.end();return;}
  const params=new URL(req.url,'http://localhost').searchParams;let input;
  try{input=validateSearch(params);}catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));return;}
  try{
    const key=`${input.ra},${input.dec}`,old=cache.get(key);let result;
    if(old&&Date.now()-old.at<1800000)result=old;
    else{const responses=await Promise.allSettled(['spherex_dr1','spherex_qr3'].map(c=>queryCollection(input,c)));const ok=responses.filter(r=>r.status==='fulfilled');if(!ok.length)throw new Error('The IRSA archive is temporarily unavailable. Retry the search in a moment.');result={rows:ok.flatMap(r=>r.value.rows),at:Date.now(),source:ok.map(r=>r.value.source),warnings:responses.flatMap((r,i)=>r.status==='rejected'?[`${i===0?'DR1':'QR3'} could not be queried; results cover the other release only.`]:[])};if(!result.warnings.length){if(cache.size>=24)cache.delete(cache.keys().next().value);cache.set(key,result);}}
    const all=normalizeRecords(result.rows,input.detector);const records=all.length>1500?Array.from({length:1500},(_,i)=>all[Math.round(i*(all.length-1)/1499)]):all;
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':result.warnings.length?'no-store':'public, s-maxage=1800, stale-while-revalidate=3600'});res.end(JSON.stringify({records,total:all.length,sampled:records.length<all.length,source:result.source,retrievedAt:new Date(result.at).toISOString(),releases:['DR1','QR3'],warnings:result.warnings||[]}));
  }catch(e){const saved=findSnapshot(input);if(saved){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(snapshotResponse(saved)));return;}
    res.writeHead(502,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:e.name==='TimeoutError'?'IRSA is taking longer than usual. Retry the search in a moment.':e.message}));}
}
