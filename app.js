/* 诸子百家 · 任务仪 — snapshot replay instrument */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var BEAT_MS_DEFAULT = 1600;
  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  var COLORS = {
    active: "#dda17b",
    activeSoft: "#f0e4d6",
    activeInk: "#975334",
    wait: "#956447",
    waitSoft: "#eaeadd",
    waitInk: "#73513a",
    done: "#abd0c6",
    doneSoft: "#dceee9",
    doneInk: "#264c3b",
    unknown: "#69716a",
    unknownSoft: "#e3e7d9",
    unknownInk: "#3a4038",
    ink: "#202b28",
    ink2: "#69716a",
    ink3: "#7d8b7d",
    line: "#d6d8ce",
    metal: "#eaeadd",
    metalHi: "#e3e7d9",
    metalLo: "#bcc5b5",
    paper: "#f4f1e9",
    raised: "#fcfaf5",
    dark: "#141918"
  };

  var STREAM_HUE = {
    speech: "#b5838d",
    film: "#6a8a8e",
    loopos: "#7a86a0",
    console: "#7e9576",
    kindling: "#c0845a",
    hud: "#dda17b"
  };

  var VIEW_LABELS = {
    dial: "转盘",
    loom: "织机",
    factory: "流水线",
    chips: "牌桌",
    rhythm: "节拍",
    hive: "蜂群"
  };

  var STREAM_SHORT = {
    speech: "分享稿",
    film: "短片",
    loopos: "LoopOS",
    console: "观察台",
    kindling: "火种",
    hud: "任务仪"
  };

  function shortStreamLabel(streamId, fallback) {
    return STREAM_SHORT[streamId] || fallback || "";
  }

  function parcelLabel(p) {
    if (p.unverified) return "未核实";
    if (p.streamId && STREAM_SHORT[p.streamId]) return STREAM_SHORT[p.streamId];
    var t = p.title || "";
    return t.length <= 4 ? t : t.slice(0, 3) + "…";
  }

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  function easeOut(t) { return 1 - (1 - t) * (1 - t); }
  function nowMs() { return performance.now(); }

  function svg(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v == null) continue;
        if (k === "text") n.textContent = v;
        else if (k === "href") n.setAttributeNS("http://www.w3.org/1999/xlink", "href", v);
        else n.setAttribute(k, String(v));
      }
    }
    if (parent) parent.appendChild(n);
    return n;
  }

  function empty(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function polar(cx, cy, r, deg) {
    var a = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }

  function arcPath(cx, cy, r, a0, a1, ccw) {
    var p0 = polar(cx, cy, r, a0);
    var p1 = polar(cx, cy, r, a1);
    var delta = ccw ? a0 - a1 : a1 - a0;
    var large = Math.abs(delta) > 180 ? 1 : 0;
    var sweep = ccw ? 0 : 1;
    return "M " + p0.x + " " + p0.y + " A " + r + " " + r + " 0 " + large + " " + sweep + " " + p1.x + " " + p1.y;
  }

  function ringSegment(cx, cy, r0, r1, a0, a1) {
    var p0 = polar(cx, cy, r0, a0);
    var p1 = polar(cx, cy, r0, a1);
    var p2 = polar(cx, cy, r1, a1);
    var p3 = polar(cx, cy, r1, a0);
    var large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    return (
      "M " + p0.x + " " + p0.y +
      " A " + r0 + " " + r0 + " 0 " + large + " 1 " + p1.x + " " + p1.y +
      " L " + p2.x + " " + p2.y +
      " A " + r1 + " " + r1 + " 0 " + large + " 0 " + p3.x + " " + p3.y +
      " Z"
    );
  }

  function roundedRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    return (
      "M " + (x + r) + " " + y +
      " H " + (x + w - r) +
      " A " + r + " " + r + " 0 0 1 " + (x + w) + " " + (y + r) +
      " V " + (y + h - r) +
      " A " + r + " " + r + " 0 0 1 " + (x + w - r) + " " + (y + h) +
      " H " + (x + r) +
      " A " + r + " " + r + " 0 0 1 " + x + " " + (y + h - r) +
      " V " + (y + r) +
      " A " + r + " " + r + " 0 0 1 " + (x + r) + " " + y +
      " Z"
    );
  }

  function orthoPipe(points, radius) {
    if (!points || points.length < 2) return "";
    radius = radius == null ? 10 : radius;
    var d = "M " + points[0][0] + " " + points[0][1];
    for (var i = 1; i < points.length - 1; i++) {
      var x0 = points[i - 1][0], y0 = points[i - 1][1];
      var x1 = points[i][0], y1 = points[i][1];
      var x2 = points[i + 1][0], y2 = points[i + 1][1];
      var dx1 = x1 - x0, dy1 = y1 - y0;
      var dx2 = x2 - x1, dy2 = y2 - y1;
      var len1 = Math.hypot(dx1, dy1) || 1;
      var len2 = Math.hypot(dx2, dy2) || 1;
      var r = Math.min(radius, len1 / 2, len2 / 2);
      var sx = x1 - (dx1 / len1) * r;
      var sy = y1 - (dy1 / len1) * r;
      var ex = x1 + (dx2 / len2) * r;
      var ey = y1 + (dy2 / len2) * r;
      d += " L " + sx + " " + sy + " Q " + x1 + " " + y1 + " " + ex + " " + ey;
    }
    var last = points[points.length - 1];
    d += " L " + last[0] + " " + last[1];
    return d;
  }

  function statusKind(status) {
    if (status === "进行中") return "active";
    if (status === "等待义情") return "wait";
    if (status === "验收未完成") return "incomplete";
    if (status === "未核实") return "unknown";
    return "done";
  }

  function statusColor(status, soft) {
    var k = statusKind(status);
    if (k === "active") return soft ? COLORS.activeSoft : COLORS.active;
    if (k === "wait") return soft ? COLORS.waitSoft : COLORS.wait;
    if (k === "incomplete") return soft ? COLORS.waitSoft : COLORS.wait;
    if (k === "unknown") return soft ? COLORS.unknownSoft : COLORS.unknown;
    return soft ? COLORS.doneSoft : COLORS.done;
  }

  function statusInk(status) {
    var k = statusKind(status);
    if (k === "active") return COLORS.activeInk;
    if (k === "wait") return COLORS.waitInk;
    if (k === "incomplete") return COLORS.waitInk;
    if (k === "unknown") return COLORS.unknownInk;
    return COLORS.doneInk;
  }

  function shortStatus(status) {
    if (status === "进行中") return "进行中";
    if (status === "等待义情") return "等待";
    if (status === "验收未完成") return "未验收";
    if (status === "未核实") return "未核实";
    if (status === "已交付切片" || status === "近期已交") return "已交";
    if (status === "协作中") return "协作中";
    if (status === "待平台修复") return "待修复";
    return status || "—";
  }

  function isVerifiedStatus(status) {
    return status && status !== "未核实";
  }

  function streamColor(id) {
    return STREAM_HUE[id] || COLORS.metalLo;
  }

  function agentById(id) {
    if (!state.data || !id) return null;
    for (var i = 0; i < state.data.agents.length; i++) {
      if (state.data.agents[i].id === id) return state.data.agents[i];
    }
    return null;
  }

  function streamById(id) {
    if (!state.data || !id) return null;
    for (var i = 0; i < state.data.streams.length; i++) {
      if (state.data.streams[i].id === id) return state.data.streams[i];
    }
    return null;
  }

  function pipelineCount(id) {
    var stages = (state.data && state.data.pipeline && state.data.pipeline.stages) || [];
    for (var i = 0; i < stages.length; i++) if (stages[i].id === id) return stages[i].count;
    return 0;
  }

  /* ---------- state ---------- */
  var state = {
    data: null,
    allBeats: [],
    beats: [],
    view: "dial",
    playing: true,
    beatIndex: 0,
    phase: 0,
    acc: 0,
    lastTs: 0,
    loopCount: 0,
    pinnedAgentId: null,
    held: null,
    combo: 0,
    maxCombo: 0,
    particles: [],
    source: "embedded"
  };

  /* ---------- data load ---------- */
  function parseSnapshot(text) {
    var data = typeof text === "string" ? JSON.parse(text) : text;
    if (!data || !data.agents || !data.streams) throw new Error("快照缺少 agents 或 streams");
    return data;
  }

  function loadData() {
    return new Promise(function (resolve) {
      var embedded = function () {
        var el = document.getElementById("embedded-snapshot");
        var data = parseSnapshot(el.textContent);
        state.source = "embedded";
        return data;
      };
      try {
        fetch("snapshot.json", { cache: "no-store" })
          .then(function (res) {
            if (!res.ok) throw new Error("fetch failed");
            return res.json();
          })
          .then(function (data) {
            if (!data || !data.agents) throw new Error("bad json");
            state.source = "file";
            resolve(data);
          })
          .catch(function () {
            resolve(embedded());
          });
      } catch (e) {
        resolve(embedded());
      }
    });
  }

  function applyData(data) {
    state.data = data;
    state.allBeats = buildBeats(data);
    refreshVisibleBeats(true);
    var hon = document.getElementById("honesty");
    if (hon) hon.textContent = data.honesty || "";
  }

  function buildBeats(data) {
    var beats = [];
    var A = {};
    var S = {};
    data.agents.forEach(function (a) { A[a.id] = a; });
    data.streams.forEach(function (s) { S[s.id] = s; });

    function incBeat(inc) {
      var st = "等待义情";
      if (inc.agentId && A[inc.agentId]) st = A[inc.agentId].status;
      else if (inc.streamId && S[inc.streamId]) st = S[inc.streamId].status;
      return {
        type: "incoming",
        agentId: inc.agentId || null,
        streamId: inc.streamId || null,
        status: st,
        title: inc.tag,
        kicker: "来件 · " + inc.time,
        text: inc.text,
        source: inc.source,
        time: inc.time,
        unverified: false,
        incoming: inc
      };
    }
    function agentBeat(a) {
      return {
        type: "agent",
        agentId: a.id,
        streamId: (a.streamIds && a.streamIds[0]) || null,
        status: a.status,
        title: a.name,
        kicker: a.title,
        text: a.current,
        source: a.name,
        time: a.updated,
        unverified: a.status === "未核实",
        agent: a
      };
    }
    function streamBeat(s) {
      var agent = null;
      for (var i = 0; i < data.agents.length; i++) {
        var ids = data.agents[i].streamIds || [];
        if (ids.indexOf(s.id) !== -1) { agent = data.agents[i]; break; }
      }
      return {
        type: "stream",
        agentId: agent ? agent.id : null,
        streamId: s.id,
        status: s.status,
        title: s.name,
        kicker: "工作线",
        text: s.detail,
        source: s.name,
        time: s.updated,
        unverified: false,
        stream: s
      };
    }

    function findInc(time) {
      for (var i = 0; i < data.incoming.length; i++) {
        if (data.incoming[i].time === time) return data.incoming[i];
      }
      return null;
    }

    var i0740 = findInc("07:40");
    var i0730 = findInc("07:30");
    var i1116 = findInc("11-16");
    var i1115 = findInc("11-15 21:03");
    var i1114w = findInc("11-14 18:09");
    var i1114f = findInc("11-14 11:28");

    if (i0740) beats.push(incBeat(i0740));
    if (A.mozi) beats.push(agentBeat(A.mozi));
    if (S.hud) beats.push(streamBeat(S.hud));
    if (i0730) beats.push(incBeat(i0730));

    if (i1114f) beats.push(incBeat(i1114f));
    if (A.zhuangzi) beats.push(agentBeat(A.zhuangzi));
    if (S.film) beats.push(streamBeat(S.film));

    if (i1115) beats.push(incBeat(i1115));
    if (A.huizi) beats.push(agentBeat(A.huizi));
    if (A.xunzi) beats.push(agentBeat(A.xunzi));
    if (A.suqin) beats.push(agentBeat(A.suqin));
    if (S.speech) beats.push(streamBeat(S.speech));
    if (i1114w) beats.push(incBeat(i1114w));
    if (i1116) beats.push(incBeat(i1116));

    if (S.loopos) beats.push(streamBeat(S.loopos));
    if (S.console) beats.push(streamBeat(S.console));
    if (S.kindling) beats.push(streamBeat(S.kindling));
    if (A.codex) beats.push(agentBeat(A.codex));

    ["luban", "laozi", "sunzi", "gongsunlong", "fanli", "hermes"].forEach(function (id) {
      if (A[id]) beats.push(agentBeat(A[id]));
    });

    beats.forEach(function (b, i) { b.index = i; });
    return beats;
  }

  function refreshVisibleBeats(reset) {
    var all = state.allBeats;
    if (!state.pinnedAgentId) {
      state.beats = all.slice();
    } else {
      var a = agentById(state.pinnedAgentId);
      var sids = (a && a.streamIds) || [];
      state.beats = all.filter(function (b) {
        if (b.agentId === state.pinnedAgentId) return true;
        if (b.streamId && sids.indexOf(b.streamId) !== -1) return true;
        return false;
      });
      if (!state.beats.length && a) {
        state.beats = all.filter(function (b) { return b.agentId === a.id; });
      }
    }
    if (reset || state.beatIndex >= state.beats.length) state.beatIndex = 0;
    var total = document.getElementById("beat-total");
    if (total) total.textContent = String(state.beats.length);
  }

  function currentBeat() {
    if (!state.beats.length) return null;
    return state.beats[state.beatIndex] || null;
  }

  /* ---------- clock ---------- */
  function beatDuration() {
    return reduceMotion ? 2400 : BEAT_MS_DEFAULT;
  }

  function setPlaying(p) {
    state.playing = !!p;
    var btn = document.getElementById("btn-play");
    var lab = document.getElementById("play-label");
    if (btn) btn.setAttribute("aria-pressed", state.playing ? "true" : "false");
    if (lab) lab.textContent = state.playing ? "回放中" : "已暂停";
  }

  function landBeat(beat, isLoopWrap) {
    if (!beat) return;
    if (isLoopWrap) state.loopCount += 1;
    if (isVerifiedStatus(beat.status) && !beat.unverified) {
      state.combo += 1;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    } else {
      state.combo = 0;
    }
    if (state.pinnedAgentId) {
      showAgentDetail(state.pinnedAgentId, { kicker: "已锁定" });
    } else {
      state.held = null;
      showFromBeat(beat);
    }
    renderChrome();
    if (Views[state.view] && Views[state.view].onBeat) {
      Views[state.view].onBeat(beat, isLoopWrap);
    }
    if (state.view !== "loom" && Views.loom && Views.loom.onBeat) Views.loom.onBeat(beat, isLoopWrap);
    if (state.view !== "factory" && Views.factory && Views.factory.onBeat) Views.factory.onBeat(beat, isLoopWrap);
    if (state.view !== "rhythm" && Views.rhythm && Views.rhythm.onBeat) Views.rhythm.onBeat(beat, isLoopWrap);
    if (state.view !== "chips" && Views.chips && Views.chips.onBeat) Views.chips.onBeat(beat, isLoopWrap);
  }

  function advanceBeat() {
    if (!state.beats.length) return;
    var wrap = false;
    state.beatIndex += 1;
    if (state.beatIndex >= state.beats.length) {
      state.beatIndex = 0;
      wrap = true;
    }
    state.phase = 0;
    state.acc = 0;
    landBeat(currentBeat(), wrap);
  }

  function tick(ts) {
    if (!state.lastTs) state.lastTs = ts;
    var dt = ts - state.lastTs;
    state.lastTs = ts;
    if (dt > 100) dt = 100;
    var dur = beatDuration();
    if (state.playing) {
      state.acc += dt;
      if (state.acc >= dur) {
        var n = Math.floor(state.acc / dur);
        state.acc = state.acc % dur;
        for (var i = 0; i < n; i++) advanceBeat();
      }
      state.phase = state.acc / dur;
    }
    drawActive(ts, dt);
    requestAnimationFrame(tick);
  }

  function renderChrome() {
    var num = document.getElementById("beat-num");
    if (num) num.textContent = String((state.beatIndex % Math.max(state.beats.length, 1)) + 1);
    var total = document.getElementById("beat-total");
    if (total) total.textContent = String(state.beats.length);
  }

  /* ---------- detail ---------- */
  function setPip(el, kind) {
    if (!el) return;
    el.className = "pip k-" + (kind || "unknown");
  }

  function renderStreams(ids) {
    var box = document.getElementById("detail-streams");
    if (!box) return;
    empty(box);
    (ids || []).forEach(function (id) {
      var s = streamById(id);
      if (!s) return;
      var chip = document.createElement("span");
      chip.className = "stream-chip k-" + statusKind(s.status);
      chip.textContent = s.name;
      box.appendChild(chip);
    });
  }

  function renderEvidence(list) {
    var box = document.getElementById("detail-evidence");
    if (!box) return;
    empty(box);
    if (!list || !list.length) return;
    var heading = document.createElement("div");
    heading.className = "ev-label";
    heading.textContent = "证据";
    box.appendChild(heading);
    list.forEach(function (ev) {
      if (!ev || !ev.url) return;
      var row = document.createElement("div");
      row.className = "ev-row";
      if (ev.date) {
        var d = document.createElement("span");
        d.className = "ev-date";
        d.textContent = ev.date;
        row.appendChild(d);
        row.appendChild(document.createTextNode(" "));
      }
      var a = document.createElement("a");
      a.href = ev.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = ev.label || ev.url;
      row.appendChild(a);
      box.appendChild(row);
    });
  }

  function fillDetail(opt) {
    $("#detail-kicker").textContent = opt.kicker || "当前拍";
    $("#detail-name").textContent = opt.name || "—";
    var title = opt.title || "";
    if (opt.affiliation) title = opt.affiliation + (title ? " · " + title : "");
    $("#detail-title").textContent = title;
    var st = $("#detail-status");
    var kind = statusKind(opt.status);
    st.textContent = opt.status || "—";
    st.className = "card-status k-" + kind;
    setPip($("#detail-pip"), kind);
    var upd = $("#detail-updated");
    upd.textContent = opt.updated ? "更新 " + opt.updated : "";
    $("#detail-current").textContent = opt.current || "";
    $("#detail-body").textContent = opt.detail || "";
    renderEvidence(opt.evidence || []);
    renderStreams(opt.streamIds || []);
    var unpin = document.getElementById("btn-unpin");
    if (unpin) unpin.hidden = !state.pinnedAgentId;
  }

  function showAgentDetail(id, extra) {
    var a = agentById(id);
    if (!a) return;
    fillDetail({
      kicker: (extra && extra.kicker) || a.title,
      name: a.name,
      title: a.title,
      affiliation: a.affiliation || "",
      status: a.status,
      updated: a.updated,
      current: a.current,
      detail: a.detail,
      streamIds: a.streamIds || [],
      evidence: a.evidence || []
    });
  }

  function showStreamDetail(id, extra) {
    var s = streamById(id);
    if (!s) return;
    var linked = state.data.agents.filter(function (a) {
      return (a.streamIds || []).indexOf(s.id) !== -1;
    }).map(function (a) { return a.name; });
    fillDetail({
      kicker: (extra && extra.kicker) || "工作线",
      name: s.name,
      title: linked.length ? "相关：" + linked.join("、") : "工作线",
      status: s.status,
      updated: s.updated,
      current: s.detail,
      detail: "",
      streamIds: [s.id]
    });
  }

  function showIncomingDetail(beat, extra) {
    var inc = beat.incoming || beat;
    fillDetail({
      kicker: (extra && extra.kicker) || ("来件 · " + (inc.time || "")),
      name: inc.tag || "来件",
      title: inc.source || "",
      status: beat.status,
      updated: inc.time,
      current: inc.text,
      detail: "",
      streamIds: inc.streamId ? [inc.streamId] : []
    });
  }

  function showFromBeat(beat) {
    if (!beat) return;
    if (beat.type === "agent") showAgentDetail(beat.agentId, { kicker: "智能体 · 当前拍" });
    else if (beat.type === "stream") showStreamDetail(beat.streamId, { kicker: "工作线 · 当前拍" });
    else showIncomingDetail(beat, { kicker: beat.kicker });
  }

  function pinAgent(id) {
    if (state.pinnedAgentId === id) {
      state.pinnedAgentId = null;
      state.held = null;
      refreshVisibleBeats(false);
      showFromBeat(currentBeat());
    } else {
      state.pinnedAgentId = id;
      state.held = { type: "agent", id: id };
      refreshVisibleBeats(true);
      state.acc = 0;
      state.phase = 0;
      showAgentDetail(id, { kicker: "已锁定" });
      landBeat(currentBeat(), false);
    }
    renderChrome();
  }

  function holdItem(held) {
    state.held = held;
    if (held.type === "agent") {
      showAgentDetail(held.id, { kicker: "查看" });
    } else if (held.type === "stream") {
      showStreamDetail(held.id, { kicker: "工作线" });
    }
  }

  /* ---------- particles (shared, drawn by views) ---------- */
  function spawnSparks(x, y, color, n, speed) {
    n = n || 14;
    speed = speed || 1;
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2;
      var sp = (0.4 + Math.random() * 1.4) * speed;
      state.particles.push({
        x: x, y: y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 0.4,
        life: 1,
        decay: 0.018 + Math.random() * 0.02,
        color: color,
        r: 1.2 + Math.random() * 1.8
      });
    }
  }

  function stepParticles(dt) {
    var arr = state.particles;
    for (var i = arr.length - 1; i >= 0; i--) {
      var p = arr[i];
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      p.vy += 0.012 * dt * 0.06;
      p.life -= p.decay * dt * 0.06;
      if (p.life <= 0) arr.splice(i, 1);
    }
    if (arr.length > 220) arr.splice(0, arr.length - 220);
  }

  function drawParticlesIn(g) {
    empty(g);
    state.particles.forEach(function (p) {
      svg("circle", {
        cx: p.x, cy: p.y, r: p.r,
        fill: p.color,
        opacity: String(Math.max(0, p.life) * 0.85)
      }, g);
    });
  }

  /* ---------- views registry ---------- */
  var Views = {};

  function setView(name) {
    if (!Views[name]) return;
    state.view = name;
    try {
      if ((location.hash || "").replace(/^#/, "") !== name) {
        history.replaceState(null, "", (location.search || "") + "#" + name);
      }
    } catch (e) {}
    state.particles = [];
    var stage = document.getElementById("stage");
    stage.className = "layout-" + name;
    $all(".tab").forEach(function (t) {
      var on = t.getAttribute("data-view") === name;
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    $all(".view").forEach(function (v) {
      var on = v.getAttribute("data-view") === name;
      v.classList.toggle("active", on);
      if (on) v.removeAttribute("hidden");
      else v.setAttribute("hidden", "");
    });
    if (Views[name].show) Views[name].show();
  }

  function drawActive(ts, dt) {
    stepParticles(dt);
    var v = Views[state.view];
    if (v && v.draw) v.draw(ts, dt);
  }


  /* =========================================================
     转盘
     ========================================================= */
  Views.dial = (function () {
    var root, svgRoot, gTicks, gSegs, gLabels, gNeedle, gPipes, gTanks, gSparks, hitLayer;
    var CX = -80, CY = 430;
    var R_IN = 300, R_WIN0 = 340, R_WIN1 = 520, R_TICK = 558, R_OUT = 586;
    var A0 = -50, A1 = 64;
    var needleAngle = 0;
    var needleTarget = 0;
    var ready = false;

    function agentAngle(index, n) {
      var span = A1 - A0;
      var step = span / n;
      return A0 + step * (index + 0.5);
    }

    function setup() {
      root = document.getElementById("view-dial");
      empty(root);
      svgRoot = svg("svg", {
        class: "instrument",
        viewBox: "0 0 1440 820",
        preserveAspectRatio: "xMidYMid meet",
        role: "img",
        "aria-label": "转盘任务仪"
      }, root);
      var defs = svg("defs", {}, svgRoot);
      var grad = svg("linearGradient", { id: "dialMetal", x1: "0", y1: "0", x2: "1", y2: "1" }, defs);
      svg("stop", { offset: "0%", "stop-color": "#fcfaf5" }, grad);
      svg("stop", { offset: "100%", "stop-color": "#e3e7d9" }, grad);
      var glow = svg("radialGradient", { id: "segGlow", cx: "50%", cy: "50%", r: "50%" }, defs);
      svg("stop", { offset: "0%", "stop-color": "#fff", "stop-opacity": "0.7" }, glow);
      svg("stop", { offset: "100%", "stop-color": "#fff", "stop-opacity": "0" }, glow);

      /* outer body rings */
      svg("path", {
        d: ringSegment(CX, CY, R_IN - 24, R_OUT + 8, A0 - 4, A1 + 4),
        fill: "#eaeadd",
        stroke: "#d6d8ce",
        "stroke-width": 1
      }, svgRoot);

      gPipes = svg("g", { class: "pipes" }, svgRoot);
      gTanks = svg("g", { class: "tanks" }, svgRoot);
      gTicks = svg("g", { class: "ticks" }, svgRoot);
      gSegs = svg("g", { class: "segs" }, svgRoot);
      gLabels = svg("g", { class: "labs" }, svgRoot);
      gNeedle = svg("g", { class: "needle" }, svgRoot);
      gSparks = svg("g", { class: "sparks" }, svgRoot);
      hitLayer = svg("g", { class: "hits" }, svgRoot);

      drawStaticTicks();
      drawPipesAndTanks();
      ready = true;
    }

    function drawStaticTicks() {
      empty(gTicks);
      /* rail rings */
      [R_IN, R_WIN0, R_WIN1, R_TICK, R_OUT].forEach(function (r, i) {
        svg("path", {
          d: arcPath(CX, CY, r, A0 - 2, A1 + 2),
          fill: "none",
          stroke: i === 3 || i === 4 ? "#9eaa9c" : "#d6d8ce",
          "stroke-width": i === 4 ? 1.4 : 0.8
        }, gTicks);
      });
      /* degree-like ticks along outer scale */
      var startNum = 340;
      for (var a = A0; a <= A1 + 0.01; a += 1) {
        var major = Math.round(a - A0) % 10 === 0;
        var mid = Math.round(a - A0) % 5 === 0;
        var r0 = R_TICK;
        var r1 = major ? R_TICK + 16 : mid ? R_TICK + 10 : R_TICK + 5;
        var p0 = polar(CX, CY, r0, a);
        var p1 = polar(CX, CY, r1, a);
        svg("line", {
          x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y,
          stroke: "#69716a",
          "stroke-width": major ? 1.1 : 0.5,
          opacity: major ? "0.85" : "0.55"
        }, gTicks);
        if (major) {
          var idx = Math.round((a - A0) / 10);
          var label = String((startNum + idx * 10) % 1000).padStart(3, "0");
          var pt = polar(CX, CY, R_TICK + 28, a);
          svg("text", {
            x: pt.x, y: pt.y,
            fill: "#7d8b7d",
            "font-size": 10,
            "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            text: label
          }, gTicks);
        }
      }
      /* inner perforation dots */
      for (var b = A0; b <= A1 + 0.01; b += 2.4) {
        var d0 = polar(CX, CY, R_IN - 10, b);
        svg("circle", { cx: d0.x, cy: d0.y, r: 1.4, fill: "#bcc5b5" }, gTicks);
      }
    }

    function drawPipesAndTanks() {
      empty(gPipes);
      empty(gTanks);
      /* pipes from mid-dial to card and tanks */
      var attach = polar(CX, CY, R_OUT + 2, 8);
      var attach2 = polar(CX, CY, R_OUT + 2, 22);
      var attach3 = polar(CX, CY, R_OUT + 2, 36);

      function pipe(pts, color, w) {
        svg("path", {
          d: orthoPipe(pts, 14),
          fill: "none",
          stroke: color || "#d6d8ce",
          "stroke-width": w || 5,
          "stroke-linecap": "round",
          "stroke-linejoin": "round"
        }, gPipes);
        svg("path", {
          d: orthoPipe(pts, 14),
          fill: "none",
          stroke: "rgba(255,255,255,0.55)",
          "stroke-width": (w || 5) - 3,
          "stroke-linecap": "round"
        }, gPipes);
      }

      pipe([[attach.x, attach.y], [920, attach.y], [920, 70], [1080, 70], [1080, 92]], "#dda17b", 5);
      pipe([[attach2.x, attach2.y], [880, attach2.y], [880, 520], [1040, 520], [1040, 560]], "#dda17b", 4.5);
      pipe([[attach3.x, attach3.y], [860, attach3.y], [860, 640], [1180, 640]], "#abd0c6", 4.5);
      pipe([[1180, 640], [1180, 700], [1288, 700]], "#abd0c6", 4);

      var tanks = [
        { x: 1000, y: 560, w: 70, h: 150, label: "进行中", count: pipelineCount("active"), kind: "active", shape: "flask" },
        { x: 1110, y: 540, w: 80, h: 170, label: "等待义情", count: pipelineCount("waiting"), kind: "wait", shape: "round" },
        { x: 1230, y: 500, w: 54, h: 210, label: "已交", count: pipelineCount("delivered"), kind: "done", shape: "col" },
        { x: 1310, y: 560, w: 54, h: 150, label: "未核实", count: pipelineCount("unknown"), kind: "unknown", shape: "col" }
      ];

      tanks.forEach(function (t) {
        var color = COLORS[t.kind];
        var soft = COLORS[t.kind + "Soft"];
        var max = 6;
        var fillH = (t.count / max) * (t.h - 28);

        if (t.shape === "round") {
          svg("rect", { x: t.x + 18, y: t.y + 70, width: 44, height: t.h - 70, rx: 6, fill: "#eaeadd", stroke: "#d6d8ce" }, gTanks);
          svg("ellipse", { cx: t.x + 40, cy: t.y + 70, rx: 36, ry: 36, fill: "#fcfaf5", stroke: "#d6d8ce", "stroke-width": 1.2 }, gTanks);
          svg("ellipse", { cx: t.x + 40, cy: t.y + 70, rx: 28, ry: 28, fill: soft, stroke: color, "stroke-width": 1, opacity: 0.95 }, gTanks);
          var level = t.y + t.h - 8 - fillH;
          svg("rect", { x: t.x + 22, y: level, width: 36, height: t.y + t.h - 8 - level, rx: 4, fill: color, opacity: 0.55 }, gTanks);
        } else if (t.shape === "flask") {
          var neck = "M " + (t.x + 26) + " " + t.y + " h 18 v 36 l 16 20 v " + (t.h - 56) + " h -50 v -" + (t.h - 56) + " z";
          svg("path", { d: neck, fill: "#fcfaf5", stroke: "#d6d8ce", "stroke-width": 1.1 }, gTanks);
          var fy = t.y + t.h - fillH - 4;
          svg("path", {
            d: "M " + (t.x + 14) + " " + Math.max(fy, t.y + 56) + " h 42 v " + (t.y + t.h - 4 - Math.max(fy, t.y + 56)) + " h -42 z",
            fill: color, opacity: 0.5
          }, gTanks);
        } else {
          svg("rect", { x: t.x, y: t.y, width: t.w, height: t.h, rx: 10, fill: "#eaeadd", stroke: "#d6d8ce", "stroke-width": 1.1 }, gTanks);
          svg("rect", { x: t.x + 6, y: t.y + 10, width: t.w - 12, height: t.h - 20, rx: 6, fill: "#e3e7d9", stroke: "#d6d8ce" }, gTanks);
          var ly = t.y + t.h - 16 - fillH;
          svg("rect", { x: t.x + 10, y: ly, width: t.w - 20, height: t.y + t.h - 16 - ly, rx: 4, fill: color, opacity: 0.5 }, gTanks);
          /* small side pipes */
          svg("rect", { x: t.x + t.w, y: t.y + 24, width: 10, height: 6, rx: 2, fill: "#d6d8ce", stroke: "#bcc5b5" }, gTanks);
        }

        svg("text", {
          x: t.x + t.w / 2, y: t.y + t.h + 16,
          "text-anchor": "middle",
          fill: "#69716a",
          "font-size": 10,
          "letter-spacing": "0.08em",
          text: t.label
        }, gTanks);
        svg("text", {
          x: t.x + t.w / 2, y: t.y + t.h + 32,
          "text-anchor": "middle",
          fill: COLORS[t.kind + "Ink"] || COLORS.ink,
          "font-size": 14,
          "font-weight": 650,
          "font-variant-numeric": "tabular-nums",
          text: String(t.count)
        }, gTanks);
      });

      /* small column cap details */
      svg("rect", { x: 1238, y: 478, width: 38, height: 22, rx: 4, fill: "#e3e7d9", stroke: "#d6d8ce" }, gTanks);
      svg("rect", { x: 1246, y: 468, width: 22, height: 12, rx: 2, fill: "#e3e7d9", stroke: "#d6d8ce" }, gTanks);
    }

    function draw(ts, dt) {
      if (!ready) return;
      var agents = (state.data && state.data.agents) || [];
      var n = agents.length;
      var beat = currentBeat();
      var targetIdx = 0;
      if (beat && beat.agentId) {
        for (var i = 0; i < n; i++) if (agents[i].id === beat.agentId) targetIdx = i;
      } else if (state.pinnedAgentId) {
        for (var j = 0; j < n; j++) if (agents[j].id === state.pinnedAgentId) targetIdx = j;
      }
      needleTarget = agentAngle(targetIdx, n);
      var k = reduceMotion ? 1 : 1 - Math.pow(0.001, (dt || 16) / 420);
      var da = needleTarget - needleAngle;
      needleAngle += da * k;

      empty(gSegs);
      empty(gLabels);
      empty(hitLayer);
      var span = (A1 - A0) / n;
      agents.forEach(function (a, idx) {
        var a0 = A0 + span * idx + 0.35;
        var a1 = A0 + span * (idx + 1) - 0.35;
        var kind = statusKind(a.status);
        var isCur = beat && beat.agentId === a.id;
        var isPin = state.pinnedAgentId === a.id;
        var fill = isCur || isPin ? statusColor(a.status, true) : "#fcfaf5";
        var stroke = isCur ? statusColor(a.status) : (isPin ? COLORS.wait : "#d6d8ce");
        var path = ringSegment(CX, CY, R_WIN0, R_WIN1, a0, a1);
        svg("path", {
          d: path,
          fill: fill,
          stroke: stroke,
          "stroke-width": isCur || isPin ? 1.6 : 0.8,
          opacity: a.status === "未核实" ? (isCur || isPin ? "0.9" : "0.55") : "1"
        }, gSegs);

        /* status pip on outer rim */
        var mid = (a0 + a1) / 2;
        var pip = polar(CX, CY, R_WIN0 - 12, mid);
        svg("circle", {
          cx: pip.x, cy: pip.y, r: isCur ? 4.2 : 3,
          fill: statusColor(a.status),
          opacity: a.status === "未核实" ? "0.55" : "1"
        }, gSegs);

        /* labels */
        var lp = polar(CX, CY, (R_WIN0 + R_WIN1) / 2 - 10, mid);
        svg("text", {
          x: lp.x, y: lp.y - 6,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          fill: a.status === "未核实" ? COLORS.unknownInk : COLORS.ink,
          "font-size": n > 10 ? 13 : 15,
          "font-weight": 650,
          "letter-spacing": "0.06em",
          text: a.name
        }, gLabels);
        svg("text", {
          x: lp.x, y: lp.y + 12,
          "text-anchor": "middle",
          fill: statusInk(a.status),
          "font-size": 8,
          "letter-spacing": "0.06em",
          text: a.status === "未核实" ? "未核实" : shortStatus(a.status)
        }, gLabels);
        if (isCur && a.current && a.status !== "未核实") {
          var words = a.current;
          if (words.length > 18) words = words.slice(0, 18) + "…";
          svg("text", {
            x: lp.x, y: lp.y + 28,
            "text-anchor": "middle",
            fill: COLORS.ink2,
            "font-size": 9,
            text: words
          }, gLabels);
        }

        var hit = svg("path", { d: path, fill: "transparent", cursor: "pointer" }, hitLayer);
        hit.addEventListener("click", function (ev) {
          ev.stopPropagation();
          pinAgent(a.id);
        });
      });

      /* needle / reader head */
      empty(gNeedle);
      var n0 = polar(CX, CY, R_IN + 8, needleAngle);
      var n1 = polar(CX, CY, R_OUT + 6, needleAngle);
      svg("line", {
        x1: n0.x, y1: n0.y, x2: n1.x, y2: n1.y,
        stroke: COLORS.active,
        "stroke-width": 1.3,
        opacity: "0.85"
      }, gNeedle);
      var head = polar(CX, CY, R_WIN1 + 8, needleAngle);
      var hx = head.x, hy = head.y;
      var ang = (needleAngle * Math.PI) / 180;
      var tx = Math.cos(ang), ty = Math.sin(ang);
      var px = -ty, py = tx;
      var box = [
        [hx + px * 16 - tx * 8, hy + py * 16 - ty * 8],
        [hx + px * 16 + tx * 18, hy + py * 16 + ty * 18],
        [hx - px * 16 + tx * 18, hy - py * 16 + ty * 18],
        [hx - px * 16 - tx * 8, hy - py * 16 - ty * 8]
      ];
      svg("polygon", {
        points: box.map(function (p) { return p[0] + "," + p[1]; }).join(" "),
        fill: "#fcfaf5",
        stroke: "#9eaa9c",
        "stroke-width": 1.1
      }, gNeedle);
      /* tick window mark */
      svg("line", {
        x1: hx - px * 10, y1: hy - py * 10,
        x2: hx + px * 10, y2: hy + py * 10,
        stroke: COLORS.ink, "stroke-width": 1
      }, gNeedle);

      drawParticlesIn(gSparks);
    }

    function onBeat(beat) {
      if (!beat) return;
      var agents = (state.data && state.data.agents) || [];
      var idx = 0;
      if (beat.agentId) {
        for (var i = 0; i < agents.length; i++) if (agents[i].id === beat.agentId) idx = i;
      }
      if (state.view === "dial") {
        var p = polar(CX, CY, (R_WIN0 + R_WIN1) / 2, agentAngle(idx, agents.length || 10));
        spawnSparks(p.x + 80, p.y, statusColor(beat.status), beat.unverified ? 6 : 16, beat.unverified ? 0.5 : 1);
      }
    }

    return { setup: setup, draw: draw, onBeat: onBeat, show: function () {} };
  })();


  /* =========================================================
     织机
     ========================================================= */
  Views.loom = (function () {
    var root, svgRoot, canvas, ctx, frameG, hookG, metaEl;
    var rows = [];
    var shuttle = 1;
    var shuttleDir = 1;
    var ready = false;
    var dpr = 1;
    var layout = {
      x: 470, y: 70, w: 920, h: 700,
      hookH: 34,
      clothY: 110,
      clothH: 290,
      reedY: 400,
      warpY1: 408,
      warpY2: 740
    };

    function setup() {
      root = document.getElementById("view-loom");
      empty(root);
      svgRoot = svg("svg", {
        class: "instrument",
        viewBox: "0 0 1440 820",
        preserveAspectRatio: "xMidYMid meet",
        "aria-label": "织机"
      }, root);

      /* leftover dial arc on the left */
      var CX = -40, CY = 360;
      svg("path", {
        d: ringSegment(CX, CY, 300, 430, -70, 50),
        fill: "#fcfaf5",
        stroke: "#d6d8ce",
        "stroke-width": 1
      }, svgRoot);
      svg("path", {
        d: arcPath(CX, CY, 430, -70, 50),
        fill: "none", stroke: "#9eaa9c", "stroke-width": 1.1
      }, svgRoot);
      for (var a = -70; a <= 50; a += 2) {
        var major = (a + 70) % 10 === 0;
        var p0 = polar(CX, CY, 430, a);
        var p1 = polar(CX, CY, 430 + (major ? 12 : 5), a);
        svg("line", {
          x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y,
          stroke: "#69716a", "stroke-width": major ? 1 : 0.5, opacity: "0.7"
        }, svgRoot);
      }

      /* control box */
      var box = svg("g", { transform: "translate(210, 430)" }, svgRoot);
      svg("rect", { x: 0, y: 0, width: 160, height: 110, rx: 12, fill: "#eaeadd", stroke: "#d6d8ce" }, box);
      svg("rect", { x: 12, y: 14, width: 80, height: 16, rx: 3, fill: "#e3e7d9", stroke: "#d6d8ce" }, box);
      svg("rect", { x: 12, y: 38, width: 80, height: 8, rx: 2, fill: "#e3e7d9" }, box);
      svg("rect", { x: 12, y: 52, width: 80, height: 8, rx: 2, fill: "#e3e7d9" }, box);
      svg("circle", { cx: 122, cy: 28, r: 14, fill: "#eaeadd", stroke: "#d6d8ce" }, box);
      svg("circle", { cx: 122, cy: 28, r: 3, fill: "#9eaa9c" }, box);
      svg("rect", { x: 108, y: 54, width: 36, height: 36, rx: 6, fill: "#e3e7d9", stroke: "#d6d8ce" }, box);
      /* pipes from dial to box to loom */
      svg("path", {
        d: orthoPipe([[240, 360], [240, 430], [210, 430], [210, 440]], 8),
        fill: "none", stroke: "#d6d8ce", "stroke-width": 5, "stroke-linecap": "round"
      }, svgRoot);

      frameG = svg("g", { class: "loom-frame" }, svgRoot);
      hookG = svg("g", { class: "hooks" }, svgRoot);
      drawFrame();

      canvas = document.createElement("canvas");
      canvas.className = "instrument";
      canvas.setAttribute("aria-hidden", "true");
      root.appendChild(canvas);
      ctx = canvas.getContext("2d");
      resizeCanvas();

      metaEl = document.createElement("div");
      metaEl.className = "loom-meta";
      metaEl.style.left = "22px";
      metaEl.style.bottom = "auto";
      metaEl.style.top = "auto";
      /* sit just above the detail card area — JS updates text */
      root.appendChild(metaEl);

      window.addEventListener("resize", resizeCanvas);
      ready = true;
    }

    function drawFrame() {
      empty(frameG);
      var L = layout;
      /* outer chassis */
      svg("rect", {
        x: L.x - 16, y: L.y - 16, width: L.w + 32, height: L.h + 32, rx: 8,
        fill: "none", stroke: "#d6d8ce", "stroke-width": 1.2
      }, frameG);
      svg("rect", {
        x: L.x, y: L.y, width: L.w, height: L.h, rx: 4,
        fill: "#f4f1e9", stroke: "#d6d8ce", "stroke-width": 1
      }, frameG);
      /* top rail */
      svg("rect", { x: L.x - 8, y: L.y - 8, width: L.w + 16, height: 22, rx: 3, fill: "#eaeadd", stroke: "#d6d8ce" }, frameG);
      /* reed bar */
      svg("rect", {
        x: L.x + 4, y: L.reedY - 6, width: L.w - 8, height: 12, rx: 2,
        fill: "#e3e7d9", stroke: "#bcc5b5"
      }, frameG);
      /* bottom rail */
      svg("rect", { x: L.x - 8, y: L.y + L.h - 14, width: L.w + 16, height: 22, rx: 3, fill: "#eaeadd", stroke: "#d6d8ce" }, frameG);
      /* side posts */
      svg("rect", { x: L.x - 10, y: L.y - 4, width: 10, height: L.h + 8, fill: "#e3e7d9", stroke: "#d6d8ce" }, frameG);
      svg("rect", { x: L.x + L.w, y: L.y - 4, width: 10, height: L.h + 8, fill: "#e3e7d9", stroke: "#d6d8ce" }, frameG);
      /* corner bolts */
      [[L.x - 4, L.y - 4], [L.x + L.w + 4, L.y - 4], [L.x - 4, L.y + L.h + 4], [L.x + L.w + 4, L.y + L.h + 4]].forEach(function (p) {
        svg("circle", { cx: p[0], cy: p[1], r: 3.5, fill: "#e3e7d9", stroke: "#9eaa9c" }, frameG);
      });
    }

    function drawHooks(currentStream) {
      empty(hookG);
      var streams = (state.data && state.data.streams) || [];
      var L = layout;
      var n = streams.length || 1;
      var gap = L.w / n;
      streams.forEach(function (s, i) {
        var x = L.x + gap * (i + 0.5);
        var on = currentStream && currentStream === s.id;
        var y = L.y + 6;
        svg("rect", {
          x: x - 28, y: y - 22, width: 56, height: 22, rx: 4,
          fill: on ? "#fcfaf5" : "#eaeadd",
          stroke: on ? statusColor(s.status) : "#d6d8ce",
          "stroke-width": on ? 1.4 : 0.8
        }, hookG);
        /* hook */
        svg("path", {
          d: "M " + x + " " + (y) + " v 14",
          stroke: "#9eaa9c", "stroke-width": 1.2
        }, hookG);
        var short = s.name.length > 4 ? s.name.slice(0, 4) : s.name;
        if (s.id === "loopos") short = "LoopOS";
        if (s.id === "hud") short = "任务仪";
        if (s.id === "console") short = "观察台";
        if (s.id === "kindling") short = "火种";
        if (s.id === "speech") short = "分享稿";
        if (s.id === "film") short = "短片";
        svg("text", {
          x: x, y: y - 8,
          "text-anchor": "middle",
          fill: on ? statusInk(s.status) : COLORS.ink2,
          "font-size": 10,
          "font-weight": on ? 650 : 500,
          text: short
        }, hookG);
      });
    }

    function resizeCanvas() {
      if (!canvas || !svgRoot) return;
      var rect = root.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
    }

    function svgToCanvas(x, y) {
      var rect = root.getBoundingClientRect();
      var vb = { w: 1440, h: 820 };
      var scale = Math.min(rect.width / vb.w, rect.height / vb.h);
      var ox = (rect.width - vb.w * scale) / 2;
      var oy = (rect.height - vb.h * scale) / 2;
      return { x: ox + x * scale, y: oy + y * scale, scale: scale };
    }

    function onBeat(beat) {
      if (!beat) return;
      rows.push({
        streamId: beat.streamId,
        agentId: beat.agentId,
        status: beat.status,
        unverified: !!beat.unverified,
        kind: statusKind(beat.status),
        loopN: state.loopCount,
        type: beat.type,
        title: beat.title
      });
      if (rows.length > 80) rows = rows.slice(rows.length - 80);
      shuttle = 0;
      shuttleDir = (rows.length % 2 === 0) ? 1 : -1;
    }

    function draw(ts) {
      if (!ready || !ctx) return;
      var beat = currentBeat();
      drawHooks(beat && beat.streamId);
      var remain = Math.max(0, state.beats.length - state.beatIndex - 1);
      if (metaEl) {
        metaEl.textContent = "队列 " + remain + "    第 " + (state.loopCount + 1) + " 轮";
        var q = svgToCanvas(layout.x + 16, layout.y + layout.h + 8);
        metaEl.style.left = Math.max(16, q.x) + "px";
        metaEl.style.top = q.y + "px";
        metaEl.style.bottom = "auto";
      }

      var rect = root.getBoundingClientRect();
      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        resizeCanvas();
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      var L = layout;
      var p0 = svgToCanvas(L.x + 8, L.clothY);
      var p1 = svgToCanvas(L.x + L.w - 8, L.warpY2);
      var x = p0.x, y = p0.y, w = p1.x - p0.x, h = p1.y - p0.y;
      var reed = svgToCanvas(L.x, L.reedY);
      var clothBottom = reed.y - 4;
      var clothTop = svgToCanvas(L.x, L.clothY).y;
      var warpBottom = svgToCanvas(L.x, L.warpY2).y;
      var streams = (state.data && state.data.streams) || [];
      var nS = Math.max(streams.length, 1);
      var colW = w / nS;
      var warpsPer = 10;

      /* warp threads (full height) */
      ctx.lineWidth = Math.max(1.1, 1.35 * p0.scale);
      for (var s = 0; s < nS; s++) {
        var base = streamColor(streams[s].id);
        for (var t = 0; t < warpsPer; t++) {
          var wx = x + colW * s + (t + 0.5) * (colW / warpsPer);
          ctx.strokeStyle = shade(base, 0.22 + (t % 3) * 0.06, 0.55);
          ctx.beginPath();
          ctx.moveTo(wx, clothTop);
          ctx.lineTo(wx, warpBottom);
          ctx.stroke();
        }
      }

      /* weft rows in cloth area */
      var visible = 26;
      var shown = rows.slice(-visible);
      var rowH = Math.max(3, (clothBottom - clothTop) / visible);
      shown.forEach(function (row, i) {
        var ry = clothTop + i * rowH;
        var color = row.unverified ? COLORS.unknown : statusColor(row.status);
        if (row.streamId) color = mixHex(color, streamColor(row.streamId), 0.35);
        /* highlight current stream column, mute others slightly */
        for (var c = 0; c < nS; c++) {
          var sid = streams[c] && streams[c].id;
          var colColor = color;
          if (row.streamId && sid && row.streamId !== sid) {
            colColor = mixHex(color, "#e3e7d9", 0.55);
          }
          if (row.unverified) colColor = mixHex(COLORS.unknown, "#d6d8ce", 0.2);
          ctx.strokeStyle = colColor;
          ctx.globalAlpha = row.unverified ? 0.45 : 0.92;
          ctx.lineWidth = Math.max(1, rowH * 0.55);
          var x0 = x + colW * c + 1;
          var x1 = x + colW * (c + 1) - 1;
          /* a few offset threads for textile feel */
          for (var k = 0; k < 3; k++) {
            ctx.beginPath();
            var yy = ry + rowH * 0.3 + k * 0.7;
            ctx.moveTo(x0, yy);
            var segs = 8;
            for (var g = 1; g <= segs; g++) {
              var gx = x0 + (x1 - x0) * (g / segs);
              var gy = yy + Math.sin(g * 1.7 + i * 0.6 + k) * 0.6;
              ctx.lineTo(gx, gy);
            }
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        /* loop separator */
        if (row.loopN && i > 0 && shown[i - 1] && shown[i - 1].loopN !== row.loopN) {
          ctx.strokeStyle = "rgba(90,80,60,0.25)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, ry);
          ctx.lineTo(x + w, ry);
          ctx.stroke();
        }
      });

      /* shuttle */
      var sh = reduceMotion ? 1 : Math.min(1, shuttle + 0.045);
      shuttle = sh;
      var sx = shuttleDir === 1 ? x + w * easeOut(shuttle) : x + w * (1 - easeOut(shuttle));
      ctx.fillStyle = "#e3e7d9";
      ctx.strokeStyle = "#9eaa9c";
      ctx.lineWidth = 1;
      var sy = reed.y;
      roundRect(ctx, sx - 18, sy - 7, 36, 14, 4);
      ctx.fill();
      ctx.stroke();

      /* current stream tint over hooks already in SVG */
    }

    function shade(hex, light, alpha) {
      /* return rgba-ish from hex mixed toward white */
      var c = mixHex(hex, "#ffffff", 1 - light);
      if (alpha != null) {
        var r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
        return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
      }
      return c;
    }

    function mixHex(a, b, t) {
      function parse(h) {
        h = (h || "#888888").replace("#", "");
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      }
      var A = parse(a), B = parse(b);
      var r = Math.round(lerp(A[0], B[0], t));
      var g = Math.round(lerp(A[1], B[1], t));
      var bl = Math.round(lerp(A[2], B[2], t));
      return "#" + [r, g, bl].map(function (v) { return v.toString(16).padStart(2, "0"); }).join("");
    }

    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    return { setup: setup, draw: draw, onBeat: onBeat, show: function () { resizeCanvas(); } };
  })();


  /* =========================================================
     流水线
     ========================================================= */
  Views.factory = (function () {
    var root, svgRoot, gWorld, gBelt, gArm, gMach, gParcels, gSparks;
    var consoleEl, captionEl;
    var parcels = [];
    var armT = 1;
    var gearA = 0;
    var ready = false;
    var origin = { x: 180, y: 705 };
    var SCALE = { u: 46, v: 23, z: 30 };

    function iso(x, y, z) {
      z = z || 0;
      return {
        x: origin.x + (x - y) * SCALE.u,
        y: origin.y - (x + y) * SCALE.v - z * SCALE.z
      };
    }

    function isoFace(pts, fill, stroke, parent, width) {
      var d = pts.map(function (p, i) {
        var q = iso(p[0], p[1], p[2]);
        return (i === 0 ? "M " : "L ") + q.x + " " + q.y;
      }).join(" ") + " Z";
      return svg("path", { d: d, fill: fill, stroke: stroke || "#bcc5b5", "stroke-width": width || 0.9 }, parent);
    }

    function setup() {
      root = document.getElementById("view-factory");
      empty(root);
      svgRoot = svg("svg", {
        class: "instrument",
        viewBox: "0 0 1440 820",
        preserveAspectRatio: "xMidYMid meet",
        "aria-label": "流水线"
      }, root);
      gWorld = svg("g", {}, svgRoot);
      gBelt = svg("g", {}, svgRoot);
      gMach = svg("g", {}, svgRoot);
      gArm = svg("g", {}, svgRoot);
      gParcels = svg("g", {}, svgRoot);
      gSparks = svg("g", {}, svgRoot);

      consoleEl = document.createElement("div");
      consoleEl.className = "factory-console";
      consoleEl.innerHTML = '<div class="screen"><div class="sc-name"></div><div class="card-status-row"><span class="pip"></span><span class="card-status"></span><span class="card-updated"></span></div><div class="sc-text"></div></div>';
      consoleEl.addEventListener("click", function () {
        var b = currentBeat();
        if (b && b.agentId) pinAgent(b.agentId);
        else if (b && b.streamId) holdItem({ type: "stream", id: b.streamId });
      });
      root.appendChild(consoleEl);

      captionEl = document.createElement("div");
      captionEl.className = "factory-caption";
      captionEl.innerHTML = '<div class="cap-k">当前件</div><div class="cap-t"></div><div class="cap-s"></div>';
      captionEl.addEventListener("click", function () {
        var b = currentBeat();
        if (b && b.agentId) pinAgent(b.agentId);
        else if (b && b.streamId) holdItem({ type: "stream", id: b.streamId });
      });
      root.appendChild(captionEl);

      drawStaticWorld();
      ready = true;
    }

    function box3(x, y, z, w, d, h, pal, parent) {
      /* pal: {top, left, right, stroke} */
      isoFace([[x, y + d, z + h], [x + w, y + d, z + h], [x + w, y, z + h], [x, y, z + h]], pal.top, pal.stroke, parent);
      isoFace([[x, y, z + h], [x + w, y, z + h], [x + w, y, z], [x, y, z]], pal.right, pal.stroke, parent);
      isoFace([[x, y, z + h], [x, y, z], [x, y + d, z], [x, y + d, z + h]], pal.left, pal.stroke, parent);
    }

    function drawStaticWorld() {
      empty(gWorld);
      empty(gBelt);
      empty(gMach);
      /* floor shadow under belt */
      var shadowPts = [[-0.4, -0.6, 0], [16.2, -0.6, 0], [16.2, 2.8, 0], [-0.4, 2.8, 0]];
      isoFace(shadowPts, "rgba(80,70,50,0.04)", "none", gWorld, 0);

      /* belt bed */
      var L = 17, W = 2.4, H = 0.75;
      box3(0, 0, 0, L, W, H, { top: "#eaeadd", left: "#e3e7d9", right: "#eaeadd", stroke: "#d6d8ce" }, gBelt);
      /* rails */
      box3(0, -0.12, H, L, 0.12, 0.35, { top: "#e3e7d9", left: "#d6d8ce", right: "#eaeadd", stroke: "#bcc5b5" }, gBelt);
      box3(0, W, H, L, 0.12, 0.35, { top: "#e3e7d9", left: "#d6d8ce", right: "#eaeadd", stroke: "#bcc5b5" }, gBelt);
      /* slats */
      for (var i = 0; i < 18; i++) {
        var sx = 0.15 + i * (L / 18);
        box3(sx, 0.08, H + 0.02, 0.7, W - 0.16, 0.05, {
          top: i % 2 ? "#fcfaf5" : "#eaeadd",
          left: "#e3e7d9", right: "#eaeadd", stroke: "#d6d8ce"
        }, gBelt);
      }
      /* legs */
      for (var k = 0; k < 5; k++) {
        var lx = 1 + k * 3.5;
        box3(lx, 0.15, -2.2, 0.18, 0.18, 2.2, { top: "#e3e7d9", left: "#d6d8ce", right: "#eaeadd", stroke: "#bcc5b5" }, gBelt);
        box3(lx, W - 0.35, -2.2, 0.18, 0.18, 2.2, { top: "#e3e7d9", left: "#d6d8ce", right: "#eaeadd", stroke: "#bcc5b5" }, gBelt);
      }

      /* hopper at start */
      box3(-2.0, 0.1, H, 1.8, 2.0, 1.8, { top: "#eaeadd", left: "#e3e7d9", right: "#fcfaf5", stroke: "#d6d8ce" }, gWorld);

      /* console body, to the right of mid-belt */
      box3(9.2, -6.6, 0, 5.6, 3.6, 2.8, { top: "#eaeadd", left: "#e3e7d9", right: "#fcfaf5", stroke: "#d6d8ce" }, gWorld);
      box3(9.2, -6.6, 2.8, 5.6, 3.6, 0.18, { top: "#eaeadd", left: "#d6d8ce", right: "#eaeadd", stroke: "#bcc5b5" }, gWorld);
      var scr = [[9.7, -6.45, 2.6], [14.0, -6.45, 2.6], [14.0, -6.45, 0.85], [9.7, -6.45, 0.85]];
      isoFace(scr, "#e3e7d9", "#bcc5b5", gWorld);
      var g1 = iso(10.2, -6.5, 3.15);
      svg("circle", { cx: g1.x, cy: g1.y, r: 10, fill: "#eaeadd", stroke: "#bcc5b5" }, gWorld);
      var g2 = iso(13.4, -6.5, 3.35);
      svg("circle", { cx: g2.x, cy: g2.y, r: 14, fill: "#e3e7d9", stroke: "#bcc5b5" }, gWorld);

      /* machinery at the far end */
      box3(16.4, -5.2, 0, 3.6, 3.2, 2.4, { top: "#eaeadd", left: "#d6d8ce", right: "#fcfaf5", stroke: "#d6d8ce" }, gMach);
      box3(20.2, -4.6, 0, 1.8, 1.8, 4.8, { top: "#eaeadd", left: "#d6d8ce", right: "#eaeadd", stroke: "#d6d8ce" }, gMach);
      var cap = iso(21.1, -3.7, 5.0);
      svg("ellipse", { cx: cap.x, cy: cap.y, rx: 28, ry: 12, fill: "#e3e7d9", stroke: "#bcc5b5" }, gMach);

      /* arm base on the near side of the belt */
      box3(4.6, -3.4, 0, 2.2, 2.2, 0.55, { top: "#e3e7d9", left: "#d6d8ce", right: "#eaeadd", stroke: "#bcc5b5" }, gWorld);
    }

    function drawArm(pose) {
      empty(gArm);
      /* 6-axis-ish: base turret, shoulder, upper, elbow, lower, wrist, gripper */
      var base = iso(5.7, -2.3, 0.55);
      svg("ellipse", { cx: base.x, cy: base.y, rx: 40, ry: 18, fill: "#e3e7d9", stroke: "#bcc5b5" }, gArm);
      svg("ellipse", { cx: base.x, cy: base.y - 12, rx: 30, ry: 14, fill: "#eaeadd", stroke: "#bcc5b5" }, gArm);

      var a1 = pose.s;
      var a2 = pose.e;
      var a3 = pose.w;
      var l1 = 120, l2 = 96, l3 = 40;
      var p0 = { x: base.x, y: base.y - 24 };
      var p1 = { x: p0.x + Math.cos(a1) * l1, y: p0.y + Math.sin(a1) * l1 };
      var p2 = { x: p1.x + Math.cos(a2) * l2, y: p1.y + Math.sin(a2) * l2 };
      var p3 = { x: p2.x + Math.cos(a3) * l3, y: p2.y + Math.sin(a3) * l3 };

      function link(a, b, w) {
        svg("line", {
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          stroke: "#d6d8ce", "stroke-width": w + 6, "stroke-linecap": "round"
        }, gArm);
        svg("line", {
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          stroke: "#eaeadd", "stroke-width": w, "stroke-linecap": "round"
        }, gArm);
      }
      link(p0, p1, 16);
      link(p1, p2, 12);
      link(p2, p3, 7);
      [p0, p1, p2].forEach(function (p, i) {
        svg("circle", { cx: p.x, cy: p.y, r: i === 0 ? 14 : 10, fill: "#eaeadd", stroke: "#bcc5b5", "stroke-width": 1.1 }, gArm);
      });
      /* gripper */
      var gx = Math.cos(a3 + Math.PI / 2) * 8, gy = Math.sin(a3 + Math.PI / 2) * 8;
      svg("line", { x1: p3.x + gx, y1: p3.y + gy, x2: p3.x - gx, y2: p3.y - gy, stroke: "#9eaa9c", "stroke-width": 3, "stroke-linecap": "round" }, gArm);
      var tip = 10;
      svg("line", { x1: p3.x + gx, y1: p3.y + gy, x2: p3.x + gx + Math.cos(a3) * tip, y2: p3.y + gy + Math.sin(a3) * tip, stroke: "#69716a", "stroke-width": 2, "stroke-linecap": "round" }, gArm);
      svg("line", { x1: p3.x - gx, y1: p3.y - gy, x2: p3.x - gx + Math.cos(a3) * tip, y2: p3.y - gy + Math.sin(a3) * tip, stroke: "#69716a", "stroke-width": 2, "stroke-linecap": "round" }, gArm);
    }

    function armPose(t) {
      /* t 0..1 during beat: rest -> reach hopper -> place on belt -> rest */
      var rest = { s: -1.45, e: -2.55, w: -1.9 };
      var reach = { s: -2.5, e: -1.15, w: -0.35 };
      var place = { s: -0.85, e: -2.05, w: -1.15 };
      if (reduceMotion) return rest;
      var p;
      if (t < 0.22) p = lerpPose(rest, reach, easeInOut(t / 0.22));
      else if (t < 0.45) p = lerpPose(reach, place, easeInOut((t - 0.22) / 0.23));
      else if (t < 0.75) p = lerpPose(place, rest, easeInOut((t - 0.45) / 0.3));
      else p = rest;
      return p;
    }
    function lerpPose(a, b, t) {
      return { s: lerp(a.s, b.s, t), e: lerp(a.e, b.e, t), w: lerp(a.w, b.w, t) };
    }

    function onBeat(beat) {
      if (!beat) return;
      armT = 0;
      var kind = statusKind(beat.status);
      parcels.push({
        x: 0.55,
        t: 0,
        pending: reduceMotion ? false : true,
        status: beat.status,
        kind: kind,
        unverified: !!beat.unverified,
        title: beat.title,
        agentId: beat.agentId,
        streamId: beat.streamId,
        text: beat.text,
        opened: false,
        gone: false,
        waitLinger: kind === "wait"
      });
      if (parcels.length > 14) parcels.shift();
    }

    function placeOverlays() {
      var scr = iso(11.85, -6.45, 1.7);
      var rect = root.getBoundingClientRect();
      var scale = Math.min(rect.width / 1440, rect.height / 820);
      var ox = (rect.width - 1440 * scale) / 2;
      var oy = (rect.height - 820 * scale) / 2;
      consoleEl.style.left = (ox + (scr.x - 120) * scale) + "px";
      consoleEl.style.top = (oy + (scr.y - 58) * scale) + "px";
      consoleEl.style.width = (248 * scale) + "px";
    }

    function draw(ts, dt) {
      if (!ready) return;
      gearA += (dt || 16) * 0.0002;
      if (armT < 1) {
        armT = reduceMotion ? 1 : Math.min(1, armT + (dt || 16) / 900);
      }
      drawArm(armPose(armT));

      /* rotating gear */
      var oldGear = gMach.querySelector(".gear");
      if (oldGear) oldGear.remove();
      var gp = iso(18.2, -3.6, 2.6);
      var gear = svg("g", { class: "gear", transform: "translate(" + gp.x + "," + gp.y + ") rotate(" + (gearA * 180 / Math.PI) + ")" }, gMach);
      var teeth = 12, R = 48, r = 36;
      var d = "";
      for (var i = 0; i < teeth; i++) {
        var a0 = (i / teeth) * Math.PI * 2;
        var a1 = a0 + Math.PI / teeth;
        var a2 = a0 + Math.PI / teeth * 0.45;
        var a3 = a0 + Math.PI / teeth * 0.55;
        d += (i === 0 ? "M" : "L") + " " + Math.cos(a0) * r + " " + Math.sin(a0) * r;
        d += " L " + Math.cos(a2) * R + " " + Math.sin(a2) * R;
        d += " L " + Math.cos(a3) * R + " " + Math.sin(a3) * R;
        d += " L " + Math.cos(a1) * r + " " + Math.sin(a1) * r;
      }
      d += " Z";
      svg("path", { d: d, fill: "#e3e7d9", stroke: "#bcc5b5", "stroke-width": 1 }, gear);
      svg("circle", { cx: 0, cy: 0, r: 10, fill: "#fcfaf5", stroke: "#bcc5b5" }, gear);

      /* parcels move */
      empty(gParcels);
      var speed = (dt || 16) * 0.00115;
      parcels.forEach(function (p) {
        if (p.gone) return;
        if (p.pending) {
          if (armT >= 0.42) p.pending = false;
        }
        var dest = p.waitLinger ? 10.0 : 15.4;
        if (p.unverified) dest = 13.0;
        if (p.kind === "done") dest = 16.0;
        if (p.x < dest) p.x += speed * (p.waitLinger ? 0.55 : 1);
        if (p.kind === "done" && p.x >= 15.2 && !p.opened) {
          p.opened = true;
          var burst = iso(p.x, 0.9, 1.8);
          spawnSparks(burst.x, burst.y, statusColor(p.status), 18, 1.3);
        }
        if (p.x >= 16.6 && p.kind === "done") p.gone = true;
        drawParcel(p);
      });
      parcels = parcels.filter(function (p) { return !p.gone; });

      drawParticlesIn(gSparks);
      updateFactoryCopy();
      placeOverlays();
    }

    function drawParcel(p) {
      var y = 0.5, z = 0.8, w = 1.25, d = 1.25, h = 1.25;
      var px = p.pending ? -0.3 : p.x;
      var useX = px;
      var pal;
      if (p.unverified) {
        pal = { top: "#e3e7d9", left: "#d6d8ce", right: "#e3e7d9", stroke: "#9eaa9c" };
      } else if (p.kind === "active") {
        pal = { top: "#f0e4d6", left: "#dda17b", right: "#f0e4d6", stroke: "#dda17b" };
      } else if (p.kind === "wait") {
        pal = { top: "#eaeadd", left: "#c4b06a", right: "#eaeadd", stroke: "#c4b06a" };
      } else {
        pal = { top: "#dceee9", left: "#abd0c6", right: "#dceee9", stroke: "#264c3b" };
      }
      if (p.opened) h = 0.4;
      box3(useX, y, z, w, d, h, pal, gParcels);
      var top = iso(useX + w / 2, y + d / 2, z + h + 0.05);
      var label = parcelLabel(p);
      var lw = Math.max(36, label.length * 11 + 12);
      svg("rect", {
        x: top.x - lw / 2, y: top.y - 20,
        width: lw, height: 15, rx: 7,
        fill: "#fcfaf5",
        stroke: pal.stroke,
        "stroke-width": 0.8,
        opacity: "0.95"
      }, gParcels);
      svg("text", {
        x: top.x, y: top.y - 9,
        "text-anchor": "middle",
        fill: p.unverified ? COLORS.unknownInk : COLORS.ink2,
        "font-size": 10,
        "font-weight": 650,
        text: label
      }, gParcels);
    }

    function updateFactoryCopy() {
      var beat = currentBeat();
      var screenName = consoleEl.querySelector(".sc-name");
      var screenText = consoleEl.querySelector(".sc-text");
      var pip = consoleEl.querySelector(".pip");
      var st = consoleEl.querySelector(".card-status");
      var upd = consoleEl.querySelector(".card-updated");
      var capT = captionEl.querySelector(".cap-t");
      var capS = captionEl.querySelector(".cap-s");
      if (!beat) return;
      var name = beat.title;
      var text = beat.text || "";
      if (text.length > 90) text = text.slice(0, 90) + "…";
      screenName.textContent = name;
      screenText.textContent = text;
      st.textContent = beat.status;
      st.className = "card-status k-" + statusKind(beat.status);
      setPip(pip, statusKind(beat.status));
      upd.textContent = beat.time || "";
      capT.textContent = (beat.kicker || beat.type) + " · " + name;
      capS.textContent = beat.unverified ? "当前任务未在共享场合核实" : shortStatus(beat.status);
    }

    return { setup: setup, draw: draw, onBeat: onBeat, show: function () { placeOverlays(); } };
  })();


  /* =========================================================
     牌桌
     ========================================================= */
  Views.chips = (function () {
    var root, svgRoot, gDecor, gSparks, fan, felt, board, callout;
    var ready = false;
    var feltShowAt = 0;

    function setup() {
      root = document.getElementById("view-chips");
      empty(root);
      svgRoot = svg("svg", {
        class: "instrument",
        viewBox: "0 0 1440 820",
        preserveAspectRatio: "xMidYMid meet",
        "aria-label": "牌桌"
      }, root);
      gDecor = svg("g", {}, svgRoot);
      gSparks = svg("g", {}, svgRoot);
      drawDecor();

      board = document.createElement("div");
      board.className = "scoreboard";
      board.innerHTML =
        '<div class="sb-cell"><span class="sb-label">当前拍</span><span class="sb-value" id="sb-beat">1</span></div>' +
        '<div class="sb-cell"><span class="sb-label">已核实</span><span class="sb-value" id="sb-ver">0</span></div>' +
        '<div class="sb-cell"><span class="sb-label">进行中</span><span class="sb-value k-active" id="sb-act">0</span></div>' +
        '<div class="sb-cell"><span class="sb-label">等待义情</span><span class="sb-value k-wait" id="sb-wait">0</span></div>' +
        '<div class="sb-cell"><span class="sb-label">近期已交</span><span class="sb-value k-done" id="sb-done">0</span></div>' +
        '<div class="sb-cell"><span class="sb-label">验收未完成</span><span class="sb-value k-incomplete" id="sb-inc">0</span></div>' +
        '<div class="sb-cell"><span class="sb-label">未核实</span><span class="sb-value k-unknown" id="sb-unk">0</span></div>';
      root.appendChild(board);

      felt = document.createElement("div");
      felt.className = "felt-card";
      felt.innerHTML = '<div class="fc-name"></div><div class="fc-title"></div><div class="fc-stat"><span class="pip"></span><span class="fc-st"></span></div><div class="fc-current"></div>';
      root.appendChild(felt);

      fan = document.createElement("div");
      fan.className = "card-fan";
      root.appendChild(fan);

      callout = document.createElement("div");
      callout.className = "callout";
      root.appendChild(callout);

      ready = true;
      buildFan();
    }

    function drawDecor() {
      empty(gDecor);
      /* leftover dial on the left */
      var CX = -80, CY = 380;
      svg("path", {
        d: ringSegment(CX, CY, 280, 430, -80, 40),
        fill: "#fcfaf5", stroke: "#d6d8ce", "stroke-width": 1
      }, gDecor);
      svg("path", { d: arcPath(CX, CY, 430, -80, 40), fill: "none", stroke: "#9eaa9c" }, gDecor);

      /* felt well */
      svg("rect", {
        x: 430, y: 230, width: 520, height: 340, rx: 22,
        fill: "#eaeadd", stroke: "#d6d8ce",
        "stroke-dasharray": "0"
      }, gDecor);
      svg("rect", {
        x: 448, y: 248, width: 484, height: 304, rx: 16,
        fill: "#fcfaf5", stroke: "#d6d8ce"
      }, gDecor);
      /* crosshair */
      svg("line", { x1: 690, y1: 248, x2: 690, y2: 552, stroke: "#d6d8ce", "stroke-width": 0.6 }, gDecor);
      svg("line", { x1: 448, y1: 400, x2: 932, y2: 400, stroke: "#d6d8ce", "stroke-width": 0.6 }, gDecor);

      /* left launcher */
      svg("rect", { x: 360, y: 360, width: 70, height: 36, rx: 8, fill: "#eaeadd", stroke: "#bcc5b5" }, gDecor);
      svg("polygon", { points: "360,378 348,378 356,370 356,386", fill: "#9eaa9c" }, gDecor);
      svg("path", {
        d: orthoPipe([[395, 360], [395, 200], [690, 200], [690, 248]], 10),
        fill: "none", stroke: "#d6d8ce", "stroke-width": 4, "stroke-linecap": "round"
      }, gDecor);

      /* right draw stand, under the detail card */
      svg("rect", { x: 1248, y: 300, width: 16, height: 420, rx: 4, fill: "#e3e7d9", stroke: "#d6d8ce" }, gDecor);
      svg("rect", { x: 1208, y: 280, width: 96, height: 24, rx: 6, fill: "#e3e7d9", stroke: "#d6d8ce" }, gDecor);
      svg("rect", { x: 1188, y: 710, width: 136, height: 36, rx: 8, fill: "#eaeadd", stroke: "#d6d8ce" }, gDecor);

      /* bottom ruler */
      for (var i = 0; i <= 80; i++) {
        var x = 80 + i * 16;
        var h = i % 10 === 0 ? 12 : i % 5 === 0 ? 8 : 4;
        svg("line", { x1: x, y1: 808, x2: x, y2: 808 - h, stroke: "#9eaa9c", "stroke-width": 0.6 }, gDecor);
      }
    }

    function buildFan() {
      empty(fan);
      var agents = (state.data && state.data.agents) || [];
      var n = agents.length;
      var gap = n > 10 ? 62 : 78;
      var rotStep = n > 10 ? 5 : 6.6;
      agents.forEach(function (a, i) {
        var card = document.createElement("button");
        card.type = "button";
        card.className = "agent-card k-" + statusKind(a.status);
        card.setAttribute("data-id", a.id);
        card.setAttribute("aria-label", a.name + "，" + (a.status || ""));
        var rot = (i - (n - 1) / 2) * rotStep;
        var x = (i - (n - 1) / 2) * gap;
        card.style.transform = "translateX(" + (x - 43) + "px) rotate(" + rot + "deg)";
        card.innerHTML =
          '<div class="ac-name">' + a.name + "</div>" +
          '<div class="ac-title">' + a.title + "</div>" +
          '<div class="ac-stat"><span class="pip k-' + statusKind(a.status) + '"></span><span>' +
          (a.status === "未核实" ? "未核实" : a.status) + "</span></div>";
        card.addEventListener("click", function (ev) {
          ev.stopPropagation();
          pinAgent(a.id);
          highlightFan();
        });
        fan.appendChild(card);
      });
    }

    function highlightFan() {
      var beat = currentBeat();
      $all(".agent-card", fan).forEach(function (c) {
        var id = c.getAttribute("data-id");
        c.classList.toggle("current", !!(beat && beat.agentId === id));
        c.classList.toggle("pinned", state.pinnedAgentId === id);
      });
    }

    function onBeat(beat) {
      if (!beat) return;
      feltShowAt = nowMs();
      felt.classList.remove("show");
      void felt.offsetWidth;
      felt.classList.add("show");
      fillFelt(beat);
      if (state.view === "chips") {
        showCallout(callout, (beat.unverified ? "未核实" : shortStatus(beat.status)) + "  ·  " + beat.title, statusKind(beat.status));
        spawnSparks(720, 400, statusColor(beat.status), beat.unverified ? 8 : 20, beat.unverified ? 0.6 : 1.1);
      }
    }

    function fillFelt(beat) {
      felt.querySelector(".fc-name").textContent = beat.title || "—";
      felt.querySelector(".fc-title").textContent = beat.kicker || "";
      var st = felt.querySelector(".fc-st");
      st.textContent = beat.status;
      setPip(felt.querySelector(".pip"), statusKind(beat.status));
      var cur = beat.text || "";
      if (cur.length > 70) cur = cur.slice(0, 70) + "…";
      felt.querySelector(".fc-current").textContent = cur;
    }

    function draw() {
      if (!ready) return;
      var b = document.getElementById("sb-beat");
      if (b) b.textContent = String(state.beatIndex + 1);
      var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = String(v); };
      set("sb-ver", pipelineCount("verified"));
      set("sb-act", pipelineCount("active"));
      set("sb-wait", pipelineCount("waiting"));
      set("sb-done", pipelineCount("delivered"));
      set("sb-inc", pipelineCount("incomplete"));
      set("sb-unk", pipelineCount("unknown"));
      highlightFan();
      var beat = currentBeat();
      if (beat) fillFelt(beat);
      if (!felt.classList.contains("show")) felt.classList.add("show");
      drawParticlesIn(gSparks);
    }

    return { setup: setup, draw: draw, onBeat: onBeat, show: function () { buildFan(); } };
  })();

  function showCallout(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.className = "callout show k-" + (kind || "done");
    clearTimeout(el._t);
    el._t = setTimeout(function () {
      el.classList.add("hide");
      el.classList.remove("show");
    }, reduceMotion ? 200 : 900);
  }


  /* =========================================================
     节拍
     ========================================================= */
  Views.rhythm = (function () {
    var root, svgRoot, gLanes, gNotes, gBeam, gSparks, flip, mCombo, mQueue, callout;
    var notes = [];
    var ready = false;

    function setup() {
      root = document.getElementById("view-rhythm");
      empty(root);
      svgRoot = svg("svg", {
        class: "instrument",
        viewBox: "0 0 1440 820",
        preserveAspectRatio: "xMidYMid meet",
        "aria-label": "节拍"
      }, root);
      gLanes = svg("g", {}, svgRoot);
      gNotes = svg("g", {}, svgRoot);
      gBeam = svg("g", {}, svgRoot);
      gSparks = svg("g", {}, svgRoot);
      drawLanes();

      flip = document.createElement("div");
      flip.className = "flip-panel";
      flip.innerHTML =
        '<div class="flip-digits" id="flip-num"></div>' +
        '<div class="flip-sub" id="flip-sub"></div>';
      root.appendChild(flip);

      mCombo = document.createElement("div");
      mCombo.className = "rhythm-side rhythm-meter";
      mCombo.style.left = "22%";
      mCombo.style.top = "46%";
      mCombo.innerHTML = '<div class="rm-val" id="rm-combo">0</div><div class="rm-lab">连击</div>';
      root.appendChild(mCombo);

      mQueue = document.createElement("div");
      mQueue.className = "rhythm-side rhythm-meter";
      mQueue.style.left = "70%";
      mQueue.style.top = "46%";
      mQueue.innerHTML = '<div class="rm-val" id="rm-queue">0</div><div class="rm-lab">队列</div>';
      root.appendChild(mQueue);

      callout = document.createElement("div");
      callout.className = "callout";
      callout.style.top = "70%";
      root.appendChild(callout);

      ready = true;
    }

    var HORIZON = 140, BEAM_Y = 640, MID = 720;

    function persp(lane, t, nLanes) {
      var depth = t * t;
      var scale = 0.12 + 0.88 * depth;
      var laneW = 86 * scale;
      var x = MID + (lane - (nLanes - 1) / 2) * laneW * 1.7;
      var y = HORIZON + t * (BEAM_Y - HORIZON);
      return { x: x, y: y, scale: scale };
    }

    function drawLanes() {
      empty(gLanes);
      empty(gBeam);
      var streams = (state.data && state.data.streams) || [];
      var n = streams.length || 6;
      /* perspective surface */
      var pL = persp(-0.7, 0, n), pR = persp(n - 0.3, 0, n);
      var qL = persp(-0.7, 1, n), qR = persp(n - 0.3, 1, n);
      svg("path", {
        d: "M " + pL.x + " " + pL.y + " L " + pR.x + " " + pR.y + " L " + qR.x + " " + qR.y + " L " + qL.x + " " + qL.y + " Z",
        fill: "#eaeadd",
        stroke: "#d6d8ce",
        "stroke-width": 1
      }, gLanes);
      /* lane lines */
      for (var i = 0; i <= n; i++) {
        var a = persp(i - 0.5, 0, n);
        var b = persp(i - 0.5, 1, n);
        svg("line", {
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          stroke: "#d6d8ce", "stroke-width": 0.8, opacity: "0.8"
        }, gLanes);
      }
      /* guide ticks on surface */
      for (var t = 0.15; t < 1; t += 0.12) {
        var u = persp(-0.5, t, n), v = persp(n - 0.5, t, n);
        svg("line", { x1: u.x, y1: u.y, x2: v.x, y2: v.y, stroke: "#d6d8ce", "stroke-width": 0.5 }, gLanes);
      }
      /* stream labels just above the judgment beam */
      streams.forEach(function (s, i) {
        var p = persp(i, 0.78, n);
        var short = ({
          speech: "分享稿", film: "短片", loopos: "LoopOS",
          console: "观察台", kindling: "火种", hud: "任务仪"
        })[s.id] || s.name;
        svg("text", {
          x: p.x, y: p.y - 10,
          "text-anchor": "middle",
          fill: COLORS.ink2,
          "font-size": 11,
          "font-weight": 600,
          "letter-spacing": "0.06em",
          text: short
        }, gLanes);
      });

      /* curved judgment beam — top of a large circle whose center sits below the stage */
      var beam = svg("g", {}, gBeam);
      svg("path", {
        d: describeBeam(720, 1560, 900, 70),
        fill: "#fcfaf5",
        stroke: "#d6d8ce",
        "stroke-width": 1.1
      }, beam);
      drawBeamTicks(beam);
    }

    function describeBeam(cx, cy, r, thick) {
      var a0 = -Math.PI / 2 - 0.72, a1 = -Math.PI / 2 + 0.72;
      function pt(a, rad) { return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]; }
      var p0 = pt(a0, r), p1 = pt(a1, r);
      var q1 = pt(a1, r + thick), q0 = pt(a0, r + thick);
      return "M " + p0[0] + " " + p0[1] +
        " A " + r + " " + r + " 0 0 1 " + p1[0] + " " + p1[1] +
        " L " + q1[0] + " " + q1[1] +
        " A " + (r + thick) + " " + (r + thick) + " 0 0 0 " + q0[0] + " " + q0[1] + " Z";
    }

    function drawBeamTicks(parent) {
      var cx = 720, cy = 1560, r = 900;
      for (var i = -36; i <= 36; i++) {
        var a = -Math.PI / 2 + (i / 36) * 0.62;
        var major = i % 6 === 0;
        var mid = i % 3 === 0;
        var r0 = r - 4;
        var r1 = r0 + (major ? 16 : mid ? 9 : 5);
        var x0 = cx + Math.cos(a) * r0, y0 = cy + Math.sin(a) * r0;
        var x1 = cx + Math.cos(a) * r1, y1 = cy + Math.sin(a) * r1;
        svg("line", {
          x1: x0, y1: y0, x2: x1, y2: y1,
          stroke: "#69716a",
          "stroke-width": major ? 1.1 : 0.5,
          opacity: major ? "0.8" : "0.5"
        }, parent);
      }
      /* center judgment mark */
      var mx = cx, my = cy - r;
      svg("rect", { x: mx - 14, y: my - 10, width: 28, height: 18, rx: 3, fill: "#eaeadd", stroke: "#9eaa9c" }, parent);
      svg("polygon", { points: mx + "," + (my + 12) + " " + (mx - 6) + "," + (my + 4) + " " + (mx + 6) + "," + (my + 4), fill: "#69716a" }, parent);
    }

    function streamIndex(id) {
      var streams = (state.data && state.data.streams) || [];
      for (var i = 0; i < streams.length; i++) if (streams[i].id === id) return i;
      return -1;
    }

    function onBeat(beat) {
      if (!beat) return;
      var lane = streamIndex(beat.streamId);
      var hitAt = nowMs();
      if (lane >= 0) {
        notes.push({
          lane: lane,
          hitAt: hitAt,
          travel: reduceMotion ? 200 : 1500,
          status: beat.status,
          unverified: !!beat.unverified,
          title: beat.title
        });
      }
      if (state.view === "rhythm") {
        showCallout(callout, (beat.unverified ? "未核实" : shortStatus(beat.status)) + "  ·  " + beat.title, statusKind(beat.status));
        if (lane >= 0) {
          var p = persp(lane, 1, ((state.data && state.data.streams) || []).length || 6);
          spawnSparks(p.x, BEAM_Y - 8, statusColor(beat.status), beat.unverified ? 6 : 16, beat.unverified ? 0.5 : 1);
        } else if (beat.unverified) {
          spawnSparks(MID, BEAM_Y - 8, COLORS.unknown, 6, 0.4);
        }
      }
    }

    function draw(ts) {
      if (!ready) return;
      var streams = (state.data && state.data.streams) || [];
      var n = streams.length || 6;
      empty(gNotes);
      var tnow = nowMs();
      notes = notes.filter(function (note) {
        var t = (tnow - (note.hitAt - note.travel)) / note.travel;
        if (t > 1.15) return false;
        if (t < 0) t = 0;
        var p = persp(note.lane, clamp(t, 0, 1), n);
        var w = 36 * p.scale, h = 16 * p.scale;
        svg("rect", {
          x: p.x - w / 2, y: p.y - h / 2, width: w, height: h, rx: 4 * p.scale,
          fill: note.unverified ? COLORS.unknownSoft : statusColor(note.status, true),
          stroke: statusColor(note.status),
          "stroke-width": 1,
          opacity: note.unverified ? "0.5" : String(0.4 + 0.6 * p.scale)
        }, gNotes);
        return t <= 1.15;
      });

      /* upcoming notes for future beats so you see them approaching */
      previewUpcoming(n, tnow);

      /* flip clock */
      var num = String(state.beatIndex + 1).padStart(3, "0");
      var box = document.getElementById("flip-num");
      if (box) {
        box.innerHTML = "";
        num.split("").forEach(function (ch) {
          var s = document.createElement("span");
          s.textContent = ch;
          box.appendChild(s);
        });
      }
      var sub = document.getElementById("flip-sub");
      if (sub) {
        sub.textContent = "第 " + (state.beatIndex + 1) + " 拍  ·  " + (state.data.snapshotAt) + " " + state.data.timezone +
          "  ·  最高连击 " + state.maxCombo;
      }
      var c = document.getElementById("rm-combo");
      if (c) c.textContent = String(state.combo);
      var q = document.getElementById("rm-queue");
      if (q) q.textContent = String(Math.max(0, state.beats.length - state.beatIndex - 1));

      drawParticlesIn(gSparks);
    }

    function previewUpcoming(nLanes, tnow) {
      /* show notes for the next 2 beats if they have streams, computed from clock */
      var dur = beatDuration();
      for (var ahead = 1; ahead <= 2; ahead++) {
        var idx = (state.beatIndex + ahead) % state.beats.length;
        var beat = state.beats[idx];
        if (!beat || !beat.streamId) continue;
        var lane = streamIndex(beat.streamId);
        if (lane < 0) continue;
        var travel = reduceMotion ? 200 : 1500;
        var hitAt = tnow + ahead * dur - state.acc;
        var t = (tnow - (hitAt - travel)) / travel;
        if (t < 0 || t > 1) continue;
        var already = notes.some(function (n) { return n.lane === lane && Math.abs(n.hitAt - hitAt) < 80; });
        if (already) continue;
        var p = persp(lane, t, nLanes);
        var w = 36 * p.scale, h = 16 * p.scale;
        svg("rect", {
          x: p.x - w / 2, y: p.y - h / 2, width: w, height: h, rx: 4 * p.scale,
          fill: beat.unverified ? COLORS.unknownSoft : statusColor(beat.status, true),
          stroke: statusColor(beat.status),
          "stroke-width": 1,
          opacity: String(0.35 + 0.6 * p.scale)
        }, gNotes);
      }
    }

    return { setup: setup, draw: draw, onBeat: onBeat, show: function () {} };
  })();


  /* =========================================================
     蜂群
     ========================================================= */
  Views.hive = (function () {
    var root, svgRoot, gField, gHive, gFlowers, gBees, gLabels;
    var ready = false;
    var flowerPos = {};

    function setup() {
      root = document.getElementById("view-hive");
      empty(root);
      svgRoot = svg("svg", {
        class: "instrument",
        viewBox: "0 0 1440 820",
        preserveAspectRatio: "xMidYMid meet",
        "aria-label": "蜂群总览"
      }, root);
      var defs = svg("defs", {}, svgRoot);
      var wash = svg("radialGradient", { id: "meadow", cx: "50%", cy: "46%", r: "55%" }, defs);
      svg("stop", { offset: "0%", "stop-color": "#dceee9", "stop-opacity": "0.55" }, wash);
      svg("stop", { offset: "70%", "stop-color": "#f4f1e9", "stop-opacity": "0" }, wash);

      gField = svg("g", {}, svgRoot);
      svg("rect", { x: 0, y: 0, width: 1440, height: 820, fill: "url(#meadow)" }, gField);
      gHive = svg("g", {}, svgRoot);
      gFlowers = svg("g", {}, svgRoot);
      gBees = svg("g", {}, svgRoot);
      gLabels = svg("g", {}, svgRoot);

      /* unverified ledge: heading above the bar so it never covers a bee */
      svg("text", {
        x: 720, y: 726,
        "text-anchor": "middle",
        fill: COLORS.unknownInk,
        "font-size": 10,
        "letter-spacing": "0.14em",
        text: "未在共享场合核实"
      }, gField);
      svg("rect", {
        x: 160, y: 736, width: 1120, height: 62, rx: 12,
        fill: "#eaeadd", stroke: "#d6d8ce"
      }, gField);

      ready = true;
    }

    function hex(cx, cy, r) {
      var pts = [];
      for (var i = 0; i < 6; i++) {
        var a = (Math.PI / 3) * i - Math.PI / 6;
        pts.push((cx + Math.cos(a) * r) + "," + (cy + Math.sin(a) * r));
      }
      return pts.join(" ");
    }

    function drawHive(ts) {
      empty(gHive);
      var cx = 720, cy = 340;
      /* outer mechanical hive */
      svg("polygon", { points: hex(cx, cy, 92), fill: "#fcfaf5", stroke: "#d6d8ce", "stroke-width": 1.2 }, gHive);
      var streams = (state.data && state.data.streams) || [];
      var beat = currentBeat();
      for (var i = 0; i < 7; i++) {
        var ang = (Math.PI / 3) * i - Math.PI / 6;
        var hx = cx + Math.cos(ang) * 44;
        var hy = cy + Math.sin(ang) * 44;
        if (i === 6) { hx = cx; hy = cy; }
        var s = streams[i] || null;
        var on = s && beat && beat.streamId === s.id;
        svg("polygon", {
          points: hex(hx, hy, 22),
          fill: on ? statusColor(s.status, true) : "#eaeadd",
          stroke: on ? statusColor(s.status) : "#d6d8ce",
          "stroke-width": on ? 1.4 : 0.8
        }, gHive);
      }
      svg("text", {
        x: cx, y: cy + 4,
        "text-anchor": "middle",
        fill: COLORS.ink,
        "font-size": 12,
        "font-weight": 650,
        "letter-spacing": "0.12em",
        text: "诸子百家"
      }, gHive);
      /* hive caption omitted so the 火种 flower has room */
    }

    function flowerLayout() {
      /* around the hive */
      return {
        hud: { x: 720, y: 160 },
        speech: { x: 430, y: 260 },
        film: { x: 1010, y: 260 },
        loopos: { x: 400, y: 500 },
        console: { x: 1040, y: 500 },
        kindling: { x: 720, y: 580 }
      };
    }

    function drawFlower(g, x, y, stream, t, active) {
      var color = streamColor(stream.id);
      var kind = statusKind(stream.status);
      var petals = 7;
      var r = active ? 28 : 22;
      for (var i = 0; i < petals; i++) {
        var a = (i / petals) * Math.PI * 2 + (reduceMotion ? 0 : Math.sin(t / 900) * 0.05);
        var px = x + Math.cos(a) * r * 0.55;
        var py = y + Math.sin(a) * r * 0.55;
        svg("ellipse", {
          cx: px, cy: py,
          rx: 9, ry: 14,
          fill: statusColor(stream.status, true),
          stroke: color,
          "stroke-width": 0.7,
          opacity: "0.9",
          transform: "rotate(" + (a * 180 / Math.PI + 90) + " " + px + " " + py + ")"
        }, g);
      }
      svg("circle", {
        cx: x, cy: y, r: 8,
        fill: active ? statusColor(stream.status) : "#fcfaf5",
        stroke: statusColor(stream.status),
        "stroke-width": 1.1
      }, g);
      /* stem */
      svg("path", {
        d: "M " + x + " " + (y + 12) + " C " + (x + 6) + " " + (y + 40) + ", " + (x - 8) + " " + (y + 50) + ", " + x + " " + (y + 62),
        fill: "none", stroke: "#dceee9", "stroke-width": 1.2
      }, g);
      /* plaque */
      var short = shortStreamLabel(stream.id, stream.name);
      svg("rect", {
        x: x - 28, y: y + 66, width: 56, height: 18, rx: 8,
        fill: "#fcfaf5", stroke: "#d6d8ce"
      }, g);
      svg("text", {
        x: x, y: y + 78,
        "text-anchor": "middle",
        fill: statusInk(stream.status),
        "font-size": 9,
        "font-weight": 650,
        text: short
      }, g);
      var hit = svg("circle", { cx: x, cy: y, r: 36, fill: "transparent", cursor: "pointer" }, g);
      hit.addEventListener("click", function (ev) {
        ev.stopPropagation();
        holdItem({ type: "stream", id: stream.id });
      });
    }

    function drawBee(g, x, y, agent, flap, working) {
      var body = svg("g", { transform: "translate(" + x + "," + y + ")", cursor: "pointer" }, g);
      var kind = statusKind(agent.status);
      var dim = agent.status === "未核实";
      var wingOpen = dim ? 6 : (8 + Math.sin(flap) * (working ? 7 : 5));
      if (reduceMotion) wingOpen = dim ? 6 : 8;
      /* wings */
      svg("ellipse", {
        cx: -10, cy: -4, rx: wingOpen, ry: 5,
        fill: "rgba(255,255,255,0.7)", stroke: "#d6d8ce", "stroke-width": 0.6,
        opacity: dim ? "0.4" : "0.85",
        transform: "rotate(-20 -10 -4)"
      }, body);
      svg("ellipse", {
        cx: 10, cy: -4, rx: wingOpen, ry: 5,
        fill: "rgba(255,255,255,0.7)", stroke: "#d6d8ce", "stroke-width": 0.6,
        opacity: dim ? "0.4" : "0.85",
        transform: "rotate(20 10 -4)"
      }, body);
      /* body */
      svg("ellipse", {
        cx: 0, cy: 2, rx: 11, ry: 7,
        fill: dim ? COLORS.unknownSoft : statusColor(agent.status, true),
        stroke: statusColor(agent.status),
        "stroke-width": 1,
        opacity: dim ? "0.75" : "1"
      }, body);
      svg("line", { x1: -4, y1: -1, x2: -4, y2: 5, stroke: statusColor(agent.status), "stroke-width": 0.7, opacity: "0.6" }, body);
      svg("line", { x1: 2, y1: -1, x2: 2, y2: 5, stroke: statusColor(agent.status), "stroke-width": 0.7, opacity: "0.6" }, body);
      /* head */
      svg("circle", { cx: 11, cy: 1, r: 4.2, fill: dim ? "#e3e7d9" : "#fcfaf5", stroke: statusColor(agent.status), "stroke-width": 0.7 }, body);
      svg("text", {
        x: 0, y: 22,
        "text-anchor": "middle",
        fill: dim ? COLORS.unknownInk : COLORS.ink2,
        "font-size": 10,
        "font-weight": 650,
        text: agent.name
      }, body);
      if (dim) {
        svg("text", {
          x: 0, y: 34,
          "text-anchor": "middle",
          fill: COLORS.unknownInk,
          "font-size": 8,
          text: "未核实"
        }, body);
      }
      body.addEventListener("click", function (ev) {
        ev.stopPropagation();
        pinAgent(agent.id);
      });
      if (state.pinnedAgentId === agent.id) {
        svg("circle", { cx: 0, cy: 2, r: 22, fill: "none", stroke: COLORS.wait, "stroke-width": 1, "stroke-dasharray": "3 2" }, body);
      }
    }

    function draw(ts) {
      if (!ready) return;
      var t = ts || 0;
      drawHive(t);
      empty(gFlowers);
      empty(gBees);
      var pos = flowerLayout();
      flowerPos = pos;
      var streams = (state.data && state.data.streams) || [];
      var beat = currentBeat();
      streams.forEach(function (s) {
        var p = pos[s.id];
        if (!p) return;
        drawFlower(gFlowers, p.x, p.y, s, t, !!(beat && beat.streamId === s.id));
      });

      var agents = (state.data && state.data.agents) || [];
      var unverified = [];
      agents.forEach(function (a) {
        if (a.status === "未核实") { unverified.push(a); return; }
        var dest = { x: 720, y: 340 };
        if (a.id === "mozi" && pos.hud) dest = { x: pos.hud.x + 36, y: pos.hud.y - 8 };
        else if (a.id === "zhuangzi" && pos.film) dest = { x: pos.film.x + 40, y: pos.film.y - 10 };
        else if (a.id === "huizi" && pos.speech) dest = { x: pos.speech.x - 40, y: pos.speech.y - 12 };
        else if (a.id === "xunzi" && pos.speech) dest = { x: pos.speech.x + 8, y: pos.speech.y - 44 };
        else if (a.id === "suqin" && pos.speech) dest = { x: pos.speech.x + 48, y: pos.speech.y + 8 };
        else if (a.id === "codex" && pos.loopos) dest = { x: pos.loopos.x - 52, y: pos.loopos.y - 20 };
        var bob = reduceMotion ? 0 : Math.sin(t / 420 + a.name.length) * 6;
        var orbit = 0;
        if (a.status === "等待义情" && !reduceMotion) {
          orbit = Math.sin(t / 1600 + a.name.charCodeAt(0)) * 10;
        }
        var working = a.status === "进行中";
        var flap = t / (working ? 70 : 120) + a.name.charCodeAt(0);
        if (beat && beat.agentId === a.id && !reduceMotion) {
          dest.x += Math.sin(t / 80) * 4;
        }
        drawBee(gBees, dest.x + orbit, dest.y + bob, a, flap, working);
      });
      unverified.forEach(function (a, i) {
        var n = unverified.length;
        var x = 240 + i * (960 / Math.max(n - 1, 1));
        var y = 762;
        var flap = t / 800 + i;
        drawBee(gBees, x, y, a, flap, false);
      });
    }

    return { setup: setup, draw: draw, onBeat: function () {}, show: function () {} };
  })();

  /* ---------- chrome bindings & init ---------- */
  function bindChrome() {
    $all(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        setView(tab.getAttribute("data-view"));
      });
    });
    var play = document.getElementById("btn-play");
    play.addEventListener("click", function () { setPlaying(!state.playing); });
    document.getElementById("btn-unpin").addEventListener("click", function () {
      if (state.pinnedAgentId) pinAgent(state.pinnedAgentId);
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.target && /input|textarea/i.test(ev.target.tagName)) return;
      if (ev.code === "Space") {
        ev.preventDefault();
        setPlaying(!state.playing);
      } else if (ev.key === "ArrowRight") {
        ev.preventDefault();
        advanceBeat();
      } else if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        if (!state.beats.length) return;
        state.beatIndex = (state.beatIndex - 1 + state.beats.length) % state.beats.length;
        state.acc = 0;
        state.phase = 0;
        landBeat(currentBeat(), false);
      } else if (ev.key >= "1" && ev.key <= "6") {
        var names = ["dial", "loom", "factory", "chips", "rhythm", "hive"];
        setView(names[Number(ev.key) - 1]);
      }
    });
    var loader = document.getElementById("load-snapshot");
    if (loader) {
      loader.addEventListener("change", function () {
        var file = loader.files && loader.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            applyData(parseSnapshot(String(reader.result)));
            state.loopCount = 0;
            state.combo = 0;
            state.acc = 0;
            state.phase = 0;
            showFromBeat(currentBeat());
            renderChrome();
            /* rebuild views that cache data-derived DOM */
            if (Views.chips && Views.chips.setup) Views.chips.setup();
            if (Views.rhythm && Views.rhythm.setup) Views.rhythm.setup();
            if (Views.hive && Views.hive.setup) Views.hive.setup();
            if (Views.dial && Views.dial.setup) Views.dial.setup();
            if (Views.loom && Views.loom.setup) Views.loom.setup();
            if (Views.factory && Views.factory.setup) Views.factory.setup();
            landBeat(currentBeat(), false);
          } catch (err) {
            alert("无法读取这份快照：" + err.message);
          }
        };
        reader.readAsText(file, "utf-8");
      });
    }
  }

  function init() {
    loadData().then(function (data) {
      applyData(data);
      bindChrome();
      Views.dial.setup();
      Views.loom.setup();
      Views.factory.setup();
      Views.chips.setup();
      Views.rhythm.setup();
      Views.hive.setup();
      var hash = (location.hash || "").replace(/^#/, "");
      setView(Views[hash] ? hash : "dial");
      var params = {};
      try { params = Object.fromEntries(new URLSearchParams(location.search)); } catch (e2) {}
      setPlaying(!(params.paused === "1" || params.paused === "true"));
      showFromBeat(currentBeat());
      renderChrome();
      landBeat(currentBeat(), false);
      requestAnimationFrame(tick);
    }).catch(function (err) {
      var hon = document.getElementById("honesty");
      if (hon) hon.textContent = "无法载入快照：" + err.message;
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

