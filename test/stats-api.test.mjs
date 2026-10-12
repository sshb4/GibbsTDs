import test from 'node:test';
import assert from 'node:assert/strict';
import { statsResponse, statsUpstream, statsPath } from '../stats-api.mjs';
const req = (path,method='GET')=>new Request(`https://gibbstouchdowns.com${path}`,{method});
test('public stats routes resolve only fixed ESPN resources and retain required parameters',()=>{
 for (const path of ['/api/nfl/season','/api/nfl/career','/api/nfl/leaders','/api/nfl/schedule','/api/nfl/summary?event=401872991','/api/nfl/athlete?id=4429795']) {
  const upstream=statsUpstream(new URL(req(path).url));
  assert.equal(new URL(upstream).protocol,'https:'); assert.equal(statsPath(upstream),path);
 }
 assert.equal(statsUpstream(new URL(req('/api/nfl/summary?event=https://example.com').url)),null);
 assert.equal(statsUpstream(new URL(req('/api/nfl/athlete?id=../secret').url)),null);
});
test('API works without credentials or D1 and supplies CORS',async()=>{
 const response=await statsResponse(req('/api/nfl/season'),{fetcher:async()=>Response.json({total:9})});
 assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'*');assert.deepEqual(await response.json(),{total:9});
});
test('cached responses reduce upstream requests; cache keys ignore irrelevant parameters',async()=>{
 const entries=new Map(); let calls=0;
 const options={fetcher:async()=>{calls++;return Response.json({total:9});},cache:{match:async key=>entries.get(key.url)?.clone(),put:async(key,value)=>entries.set(key.url,value)}};
 await statsResponse(req('/api/nfl/season?extra=one'),options);
 await statsResponse(req('/api/nfl/season?extra=two'),options);
 assert.equal(calls,1);
});
test('API rejects arbitrary proxying and write requests without fetching',async()=>{
 const options={fetcher:()=>assert.fail('must not fetch')};
 assert.equal((await statsResponse(req('/api/nfl/unknown'),options)).status,404);
 assert.equal((await statsResponse(req('/api/nfl/season','POST'),options)).status,405);
 assert.equal((await statsResponse(req('/api/nfl/season','OPTIONS'),options)).status,204);
});
test('upstream outages return a retryable error without caching false data',async()=>{
 const response=await statsResponse(req('/api/nfl/season'),{fetcher:async()=>new Response('unavailable',{status:503}),cache:{match:async()=>undefined,put:()=>assert.fail('must not cache failure')}});
 assert.equal(response.status,502);assert.equal(response.headers.get('cache-control'),'no-store');assert.match((await response.json()).error,/temporarily unavailable/);
});
