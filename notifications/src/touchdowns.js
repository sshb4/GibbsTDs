export const PLAYER_ID = '4429795';
export const TEAM_ID = '8';
export const SEASON = 2026;

// Summary scoringPlays has no wallclock or athlete IDs. Join it to drive plays
// for actual occurrence time; never use feed modified time or polling time.
export function touchdownEvents(feed, startAt, now = Date.now(), siteOrigin = '') {
  if (Number(feed.header?.season?.type) !== 2 || Number(feed.header?.season?.year) !== SEASON) return [];
  const gameId = String(feed.header?.id || '');
  if (!/^\d+$/.test(gameId) || !Number.isFinite(startAt)) return [];
  const opponent = feed.header.competitions?.[0]?.competitors?.find(c => String(c.team?.id) !== TEAM_ID);
  const name = String(opponent?.team?.abbreviation || 'opposition').replace(/[^a-zA-Z0-9 .-]/g, '').slice(0, 16);
  const drives = [...(feed.drives?.previous || []), ...(feed.drives?.current ? [feed.drives.current] : [])];
  const plays = new Map(drives.flatMap(d => d.plays || []).map(p => [String(p.id), p]));
  const seen = new Set();
  return (feed.scoringPlays || []).flatMap(score => {
    const id = String(score.id || '');
    const play = plays.get(id);
    const when = Date.parse(play?.wallclock);
    if (!/^\d+$/.test(id) || seen.has(id) || String(score.team?.id) !== TEAM_ID ||
        score.scoringType?.name !== 'touchdown' || !play?.scoringPlay || play.scoringType?.name !== 'touchdown' ||
        !Number.isFinite(when) || when <= startAt || when < now - 6 * 60 * 60 * 1000 || when > now) return [];
    const text = String(score.text || '').replace(/^\(No Huddle\)\s*/i, '');
    // ESPN spells the scorer J.Gibbs or Jahmyr Gibbs. Only accept him as
    // the scorer, not as passer, tackler, or another mention in the play.
    const scorer = /^(?:J\.?\s*Gibbs|Jahmyr Gibbs)\b/i.test(text);
    const receiver = /\bpass (?:short |deep )?(?:left |right |middle )?to (?:J\.?\s*Gibbs|Jahmyr Gibbs)\b/i.test(text);
    if (!(scorer || receiver) || /\b(?:no play|nullified|overturned)\b/i.test(text)) return [];
    if (scorer && /\bpass\b/i.test(text) && !/\bpass from\b/i.test(text) && !receiver) return [];
    seen.add(id);
    const link = siteOrigin ? ` ${siteOrigin.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : '';
    const body = `Gibbs TD Chase: HE SCORED. vs ${name}, Q${Number(play.period?.number) || '?'}.${link} Reply STOP to unsubscribe.`;
    return [{ id: `${gameId}:${id}`, occurredAt: when, body }];
  });
}
