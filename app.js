/* Aussie Citizenship Test Practice - no build step, no server. Data is stored in this browser (localStorage). */

/* ---------------- Config: mirrors the real test format ---------------- */
const TEST = {
  total: 20,            // questions in the real test
  minutes: 45,          // time limit
  passMark: 15,         // 75% of 20
  valuesQuestions: 5,   // values questions inside the 20 (all must be correct)
  perOtherCategory: 5   // 15 other questions split evenly (the real split is not published)
};
const PLAYERS = ["Jools", "Holly"];
const STORE_KEY = "aussie-citizenship-v1";

/* ---------------- Pure logic (also used by the tests) ---------------- */
function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function prepareQuestion(q, rnd = Math.random) {
  const order = shuffle([0, 1, 2, 3], rnd);                 // order[i] = original option index shown at slot i
  return { id: q.id, cat: q.cat, q: q.q, reason: q.reason,
           options: order.map(i => q.options[i]), correct: order.indexOf(q.answer) };
}
function pick(cat, n, rnd) { return shuffle(QUESTIONS.filter(q => q.cat === cat), rnd).slice(0, n); }
function buildMockTest(rnd = Math.random) {
  const chosen = [
    ...pick("values", TEST.valuesQuestions, rnd),
    ...pick("people", TEST.perOtherCategory, rnd),
    ...pick("democracy", TEST.perOtherCategory, rnd),
    ...pick("government", TEST.perOtherCategory, rnd)
  ];
  return shuffle(chosen, rnd).map(q => prepareQuestion(q, rnd));
}
function gradeAttempt(prepared, answers) {            // answers[i] = chosen slot or null
  let score = 0, valuesCorrect = 0, valuesTotal = 0; const byCat = {};
  prepared.forEach((q, i) => {
    const ok = answers[i] === q.correct;
    byCat[q.cat] = byCat[q.cat] || { right: 0, total: 0 };
    byCat[q.cat].total++;
    if (ok) { score++; byCat[q.cat].right++; }
    if (q.cat === "values") { valuesTotal++; if (ok) valuesCorrect++; }
  });
  const passed = score >= TEST.passMark && valuesCorrect === valuesTotal;
  return { score, total: prepared.length, valuesCorrect, valuesTotal, passed, byCat };
}
function playerStats(attempts) {
  const a = attempts || [];
  const passes = a.filter(x => x.passed);
  return {
    attempts: a.length,
    best: a.length ? Math.max(...a.map(x => x.score)) : 0,
    avg: a.length ? a.reduce((s, x) => s + x.score, 0) / a.length : 0,
    passes: passes.length,
    passRate: a.length ? passes.length / a.length : 0,
    fastestPass: passes.length ? Math.min(...passes.map(x => x.seconds)) : null,
    last: a.length ? a[a.length - 1] : null
  };
}
function rankPlayers(data) {
  return PLAYERS.map(p => ({ name: p, ...playerStats(data.attempts[p]) }))
    .sort((x, y) => (y.best - x.best) || (y.passes - x.passes) || (y.avg - x.avg) ||
      ((x.fastestPass ?? 1e9) - (y.fastestPass ?? 1e9)));
}
function mergeData(base, incoming) {                  // merge attempts by id so two phones can be combined
  PLAYERS.forEach(p => {
    const have = new Set((base.attempts[p] || []).map(a => a.id));
    (incoming.attempts?.[p] || []).forEach(a => { if (!have.has(a.id)) base.attempts[p].push(a); });
    base.attempts[p].sort((x, y) => x.date.localeCompare(y.date));
    Object.entries(incoming.progress?.[p] || {}).forEach(([id, r]) => {
      const cur = base.progress[p][id] || { right: 0, wrong: 0 };
      base.progress[p][id] = { right: Math.max(cur.right, r.right || 0), wrong: Math.max(cur.wrong, r.wrong || 0), last: r.last ?? cur.last };
    });
  });
  return base;
}
function fmtTime(s) { s = Math.max(0, Math.round(s)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }

if (typeof module !== "undefined") {   // test hook
  module.exports = { TEST, shuffle, prepareQuestion, buildMockTest, gradeAttempt, playerStats, rankPlayers, mergeData, fmtTime };
}

/* ---------------- UI ---------------- */
if (typeof document !== "undefined") (function () {
  const app = document.getElementById("app");
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LETTERS = "ABCD";

  /* storage */
  function emptyData() {
    const d = { current: PLAYERS[0], attempts: {}, progress: {} };
    PLAYERS.forEach(p => { d.attempts[p] = []; d.progress[p] = {}; });
    return d;
  }
  function load() {
    try { const d = JSON.parse(localStorage.getItem(STORE_KEY)); if (d && d.attempts) { PLAYERS.forEach(p => { d.attempts[p] ||= []; d.progress[p] ||= {}; }); return d; } } catch (e) {}
    return emptyData();
  }
  let data = load();
  let memoryOnly = false;
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { memoryOnly = true; } }
  const me = () => data.current;

  /* session state */
  let view = "home", mock = null, practice = null, timerId = null;

  function setView(v) { stopTimer(); if (mock && mock.done) mock = null; view = v; render(); window.scrollTo(0, 0); }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  function renderChrome() {
    document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    document.getElementById("players").innerHTML = `<span>Playing as</span>` +
      PLAYERS.map(p => `<button data-player="${p}" class="${p === me() ? "active" : ""}">${p}</button>`).join("");
  }
  function render() {
    renderChrome();
    ({ home: renderHome, mock: renderMock, practice: renderPractice, browse: renderBrowse, leaderboard: renderLeaderboard, about: renderAbout }[view])();
  }

  /* ---- Home ---- */
  function renderHome() {
    const st = playerStats(data.attempts[me()]);
    const seen = Object.keys(data.progress[me()]).length;
    app.innerHTML = `
      <h1>G'day ${esc(me())} 👋</h1>
      <p class="muted">200 practice questions, each with a reason, plus a mock test that copies the real format.</p>
      <div class="card">
        <h2 style="margin-top:0">The real test, as this app copies it</h2>
        <div class="grid">
          <div class="stat"><div class="n">${TEST.total}</div><div class="l">multiple-choice questions</div></div>
          <div class="stat"><div class="n">${TEST.minutes} min</div><div class="l">time limit</div></div>
          <div class="stat"><div class="n">${TEST.passMark}/${TEST.total}</div><div class="l">pass mark (75%)</div></div>
          <div class="stat"><div class="n">5/5</div><div class="l">values questions, all must be right</div></div>
        </div>
        <p class="small muted">Each mock test has 5 values questions and 15 from the other three sections (5 each). The real test picks its 20 questions from a pool of 200.</p>
        <div class="row"><button class="btn gold" data-go="mock">Start a mock test</button><button class="btn alt" data-go="practice">Practise by topic</button></div>
      </div>
      <div class="grid">
        <div class="card stat"><div class="n">${st.attempts}</div><div class="l">mock tests taken</div></div>
        <div class="card stat"><div class="n">${st.attempts ? st.best + "/20" : "–"}</div><div class="l">best score</div></div>
        <div class="card stat"><div class="n">${st.passes}</div><div class="l">passes</div></div>
        <div class="card stat"><div class="n">${seen}/200</div><div class="l">questions practised</div></div>
      </div>
      ${memoryOnly ? `<div class="notice">⚠️ This browser is blocking storage, so scores will be lost when you close the tab.</div>` : ""}`;
  }

  /* ---- Mock test ---- */
  function renderMock() {
    if (!mock) {
      app.innerHTML = `
        <h1>Mock citizenship test</h1>
        <div class="card">
          <ul>
            <li><b>${TEST.total}</b> questions, one at a time, in a mixed order</li>
            <li><b>${TEST.minutes} minutes</b>. The test submits itself when time runs out</li>
            <li>No feedback until you finish (like the real thing)</li>
            <li>To pass: at least <b>${TEST.passMark}</b> correct <b>and</b> all <b>5 values</b> questions correct</li>
          </ul>
          <p>Playing as <b>${esc(me())}</b>. Your result goes on the leaderboard.</p>
          <button class="btn gold" id="startMock">Start test</button>
        </div>`;
      document.getElementById("startMock").onclick = startMock;
      return;
    }
    if (mock.done) return renderMockResult();
    if (!timerId) startTimer();   // resume if the user left this tab and came back
    mock.left = Math.max(0, TEST.minutes * 60 - Math.floor((Date.now() - mock.started) / 1000));
    if (mock.left <= 0) return finishMock();
    const q = mock.qs[mock.i];
    const answered = mock.answers.filter(a => a !== null).length;
    app.innerHTML = `
      <div class="row space">
        <div>Question <b>${mock.i + 1}</b> of ${mock.qs.length} · ${answered} answered</div>
        <div class="timer" id="timer">${fmtTime(mock.left)}</div>
      </div>
      <div class="bar"><i style="width:${(answered / mock.qs.length) * 100}%"></i></div>
      <div class="palette">${mock.qs.map((_, i) => `<button data-jump="${i}" class="${mock.answers[i] !== null ? "done" : ""} ${i === mock.i ? "cur" : ""} ${mock.flags[i] ? "flag" : ""}" aria-label="Question ${i + 1}">${i + 1}</button>`).join("")}</div>
      <div class="card">
        <div class="qtext">${esc(q.q)}</div>
        <div class="opts">${q.options.map((o, k) => `<button class="opt ${mock.answers[mock.i] === k ? "sel" : ""}" data-pick="${k}"><span class="k">${LETTERS[k]}</span><span>${esc(o)}</span></button>`).join("")}</div>
      </div>
      <div class="row space">
        <div class="row"><button class="btn alt" id="prev" ${mock.i === 0 ? "disabled" : ""}>← Back</button>
        <button class="btn alt" id="flag">${mock.flags[mock.i] ? "Unflag" : "⚑ Flag"}</button></div>
        <div class="row">${mock.i < mock.qs.length - 1 ? `<button class="btn" id="next">Next →</button>` : ""}<button class="btn gold" id="finish">Finish test</button></div>
      </div>
      <div id="finishBox"></div>`;
    app.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => { mock.answers[mock.i] = +b.dataset.pick; renderMock(); });
    app.querySelectorAll("[data-jump]").forEach(b => b.onclick = () => { mock.i = +b.dataset.jump; renderMock(); });
    const prev = document.getElementById("prev"), next = document.getElementById("next");
    prev.onclick = () => { mock.i--; renderMock(); };
    if (next) next.onclick = () => { mock.i++; renderMock(); };
    document.getElementById("flag").onclick = () => { mock.flags[mock.i] = !mock.flags[mock.i]; renderMock(); };
    document.getElementById("finish").onclick = () => {
      const left = mock.answers.filter(a => a === null).length;
      document.getElementById("finishBox").innerHTML = `<div class="notice">${left ? `You have <b>${left}</b> unanswered question${left > 1 ? "s" : ""}. ` : ""}Finish and see your result?
        <div class="row" style="margin-top:.5rem"><button class="btn gold" id="yes">Yes, finish</button><button class="btn alt" id="no">Keep going</button></div></div>`;
      document.getElementById("yes").onclick = finishMock;
      document.getElementById("no").onclick = () => { document.getElementById("finishBox").innerHTML = ""; };
    };
  }
  function startMock() {
    mock = { qs: buildMockTest(), i: 0, answers: new Array(TEST.total).fill(null), flags: new Array(TEST.total).fill(false), left: TEST.minutes * 60, started: Date.now(), done: false };
    startTimer();
    renderMock();
  }
  function startTimer() {
    stopTimer();
    timerId = setInterval(() => {
      if (!mock || mock.done) return stopTimer();
      mock.left = Math.max(0, TEST.minutes * 60 - Math.floor((Date.now() - mock.started) / 1000));
      const t = document.getElementById("timer");
      if (t) { t.textContent = fmtTime(mock.left); t.classList.toggle("low", mock.left <= 300); }
      if (mock.left <= 0) finishMock();
    }, 500);
  }
  function finishMock() {
    if (!mock || mock.done) return;
    stopTimer(); mock.done = true;
    const g = gradeAttempt(mock.qs, mock.answers);
    const seconds = Math.min(TEST.minutes * 60, Math.round((Date.now() - mock.started) / 1000));
    mock.result = { ...g, seconds, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), date: new Date().toISOString(), player: me() };
    data.attempts[me()].push(mock.result);
    mock.qs.forEach((q, i) => {
      const r = data.progress[me()][q.id] || { right: 0, wrong: 0 };
      if (mock.answers[i] === q.correct) r.right++; else r.wrong++;
      r.last = mock.answers[i] === q.correct ? "right" : "wrong";
      data.progress[me()][q.id] = r;
    });
    save(); renderMock();
  }
  function renderMockResult() {
    const r = mock.result;
    const cats = Object.entries(r.byCat).map(([c, v]) => `<tr><td>${esc(CATEGORIES[c].short)}</td><td class="num">${v.right}/${v.total}</td></tr>`).join("");
    const why = r.passed ? "You met both requirements." :
      [r.score < TEST.passMark ? `You needed at least ${TEST.passMark} correct overall (you got ${r.score}).` : "",
       r.valuesCorrect < r.valuesTotal ? `You must get all ${r.valuesTotal} values questions right (you got ${r.valuesCorrect}).` : ""].filter(Boolean).join(" ");
    app.innerHTML = `
      <div class="card result-hero">
        <span class="pill ${r.passed ? "pass" : "fail"}">${r.passed ? "PASS" : "NOT YET"}</span>
        <div class="big">${r.score}/${r.total}</div>
        <div>Values questions: <b>${r.valuesCorrect}/${r.valuesTotal}</b> · Time: <b>${fmtTime(r.seconds)}</b></div>
        <p class="muted">${esc(why)}</p>
        <div class="row" style="justify-content:center"><button class="btn gold" id="again">Another test</button><button class="btn alt" data-go="leaderboard">Leaderboard</button></div>
      </div>
      <div class="card"><table><thead><tr><th>Section</th><th class="num">Score</th></tr></thead><tbody>${cats}</tbody></table></div>
      <h2>Review every question</h2>
      <div class="card">${mock.qs.map((q, i) => {
        const ok = mock.answers[i] === q.correct, a = mock.answers[i];
        return `<div class="review-item"><div class="small muted">Q${i + 1} · ${esc(CATEGORIES[q.cat].short)} ${q.cat === "values" ? '<span class="pill values">values</span>' : ""} <span class="${ok ? "tag-ok" : "tag-bad"}">${ok ? "Correct" : a === null ? "Not answered" : "Incorrect"}</span></div>
          <div class="qtext" style="font-size:1rem">${esc(q.q)}</div>
          ${a !== null && !ok ? `<div>Your answer: <span class="tag-bad">${esc(q.options[a])}</span></div>` : ""}
          <div>Correct answer: <span class="tag-ok">${esc(q.options[q.correct])}</span></div>
          <div class="reason"><b>Why:</b> ${esc(q.reason)}</div></div>`; }).join("")}</div>`;
    document.getElementById("again").onclick = () => { mock = null; renderMock(); };
  }

  /* ---- Practice ---- */
  function renderPractice() {
    if (!practice) {
      const prog = data.progress[me()];
      const missed = QUESTIONS.filter(q => prog[q.id] && prog[q.id].last === "wrong").length;
      const fresh = QUESTIONS.filter(q => !prog[q.id]).length;
      app.innerHTML = `
        <h1>Practice</h1>
        <p class="muted">Instant feedback and the reason after every answer.</p>
        <div class="card">
          <div class="row"><label>Topic <select id="pCat">
            <option value="all">All sections (200)</option>
            ${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${esc(v.name)} (${QUESTIONS.filter(q => q.cat === k).length})</option>`).join("")}
            <option value="missed">Questions I got wrong (${missed})</option>
            <option value="fresh">Questions I haven't tried (${fresh})</option>
          </select></label>
          <label>How many <select id="pNum"><option>10</option><option selected>20</option><option>50</option><option value="9999">All</option></select></label></div>
          <p><button class="btn gold" id="pStart">Start practice</button></p>
        </div>`;
      document.getElementById("pStart").onclick = () => {
        const c = document.getElementById("pCat").value, n = +document.getElementById("pNum").value;
        const prog2 = data.progress[me()];
        let pool = QUESTIONS.filter(q => c === "all" || c === q.cat || (c === "missed" && prog2[q.id] && prog2[q.id].last === "wrong") || (c === "fresh" && !prog2[q.id]));
        if (!pool.length) { app.insertAdjacentHTML("beforeend", `<div class="notice">Nothing in that group yet. Pick another topic.</div>`); return; }
        practice = { qs: shuffle(pool).slice(0, n).map(q => prepareQuestion(q)), i: 0, picked: null, right: 0, done: false };
        renderPractice();
      };
      return;
    }
    if (practice.done) {
      app.innerHTML = `<div class="card result-hero"><div class="big">${practice.right}/${practice.qs.length}</div><p>Practice finished.</p>
        <div class="row" style="justify-content:center"><button class="btn gold" id="more">More practice</button><button class="btn alt" data-go="mock">Try a mock test</button></div></div>`;
      document.getElementById("more").onclick = () => { practice = null; renderPractice(); };
      return;
    }
    const q = practice.qs[practice.i], p = practice.picked;
    app.innerHTML = `
      <div class="row space"><div>Question <b>${practice.i + 1}</b> of ${practice.qs.length}</div><div><span class="pill ${q.cat === "values" ? "values" : ""}">${esc(CATEGORIES[q.cat].short)}</span> <button class="btn alt" id="quit" style="padding:.25rem .7rem">End</button></div></div>
      <div class="bar"><i style="width:${(practice.i / practice.qs.length) * 100}%"></i></div>
      <div class="card"><div class="qtext">${esc(q.q)}</div>
        <div class="opts">${q.options.map((o, k) => {
          let cls = ""; if (p !== null) { if (k === q.correct) cls = "right"; else if (k === p) cls = "wrong"; }
          return `<button class="opt ${cls}" data-pick="${k}" ${p !== null ? "disabled" : ""}><span class="k">${LETTERS[k]}</span><span>${esc(o)}</span></button>`; }).join("")}</div>
        ${p !== null ? `<div class="reason"><b>${p === q.correct ? "Correct." : "Not quite."}</b> ${esc(q.reason)}</div>
          <p><button class="btn" id="nextQ">${practice.i < practice.qs.length - 1 ? "Next question →" : "See results"}</button></p>` : ""}</div>`;
    app.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => {
      const k = +b.dataset.pick; practice.picked = k;
      const ok = k === q.correct; if (ok) practice.right++;
      const r = data.progress[me()][q.id] || { right: 0, wrong: 0 };
      ok ? r.right++ : r.wrong++; r.last = ok ? "right" : "wrong"; data.progress[me()][q.id] = r; save();
      renderPractice();
    });
    const nq = document.getElementById("nextQ");
    if (nq) nq.onclick = () => { practice.picked = null; if (practice.i < practice.qs.length - 1) practice.i++; else practice.done = true; renderPractice(); };
    document.getElementById("quit").onclick = () => { practice.done = true; renderPractice(); };
  }

  /* ---- Browse all 200 ---- */
  function renderBrowse() {
    app.innerHTML = `
      <h1>All 200 questions</h1>
      <div class="row"><input type="search" id="bq" placeholder="Search questions…" style="flex:1;min-width:180px">
        <select id="bc"><option value="all">All sections</option>${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${esc(v.short)}</option>`).join("")}</select></div>
      <div id="blist"></div>`;
    const draw = () => {
      const t = document.getElementById("bq").value.toLowerCase(), c = document.getElementById("bc").value;
      const list = QUESTIONS.filter(q => (c === "all" || q.cat === c) && (!t || (q.q + q.options.join(" ") + q.reason).toLowerCase().includes(t)));
      document.getElementById("blist").innerHTML = `<p class="muted small">${list.length} question${list.length === 1 ? "" : "s"}</p>` + list.map(q => `
        <div class="card"><div class="small muted">#${q.id} · ${esc(CATEGORIES[q.cat].short)}</div>
        <div class="qtext" style="font-size:1rem">${esc(q.q)}</div>
        <div><span class="tag-ok">✔ ${esc(q.options[q.answer])}</span></div>
        <div class="small muted">Other options: ${q.options.filter((_, i) => i !== q.answer).map(esc).join(" · ")}</div>
        <div class="reason"><b>Why:</b> ${esc(q.reason)}</div></div>`).join("");
    };
    document.getElementById("bq").oninput = draw; document.getElementById("bc").onchange = draw; draw();
  }

  /* ---- Leaderboard ---- */
  function renderLeaderboard() {
    const ranked = rankPlayers(data);
    const medals = ["🥇", "🥈"];
    const anyone = ranked.some(r => r.attempts);
    const log = PLAYERS.flatMap(p => data.attempts[p].map(a => ({ ...a, player: p }))).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 15);
    app.innerHTML = `
      <h1>Leaderboard 🏆</h1>
      <p class="muted small">Ranked by best mock-test score, then passes, then average. Ties go to the faster pass.</p>
      <div class="card">${anyone ? `<table><thead><tr><th></th><th>Player</th><th class="num">Best</th><th class="num">Avg</th><th class="num">Passes</th><th class="num">Tests</th><th class="num">Fastest pass</th></tr></thead><tbody>
        ${ranked.map((r, i) => `<tr><td class="crown">${r.attempts ? medals[i] : ""}</td><td><b>${esc(r.name)}</b></td><td class="num">${r.attempts ? r.best + "/20" : "–"}</td><td class="num">${r.attempts ? r.avg.toFixed(1) : "–"}</td><td class="num">${r.passes}</td><td class="num">${r.attempts}</td><td class="num">${r.fastestPass != null ? fmtTime(r.fastestPass) : "–"}</td></tr>`).join("")}</tbody></table>`
        : `<p>No mock tests yet. Take one and your score lands here.</p>`}</div>
      <h2>Recent tests</h2>
      <div class="card">${log.length ? `<table><thead><tr><th>When</th><th>Player</th><th class="num">Score</th><th class="num">Values</th><th>Result</th></tr></thead><tbody>
        ${log.map(a => `<tr><td>${new Date(a.date).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td>${esc(a.player)}</td><td class="num">${a.score}/${a.total}</td><td class="num">${a.valuesCorrect}/${a.valuesTotal}</td><td><span class="pill ${a.passed ? "pass" : "fail"}">${a.passed ? "Pass" : "Not yet"}</span></td></tr>`).join("")}</tbody></table>` : `<p class="muted">Nothing yet.</p>`}</div>
      <h2>Playing on two phones?</h2>
      <div class="card">
        <p class="small muted">Scores are saved on the device you use. To combine them, copy the code from one device and paste it into the other. Do it both ways and both leaderboards match.</p>
        <div class="row"><button class="btn alt" id="exp">Copy my code</button><button class="btn alt" id="imp">Merge pasted code</button></div>
        <textarea id="code" placeholder="Code appears here, or paste your partner's code and tap Merge"></textarea>
        <div id="msg" class="small"></div>
        <p><button class="btn alt" id="reset" style="color:var(--bad);border-color:var(--bad)">Reset scores on this device</button></p>
      </div>`;
    const code = document.getElementById("code"), msg = document.getElementById("msg");
    document.getElementById("exp").onclick = async () => {
      code.value = btoa(unescape(encodeURIComponent(JSON.stringify({ attempts: data.attempts, progress: data.progress }))));
      try { await navigator.clipboard.writeText(code.value); msg.textContent = "Copied. Paste it on the other device."; } catch (e) { code.select(); msg.textContent = "Select and copy the code above."; }
    };
    document.getElementById("imp").onclick = () => {
      try { const inc = JSON.parse(decodeURIComponent(escape(atob(code.value.trim())))); mergeData(data, inc); save(); msg.textContent = "Merged!"; setTimeout(renderLeaderboard, 600); }
      catch (e) { msg.textContent = "That code didn't work. Copy it again in full."; }
    };
    document.getElementById("reset").onclick = () => {
      if (document.getElementById("reset").dataset.sure) { data = emptyData(); save(); renderLeaderboard(); }
      else { document.getElementById("reset").dataset.sure = 1; document.getElementById("reset").textContent = "Tap again to erase everything"; }
    };
  }

  /* ---- About ---- */
  function renderAbout() {
    app.innerHTML = `
      <h1>About and sources</h1>
      <div class="card">
        <h2 style="margin-top:0">Where do these questions come from?</h2>
        <p>The real test draws its 20 questions from a <b>confidential pool of 200</b>, so nobody outside the Department of Home Affairs can publish the real ones. These 200 questions are <b>original</b>. Each was written from the facts in the official study booklet, <i>Australian Citizenship: Our Common Bond</i>, which the Department says the test is based on.</p>
        <p>Every question is tagged to one of the four booklet sections: Australia and its people; democratic beliefs, rights and liberties; government and the law; and Australian values.</p>
        <p><a href="https://immi.homeaffairs.gov.au/citizenship-subsite/files/our-common-bond-testable.pdf" target="_blank" rel="noopener">Our Common Bond (testable section, PDF)</a><br>
        <a href="https://citizenshippracticetest.homeaffairs.gov.au/" target="_blank" rel="noopener">Official practice test from Home Affairs</a></p>
      </div>
      <div class="card">
        <h2 style="margin-top:0">What matches the real test, and what doesn't</h2>
        <ul>
          <li><b>Matches:</b> 20 multiple-choice questions, 45 minutes, 75% pass mark (15/20), 5 values questions that must all be correct.</li>
          <li><b>Assumption:</b> the Department doesn't publish how many of the other 15 questions come from each section, so the mock test uses 5 from each.</li>
          <li><b>Differs:</b> the wording of real questions. Always read the booklet and try the official practice test too.</li>
        </ul>
        <p class="small muted">Facts like office-holders and numbers can change. Check the current booklet before you sit the real test.</p>
      </div>`;
  }

  /* ---- Global events ---- */
  document.addEventListener("click", e => {
    const go = e.target.closest("[data-go]"); if (go) return setView(go.dataset.go);
    const nav = e.target.closest("#nav button"); if (nav) return setView(nav.dataset.view);
    const pl = e.target.closest("[data-player]");
    if (pl) {
      if (mock && !mock.done) { alert("Finish or submit the test in progress before switching player."); return; }
      data.current = pl.dataset.player; save(); practice = null; if (mock && mock.done) mock = null; render();
    }
  });
  document.getElementById("brand").onclick = () => setView("home");
  render();
})();
