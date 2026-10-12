import { SEASON, ATHLETE_ID, RECORD, ESPN_CORE, ESPN_SITE, espnUrl, parseTouchdowns, regularSeasonEvents, gameState, parseBoxscore, parseLeaders, chaseMetrics } from './nfl-data.mjs';
import { statsPath } from './stats-api.mjs';
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const $ = id => document.getElementById(id);
const kineticNumber = $('kinetic-number');
const speedCanvas = $('speed-canvas');
const speedContext = speedCanvas.getContext('2d');
const numberMain = $('number-main');
const numberHighlight = $('number-highlight');
const numberGhosts = [...kineticNumber.querySelectorAll('.number-ghost')];
const numberScene = document.createElement('canvas');
const numberSceneContext = numberScene.getContext('2d');
      function setTouchdownNumber(value) {
        const cleanNumber = String(value).replace(/[^\d]/g, "") || "0";
        const target = Number(cleanNumber);
        const start = Number(numberMain.textContent) || 0;
        const startedAt = performance.now();
        const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650;

        function animateNumber(now) {
          const progress = Math.min(1, duration ? (now - startedAt) / duration : 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = Math.round(start + (target - start) * eased);
          numberMain.textContent = String(current);
          numberHighlight.textContent = String(current);
          numberGhosts.forEach((ghost) => { ghost.textContent = String(current); });
          kineticNumber.setAttribute("aria-label", `${current} touchdowns in 2026`);
          renderNumberScene();
          animateSpeedCanvas();
          if (progress < 1) requestAnimationFrame(animateNumber);
        }

        requestAnimationFrame(animateNumber);
      }

      window.setTouchdownNumber = setTouchdownNumber;

      let canvasWidth = 0;
      let canvasHeight = 0;
      let speedParticles = [];
      let numberFrameReady = false;

      function resizeSpeedCanvas() {
        const rect = kineticNumber.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        speedCanvas.width = rect.width * ratio;
        speedCanvas.height = rect.height * ratio;
        speedCanvas.style.width = `${rect.width}px`;
        speedCanvas.style.height = `${rect.height}px`;
        speedContext.setTransform(ratio, 0, 0, ratio, 0, 0);
        canvasWidth = rect.width;
        canvasHeight = rect.height;
      }

      function createSpeedParticle(initial = false) {
        return {
          x: canvasWidth + Math.random() * canvasWidth * .35,
          y: canvasHeight * (.25 + Math.random() * .5),
          length: Math.random() * Math.random() * 150 + 15,
          speed: Math.random() * 8 + 2.5,
          thickness: Math.random() * 1.7 + .25,
          opacity: Math.random() * .55 + .1,
          life: initial ? Math.random() : 0,
        };
      }

      function initializeSpeedParticles() {
        speedParticles = Array.from(
          { length: Math.min(150, Math.floor(canvasWidth / 8)) },
          () => createSpeedParticle(true)
        );
      }

      function renderNumberScene() {
        if (!canvasWidth || !canvasHeight) return;
        const text = numberMain.textContent || "0";
        const ratio = window.devicePixelRatio || 1;
        numberScene.width = Math.max(1, Math.floor(canvasWidth * ratio));
        numberScene.height = Math.max(1, Math.floor(canvasHeight * ratio));
        numberSceneContext.setTransform(ratio, 0, 0, ratio, 0, 0);
        numberSceneContext.clearRect(0, 0, canvasWidth, canvasHeight);

        const mask = document.createElement("canvas");
        mask.width = numberScene.width;
        mask.height = numberScene.height;
        const maskContext = mask.getContext("2d");
        maskContext.setTransform(ratio, 0, 0, ratio, 0, 0);
        const fontSize = Math.min(canvasHeight, canvasWidth / (text.length * .62));
        const centerX = canvasWidth * .5;
        const centerY = canvasHeight * .62;
        maskContext.save();
        maskContext.translate(centerX, centerY);
        maskContext.transform(1, 0, -.08, 1, 0, 0);
        maskContext.font = `${fontSize}px "Bebas Neue", Impact, "Arial Black", Arial, sans-serif`;
        maskContext.textAlign = "center";
        maskContext.textBaseline = "middle";
        maskContext.lineJoin = "round";
        maskContext.lineWidth = fontSize * .045;
        maskContext.strokeStyle = "#000";
        maskContext.fillStyle = "#000";
        maskContext.strokeText(text, 0, 0);
        maskContext.fillText(text, 0, 0);
        maskContext.restore();

        const minY = centerY - fontSize * .45;
        const maxY = centerY + fontSize * .45;

        const fill = numberSceneContext.createLinearGradient(0, minY, 0, maxY || numberScene.height);
        fill.addColorStop(0, "#050505");
        fill.addColorStop(.45, "#090909");
        fill.addColorStop(.72, "#004c75");
        fill.addColorStop(1, "#0076b6");
        numberSceneContext.save();
        numberSceneContext.drawImage(mask, 0, 0, canvasWidth, canvasHeight);
        numberSceneContext.globalCompositeOperation = "source-in";
        numberSceneContext.fillStyle = fill;
        numberSceneContext.fillRect(0, 0, canvasWidth, canvasHeight);
        numberSceneContext.restore();
        numberFrameReady = true;

      }

      function animateSpeedCanvas() {
        if (!canvasWidth || !canvasHeight || !numberScene.width || !numberScene.height || !numberFrameReady) return;
        speedContext.clearRect(0, 0, canvasWidth, canvasHeight);
        speedContext.drawImage(numberScene, 0, 0, canvasWidth, canvasHeight);
      }

      resizeSpeedCanvas();
      initializeSpeedParticles();
      renderNumberScene();
      animateSpeedCanvas();
      if (document.fonts?.ready) {
        document.fonts.ready.then(() => {
          renderNumberScene();
          animateSpeedCanvas();
        });
      }

      window.addEventListener("resize", () => {
        resizeSpeedCanvas();
        initializeSpeedParticles();
        renderNumberScene();
        animateSpeedCanvas();
      });
      window.addEventListener("load", () => {
        resizeSpeedCanvas();
        initializeSpeedParticles();
        renderNumberScene();
        animateSpeedCanvas();
      });
      if (window.ResizeObserver) {
        new ResizeObserver(() => {
          resizeSpeedCanvas();
          renderNumberScene();
          animateSpeedCanvas();
        }).observe(kineticNumber);
      }


let loading = false;
let lastLoadedAt = null;
const cache = new Map();
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = value => value === null || value === undefined ? '—' : new Intl.NumberFormat().format(value);
async function fetchJson(ref, ttl = 0) {
  const url = espnUrl(ref);
  const saved = cache.get(url);
  if (saved && Date.now() - saved.at < ttl) return saved.data;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const base = window.GIBBS_DATA?.apiBaseUrl || window.location.origin;
    const response = await fetch(new URL(statsPath(url), base), { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 404 ? 'Stats API is not connected; configure the Gibbs Worker' : `Stats API HTTP ${response.status}`);
    const data = await response.json();
    cache.set(url, { at: Date.now(), data });
    return data;
  } finally { clearTimeout(timeout); }
}
// Bound fan-out when fetching boxscores and athlete references.
async function mapLimit(items, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) { const i = next++; try { results[i] = { status: 'fulfilled', value: await work(items[i]) }; } catch (reason) { results[i] = { status: 'rejected', reason }; } }
  }));
  return results;
}
function renderSeason(stats) {
  setTouchdownNumber(stats.total);
  $('season-touchdowns').textContent = stats.total;
  $('rush-total').textContent = fmt(stats.rushing);
  $('rec-total').textContent = fmt(stats.receiving);
  $('other-total').textContent = fmt(stats.other);
  $('games-played').textContent = fmt(stats.games);
  const metrics = chaseMetrics(stats.total, stats.games);
  $('pace-total').textContent = metrics.projection === null ? '—' : metrics.projection.toFixed(1);
  $('to-tie').textContent = metrics.tie;
  $('to-break').textContent = metrics.break;
  $('games-remaining').textContent = stats.games === null ? 'Games played unavailable' : `${metrics.remaining} games remaining`;
  $('record-progress').value = Math.min(stats.total, RECORD);
  $('record-progress').textContent = `${stats.total} of ${RECORD}`;
  $('record-count').textContent = stats.total > RECORD ? `${stats.total} TDs · Record broken` : stats.total === RECORD ? `${stats.total} TDs · Record tied` : `${stats.total} of ${RECORD} TDs`;
  $('hero-heading').textContent = stats.total > RECORD ? 'Record broken.' : stats.total === RECORD ? 'Record tied.' : `Chasing ${RECORD}.`;
  const tomlinsonRecord = `LaDainian Tomlinson · ${RECORD} TDs · 2006 · 16 games`;
  const gibbsRecord = `Jahmyr Gibbs · ${stats.total} TDs · ${SEASON}${stats.games === null ? '' : ` · ${stats.games} ${stats.games === 1 ? 'game' : 'games'}`}`;
  $('current-record').textContent = stats.total > RECORD ? `Current Record: ${gibbsRecord}` : stats.total === RECORD ? `Current Record (tied): ${tomlinsonRecord} / ${gibbsRecord}` : `Current Record: ${tomlinsonRecord}`;
  $('previous-record').hidden = stats.total <= RECORD;
  $('pace-note').textContent = stats.games > 0 ? `Season rate: ${(stats.total / stats.games).toFixed(2)} TDs per game × 17 games. Projection, not a prediction.` : 'Projection begins after his first appearance.';
}
async function loadGameLog() {
  const schedule = await fetchJson(`${ESPN_SITE}/teams/8/schedule?season=${SEASON}&seasontype=2`);
  const games = regularSeasonEvents(schedule).filter(event => ['final', 'live'].includes(gameState(event))).sort((a,b) => new Date(a.date) - new Date(b.date));
  const results = await mapLimit(games, async event => parseBoxscore(await fetchJson(`${ESPN_SITE}/summary?event=${event.id}`, gameState(event) === 'final' ? 60 * 60 * 1000 : 0), event));
  // Keep missing games visible; never invent a zero or misleading cumulative chart.
  const rows = results.map((result, i) => result.status === 'fulfilled' ? result.value : { id: games[i].id, date: games[i].date, week: games[i].week?.number, unavailable: true });
  $('game-log').innerHTML = rows.length ? rows.slice().reverse().map(row => `<tr><td>${escapeHtml(new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Detroit' }).format(new Date(row.date)))}<small>Week ${escapeHtml(row.week ?? '—')}${row.live ? ' · Live' : ''}</small></td>${row.unavailable ? '<td colspan="4">Boxscore unavailable</td>' : `<td>${row.away ? '@' : 'vs.'} ${escapeHtml(row.opponent)}${row.appeared ? '' : '<small>No recorded appearance</small>'}</td><td>${row.rushing}</td><td>${row.receiving}</td><td><strong>${row.total}</strong>${row.other ? `<small>Includes ${row.other} other TD</small>` : ''}</td>`}</tr>`).join('') : '<tr><td colspan="5" class="empty">No regular-season games played yet.</td></tr>';
  if (results.some(r => r.status === 'rejected')) { $('pace-chart').innerHTML = '<p class="empty">Pace chart unavailable until all game boxscores load.</p>'; throw new Error('Some game boxscores could not be loaded'); }
  renderPace(rows);
}
function renderPace(rows) {
  const finished = rows.filter(row => !row.live);
  if (!finished.length) { $('pace-chart').innerHTML = '<p class="empty">The chase chart starts with the first final game.</p>'; return; }
  const max = Math.max(35, finished.reduce((sum, row) => sum + row.total, 0));
  let total = 0;
  const points = [[40, 195], ...finished.map((row, i) => [40 + (i + 1) / 17 * 580, 195 - (total += row.total) / max * 160])];
  const line = points.map(p => p.join(',')).join(' ');
  const recordY = 195 - RECORD / max * 160;
  $('pace-chart').innerHTML = `<svg viewBox="0 0 660 235" role="img" aria-label="Gibbs has ${total} touchdowns through ${finished.length} Lions games. Dashed line shows a 31 touchdown pace over 17 games."><line x1="40" x2="620" y1="195" y2="195" class="chart-axis"/><line x1="40" x2="40" y1="25" y2="195" class="chart-axis"/><line x1="40" x2="620" y1="${recordY}" y2="${recordY}" class="chart-target"/><text x="620" y="${recordY-8}" text-anchor="end">31 TD record</text><line x1="40" y1="195" x2="620" y2="${recordY}" class="chart-record"/><polyline points="${line}" class="chart-gibbs"/>${points.slice(1).map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" class="chart-dot"/>`).join('')}<text x="24" y="200">0</text><text x="40" y="225">Game 0</text><text x="620" y="225" text-anchor="end">Game 17</text></svg>`;
}
async function loadLeaderboard() {
  const leaders = parseLeaders(await fetchJson(`${ESPN_CORE}/seasons/${SEASON}/types/2/leaders`));
  const selected = leaders.slice(0, 10);
  const gibbs = leaders.find(row => row.id === ATHLETE_ID);
  if (gibbs && !selected.some(row => row.id === ATHLETE_ID)) selected.push(gibbs);
  const results = await mapLimit(selected, async row => ({ ...row, name: row.id === ATHLETE_ID ? 'Jahmyr Gibbs' : row.name || (await fetchJson(row.ref, 24 * 60 * 60 * 1000)).displayName }));
  $('season-leaderboard').innerHTML = results.map((result, i) => {
    const row = result.status === 'fulfilled' ? result.value : { ...selected[i], name: 'Name unavailable' };
    return `<li class="leader-row ${row.id === ATHLETE_ID ? 'is-gibbs' : ''}"><span class="leader-rank">${row.rank}</span><span>${escapeHtml(row.name || 'Name unavailable')}</span><strong>${row.total}</strong></li>`;
  }).join('');
  $('season-rank-label').textContent = gibbs ? `${SEASON} NFL · Gibbs #${gibbs.rank}` : `${SEASON} NFL · ESPN top ${leaders.length}`;
}
function updateStatus() {
  if (loading) return;
  if (lastLoadedAt) $('status').textContent = `Updated ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(lastLoadedAt)}`;
}
async function loadData() {
  if (loading) return;
  loading = true;
  $('refresh-button').disabled = true;
  $('status').textContent = 'Updating ESPN data…';
  const jobs = [
    ['Season stats', async () => { const stats = parseTouchdowns(await fetchJson(`${ESPN_CORE}/seasons/${SEASON}/types/2/athletes/${ATHLETE_ID}/statistics`)); renderSeason(stats); if (stats.mismatch) throw new Error('ESPN total differs from its touchdown breakdown; showing ESPN total'); }],
    ['Career stats', async () => { const stats = parseTouchdowns(await fetchJson(`${ESPN_CORE}/athletes/${ATHLETE_ID}/statistics/0`)); $('career-touchdowns').textContent = stats.total; }],
    ['Game log', loadGameLog],
    ['Leaderboard', loadLeaderboard]
  ];
  const results = await Promise.allSettled(jobs.map(([,job]) => job()));
  for (let i = 0; i < results.length; i++) {
    if (results[i].status !== 'rejected') continue;
    if (i === 2 && $('game-log').textContent.includes('Loading')) { $('game-log').innerHTML = '<tr><td colspan="5" class="empty">Game log unavailable. Refresh to retry.</td></tr>'; $('pace-chart').innerHTML = '<p class="empty">Pace chart unavailable.</p>'; }
    if (i === 3 && $('season-leaderboard').textContent.includes('Loading')) $('season-leaderboard').innerHTML = '<li class="empty">Leaderboard unavailable. Refresh to retry.</li>';
  }
  const failures = results.flatMap((result,i) => result.status === 'rejected' ? [`${jobs[i][0]}: ${result.reason.message}`] : []);
  $('error').hidden = !failures.length;
  $('error').textContent = failures.length ? `${failures.join('. ')}. Refresh to retry; previous successful data is retained.` : '';
  loading = false;
  $('refresh-button').disabled = false;
  if (results[0].status === 'fulfilled') lastLoadedAt = new Date();
  if (failures.length) $('status').textContent = lastLoadedAt ? `Some data unavailable · Season updated ${lastLoadedAt.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})}` : 'Season data unavailable';
  else updateStatus();
}
$('refresh-button').addEventListener('click', loadData);
setInterval(() => { if (!document.hidden) loadData(); }, AUTO_REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden && (!lastLoadedAt || Date.now() - lastLoadedAt.getTime() >= AUTO_REFRESH_MS)) loadData(); });
loadData();
