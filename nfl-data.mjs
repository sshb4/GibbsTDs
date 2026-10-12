export const SEASON = 2026;
export const ATHLETE_ID = '4429795';
export const TEAM_ID = '8';
export const RECORD = 31;
export const SEASON_GAMES = 17;
export const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';
export const ESPN_SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

export function espnUrl(ref) {
  const url = new URL(ref);
  if (!['sports.core.api.espn.com', 'site.api.espn.com'].includes(url.hostname)) throw new Error('Unexpected ESPN reference');
  url.protocol = 'https:';
  if (url.hostname === 'sports.core.api.espn.com') {
    url.searchParams.set('lang', 'en');
    url.searchParams.set('region', 'us');
  }
  return url.href;
}
export function refId(ref, type = 'athletes') {
  return String(ref || '').match(new RegExp(`/${type}/(\\d+)(?:[/?]|$)`))?.[1] || null;
}
const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
function stat(categories, names, key) {
  for (const name of names) {
    const value = categories.find(c => c.name === name || c.abbreviation === name)?.stats?.find(s => s.name === key);
    if (value && numeric(value.value) !== null) return numeric(value.value);
  }
  return null;
}
export function parseTouchdowns(payload) {
  const categories = payload?.splits?.categories;
  if (!Array.isArray(categories) || !categories.length) throw new Error('ESPN touchdown stats are unavailable');
  const rushing = stat(categories, ['rushing', 'rush', 'scoring', 's'], 'rushingTouchdowns');
  const receiving = stat(categories, ['receiving', 'rec', 'scoring', 's'], 'receivingTouchdowns');
  const other = stat(categories, ['scoring', 's'], 'returnTouchdowns') ?? 0;
  // Career payloads repeat totalTouchdowns=0 in non-scoring categories.
  // Always prefer scoring's authoritative total, then summary, then phase totals.
  const summary = stat(categories, ['scoring', 'summary', 's'], 'totalTouchdowns');
  const fallback = stat(categories, ['rushing', 'rush', 'receiving', 'rec'], 'totalTouchdowns');
  const total = summary ?? fallback ?? (rushing !== null && receiving !== null ? rushing + receiving + other : null);
  if (total === null) throw new Error('ESPN did not provide a touchdown total');
  const games = stat(categories, ['general', 'gen'], 'gamesPlayed');
  return { total, rushing, receiving, other, games, mismatch: rushing !== null && receiving !== null && total !== rushing + receiving + other };
}
export function regularSeasonEvents(schedule) {
  // ESPN may silently return a different season when a requested one is unavailable.
  if (Number(schedule?.season?.year) !== SEASON || Number(schedule?.season?.type) !== 2 || !Array.isArray(schedule.events)) {
    throw new Error('ESPN did not return the 2026 regular-season schedule');
  }
  return schedule.events.filter(event => Number(event.season?.year) === SEASON && Number(event.seasonType?.type ?? event.seasonType?.id) === 2);
}
export function gameState(event) {
  const status = event.competitions?.[0]?.status?.type;
  return status?.completed ? 'final' : status?.state === 'in' ? 'live' : 'scheduled';
}
export function parseBoxscore(summary, event) {
  if (Number(summary?.header?.season?.year) !== SEASON || Number(summary?.header?.season?.type) !== 2) throw new Error('Unexpected boxscore season');
  const players = summary.boxscore?.players?.find(p => String(p.team?.id) === TEAM_ID);
  if (!players?.statistics?.some(c => c.name === 'rushing') || !players.statistics.some(c => c.name === 'receiving')) throw new Error('Gibbs boxscore is unavailable');
  let appeared = false;
  function tds(category) {
    const group = players.statistics.find(c => c.name === category);
    if (!group) return 0;
    const row = group.athletes?.find(a => String(a.athlete?.id) === ATHLETE_ID);
    if (!row) return 0;
    appeared = true;
    const column = group.labels?.indexOf('TD');
    const value = column >= 0 ? numeric(row.stats?.[column]) : null;
    if (value === null) throw new Error('Missing boxscore touchdown column');
    return value;
  }
  const rushing = tds('rushing');
  const receiving = tds('receiving');
  const other = ['kickReturns', 'puntReturns', 'fumbles', 'defensive', 'interceptions'].reduce((sum, category) => {
    const group = players.statistics.find(c => c.name === category);
    return group?.labels?.includes('TD') ? sum + tds(category) : sum;
  }, 0);
  const competition = event.competitions?.[0];
  const opponent = competition?.competitors?.find(c => String(c.team?.id) !== TEAM_ID);
  const det = competition?.competitors?.find(c => String(c.team?.id) === TEAM_ID);
  return { id: event.id, date: event.date, week: event.week?.number, opponent: opponent?.team?.abbreviation || '?', away: det?.homeAway === 'away', rushing, receiving, other, total: rushing + receiving + other, appeared, live: gameState(event) === 'live' };
}
export function parseLeaders(payload) {
  const category = payload?.categories?.find(c => c.name === 'totalTouchdowns');
  if (!Array.isArray(category?.leaders)) throw new Error('ESPN touchdown leaderboard is unavailable');
  return category.leaders.map(row => ({ id: refId(row.athlete?.$ref), ref: row.athlete?.$ref, total: numeric(row.value), name: row.athlete?.displayName })).filter(row => row.id && row.total !== null).sort((a, b) => b.total - a.total).map((row, index, rows) => ({ ...row, rank: rows.findIndex(other => other.total === row.total) + 1 }));
}
export function chaseMetrics(total, games) {
  return { projection: games > 0 ? total / games * SEASON_GAMES : null, tie: Math.max(0, RECORD - total), break: Math.max(0, RECORD + 1 - total), remaining: Math.max(0, SEASON_GAMES - games) };
}
