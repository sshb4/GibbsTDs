import { ESPN_CORE, ESPN_SITE, SEASON, ATHLETE_ID, espnUrl } from './nfl-data.mjs';

// Explicit resource routes only: this is not an arbitrary-URL proxy.
export function statsUpstream(url) {
  const routes = {
    '/api/nfl/season': `${ESPN_CORE}/seasons/${SEASON}/types/2/athletes/${ATHLETE_ID}/statistics`,
    '/api/nfl/career': `${ESPN_CORE}/athletes/${ATHLETE_ID}/statistics/0`,
    '/api/nfl/leaders': `${ESPN_CORE}/seasons/${SEASON}/types/2/leaders`,
    '/api/nfl/schedule': `${ESPN_SITE}/teams/8/schedule?season=${SEASON}&seasontype=2`
  };
  if (routes[url.pathname]) return espnUrl(routes[url.pathname]);
  if (url.pathname === '/api/nfl/summary' && /^\d{6,12}$/.test(url.searchParams.get('event') || '')) return espnUrl(`${ESPN_SITE}/summary?event=${url.searchParams.get('event')}`);
  if (url.pathname === '/api/nfl/athlete' && /^\d{1,10}$/.test(url.searchParams.get('id') || '')) return espnUrl(`${ESPN_CORE}/seasons/${SEASON}/athletes/${url.searchParams.get('id')}`);
  return null;
}
export function statsPath(ref) {
  const url = new URL(espnUrl(ref));
  const path = url.pathname;
  if (path.endsWith(`/seasons/${SEASON}/types/2/athletes/${ATHLETE_ID}/statistics`)) return '/api/nfl/season';
  if (path.endsWith(`/athletes/${ATHLETE_ID}/statistics/0`)) return '/api/nfl/career';
  if (path.endsWith(`/seasons/${SEASON}/types/2/leaders`)) return '/api/nfl/leaders';
  if (url.hostname === 'site.api.espn.com' && path.endsWith('/teams/8/schedule')) return '/api/nfl/schedule';
  if (url.hostname === 'site.api.espn.com' && path.endsWith('/summary')) return `/api/nfl/summary?event=${url.searchParams.get('event')}`;
  const id = path.match(/\/athletes\/(\d+)$/)?.[1];
  if (id) return `/api/nfl/athlete?id=${id}`;
  throw new Error('Unsupported ESPN resource');
}
export async function statsResponse(request, { fetcher = fetch, cache = null } = {}) {
  const url = new URL(request.url);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return Response.json({ error: 'Use GET for public stats' }, { status: 405, headers: { ...cors, Allow: 'GET, OPTIONS' } });
  const upstream = statsUpstream(url);
  if (!upstream) return Response.json({ error: 'Unknown stats resource' }, { status: 404, headers: cors });
  // Cache a canonical URL so extraneous query parameters cannot bust the cache.
  const key = new Request(new URL(statsPath(upstream), url.origin));
  const cached = await cache?.match(key);
  if (cached) return cached;
  try {
    const response = await fetcher(upstream, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`ESPN HTTP ${response.status}`);
    const data = await response.json();
    const result = Response.json(data, { headers: { ...cors, 'Cache-Control': 'public, max-age=60' } });
    if (cache) await cache.put(key, result.clone());
    return result;
  } catch {
    return Response.json({ error: 'ESPN data is temporarily unavailable' }, { status: 502, headers: { ...cors, 'Cache-Control': 'no-store' } });
  }
}
