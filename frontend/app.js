const state = {
  ws: null,
  playerId: null,
  roomCode: null,
  gameType: null,
  hostId: null,
  players: [],
  roomState: "lobby",
  gameInfo: null,
  lastGameState: null,
  myRole: null,
  detectiveResult: null,
  lastNightResult: null,
  lastVoteResult: null,
  chatLog: [],
};

let countdownInterval = null;
let gameErrorTimeout = null;

function resetRoundState() {
  state.myRole = null;
  state.detectiveResult = null;
  state.lastNightResult = null;
  state.lastVoteResult = null;
  state.chatLog = [];
  state.arenaInitialized = false;
  state.arenaGameType = null;
  state.arenaDots = null;
  activeDirs.clear();
  lastMoveKey = null;
  state.clueRoundInitialized = false;
  state.pictionaryCanvas = null;
  state.pictionaryCtx = null;
  state.antakshariInitialized = false;
  state.lastDiceRoll = null;
  state.myHand = null;
  state.snakeLadderInitialized = false;
  state.slInitialized = false;
  state.slTokens = null;
  state.unoInitialized = false;
  state.unoLastTopKey = null;
  state.ludoInitialized = false;
  state.ludoTokenEls = null;
  state.pendingWildCardIndex = null;
}

// ---------- Arena movement controls (Hide & Seek, Freeze Tag) ----------

const ARENA_GAMES = ["hide_seek", "freeze_tag"];
const DIRECTION_VECTORS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const KEY_TO_DIR = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
};
const activeDirs = new Set();
let lastMoveKey = null;

function normalizeKeyName(e) {
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

function recomputeAndSendMove() {
  if (!ARENA_GAMES.includes(state.gameType)) return;
  if (screens.game.classList.contains("hidden")) return;
  let dx = 0;
  let dy = 0;
  activeDirs.forEach((d) => {
    dx += DIRECTION_VECTORS[d][0];
    dy += DIRECTION_VECTORS[d][1];
  });
  dx = Math.max(-1, Math.min(1, dx));
  dy = Math.max(-1, Math.min(1, dy));
  const key = `${dx},${dy}`;
  if (key === lastMoveKey) return;
  lastMoveKey = key;
  send("game_action", { action: { type: "move", dx, dy } });
}

window.addEventListener("keydown", (e) => {
  const dir = KEY_TO_DIR[normalizeKeyName(e)];
  if (dir) {
    activeDirs.add(dir);
    recomputeAndSendMove();
  }
});
window.addEventListener("keyup", (e) => {
  const dir = KEY_TO_DIR[normalizeKeyName(e)];
  if (dir) {
    activeDirs.delete(dir);
    recomputeAndSendMove();
  }
});

function bindDpadButton(el, dir) {
  const press = (ev) => {
    ev.preventDefault();
    activeDirs.add(dir);
    recomputeAndSendMove();
  };
  const release = (ev) => {
    ev.preventDefault();
    activeDirs.delete(dir);
    recomputeAndSendMove();
  };
  el.addEventListener("mousedown", press);
  el.addEventListener("mouseup", release);
  el.addEventListener("mouseleave", release);
  el.addEventListener("touchstart", press, { passive: false });
  el.addEventListener("touchend", release);
}

function buildDpad() {
  const pad = document.createElement("div");
  pad.className = "dpad";
  pad.innerHTML = `
    <button class="dpad-up">&uarr;</button>
    <button class="dpad-left">&larr;</button>
    <button class="dpad-right">&rarr;</button>
    <button class="dpad-down">&darr;</button>
  `;
  bindDpadButton(pad.querySelector(".dpad-up"), "up");
  bindDpadButton(pad.querySelector(".dpad-down"), "down");
  bindDpadButton(pad.querySelector(".dpad-left"), "left");
  bindDpadButton(pad.querySelector(".dpad-right"), "right");
  return pad;
}

// Hand-authored illustrated character avatar (top-down chibi style).
// Recraft (the project's standard image-generation tool) isn't configured in
// this session, so this is a hand-drawn SVG fallback at the best quality
// achievable by hand, per that tool's own documented fallback rule.
const HAIR_PALETTE = ["#3a2a20", "#1c1c1e", "#5c3a21", "#7a4a2b", "#2b2320", "#4a3528"];

function characterSVG(colorHex, { isChaser, caught, hairKey } = {}) {
  const skin = "#ffd9b0";
  const hair = HAIR_PALETTE[hashString(hairKey || colorHex) % HAIR_PALETTE.length];
  const hairHighlight = "#8a6a4a";
  const clothColor = caught ? "#8a8d99" : colorHex;

  const blush = `
    <ellipse cx="14.3" cy="25.2" rx="2.3" ry="1.3" fill="#ff9aa8" opacity="0.55"/>
    <ellipse cx="29.7" cy="25.2" rx="2.3" ry="1.3" fill="#ff9aa8" opacity="0.55"/>`;

  let eyes;
  let brows;
  let mouth;
  if (caught) {
    eyes = `
      <path d="M14 21 Q16.5 23.6 19 21" stroke="#2a2a2a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M25 21 Q27.5 23.6 30 21" stroke="#2a2a2a" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
    brows = "";
    mouth = `<ellipse cx="22" cy="27.5" rx="1.5" ry="1" fill="#2a2a2a"/>`;
  } else {
    eyes = `
      <ellipse cx="16.3" cy="21.6" rx="3.2" ry="3.7" fill="white"/>
      <ellipse cx="27.7" cy="21.6" rx="3.2" ry="3.7" fill="white"/>
      <circle cx="16.6" cy="22.4" r="2.2" fill="#3a2a20"/>
      <circle cx="28" cy="22.4" r="2.2" fill="#3a2a20"/>
      <circle cx="17.4" cy="21" r="0.8" fill="white"/>
      <circle cx="28.8" cy="21" r="0.8" fill="white"/>
      <circle cx="16" cy="23" r="0.4" fill="white" opacity="0.8"/>
      <circle cx="27.4" cy="23" r="0.4" fill="white" opacity="0.8"/>
      <path d="M13.3 19.1 Q16.3 17.3 19.7 18.9" stroke="#241a14" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      <path d="M24.3 18.9 Q27.7 17.3 30.7 19.1" stroke="#241a14" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
    brows = `
      <path d="M13.3 16 Q16.3 14.3 19.5 15.6" stroke="${hair}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <path d="M24.5 15.6 Q27.7 14.3 30.7 16" stroke="${hair}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
    mouth = `<path d="M19.3 27.3 Q22 29.9 24.7 27.3" stroke="#c2694f" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
  }

  const chaserMark = isChaser && !caught
    ? `<path d="M8.5 13.5 L35.5 13.5 L33.5 17.5 L22 16 L10.5 17.5 Z" fill="#e5473b"/>
       <circle cx="22" cy="15.2" r="1.3" fill="#ffd93d"/>
       <path d="M33.5 14.5 L40 11 M33.5 16.5 L40 17.5" stroke="#e5473b" stroke-width="1.5" stroke-linecap="round" fill="none"/>`
    : "";

  const iceOverlay = caught
    ? `<g stroke="#bfe6ff" stroke-width="1.6" stroke-linecap="round">
         <path d="M4 6 L7 11 M7 6 L4 11"/><path d="M38 6 L41 11 M41 6 L38 11"/>
       </g>`
    : "";

  return `
    <svg viewBox="0 0 44 44" width="100%" height="100%" aria-hidden="true">
      <ellipse cx="22" cy="41" rx="11.5" ry="2" fill="rgba(0,0,0,0.28)"/>
      <path d="M9.5 43 Q9 30.5 22 30.5 Q35 30.5 34.5 43 Z" fill="${clothColor}"/>
      <rect x="18.7" y="24.5" width="6.6" height="7.5" rx="2.4" fill="${skin}"/>
      <path d="M7.5 22.5 Q6.2 9.5 22 7.8 Q37.8 9.5 36.5 22.5 Q36.3 28.5 32 27.3
               Q33.2 16 22 15.2 Q10.8 16 12 27.3 Q7.7 28.5 7.5 22.5 Z" fill="${hair}"/>
      <circle cx="22" cy="20.3" r="11.7" fill="${skin}"/>
      ${blush}
      ${brows}
      ${eyes}
      ${mouth}
      <path d="M9 18.5 Q9.5 8 22 6.3 Q34.5 8 35 18.5 Q30 10.8 22 11.8 Q14 10.8 9 18.5 Z" fill="${hair}"/>
      <path d="M17 8.3 Q18.3 12.5 16.2 16" stroke="${hairHighlight}" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.65"/>
      <path d="M27.5 8.6 Q28.6 11.5 27.3 14.3" stroke="${hairHighlight}" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.5"/>
      ${chaserMark}
      ${iceOverlay}
    </svg>`;
}

function updateArenaDots(box, positions) {
  if (!state.arenaDots) state.arenaDots = {};
  const seenIds = new Set();
  Object.entries(positions).forEach(([pid, p]) => {
    seenIds.add(pid);
    let dot = state.arenaDots[pid];
    if (!dot) {
      dot = document.createElement("div");
      dot.className = "arena-dot";
      const charWrap = document.createElement("div");
      charWrap.className = "arena-char";
      const label = document.createElement("span");
      label.className = "arena-label";
      label.textContent = nicknameOf(pid);
      dot.appendChild(charWrap);
      dot.appendChild(label);
      box.appendChild(dot);
      state.arenaDots[pid] = dot;
    }
    dot.style.left = `${p.x}%`;
    dot.style.top = `${p.y}%`;
    const isChaser = p.role === "seeker" || p.role === "it";
    const caught = !!(p.found || p.frozen);
    const color = isChaser ? "#e5473b" : "#17c3a2";
    dot.querySelector(".arena-char").innerHTML = characterSVG(color, { isChaser, caught });
    dot.className = "arena-dot" + (pid === state.playerId ? " me" : "") + (caught ? " caught" : "");
  });
  Object.keys(state.arenaDots).forEach((pid) => {
    if (!seenIds.has(pid)) {
      state.arenaDots[pid].remove();
      delete state.arenaDots[pid];
    }
  });
}

const els = {
  status: document.getElementById("connection-status"),
  nickname: document.getElementById("nickname"),
  nicknameAvatar: document.getElementById("nickname-avatar"),
  gameGrid: document.getElementById("game-grid"),
  joinCode: document.getElementById("join-code"),
  joinBtn: document.getElementById("join-btn"),
  homeError: document.getElementById("home-error"),

  lobbyRoomCode: document.getElementById("lobby-room-code"),
  copyCodeBtn: document.getElementById("copy-code-btn"),
  lobbyGameIcon: document.getElementById("lobby-game-icon"),
  lobbyGameName: document.getElementById("lobby-game-name"),
  lobbyGameDesc: document.getElementById("lobby-game-desc"),
  lobbyPlayerCount: document.getElementById("lobby-player-count"),
  lobbyPlayers: document.getElementById("lobby-players"),
  startGameBtn: document.getElementById("start-game-btn"),
  lobbyWaitText: document.getElementById("lobby-wait-text"),
  lobbyError: document.getElementById("lobby-error"),
  leaveLobbyBtn: document.getElementById("leave-lobby-btn"),

  gameRoot: document.getElementById("game-root"),
  gameError: document.getElementById("game-error"),

  gameoverTitle: document.getElementById("gameover-title"),
  gameoverDetail: document.getElementById("gameover-detail"),
  gameoverExtra: document.getElementById("gameover-extra"),
  playAgainBtn: document.getElementById("play-again-btn"),
  backHomeBtn: document.getElementById("back-home-btn"),
};

const screens = {
  home: document.getElementById("screen-home"),
  lobby: document.getElementById("screen-lobby"),
  game: document.getElementById("screen-game"),
  gameover: document.getElementById("screen-gameover"),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

function getNickname() {
  return (els.nickname.value || "Player").trim().slice(0, 20) || "Player";
}

// ---------- WebSocket plumbing ----------

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  state.ws = ws;

  ws.onopen = () => {
    els.status.textContent = "online";
    els.status.className = "status-pill online";
  };
  ws.onclose = () => {
    els.status.textContent = "disconnected — retrying…";
    els.status.className = "status-pill offline";
    setTimeout(connect, 1500);
  };
  ws.onerror = () => ws.close();
  ws.onmessage = (event) => handleMessage(JSON.parse(event.data));
}

function send(type, extra = {}) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type, ...extra }));
  }
}

function handleMessage(msg) {
  switch (msg.type) {
    case "error":
      if (!screens.game.classList.contains("hidden")) {
        els.gameError.textContent = msg.message;
        clearTimeout(gameErrorTimeout);
        gameErrorTimeout = setTimeout(() => { els.gameError.textContent = ""; }, 4000);
      } else if (!screens.lobby.classList.contains("hidden")) {
        els.lobbyError.textContent = msg.message;
      } else {
        els.homeError.textContent = msg.message;
      }
      break;
    case "joined":
      state.playerId = msg.player_id;
      state.roomCode = msg.room_code;
      state.gameType = msg.game_type;
      els.homeError.textContent = "";
      break;
    case "room_update":
      state.hostId = msg.host_id;
      state.players = msg.players;
      state.roomState = msg.state;
      state.gameInfo = msg.game_info;
      state.gameType = msg.game_type;
      renderLobby();
      if (msg.state === "lobby") {
        resetRoundState();
        showScreen("lobby");
      }
      break;
    case "game_state":
      state.lastGameState = msg;
      showScreen("game");
      renderGame(msg);
      break;
    case "player_eliminated":
    case "player_finished_round":
      renderGameEvent(msg);
      break;
    case "game_over":
      renderGameOver(msg.result);
      showScreen("gameover");
      break;
    case "music_playing":
    case "music_stopped":
      renderGame(msg);
      break;
    case "role_info":
      state.myRole = msg;
      renderCurrentGame();
      break;
    case "detective_result":
      state.detectiveResult = msg;
      renderCurrentGame();
      break;
    case "night_result":
      state.lastNightResult = msg;
      renderCurrentGame();
      break;
    case "vote_result":
      state.lastVoteResult = msg;
      renderCurrentGame();
      break;
    case "chat_message":
      state.chatLog.push(msg);
      if (state.chatLog.length > 100) state.chatLog.shift();
      renderCurrentGame();
      break;
    case "guess_made":
      if (state.lastGameState && state.lastGameState.guesses) {
        state.lastGameState.guesses.push(msg);
      }
      renderCurrentGame();
      break;
    case "draw_segment":
      drawSegmentLocal(msg.segment);
      break;
    case "clear_canvas":
      clearPictionaryCanvas();
      break;
    case "dice_rolled":
      state.lastDiceRoll = msg;
      renderCurrentGame();
      break;
    case "hand_update":
      state.myHand = msg.hand;
      renderCurrentGame();
      break;
    default:
      break;
  }
}

// ---------- Home screen ----------

const GAME_ORDER = [
  "tic_tac_toe", "simon_says", "red_light_green_light", "musical_chairs",
  "thief_police", "spyfall", "twenty_questions", "mafia",
  "hide_seek", "freeze_tag",
  "pictionary", "charades", "taboo", "antakshari",
  "snake_ladder", "uno", "ludo",
];

const GAME_ICONS = {
  tic_tac_toe: "❌", simon_says: "🎵", red_light_green_light: "🚦", musical_chairs: "🪑",
  thief_police: "🕵️", spyfall: "🔎", twenty_questions: "❓", mafia: "🔪",
  hide_seek: "🙈", freeze_tag: "🧊", pictionary: "🎨", charades: "🎭",
  taboo: "🚫", antakshari: "🎤", snake_ladder: "🐍", uno: "🃏", ludo: "🎲",
};

const AVATAR_PALETTE = ["#e5473b", "#0fa968", "#2e7ef0", "#e8b400", "#9b59b6", "#17c3a2", "#e67e22", "#e84393"];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function avatarColorFor(key) {
  return AVATAR_PALETTE[hashString(key || "?") % AVATAR_PALETTE.length];
}

async function loadGames() {
  const res = await fetch("/api/games");
  const games = await res.json();
  els.gameGrid.innerHTML = "";
  GAME_ORDER.filter((id) => games[id]).forEach((id) => {
    const info = games[id];
    const playerRange = info.min_players === info.max_players
      ? `${info.min_players} players`
      : `${info.min_players}-${info.max_players} players`;
    const card = document.createElement("div");
    card.className = "game-card";
    card.innerHTML = `
      <div class="game-card-top">
        <span class="game-icon">${GAME_ICONS[id] || "🎮"}</span>
        <span class="player-tag">${playerRange}</span>
      </div>
      <h3>${info.name}</h3>
      <p>${info.description}</p>
      <button>Host this game</button>
    `;
    card.querySelector("button").addEventListener("click", () => {
      els.homeError.textContent = "";
      send("create_room", { nickname: getNickname(), game: id });
    });
    els.gameGrid.appendChild(card);
  });
}

els.nickname.addEventListener("input", () => {
  const name = getNickname();
  els.nicknameAvatar.innerHTML = characterSVG(avatarColorFor(name), {});
});
els.nicknameAvatar.innerHTML = characterSVG(avatarColorFor("?"), {});

els.joinBtn.addEventListener("click", () => {
  const code = els.joinCode.value.trim().toUpperCase();
  if (code.length !== 4) {
    els.homeError.textContent = "Enter the 4-letter room code.";
    return;
  }
  els.homeError.textContent = "";
  send("join_room", { nickname: getNickname(), room_code: code });
});

// ---------- Lobby screen ----------

function renderLobby() {
  els.lobbyRoomCode.textContent = state.roomCode || "----";
  if (state.gameInfo) {
    els.lobbyGameName.textContent = state.gameInfo.name;
    els.lobbyGameDesc.textContent = state.gameInfo.description;
  }
  els.lobbyGameIcon.textContent = GAME_ICONS[state.gameType] || "🎮";
  els.lobbyPlayerCount.textContent = `(${state.players.length})`;

  els.lobbyPlayers.innerHTML = "";
  state.players.forEach((p) => {
    const li = document.createElement("li");
    if (!p.connected) li.className = "disconnected";
    li.innerHTML = `
      <span class="mini-avatar">${characterSVG(avatarColorFor(p.id), {})}</span>
      <span class="player-name">${p.nickname}</span>
      ${p.id === state.hostId ? `<span class="badge-host">👑 HOST</span>` : ""}
    `;
    els.lobbyPlayers.appendChild(li);
  });

  const isHost = state.playerId === state.hostId;
  els.startGameBtn.classList.toggle("hidden", !isHost);
  els.lobbyWaitText.classList.toggle("hidden", isHost);
}

els.startGameBtn.addEventListener("click", () => {
  els.lobbyError.textContent = "";
  send("start_game");
});

els.leaveLobbyBtn.addEventListener("click", () => {
  location.reload();
});

els.copyCodeBtn.addEventListener("click", () => {
  const code = state.roomCode || "";
  const finish = (ok) => {
    els.copyCodeBtn.textContent = ok ? "Copied!" : "Copy";
    setTimeout(() => { els.copyCodeBtn.textContent = "Copy"; }, 1500);
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(code).then(() => finish(true)).catch(() => finish(false));
  } else {
    finish(false);
  }
});

// ---------- Game screens ----------

function renderGame(msg) {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  const root = els.gameRoot;
  if (state.gameType === "tic_tac_toe") renderTicTacToe(root, msg);
  else if (state.gameType === "simon_says") renderSimonSays(root, msg);
  else if (state.gameType === "red_light_green_light") renderRedLightGreenLight(root, msg);
  else if (state.gameType === "musical_chairs") renderMusicalChairs(root, msg);
  else if (state.gameType === "thief_police") renderThiefPolice(root, msg);
  else if (state.gameType === "spyfall") renderSpyfall(root, msg);
  else if (state.gameType === "twenty_questions") renderTwentyQuestions(root, msg);
  else if (state.gameType === "mafia") renderMafia(root, msg);
  else if (state.gameType === "hide_seek") renderHideSeek(root, msg);
  else if (state.gameType === "freeze_tag") renderFreezeTag(root, msg);
  else if (state.gameType === "pictionary") renderPictionary(root, msg);
  else if (state.gameType === "charades") renderClueRound(root, msg, { showTaboo: false });
  else if (state.gameType === "taboo") renderClueRound(root, msg, { showTaboo: true });
  else if (state.gameType === "antakshari") renderAntakshari(root, msg);
  else if (state.gameType === "snake_ladder") renderSnakeLadder(root, msg);
  else if (state.gameType === "uno") renderUno(root, msg);
  else if (state.gameType === "ludo") renderLudo(root, msg);
}

function renderCurrentGame() {
  if (state.lastGameState && !screens.game.classList.contains("hidden")) {
    renderGame(state.lastGameState);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function sendChat(text) {
  send("game_action", { action: { type: "chat", text } });
}

function renderChatBox(container) {
  const box = document.createElement("div");
  box.className = "chat-box";
  box.innerHTML = `
    <div class="chat-log"></div>
    <div class="chat-input-row">
      <input type="text" class="chat-input" placeholder="Say something..." maxlength="200" />
      <button class="chat-send">Send</button>
    </div>
  `;
  container.appendChild(box);

  const log = box.querySelector(".chat-log");
  state.chatLog.forEach((m) => {
    const div = document.createElement("div");
    div.className = "chat-msg" + (m.player_id === state.playerId ? " me" : "");
    div.innerHTML = `<strong>${escapeHtml(m.nickname)}:</strong> ${escapeHtml(m.text)}`;
    log.appendChild(div);
  });
  log.scrollTop = log.scrollHeight;

  const input = box.querySelector(".chat-input");
  const doSend = () => {
    const text = input.value.trim();
    if (!text) return;
    sendChat(text);
    input.value = "";
  };
  box.querySelector(".chat-send").addEventListener("click", doSend);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSend();
  });
}

function startCountdown(el, seconds) {
  let remaining = Math.round(seconds);
  el.textContent = `${remaining}s`;
  countdownInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      el.textContent = "0s";
      clearInterval(countdownInterval);
    } else {
      el.textContent = `${remaining}s`;
    }
  }, 1000);
}

function renderGameEvent(msg) {
  // Lightweight re-render hook for games that want toast-like feedback.
  if (state.gameType === "simon_says" && state.lastGameState) {
    renderSimonSays(els.gameRoot, state.lastGameState, msg);
  }
}

function nicknameOf(playerId) {
  const p = state.players.find((pl) => pl.id === playerId);
  return p ? p.nickname : "?";
}

// Tic Tac Toe
function renderTicTacToe(root, msg) {
  const mySymbol = msg.symbols[state.playerId];
  const isSpectator = msg.spectators.includes(state.playerId);
  const myTurn = msg.turn === state.playerId;

  root.innerHTML = `
    <h2>Tic-Tac-Toe</h2>
    <p class="muted">${isSpectator ? "You are spectating." : `You are <strong>${mySymbol}</strong>.`}
       ${myTurn && !isSpectator ? " Your move!" : ""}</p>
    <div class="ttt-board"></div>
  `;
  const board = root.querySelector(".ttt-board");
  msg.board.forEach((val, i) => {
    const cell = document.createElement("div");
    cell.className = "ttt-cell" + (!val && myTurn && !isSpectator ? " clickable" : "");
    cell.textContent = val || "";
    if (!val && myTurn && !isSpectator) {
      cell.addEventListener("click", () => send("game_action", { action: { cell: i } }));
    }
    board.appendChild(cell);
  });
}

// Simon Says
function renderSimonSays(root, msg, event) {
  const sequence = msg.sequence || [];
  const players = msg.players || [];
  const me = players.find((p) => p.id === state.playerId);
  const amAlive = me ? me.alive : true;

  root.innerHTML = `
    <h2>Simon Says</h2>
    <p class="muted">Round ${msg.round} — sequence length ${sequence.length}</p>
    <div class="simon-grid">
      ${["red", "green", "blue", "yellow"].map((c) => `<button class="simon-pad ${c}" data-color="${c}"></button>`).join("")}
    </div>
    <p id="simon-status" class="muted">${amAlive ? "Watch, then repeat it." : "You're out — spectating."}</p>
    <div class="alive-row">
      ${players.map((p) => `<span class="alive-chip ${p.alive ? "" : "out"}">${nicknameOf(p.id)}</span>`).join("")}
    </div>
  `;

  const pads = root.querySelectorAll(".simon-pad");
  let inputEnabled = false;

  pads.forEach((pad) => {
    pad.addEventListener("click", () => {
      if (!inputEnabled || !amAlive) return;
      send("game_action", { action: { color: pad.dataset.color } });
    });
  });

  // Replay the sequence visually, then enable input.
  let i = 0;
  const statusEl = root.querySelector("#simon-status");
  function flashNext() {
    if (i >= sequence.length) {
      inputEnabled = true;
      if (statusEl && amAlive) statusEl.textContent = "Your turn — repeat the sequence!";
      return;
    }
    const color = sequence[i];
    const pad = root.querySelector(`.simon-pad[data-color="${color}"]`);
    if (pad) {
      pad.classList.add("lit");
      setTimeout(() => pad.classList.remove("lit"), 400);
    }
    i += 1;
    setTimeout(flashNext, 550);
  }
  if (statusEl && amAlive) statusEl.textContent = "Watch the sequence…";
  setTimeout(flashNext, 500);
}

// Red Light, Green Light
function renderRedLightGreenLight(root, msg) {
  const alive = msg.alive[state.playerId];
  root.innerHTML = `
    <h2>Red Light, Green Light</h2>
    <div class="light-indicator ${msg.light}">${msg.light === "green" ? "🟢 GO!" : "🔴 STOP!"}</div>
    <div class="track"></div>
    <button id="move-btn" class="primary" ${alive ? "" : "disabled"}>${alive ? "Move!" : "Eliminated"}</button>
  `;
  const track = root.querySelector(".track");
  Object.entries(msg.positions).forEach(([pid, pos]) => {
    const row = document.createElement("div");
    row.className = "track-row" + (msg.alive[pid] ? "" : " eliminated");
    row.innerHTML = `
      <span class="name">${nicknameOf(pid)}</span>
      <div class="track-bar"><div class="track-fill" style="width:${pos}%"></div></div>
    `;
    track.appendChild(row);
  });

  if (alive) {
    root.querySelector("#move-btn").addEventListener("click", () => {
      send("game_action", { action: { type: "move" } });
    });
  }
}

// Musical Chairs
function renderMusicalChairs(root, msg) {
  const alive = state.lastMusicAlive ? state.lastMusicAlive.includes(state.playerId) : true;
  if (msg.type === "music_playing") {
    state.lastMusicAlive = msg.alive;
  }
  const playing = msg.type === "music_playing";
  const stopped = msg.type === "music_stopped";

  root.innerHTML = `
    <h2>Musical Chairs</h2>
    <p class="muted">Round ${msg.round}</p>
    <div class="music-box">
      <div class="icon">${playing ? "🎵" : stopped ? "🛑" : "🎵"}</div>
      <p>${playing ? "The music is playing…" : stopped ? "MUSIC STOPPED — SIT NOW!" : ""}</p>
      ${stopped ? `<button id="sit-btn" class="sit-btn">SIT!</button>` : ""}
    </div>
    <div class="alive-row">
      ${(state.lastMusicAlive || []).map((pid) => `<span class="alive-chip">${nicknameOf(pid)}</span>`).join("")}
    </div>
  `;

  if (stopped) {
    const btn = root.querySelector("#sit-btn");
    btn.addEventListener("click", () => {
      send("game_action", { action: { type: "sit" } });
      btn.disabled = true;
      btn.textContent = "Sat down!";
    });
  }
}

// Thief & Police
function renderThiefPolice(root, msg) {
  const myRole = state.myRole ? state.myRole.role : null;
  const isPolice = state.playerId === msg.police_id;

  root.innerHTML = `
    <h2>Thief &amp; Police</h2>
    <p class="muted">You are <strong>${myRole ? myRole.toUpperCase() : "..."}</strong></p>
    ${isPolice
      ? `<p>Who do you think is the <strong>Thief</strong>?</p><div class="suspect-list"></div>`
      : `<p class="muted">The Police is deciding who the Thief is...</p>`}
  `;

  if (isPolice) {
    const list = root.querySelector(".suspect-list");
    let guessed = false;
    msg.suspects.forEach((pid) => {
      const btn = document.createElement("button");
      btn.className = "primary suspect-btn";
      btn.textContent = nicknameOf(pid);
      btn.addEventListener("click", () => {
        if (guessed) return;
        guessed = true;
        list.querySelectorAll("button").forEach((b) => (b.disabled = true));
        send("game_action", { action: { type: "guess", suspect: pid } });
      });
      list.appendChild(btn);
    });
  }
}

// Spyfall
function renderSpyfall(root, msg) {
  const role = state.myRole;
  const isSpy = role && role.role === "spy";

  root.innerHTML = `
    <h2>Spyfall</h2>
    <div class="role-card ${isSpy ? "spy" : ""}">
      ${isSpy
        ? `<p><strong>You are the SPY.</strong> Blend in and figure out the location.</p>`
        : `<p>Location: <strong>${role ? role.location : "..."}</strong></p>`}
    </div>
    <p class="muted">Phase: ${msg.phase} <span class="countdown" id="spy-countdown"></span></p>
  `;

  if (msg.phase === "discussion") {
    const actions = document.createElement("div");
    actions.className = "action-row";

    const voteBtn = document.createElement("button");
    voteBtn.className = "secondary";
    voteBtn.textContent = "Call a vote now";
    voteBtn.addEventListener("click", () => send("game_action", { action: { type: "call_vote" } }));
    actions.appendChild(voteBtn);
    root.appendChild(actions);

    if (isSpy) {
      const guessRow = document.createElement("div");
      guessRow.className = "action-row";
      const select = document.createElement("select");
      role.locations.forEach((loc) => {
        const opt = document.createElement("option");
        opt.value = loc;
        opt.textContent = loc;
        select.appendChild(opt);
      });
      const guessBtn = document.createElement("button");
      guessBtn.className = "primary";
      guessBtn.textContent = "Guess the location";
      guessBtn.addEventListener("click", () => {
        send("game_action", { action: { type: "spy_guess_location", location: select.value } });
      });
      guessRow.appendChild(select);
      guessRow.appendChild(guessBtn);
      root.appendChild(guessRow);
    }

    renderChatBox(root);
    const cd = root.querySelector("#spy-countdown");
    if (cd && msg.seconds) startCountdown(cd, msg.seconds);
  } else if (msg.phase === "voting") {
    const list = document.createElement("div");
    list.className = "suspect-list";
    let voted = false;
    msg.players.filter((pid) => pid !== state.playerId).forEach((pid) => {
      const btn = document.createElement("button");
      btn.className = "primary suspect-btn";
      btn.textContent = `Vote ${nicknameOf(pid)}`;
      btn.addEventListener("click", () => {
        if (voted) return;
        voted = true;
        list.querySelectorAll("button").forEach((b) => (b.disabled = true));
        send("game_action", { action: { type: "vote", suspect: pid } });
      });
      list.appendChild(btn);
    });
    root.appendChild(list);
    renderChatBox(root);
  }
}

// 20 Questions
function renderTwentyQuestions(root, msg) {
  const role = state.myRole;
  const isAnswerer = state.playerId === msg.answerer_id;
  const isCurrentAsker = state.playerId === msg.current_asker;

  root.innerHTML = `
    <h2>20 Questions</h2>
    <p class="muted">Answerer: <strong>${nicknameOf(msg.answerer_id)}</strong> &middot;
       Questions asked: ${msg.questions_asked}/${msg.max_questions}</p>
    ${isAnswerer && role && role.secret ? `<p>Your secret word: <strong>${role.secret}</strong></p>` : ""}
    <div class="qa-log"></div>
  `;

  const log = root.querySelector(".qa-log");
  msg.log.forEach((entry) => {
    const div = document.createElement("div");
    if (entry.type === "question") {
      div.textContent = `❓ ${nicknameOf(entry.player_id)}: ${entry.text}`;
    } else if (entry.type === "answer") {
      div.textContent = `➡️ Answer: ${entry.text.toUpperCase()}`;
      div.className = "qa-answer";
    } else if (entry.type === "wrong_guess") {
      div.textContent = `❌ ${nicknameOf(entry.player_id)} guessed "${entry.text}" - wrong!`;
    }
    log.appendChild(div);
  });
  log.scrollTop = log.scrollHeight;

  if (isCurrentAsker && !msg.awaiting_answer) {
    const row = document.createElement("div");
    row.className = "action-row";
    row.innerHTML = `<input type="text" class="qa-ask-input" placeholder="Ask a yes/no question..." maxlength="150" />
                      <button class="primary">Ask</button>`;
    const input = row.querySelector("input");
    row.querySelector("button").addEventListener("click", () => {
      const text = input.value.trim();
      if (!text) return;
      send("game_action", { action: { type: "ask", text } });
      input.value = "";
    });
    root.appendChild(row);
  } else if (isAnswerer && msg.awaiting_answer) {
    const row = document.createElement("div");
    row.className = "action-row";
    ["yes", "no", "maybe"].forEach((v) => {
      const btn = document.createElement("button");
      btn.className = "primary";
      btn.textContent = v.toUpperCase();
      btn.addEventListener("click", () => send("game_action", { action: { type: "answer", value: v } }));
      row.appendChild(btn);
    });
    root.appendChild(row);
  } else {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = msg.awaiting_answer
      ? `Waiting for ${nicknameOf(msg.answerer_id)} to answer...`
      : `Waiting for ${nicknameOf(msg.current_asker)} to ask a question...`;
    root.appendChild(p);
  }

  if (!isAnswerer) {
    const guessRow = document.createElement("div");
    guessRow.className = "action-row";
    guessRow.innerHTML = `<input type="text" class="qa-guess-input" placeholder="Guess the word..." maxlength="50" />
                           <button class="secondary">Guess</button>`;
    const gInput = guessRow.querySelector("input");
    guessRow.querySelector("button").addEventListener("click", () => {
      const text = gInput.value.trim();
      if (!text) return;
      send("game_action", { action: { type: "guess", text } });
      gInput.value = "";
    });
    root.appendChild(guessRow);
  }
}

// Mafia
function renderMafia(root, msg) {
  const role = state.myRole;
  const myRoleName = role ? role.role : null;
  const alive = msg.alive || [];
  const amAlive = alive.includes(state.playerId);

  root.innerHTML = `
    <h2>Mafia</h2>
    <p class="muted">Round ${msg.round} &middot; Phase: <strong>${msg.phase}</strong>
       <span class="countdown" id="mafia-countdown"></span></p>
    <p class="muted">Your role: <strong>${myRoleName ? myRoleName.toUpperCase() : "..."}</strong>
       ${!amAlive ? " (eliminated - spectating)" : ""}</p>
    ${role && role.allies && role.allies.length ? `<p class="muted">Fellow mafia: ${role.allies.map(nicknameOf).join(", ")}</p>` : ""}
    <div class="alive-row">${alive.map((pid) => `<span class="alive-chip">${nicknameOf(pid)}</span>`).join("")}</div>
    <div id="mafia-announce" class="muted"></div>
    <div id="mafia-action"></div>
  `;

  const announce = root.querySelector("#mafia-announce");
  if (state.lastNightResult && msg.phase !== "night") {
    const nr = state.lastNightResult;
    announce.textContent = nr.died
      ? `☠️ ${nicknameOf(nr.died)} (${nr.died_role}) was killed last night.`
      : "🌙 No one died last night.";
  }
  if (state.lastVoteResult) {
    const vr = state.lastVoteResult;
    const line = document.createElement("div");
    line.textContent = vr.eliminated
      ? `⚖️ ${nicknameOf(vr.eliminated)} (${vr.eliminated_role}) was voted out.`
      : "⚖️ The vote was tied - no one was eliminated.";
    announce.appendChild(line);
  }

  const actionRoot = root.querySelector("#mafia-action");
  const others = alive.filter((pid) => pid !== state.playerId);

  if (!amAlive) {
    actionRoot.innerHTML = `<p class="muted">You're out, but you can keep watching.</p>`;
  } else if (msg.phase === "night") {
    if (myRoleName === "mafia") {
      actionRoot.innerHTML = `<p>Choose a victim:</p>`;
      addTargetButtons(actionRoot, others, (pid) => send("game_action", { action: { type: "mafia_vote", target: pid } }));
    } else if (myRoleName === "doctor") {
      actionRoot.innerHTML = `<p>Choose someone to save (can be yourself):</p>`;
      addTargetButtons(actionRoot, alive, (pid) => send("game_action", { action: { type: "doctor_save", target: pid } }));
    } else if (myRoleName === "detective") {
      actionRoot.innerHTML = `<p>Choose someone to investigate:</p>`;
      addTargetButtons(actionRoot, others, (pid) => send("game_action", { action: { type: "detective_check", target: pid } }));
      if (state.detectiveResult) {
        const r = state.detectiveResult;
        const p = document.createElement("p");
        p.textContent = `🔍 ${nicknameOf(r.target)} is ${r.is_mafia ? "MAFIA!" : "not mafia."}`;
        actionRoot.appendChild(p);
      }
    } else {
      actionRoot.innerHTML = `<p class="muted">Night falls. The town sleeps...</p>`;
    }
  } else if (msg.phase === "discussion") {
    renderChatBox(actionRoot);
  } else if (msg.phase === "voting") {
    actionRoot.innerHTML = `<p>Vote to eliminate a suspect:</p>`;
    addTargetButtons(actionRoot, others, (pid) => send("game_action", { action: { type: "day_vote", target: pid } }));
    renderChatBox(actionRoot);
  }

  const cd = root.querySelector("#mafia-countdown");
  if (cd && msg.seconds) startCountdown(cd, msg.seconds);
}

function addTargetButtons(container, targets, onPick) {
  const list = document.createElement("div");
  list.className = "suspect-list";
  let picked = false;
  targets.forEach((pid) => {
    const btn = document.createElement("button");
    btn.className = "primary suspect-btn";
    btn.textContent = nicknameOf(pid);
    btn.addEventListener("click", () => {
      if (picked) return;
      picked = true;
      list.querySelectorAll("button").forEach((b) => (b.disabled = true));
      onPick(pid);
    });
    list.appendChild(btn);
  });
  container.appendChild(list);
}

// Illustrated top-down arena backgrounds (hand-drawn SVG; Recraft isn't
// configured in this session, so this is the fallback per that tool's rule).
function hideSeekBackgroundSVG() {
  const fenceSlats = Array.from({ length: 14 })
    .map((_, i) => `<rect x="${i * 22}" y="2" width="12" height="10" rx="2"/>`)
    .join("");
  return `
    <svg viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true">
      <defs>
        <radialGradient id="grassGrad" cx="50%" cy="40%" r="75%">
          <stop offset="0%" stop-color="#4a9c56"/>
          <stop offset="100%" stop-color="#2f6e3a"/>
        </radialGradient>
      </defs>
      <rect width="300" height="200" fill="url(#grassGrad)"/>
      <g fill="#3a7a44" opacity="0.5">
        <ellipse cx="40" cy="30" rx="26" ry="10"/>
        <ellipse cx="220" cy="60" rx="30" ry="12"/>
        <ellipse cx="90" cy="150" rx="34" ry="14"/>
        <ellipse cx="250" cy="165" rx="24" ry="10"/>
      </g>
      <path d="M-10 172 Q90 142 150 172 T 310 152" stroke="#d8c08a" stroke-width="22" fill="none" opacity="0.5"/>
      <g fill="#8a5a33" opacity="0.9">${fenceSlats}</g>
      <g>
        <ellipse cx="262" cy="42" rx="20" ry="16" fill="#2f7a3d"/>
        <ellipse cx="254" cy="36" rx="12" ry="10" fill="#3d8f4c"/>
        <ellipse cx="28" cy="112" rx="18" ry="14" fill="#2f7a3d"/>
        <ellipse cx="22" cy="106" rx="10" ry="9" fill="#3d8f4c"/>
        <ellipse cx="180" cy="182" rx="22" ry="13" fill="#2f7a3d"/>
        <ellipse cx="172" cy="176" rx="12" ry="9" fill="#3d8f4c"/>
      </g>
      <g>
        <circle cx="68" cy="52" r="22" fill="#255f31"/>
        <circle cx="68" cy="52" r="14" fill="#2f7a3d"/>
        <circle cx="68" cy="52" r="5" fill="#8a5a33"/>
        <circle cx="238" cy="128" r="20" fill="#255f31"/>
        <circle cx="238" cy="128" r="13" fill="#2f7a3d"/>
        <circle cx="238" cy="128" r="4" fill="#8a5a33"/>
      </g>
      <g fill="#ffd93d" opacity="0.9">
        <circle cx="120" cy="90" r="2.5"/><circle cx="128" cy="95" r="2.5"/><circle cx="112" cy="96" r="2.5"/>
        <circle cx="200" cy="28" r="2.5"/><circle cx="208" cy="24" r="2.5"/>
      </g>
    </svg>`;
}

function freezeTagBackgroundSVG() {
  const seamRows = Array.from({ length: 6 }).map((_, i) => `<line x1="0" y1="${i * 34}" x2="300" y2="${i * 34}"/>`).join("");
  const seamCols = Array.from({ length: 9 }).map((_, i) => `<line x1="${i * 34}" y1="0" x2="${i * 34}" y2="200"/>`).join("");
  return `
    <svg viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true">
      <defs>
        <radialGradient id="courtGrad" cx="50%" cy="45%" r="75%">
          <stop offset="0%" stop-color="#c77b45"/>
          <stop offset="100%" stop-color="#a7612f"/>
        </radialGradient>
      </defs>
      <rect width="300" height="200" fill="url(#courtGrad)"/>
      <g stroke="#8f5527" stroke-width="1" opacity="0.4">${seamRows}${seamCols}</g>
      <circle cx="150" cy="100" r="55" fill="none" stroke="#fff" stroke-width="3" opacity="0.6"/>
      <circle cx="150" cy="100" r="4" fill="#fff" opacity="0.6"/>
      <g stroke="#fff" stroke-width="2.5" fill="none" opacity="0.55">
        <rect x="14" y="14" width="24" height="24"/>
        <rect x="14" y="38" width="24" height="24"/>
        <rect x="14" y="62" width="24" height="24"/>
      </g>
      <g stroke="#5a5a66" stroke-width="2.5" fill="none" opacity="0.8">
        <rect x="228" y="148" width="54" height="36" rx="4"/>
        <line x1="228" y1="148" x2="282" y2="184"/>
        <line x1="282" y1="148" x2="228" y2="184"/>
      </g>
      <rect x="248" y="8" width="38" height="10" rx="2" fill="#6b4226" opacity="0.85"/>
    </svg>`;
}

// Hide & Seek
function renderHideSeek(root, msg) {
  if (!state.arenaInitialized || state.arenaGameType !== "hide_seek") {
    root.innerHTML = `
      <h2>Hide &amp; Seek</h2>
      <p class="muted">Phase: <strong id="arena-phase"></strong> &middot;
         <span class="countdown" id="arena-timer"></span> &middot;
         You are <strong id="arena-role"></strong></p>
      <p class="muted">Move with WASD, arrow keys, or the pad below.</p>
      <div class="arena-box" id="arena-box"><div class="arena-bg">${hideSeekBackgroundSVG()}</div></div>
    `;
    root.appendChild(buildDpad());
    state.arenaInitialized = true;
    state.arenaGameType = "hide_seek";
    state.arenaDots = {};
  }

  const myRole = state.myRole ? state.myRole.role : null;
  root.querySelector("#arena-phase").textContent = msg.phase === "hiding" ? "Hiding" : "Seeking";
  root.querySelector("#arena-timer").textContent = `${Math.ceil(msg.seconds_left)}s`;
  root.querySelector("#arena-role").textContent = myRole ? myRole.toUpperCase() : "...";

  updateArenaDots(root.querySelector("#arena-box"), msg.positions);
}

// Freeze Tag (Ice)
function renderFreezeTag(root, msg) {
  if (!state.arenaInitialized || state.arenaGameType !== "freeze_tag") {
    root.innerHTML = `
      <h2>Freeze Tag</h2>
      <p class="muted">
         <span class="countdown" id="arena-timer"></span> left &middot;
         You are <strong id="arena-role"></strong></p>
      <p class="muted">Move with WASD, arrow keys, or the pad below. Unfreeze teammates by touching them!</p>
      <div class="arena-box" id="arena-box"><div class="arena-bg">${freezeTagBackgroundSVG()}</div></div>
    `;
    root.appendChild(buildDpad());
    state.arenaInitialized = true;
    state.arenaGameType = "freeze_tag";
    state.arenaDots = {};
  }

  const myRole = state.myRole ? state.myRole.role : null;
  root.querySelector("#arena-timer").textContent = `${Math.ceil(msg.seconds_left)}s`;
  root.querySelector("#arena-role").textContent = myRole ? myRole.toUpperCase() : "...";

  updateArenaDots(root.querySelector("#arena-box"), msg.positions);
}

// ---------- Clue Round (Charades, Taboo) ----------

function renderClueRound(root, msg, opts) {
  const amGiver = state.playerId === msg.giver_id;

  if (!state.clueRoundInitialized) {
    root.innerHTML = `
      <h2 id="cr-title"></h2>
      <p class="muted">Round <span id="cr-round"></span>/<span id="cr-total"></span> &middot;
         <span id="cr-giver-label"></span> &middot; <span class="countdown" id="cr-timer"></span></p>
      <div id="cr-word-banner" class="role-card hidden"></div>
      <div id="cr-taboo-list" class="alive-row hidden"></div>
      <div id="cr-guess-row" class="action-row hidden">
        <input type="text" id="cr-guess-input" placeholder="Type your guess..." maxlength="50" />
        <button id="cr-guess-btn" class="primary">Guess</button>
      </div>
      <div id="cr-feed" class="qa-log"></div>
      <h3>Scores</h3>
      <div id="cr-scores" class="reveal-table"></div>
    `;
    state.clueRoundInitialized = true;

    const input = root.querySelector("#cr-guess-input");
    const doGuess = () => {
      const text = input.value.trim();
      if (!text) return;
      send("game_action", { action: { type: "guess", text } });
      input.value = "";
    };
    root.querySelector("#cr-guess-btn").addEventListener("click", doGuess);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doGuess();
    });
  }

  root.querySelector("#cr-title").textContent = opts.showTaboo ? "Taboo" : "Charades";
  root.querySelector("#cr-round").textContent = msg.round;
  root.querySelector("#cr-total").textContent = msg.total_rounds;
  root.querySelector("#cr-giver-label").textContent = amGiver
    ? (opts.showTaboo ? "You're giving clues!" : "You're acting it out!")
    : `${nicknameOf(msg.giver_id)} is ${opts.showTaboo ? "giving clues" : "acting"}`;

  const timerEl = root.querySelector("#cr-timer");
  if (!msg.revealed) startCountdown(timerEl, msg.seconds);
  else timerEl.textContent = "";

  const banner = root.querySelector("#cr-word-banner");
  const tabooList = root.querySelector("#cr-taboo-list");
  if (amGiver && !msg.revealed && state.myRole) {
    banner.textContent = `Your word: ${state.myRole.word}`;
    banner.classList.remove("hidden");
    if (opts.showTaboo && state.myRole.taboo && state.myRole.taboo.length) {
      tabooList.innerHTML = `<strong style="width:100%">Don't say:</strong>` +
        state.myRole.taboo.map((w) => `<span class="alive-chip">${escapeHtml(w)}</span>`).join("");
      tabooList.classList.remove("hidden");
    }
  } else if (msg.revealed) {
    banner.textContent = `The word was: ${msg.word}`;
    banner.classList.remove("hidden");
    tabooList.classList.add("hidden");
  } else {
    banner.classList.add("hidden");
    tabooList.classList.add("hidden");
  }

  root.querySelector("#cr-guess-row").classList.toggle("hidden", amGiver || msg.revealed);

  const feed = root.querySelector("#cr-feed");
  feed.innerHTML = "";
  (msg.guesses || []).forEach((g) => {
    const div = document.createElement("div");
    div.textContent = `${g.correct ? "✅" : "💬"} ${nicknameOf(g.player_id)}: ${g.text}`;
    if (g.correct) div.className = "qa-answer";
    feed.appendChild(div);
  });
  feed.scrollTop = feed.scrollHeight;

  const scoresBox = root.querySelector("#cr-scores");
  scoresBox.innerHTML = "";
  Object.entries(msg.scores || {})
    .sort((a, b) => b[1] - a[1])
    .forEach(([pid, score]) => {
      const row = document.createElement("div");
      row.className = "reveal-row";
      row.innerHTML = `<span>${nicknameOf(pid)}</span><span>${score} pts</span>`;
      scoresBox.appendChild(row);
    });
}

// ---------- Pictionary ----------

function drawSegmentLocal(segment) {
  const ctx = state.pictionaryCtx;
  const canvas = state.pictionaryCanvas;
  if (!ctx || !canvas || !segment) return;
  ctx.beginPath();
  ctx.moveTo(segment.x0 * canvas.width, segment.y0 * canvas.height);
  ctx.lineTo(segment.x1 * canvas.width, segment.y1 * canvas.height);
  ctx.stroke();
}

function clearPictionaryCanvas() {
  const ctx = state.pictionaryCtx;
  const canvas = state.pictionaryCanvas;
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function renderPictionary(root, msg) {
  const amGiver = state.playerId === msg.giver_id;

  if (!state.clueRoundInitialized) {
    root.innerHTML = `
      <h2>Pictionary</h2>
      <p class="muted">Round <span id="cr-round"></span>/<span id="cr-total"></span> &middot;
         <span id="cr-giver-label"></span> &middot; <span class="countdown" id="cr-timer"></span></p>
      <div id="cr-word-banner" class="role-card hidden"></div>
      <canvas id="pic-canvas" class="pictionary-canvas" width="500" height="340"></canvas>
      <div id="pic-tools" class="action-row hidden">
        <button id="pic-clear" class="secondary">Clear canvas</button>
      </div>
      <div id="cr-guess-row" class="action-row hidden">
        <input type="text" id="cr-guess-input" placeholder="Type your guess..." maxlength="50" />
        <button id="cr-guess-btn" class="primary">Guess</button>
      </div>
      <div id="cr-feed" class="qa-log"></div>
      <h3>Scores</h3>
      <div id="cr-scores" class="reveal-table"></div>
    `;
    state.clueRoundInitialized = true;

    const canvas = root.querySelector("#pic-canvas");
    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = "#eef0f5";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    state.pictionaryCanvas = canvas;
    state.pictionaryCtx = ctx;

    let drawing = false;
    let last = null;
    const amIGiver = () => state.lastGameState && state.playerId === state.lastGameState.giver_id;
    function canvasPoint(e) {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
    }
    function startDraw(e) {
      if (!amIGiver()) return;
      drawing = true;
      last = canvasPoint(e);
    }
    function moveDraw(e) {
      if (!drawing || !amIGiver()) return;
      e.preventDefault();
      const p = canvasPoint(e);
      const segment = { x0: last.x, y0: last.y, x1: p.x, y1: p.y };
      drawSegmentLocal(segment);
      send("game_action", { action: { type: "draw", segment } });
      last = p;
    }
    function endDraw() {
      drawing = false;
      last = null;
    }
    canvas.addEventListener("mousedown", startDraw);
    canvas.addEventListener("mousemove", moveDraw);
    window.addEventListener("mouseup", endDraw);
    canvas.addEventListener("touchstart", startDraw, { passive: false });
    canvas.addEventListener("touchmove", moveDraw, { passive: false });
    canvas.addEventListener("touchend", endDraw);

    root.querySelector("#pic-clear").addEventListener("click", () => {
      if (!amIGiver()) return;
      clearPictionaryCanvas();
      send("game_action", { action: { type: "clear" } });
    });

    const input = root.querySelector("#cr-guess-input");
    const doGuess = () => {
      const text = input.value.trim();
      if (!text) return;
      send("game_action", { action: { type: "guess", text } });
      input.value = "";
    };
    root.querySelector("#cr-guess-btn").addEventListener("click", doGuess);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doGuess();
    });
  }

  root.querySelector("#cr-round").textContent = msg.round;
  root.querySelector("#cr-total").textContent = msg.total_rounds;
  root.querySelector("#cr-giver-label").textContent = amGiver
    ? "You're drawing!"
    : `${nicknameOf(msg.giver_id)} is drawing`;

  const timerEl = root.querySelector("#cr-timer");
  if (!msg.revealed) startCountdown(timerEl, msg.seconds);
  else timerEl.textContent = "";

  const banner = root.querySelector("#cr-word-banner");
  if (amGiver && !msg.revealed && state.myRole) {
    banner.textContent = `Draw: ${state.myRole.word}`;
    banner.classList.remove("hidden");
  } else if (msg.revealed) {
    banner.textContent = `The word was: ${msg.word}`;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }

  root.querySelector("#pic-tools").classList.toggle("hidden", !amGiver || msg.revealed);
  root.querySelector("#cr-guess-row").classList.toggle("hidden", amGiver || msg.revealed);

  const feed = root.querySelector("#cr-feed");
  feed.innerHTML = "";
  (msg.guesses || []).forEach((g) => {
    const div = document.createElement("div");
    div.textContent = `${g.correct ? "✅" : "💬"} ${nicknameOf(g.player_id)}: ${g.text}`;
    if (g.correct) div.className = "qa-answer";
    feed.appendChild(div);
  });
  feed.scrollTop = feed.scrollHeight;

  const scoresBox = root.querySelector("#cr-scores");
  scoresBox.innerHTML = "";
  Object.entries(msg.scores || {})
    .sort((a, b) => b[1] - a[1])
    .forEach(([pid, score]) => {
      const row = document.createElement("div");
      row.className = "reveal-row";
      row.innerHTML = `<span>${nicknameOf(pid)}</span><span>${score} pts</span>`;
      scoresBox.appendChild(row);
    });
}

// ---------- Antakshari ----------

function renderAntakshari(root, msg) {
  const isMyTurn = state.playerId === msg.current_player;

  if (!state.antakshariInitialized) {
    root.innerHTML = `
      <h2>Antakshari</h2>
      <p class="muted">Turn: <strong id="an-turn"></strong> &middot;
         Next letter: <strong id="an-letter"></strong> &middot;
         <span class="countdown" id="an-timer"></span></p>
      <div id="an-history" class="qa-log"></div>
      <div id="an-input-row" class="action-row hidden">
        <input type="text" id="an-input" placeholder="Type a song line..." maxlength="80" />
        <button id="an-submit" class="primary">Submit</button>
      </div>
      <div id="an-alive" class="alive-row"></div>
    `;
    state.antakshariInitialized = true;

    const input = root.querySelector("#an-input");
    const doSubmit = () => {
      const text = input.value.trim();
      if (!text) return;
      send("game_action", { action: { type: "submit", text } });
      input.value = "";
    };
    root.querySelector("#an-submit").addEventListener("click", doSubmit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSubmit();
    });
  }

  root.querySelector("#an-turn").textContent = nicknameOf(msg.current_player);
  root.querySelector("#an-letter").textContent = msg.letter;
  startCountdown(root.querySelector("#an-timer"), msg.seconds);

  const history = root.querySelector("#an-history");
  history.innerHTML = "";
  (msg.history || []).forEach((h) => {
    const div = document.createElement("div");
    div.textContent = `${nicknameOf(h.player_id)}: ${h.text}`;
    history.appendChild(div);
  });
  history.scrollTop = history.scrollHeight;

  root.querySelector("#an-input-row").classList.toggle("hidden", !isMyTurn);

  const alive = root.querySelector("#an-alive");
  alive.innerHTML = (msg.alive || []).map((pid) => `<span class="alive-chip">${nicknameOf(pid)}</span>`).join("");
}

// ---------- Snake and Ladder ----------

const SL_BOARD_PX = 300;
const SL_CELL = 30;

function slSquareCenter(n) {
  const num = Math.max(1, Math.min(100, n));
  const idx = num - 1;
  const row = Math.floor(idx / 10);
  let col = idx % 10;
  if (row % 2 === 1) col = 9 - col;
  return { x: col * SL_CELL + SL_CELL / 2, y: SL_BOARD_PX - (row + 1) * SL_CELL + SL_CELL / 2 };
}

function buildSnakeLadderBoardSVG(snakes, ladders) {
  let cells = "";
  for (let n = 1; n <= 100; n++) {
    const { x, y } = slSquareCenter(n);
    const row = Math.floor((n - 1) / 10);
    const col = (n - 1) % 10;
    const dark = (row + col) % 2 === 0;
    cells += `
      <rect x="${x - 15}" y="${y - 15}" width="30" height="30" fill="${dark ? "#e8dcc0" : "#f3ead3"}" stroke="#c9b98f" stroke-width="0.5"/>
      <text x="${x - 13}" y="${y - 9}" font-size="6" fill="#8a7a55">${n}</text>`;
  }

  let ladderShapes = "";
  Object.entries(ladders || {}).forEach(([start, end]) => {
    const a = slSquareCenter(Number(start));
    const b = slSquareCenter(Number(end));
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * 4;
    const ny = (dx / len) * 4;
    let rungs = "";
    const steps = Math.max(2, Math.floor(len / 12));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const mx = a.x + dx * t;
      const my = a.y + dy * t;
      rungs += `<line x1="${mx + nx}" y1="${my + ny}" x2="${mx - nx}" y2="${my - ny}" stroke="#a9742f" stroke-width="1.5"/>`;
    }
    ladderShapes += `
      <line x1="${a.x + nx}" y1="${a.y + ny}" x2="${b.x + nx}" y2="${b.y + ny}" stroke="#c98b3c" stroke-width="2"/>
      <line x1="${a.x - nx}" y1="${a.y - ny}" x2="${b.x - nx}" y2="${b.y - ny}" stroke="#c98b3c" stroke-width="2"/>
      ${rungs}`;
  });

  let snakeShapes = "";
  Object.entries(snakes || {}).forEach(([start, end]) => {
    const a = slSquareCenter(Number(start));
    const b = slSquareCenter(Number(end));
    const midx = (a.x + b.x) / 2 + (((Number(start) * 7) % 10) - 5) * 3;
    const midy = (a.y + b.y) / 2;
    snakeShapes += `
      <path d="M${a.x} ${a.y} Q${midx} ${midy} ${b.x} ${b.y}" stroke="#3f8f4a" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.88"/>
      <circle cx="${a.x}" cy="${a.y}" r="5.5" fill="#2f6e3a"/>
      <circle cx="${a.x - 1.6}" cy="${a.y - 1.6}" r="1" fill="white"/>
      <circle cx="${a.x + 1.6}" cy="${a.y - 1.6}" r="1" fill="white"/>`;
  });

  return `
    <svg viewBox="0 0 300 300" width="100%" height="100%" aria-hidden="true">
      <rect width="300" height="300" fill="#f3ead3"/>
      ${cells}
      ${ladderShapes}
      ${snakeShapes}
    </svg>`;
}

const SL_TOKEN_OFFSETS = [[-6, -6], [6, -6], [-6, 6], [6, 6]];

function renderSnakeLadder(root, msg) {
  const isMyTurn = state.playerId === msg.current_player;

  if (!state.slInitialized) {
    root.innerHTML = `
      <h2>Snake and Ladder</h2>
      <p class="muted">Turn: <strong id="sl-turn"></strong> &middot; <span id="sl-die" class="sl-die">?</span></p>
      <div class="sl-board-wrap">
        <div class="sl-board">${buildSnakeLadderBoardSVG(msg.snakes, msg.ladders)}</div>
        <div class="sl-tokens" id="sl-tokens"></div>
      </div>
      <button id="sl-roll" class="primary">Roll Dice</button>
      <p id="sl-roll-result" class="muted"></p>
    `;
    state.slInitialized = true;
    state.slTokens = {};
  }

  root.querySelector("#sl-turn").textContent = nicknameOf(msg.current_player);
  const rollBtn = root.querySelector("#sl-roll");
  rollBtn.disabled = !isMyTurn;
  rollBtn.textContent = isMyTurn ? "Roll Dice" : "Waiting...";
  rollBtn.onclick = isMyTurn ? () => send("game_action", { action: { type: "roll" } }) : null;

  const tokenLayer = root.querySelector("#sl-tokens");
  const seen = new Set();
  state.players.forEach((p, i) => {
    seen.add(p.id);
    const pos = msg.positions[p.id] || 0;
    const center = slSquareCenter(pos || 1);
    const [ox, oy] = SL_TOKEN_OFFSETS[i % SL_TOKEN_OFFSETS.length];
    let token = state.slTokens[p.id];
    if (!token) {
      token = document.createElement("div");
      token.className = "sl-token";
      token.innerHTML = `<div class="arena-char">${characterSVG(avatarColorFor(p.id), {})}</div>`;
      tokenLayer.appendChild(token);
      state.slTokens[p.id] = token;
    }
    token.style.left = `${((center.x + (pos ? ox : 0)) / SL_BOARD_PX) * 100}%`;
    token.style.top = `${((center.y + (pos ? oy : 0)) / SL_BOARD_PX) * 100}%`;
  });
  Object.keys(state.slTokens).forEach((pid) => {
    if (!seen.has(pid)) {
      state.slTokens[pid].remove();
      delete state.slTokens[pid];
    }
  });

  if (state.lastDiceRoll) {
    const r = state.lastDiceRoll;
    const die = root.querySelector("#sl-die");
    die.textContent = r.roll;
    die.classList.remove("sl-die-roll");
    void die.offsetWidth;
    die.classList.add("sl-die-roll");

    let text = `🎲 ${nicknameOf(r.player_id)} rolled a ${r.roll}`;
    if (r.landed_on === "snake") text += " - bitten by a snake! 🐍";
    else if (r.landed_on === "ladder") text += " - climbed a ladder! 🪜";
    else if (!r.moved) text += " - can't move (would overshoot 100).";
    root.querySelector("#sl-roll-result").textContent = text;
  }
}

// ---------- Uno ----------

function cardLabel(card) {
  if (!card) return "?";
  if (card.color === "wild") return card.value === "wild4" ? "+4" : "WILD";
  const valueMap = { skip: "⦸", reverse: "⟲", draw2: "+2" };
  return valueMap[card.value] || card.value;
}

function renderUno(root, msg) {
  const isMyTurn = state.playerId === msg.current_player;
  const hand = state.myHand || [];

  const topKey = msg.top_card ? `${msg.top_card.color}-${msg.top_card.value}` : null;
  const topChanged = topKey !== state.unoLastTopKey;
  state.unoLastTopKey = topKey;

  root.innerHTML = `
    <h2>Uno</h2>
    <p class="muted">Turn: <strong>${nicknameOf(msg.current_player)}</strong> &middot;
       Direction: ${msg.direction === 1 ? "➡️" : "⬅️"}</p>
    <div class="uno-felt">
      <div class="uno-table">
        <div class="uno-deck" title="Draw pile">🂠</div>
        <div class="uno-card uno-top ${msg.top_card ? msg.top_card.color : ""} ${topChanged ? "uno-card-flip" : ""}">${msg.top_card ? cardLabel(msg.top_card) : ""}</div>
        <div class="muted">Color: <span class="uno-color-dot ${msg.current_color}"></span> ${msg.current_color}</div>
      </div>
    </div>
    <div class="alive-row">
      ${Object.entries(msg.hand_counts || {}).map(([pid, n]) => `<span class="alive-chip">${nicknameOf(pid)}: ${n}</span>`).join("")}
    </div>
    <div id="uno-wild-picker" class="action-row hidden">
      <p class="muted" style="width:100%">Choose a color:</p>
      ${["red", "green", "blue", "yellow"].map((c) => `<button class="uno-color-btn ${c}" data-color="${c}"></button>`).join("")}
    </div>
    <div class="uno-hand" id="uno-hand"></div>
    <button id="uno-draw" class="secondary" ${isMyTurn ? "" : "disabled"}>Draw a card (${msg.draw_pile_count} left)</button>
  `;

  const handEl = root.querySelector("#uno-hand");
  hand.forEach((card, idx) => {
    const btn = document.createElement("button");
    btn.className = `uno-card ${card.color}`;
    btn.textContent = cardLabel(card);
    btn.disabled = !isMyTurn;
    btn.addEventListener("click", () => {
      if (card.color === "wild") {
        state.pendingWildCardIndex = idx;
        root.querySelector("#uno-wild-picker").classList.remove("hidden");
      } else {
        btn.classList.add("uno-card-playing");
        send("game_action", { action: { type: "play", card_index: idx } });
      }
    });
    handEl.appendChild(btn);
  });

  root.querySelectorAll(".uno-color-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      send("game_action", {
        action: { type: "play", card_index: state.pendingWildCardIndex, chosen_color: btn.dataset.color },
      });
      root.querySelector("#uno-wild-picker").classList.add("hidden");
      state.pendingWildCardIndex = null;
    });
  });

  if (isMyTurn) {
    root.querySelector("#uno-draw").addEventListener("click", () => {
      send("game_action", { action: { type: "draw" } });
    });
  }
}

// ---------- Ludo ----------

function tokenLabel(token) {
  if (token.state === "base") return "🏠";
  if (token.state === "finished") return "🏁";
  return String(token.steps);
}

const LUDO_COLOR_HEX = { red: "#e5473b", green: "#0fa968", blue: "#2e7ef0", yellow: "#e8b400" };

// Real 52-square Ludo path + per-color home stretches on a 15x15 grid.
const LUDO_PATH = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0], [8, 0],
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7], [14, 8],
  [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14], [6, 14],
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7], [0, 6],
];
const LUDO_HOME_STRETCH = {
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  green: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
  blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
};
const LUDO_START_OFFSETS = { red: 0, green: 13, yellow: 26, blue: 39 };
const LUDO_BASE_BLOCKS = { red: [0, 0], green: [9, 0], yellow: [9, 9], blue: [0, 9] };
const LUDO_BASE_SLOTS = [[1.5, 1.5], [4.5, 1.5], [1.5, 4.5], [4.5, 4.5]];
const LUDO_FINISH_SPOTS = { red: [-1, -0.6], green: [0.6, -1], yellow: [1, 0.6], blue: [-0.6, 1] };
const LUDO_SAFE_INDEXES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const LD_CELL = 20;

function ludoCellPx(col, row) {
  return { x: col * LD_CELL + LD_CELL / 2, y: row * LD_CELL + LD_CELL / 2 };
}

function ludoCellForToken(color, token, tokenIndex) {
  if (token.state === "base") {
    const [bx, by] = LUDO_BASE_BLOCKS[color];
    const [sx, sy] = LUDO_BASE_SLOTS[tokenIndex % 4];
    return { col: bx + sx, row: by + sy };
  }
  if (token.state === "finished") {
    const [fx, fy] = LUDO_FINISH_SPOTS[color];
    return { col: 7 + fx, row: 7 + fy };
  }
  if (token.state === "home_stretch") {
    const idx = Math.max(0, Math.min(5, token.steps - 51));
    const [c, r] = LUDO_HOME_STRETCH[color][idx];
    return { col: c, row: r };
  }
  const globalPos = (LUDO_START_OFFSETS[color] + token.steps) % 52;
  const [c, r] = LUDO_PATH[globalPos];
  return { col: c, row: r };
}

function buildLudoBoardSVG() {
  const hex = (c) => LUDO_COLOR_HEX[c];
  let svg = `<rect width="300" height="300" fill="#fff8ec"/>`;

  Object.entries(LUDO_BASE_BLOCKS).forEach(([color, [bx, by]]) => {
    const x = bx * LD_CELL;
    const y = by * LD_CELL;
    svg += `<rect x="${x}" y="${y}" width="120" height="120" fill="${hex(color)}" opacity="0.22"/>`;
    svg += `<rect x="${x + 15}" y="${y + 15}" width="90" height="90" rx="10" fill="#fff8ec" stroke="${hex(color)}" stroke-width="2"/>`;
    LUDO_BASE_SLOTS.forEach(([sx, sy]) => {
      const p = ludoCellPx(bx + sx, by + sy);
      svg += `<circle cx="${p.x}" cy="${p.y}" r="7" fill="none" stroke="${hex(color)}" stroke-width="1.5" opacity="0.5"/>`;
    });
  });

  LUDO_PATH.forEach(([c, r], idx) => {
    const x = c * LD_CELL;
    const y = r * LD_CELL;
    const safe = LUDO_SAFE_INDEXES.has(idx);
    svg += `<rect x="${x}" y="${y}" width="${LD_CELL}" height="${LD_CELL}" fill="${safe ? "#ffe9a8" : "#fff8ec"}" stroke="#d8c7a0" stroke-width="0.5"/>`;
    if (safe) {
      const p = ludoCellPx(c, r);
      svg += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#c9a227"/>`;
    }
  });

  Object.entries(LUDO_START_OFFSETS).forEach(([color, offset]) => {
    const [c, r] = LUDO_PATH[offset];
    svg += `<rect x="${c * LD_CELL}" y="${r * LD_CELL}" width="${LD_CELL}" height="${LD_CELL}" fill="${hex(color)}" opacity="0.55"/>`;
  });

  Object.entries(LUDO_HOME_STRETCH).forEach(([color, cells]) => {
    cells.forEach(([c, r]) => {
      svg += `<rect x="${c * LD_CELL}" y="${r * LD_CELL}" width="${LD_CELL}" height="${LD_CELL}" fill="${hex(color)}" opacity="0.4" stroke="#d8c7a0" stroke-width="0.5"/>`;
    });
  });

  svg += `
    <path d="M120,120 L180,120 L150,150 Z" fill="${hex("green")}" opacity="0.6"/>
    <path d="M180,120 L180,180 L150,150 Z" fill="${hex("yellow")}" opacity="0.6"/>
    <path d="M180,180 L120,180 L150,150 Z" fill="${hex("blue")}" opacity="0.6"/>
    <path d="M120,180 L120,120 L150,150 Z" fill="${hex("red")}" opacity="0.6"/>
    <circle cx="150" cy="150" r="4" fill="#fff8ec"/>`;

  return `<svg viewBox="0 0 300 300" width="100%" height="100%" aria-hidden="true">${svg}</svg>`;
}

function renderLudo(root, msg) {
  const isMyTurn = state.playerId === msg.current_player;
  const myRoll = state.lastDiceRoll && state.lastDiceRoll.player_id === state.playerId ? state.lastDiceRoll : null;
  const canRoll = isMyTurn && msg.pending_roll === null;
  const canMove = isMyTurn && msg.pending_roll !== null && myRoll;

  if (!state.ludoInitialized) {
    root.innerHTML = `
      <h2>Ludo</h2>
      <p class="muted">Turn: <strong id="ludo-turn"></strong>
         (<span id="ludo-turn-dot" class="ludo-color-dot"></span><span id="ludo-turn-color"></span>)
         <span id="ludo-die" class="sl-die">?</span></p>
      <div class="sl-board-wrap">
        <div class="sl-board">${buildLudoBoardSVG()}</div>
        <div class="sl-tokens" id="ludo-board-tokens"></div>
      </div>
      <p id="ludo-roll-result" class="muted"></p>
      <button id="ludo-roll" class="primary">Roll Dice</button>
      <div id="ludo-move-row" class="action-row"></div>
    `;
    state.ludoInitialized = true;
    state.ludoTokenEls = {};
  }

  root.querySelector("#ludo-turn").textContent = nicknameOf(msg.current_player);
  root.querySelector("#ludo-turn-dot").className = `ludo-color-dot ${msg.colors[msg.current_player]}`;
  root.querySelector("#ludo-turn-color").textContent = msg.colors[msg.current_player];

  const rollBtn = root.querySelector("#ludo-roll");
  rollBtn.disabled = !canRoll;
  rollBtn.onclick = canRoll ? () => send("game_action", { action: { type: "roll" } }) : null;

  const tokenLayer = root.querySelector("#ludo-board-tokens");
  const seen = new Set();
  state.players.forEach((p) => {
    const color = msg.colors[p.id];
    if (!color) return;
    (msg.tokens[p.id] || []).forEach((token, i) => {
      const key = `${p.id}-${i}`;
      seen.add(key);
      const { col, row } = ludoCellForToken(color, token, i);
      const center = ludoCellPx(col, row);
      let el = state.ludoTokenEls[key];
      if (!el) {
        el = document.createElement("div");
        el.className = "sl-token ludo-board-token";
        el.innerHTML = `<div class="arena-char">${characterSVG(LUDO_COLOR_HEX[color], {})}</div>`;
        tokenLayer.appendChild(el);
        state.ludoTokenEls[key] = el;
      }
      el.style.left = `${(center.x / 300) * 100}%`;
      el.style.top = `${(center.y / 300) * 100}%`;
      el.style.opacity = token.state === "base" ? "0.5" : "1";
    });
  });
  Object.keys(state.ludoTokenEls).forEach((key) => {
    if (!seen.has(key)) {
      state.ludoTokenEls[key].remove();
      delete state.ludoTokenEls[key];
    }
  });

  if (state.lastDiceRoll) {
    const r = state.lastDiceRoll;
    const die = root.querySelector("#ludo-die");
    die.textContent = r.roll;
    die.classList.remove("sl-die-roll");
    void die.offsetWidth;
    die.classList.add("sl-die-roll");

    let text = `🎲 ${nicknameOf(r.player_id)} rolled a ${r.roll}`;
    if (r.forfeited) text += " - three 6s in a row, turn forfeited!";
    else if (r.movable.length === 0) text += " - no valid moves.";
    root.querySelector("#ludo-roll-result").textContent = text;
  }

  const moveRow = root.querySelector("#ludo-move-row");
  moveRow.innerHTML = "";
  if (canMove) {
    myRoll.movable.forEach((tokenIndex) => {
      const token = msg.tokens[state.playerId][tokenIndex];
      const btn = document.createElement("button");
      btn.className = "primary";
      btn.textContent = `Move token ${tokenIndex + 1} (${tokenLabel(token)})`;
      btn.addEventListener("click", () => {
        send("game_action", { action: { type: "move_token", token_index: tokenIndex } });
      });
      moveRow.appendChild(btn);
    });
  }
}

// ---------- Game over ----------

function renderGameOver(result) {
  els.gameoverExtra.innerHTML = "";

  if (state.gameType === "thief_police") {
    els.gameoverTitle.textContent = result.correct ? "🚨 Police caught the Thief!" : "🏃 Thief got away!";
    els.gameoverDetail.textContent = "";
    const table = document.createElement("div");
    table.className = "reveal-table";
    Object.entries(result.roles).forEach(([pid, role]) => {
      const row = document.createElement("div");
      row.className = "reveal-row";
      row.innerHTML = `<span>${nicknameOf(pid)}</span><span>${role}</span><span>${result.points[pid]} pts</span>`;
      table.appendChild(row);
    });
    els.gameoverExtra.appendChild(table);
  } else if (state.gameType === "spyfall") {
    const spyName = nicknameOf(result.spy_id);
    const outcomeText = {
      spy_guessed_correctly: `${spyName} (the Spy) correctly guessed the location!`,
      spy_guessed_wrong: `${spyName} (the Spy) guessed wrong!`,
      spy_caught: `${spyName} (the Spy) was caught!`,
      spy_escaped: `${spyName} (the Spy) escaped unnoticed!`,
      no_votes: `No one voted - ${spyName} (the Spy) wins by default.`,
    }[result.reason] || result.reason;
    els.gameoverTitle.textContent = outcomeText;
    els.gameoverDetail.textContent = `The location was: ${result.location}`;
  } else if (state.gameType === "mafia") {
    els.gameoverTitle.textContent = result.winner === "mafia" ? "🔪 Mafia wins!" : "🏘️ Town wins!";
    els.gameoverDetail.textContent = "";
    const table = document.createElement("div");
    table.className = "reveal-table";
    Object.entries(result.roles).forEach(([pid, role]) => {
      const row = document.createElement("div");
      row.className = "reveal-row";
      row.innerHTML = `<span>${nicknameOf(pid)}</span><span>${role}</span>`;
      table.appendChild(row);
    });
    els.gameoverExtra.appendChild(table);
  } else if (state.gameType === "hide_seek") {
    if (result.reason === "all_found") {
      els.gameoverTitle.textContent = `🔦 ${nicknameOf(result.seeker_id)} (the Seeker) found everyone!`;
      els.gameoverDetail.textContent = "";
    } else {
      const remaining = (result.hiders_remaining || []).map(nicknameOf).join(", ") || "No one";
      els.gameoverTitle.textContent = "🙈 The hiders win!";
      els.gameoverDetail.textContent = `Still hidden when time ran out: ${remaining}`;
    }
  } else if (state.gameType === "freeze_tag") {
    if (result.reason === "all_frozen") {
      els.gameoverTitle.textContent = `🥶 ${nicknameOf(result.it_id)} froze everyone!`;
      els.gameoverDetail.textContent = "";
    } else {
      els.gameoverTitle.textContent = "🏃 The runners win!";
      els.gameoverDetail.textContent = `${nicknameOf(result.it_id)} (It) couldn't freeze everyone in time.`;
    }
  } else if (["pictionary", "charades", "taboo"].includes(state.gameType)) {
    els.gameoverTitle.textContent = `🏆 ${nicknameOf(result.winner)} wins!`;
    els.gameoverDetail.textContent = "";
    const table = document.createElement("div");
    table.className = "reveal-table";
    Object.entries(result.scores || {})
      .sort((a, b) => b[1] - a[1])
      .forEach(([pid, score]) => {
        const row = document.createElement("div");
        row.className = "reveal-row";
        row.innerHTML = `<span>${nicknameOf(pid)}</span><span>${score} pts</span>`;
        table.appendChild(row);
      });
    els.gameoverExtra.appendChild(table);
  } else if (state.gameType === "snake_ladder") {
    els.gameoverTitle.textContent = `🏆 ${nicknameOf(result.winner)} reached 100!`;
    els.gameoverDetail.textContent = "";
  } else if (state.gameType === "uno") {
    els.gameoverTitle.textContent = `🏆 ${nicknameOf(result.winner)} wins - hand's empty!`;
    els.gameoverDetail.textContent = "";
  } else if (state.gameType === "ludo") {
    const color = result.colors ? result.colors[result.winner] : "";
    els.gameoverTitle.textContent = `🏆 ${nicknameOf(result.winner)} (${color}) got all 4 tokens home!`;
    els.gameoverDetail.textContent = "";
  } else if (state.gameType === "antakshari") {
    els.gameoverTitle.textContent = result.winner ? `🎤 ${nicknameOf(result.winner)} wins!` : "Game over";
    els.gameoverDetail.textContent = "Last one still singing takes it!";
  } else if (state.gameType === "twenty_questions") {
    els.gameoverTitle.textContent = result.reason === "guessed_correctly"
      ? `🎉 ${nicknameOf(result.winner)} guessed it!`
      : `🏆 ${nicknameOf(result.winner)} (the Answerer) wins!`;
    els.gameoverDetail.textContent = `The secret word was: ${result.secret}`;
  } else if (result.winner_nickname) {
    els.gameoverTitle.textContent = `🏆 ${result.winner_nickname} wins!`;
    els.gameoverDetail.textContent = `Reason: ${result.reason.replace(/_/g, " ")}`;
  } else if (result.reason === "draw") {
    els.gameoverTitle.textContent = "It's a draw!";
    els.gameoverDetail.textContent = "";
  } else {
    els.gameoverTitle.textContent = "Game over";
    els.gameoverDetail.textContent = `Reason: ${result.reason.replace(/_/g, " ")}`;
  }

  const isHost = state.playerId === state.hostId;
  els.playAgainBtn.classList.toggle("hidden", !isHost);
}

els.playAgainBtn.addEventListener("click", () => {
  send("play_again");
  showScreen("lobby");
});

els.backHomeBtn.addEventListener("click", () => {
  location.reload();
});

// ---------- Boot ----------

connect();
loadGames();
