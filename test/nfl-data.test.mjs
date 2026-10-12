import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTouchdowns, espnUrl, regularSeasonEvents, parseBoxscore, parseLeaders, chaseMetrics } from '../nfl-data.mjs';
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));
const event = { id: '401872991', date: '2026-10-11T20:25Z', season: { year: 2026 }, seasonType: { type: 2 }, week: { number: 5 }, competitions: [{ status: { type: { completed: true } }, competitors: [{ team: { id: '8' }, homeAway: 'away' }, { team: { id: '22', abbreviation: 'ARI' } }] }] };
test('live ESPN season response yields 9 TDs through 5 games and 30.6 pace', () => {
  const stats = parseTouchdowns(fixture('stats'));
  assert.deepEqual(stats, { total: 9, rushing: 7, receiving: 2, other: 0, games: 5, mismatch: false });
  assert.deepEqual(chaseMetrics(9,5), { projection: 30.6, tie: 22, break: 23, remaining: 12 });
  assert.equal(chaseMetrics(0,0).projection, null);
  assert.equal(chaseMetrics(33,17).break, 0);
});
test('career scoring total takes precedence over duplicate zero totals', () => {
  assert.equal(parseTouchdowns(fixture('career')).total, 58);
  assert.throws(() => parseTouchdowns({}), /unavailable/);
  assert.throws(() => parseTouchdowns({ splits: { categories: [{ name: 'scoring', stats: [] }] } }), /total/);
});
test('return TDs are included; inconsistent phase totals are surfaced', () => {
  const data = fixture('stats');
  const scoring = data.splits.categories.find(c => c.name === 'scoring');
  scoring.stats.find(s => s.name === 'returnTouchdowns').value = 1;
  scoring.stats.find(s => s.name === 'totalTouchdowns').value = 10;
  assert.equal(parseTouchdowns(data).mismatch, false);
  scoring.stats.find(s => s.name === 'totalTouchdowns').value = 11;
  assert.equal(parseTouchdowns(data).mismatch, true);
});
test('HTTPS references retain language and region, reject unexpected hosts', () => {
  const url = new URL(espnUrl('http://sports.core.api.espn.com/v2/athletes/4429795'));
  assert.equal(url.protocol, 'https:'); assert.equal(url.searchParams.get('lang'),'en'); assert.equal(url.searchParams.get('region'),'us');
  assert.throws(() => espnUrl('http://example.com/athletes/1'));
});
test('schedule excludes playoffs and rejects silent season fallback', () => {
  const schedule = { season: { year: 2026, type: 2 }, events: [event, { ...event, seasonType: { type: 3 } }, { ...event, season: { year: 2025 } }] };
  assert.equal(regularSeasonEvents(schedule).length,1);
  schedule.season.year = 2025; assert.throws(() => regularSeasonEvents(schedule));
});
test('actual ARI boxscore: label-based parsing, 2 rushing TDs, 0 receiving', () => {
  const summary = fixture('boxscore');
  const row = parseBoxscore(summary,event);
  assert.equal(row.rushing,2); assert.equal(row.receiving,0); assert.equal(row.total,2); assert.equal(row.appeared,true); assert.equal(row.away,true);
  summary.header.season.type = 3; assert.throws(() => parseBoxscore(summary,event));
});
test('absent players are marked as no appearance; unavailable columns are not zeros', () => {
  const summary = fixture('boxscore');
  summary.boxscore.players[0].statistics.forEach(g => g.athletes=[]);
  assert.equal(parseBoxscore(summary,event).appeared,false);
  const broken = fixture('boxscore'); broken.boxscore.players[0].statistics.find(c=>c.name==='rushing').labels=[];
  assert.throws(() => parseBoxscore(broken,event), /column/);
});
test('leaderboard uses scored touchdowns only and competition ranks for ties', () => {
  const data = { categories: [{ name: 'passingTouchdowns', leaders: [] }, { name:'totalTouchdowns', leaders:[9,8,8,7].map((value,i)=>({value,athlete:{$ref:`http://sports.core.api.espn.com/v2/athletes/${i+1}?lang=en`}})) }] };
  assert.deepEqual(parseLeaders(data).map(r=>r.rank),[1,2,2,4]);
  assert.throws(()=>parseLeaders({categories:[]}), /unavailable/);
});
