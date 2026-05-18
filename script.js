// --- 전역 변수 및 초기화 ---
let mode = "ai", level = "easy", board = [], turn = 1, isGameOver = false, lastMove = null, playerColor = 1;
let currentLimit = 20, timerInterval, moveHistory = [], endReason = "";
let undoCounts = { 1: 0, 2: 0 }; 
let statusTimeout = null;
let placeMode = localStorage.getItem("omok_settings_placeMode") || "direct"; 
let tempMove = null;
let aiTimeout = null;
let deferredPrompt = null;

const SIZE = 15;
const c = document.getElementById("c");
const ctx = c.getContext("2d");
const cell = 600 / 16;

// --- 게임 시작 함수 ---
function startGame() {
    if (aiTimeout) clearTimeout(aiTimeout);
    if (timerInterval) clearInterval(timerInterval);
    
    board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    moveHistory = []; 
    isGameOver = false; 
    turn = 1; 
    endReason = ""; 
    undoCounts = { 1: 0, 2: 0 }; 
    tempMove = null;
    lastMove = null;

    document.getElementById("startModal").style.display = "none";
    document.getElementById("mainGoBtn").style.display = "none";
    document.getElementById("confirmPlaceBtn").style.display = "none";
    document.getElementById("finishConfirmModal").style.display = "none";
    
    const isImp = (level === 'impossible' && mode === 'ai');
    const ub = document.getElementById("undoBtn");
    if (ub) {
        ub.style.display = "block";
        ub.disabled = isImp;
        ub.innerText = isImp ? "무르기 불가" : "무르기";
    }
    
    const gb = document.getElementById("giveUpBtn");
    if (gb) gb.style.display = "block";
    
    draw();
    startTurn(); 
}

// --- UI 업데이트 로직 ---
function updateUI() {
    const isImp = (level === 'impossible' && mode === 'ai');
    
    document.getElementById("aiBtn")?.classList.toggle("active", mode === 'ai');
    document.getElementById("friendBtn")?.classList.toggle("active", mode === 'friend');
    
    const aiOpts = document.getElementById("aiOptions");
    if (aiOpts) {
        if (mode === 'friend') aiOpts.style.opacity = "0.3";
        else aiOpts.style.opacity = "1";
    }

    const sb = document.getElementById("startBtn");
    if(sb) sb.style.background = isImp ? "var(--impossible)" : "var(--dark)";
    
    document.getElementById("colorBlack")?.classList.toggle("active", playerColor === 1);
    document.getElementById("colorWhite")?.classList.toggle("active", playerColor === 2);

    ['easy', 'medium', 'hard', 'impossible'].forEach(l => {
        const id = l === 'medium' ? 'midBtn' : l === 'impossible' ? 'impBtn' : l + 'Btn';
        const el = document.getElementById(id);
        if (el) {
            el.classList.toggle("active", level === l);
        }
    });

    document.getElementById("directModeBtn")?.classList.toggle("active", placeMode === 'direct');
    document.getElementById("confirmModeBtn")?.classList.toggle("active", placeMode === 'confirm');
}

function setPlaceMode(m) {
    placeMode = m;
    localStorage.setItem("omok_settings_placeMode", m);
    updateUI();
}

// --- 보드 그리기 ---
function draw() {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#4a3419"; ctx.lineWidth = 1;
    for (let i = 1; i <= SIZE; i++) {
        ctx.beginPath(); ctx.moveTo(cell, i * cell); ctx.lineTo(SIZE * cell, i * cell); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i * cell, cell); ctx.lineTo(i * cell, SIZE * cell); ctx.stroke();
    }
    [4, 8, 12].forEach(y => [4, 8, 12].forEach(x => {
        ctx.beginPath(); ctx.arc(x * cell, y * cell, 4, 0, Math.PI * 2); ctx.fillStyle = "#4a3419"; ctx.fill();
    }));
    
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (board[y][x]) drawStone(x, y, board[y][x]);
        }
    }

    if (placeMode === "confirm" && tempMove && !isGameOver) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        drawStone(tempMove.x, tempMove.y, turn);
        ctx.restore();
        ctx.strokeStyle = "#ff4d4d"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc((tempMove.x + 1) * cell, (tempMove.y + 1) * cell, cell * 0.45, 0, Math.PI * 2); ctx.stroke();
    }

    if (isGameOver) {
        moveHistory.forEach((m, i) => {
            ctx.font = "bold 14px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillStyle = m.p === 1 ? "#fff" : "#000"; ctx.fillText(i + 1, (m.x + 1) * cell, (m.y + 1) * cell);
        });
    } else if (lastMove) {
        ctx.fillStyle = (level === 'impossible' && mode === 'ai') ? "#8e44ad" : "#ff4d4d";
        ctx.beginPath(); ctx.arc((lastMove.x + 1) * cell, (lastMove.y + 1) * cell, 6, 0, Math.PI * 2); ctx.fill();
    }
}

function drawStone(x, y, p) {
    const px = (x + 1) * cell, py = (y + 1) * cell;
    const grad = ctx.createRadialGradient(px - cell * 0.15, py - cell * 0.15, cell * 0.05, px, py, cell * 0.4);
    if (p === 1) { grad.addColorStop(0, "#666"); grad.addColorStop(1, "#000"); }
    else { grad.addColorStop(0, "#fff"); grad.addColorStop(1, "#ccc"); }
    ctx.beginPath(); ctx.arc(px, py, cell * 0.43, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
}

// --- 턴 및 상태 관리 ---
function startTurn() {
    if (timerInterval) clearInterval(timerInterval);
    const isImp = (level === 'impossible' && mode === 'ai');
    if (isImp) {
        currentLimit = 20; updateTimerUI();
        timerInterval = setInterval(() => {
            if (isGameOver) { clearInterval(timerInterval); return; }
            currentLimit--; updateTimerUI();
            if (currentLimit <= 0) { clearInterval(timerInterval); endByTimeout(); }
        }, 1000);
    } else updateTimerUI();
    
    updateStatus();
    if (mode === "ai" && turn !== playerColor && !isGameOver) triggerAi();
}

function updateStatus(msg, isPriority = false) {
    if (statusTimeout) { clearTimeout(statusTimeout); statusTimeout = null; }
    const s = document.getElementById("status");
    if (!s) return;
    if (isGameOver && !msg) return;
    
    s.classList.remove("thinking");

    if (msg) {
        s.innerText = msg;
        if (isPriority) { statusTimeout = setTimeout(() => updateStatus(), 3000); }
        return;
    }

    if (mode === "ai" && turn !== playerColor) {
        s.innerText = "AI 생각 중..."; 
        s.classList.add("thinking");
    } else {
        s.innerText = (turn === 1 ? "흑 차례" : "백 차례");
    }
}

function updateTimerUI() {
    const isImp = (level === 'impossible' && mode === 'ai');
    for (let i = 1; i <= 2; i++) {
        const tEl = document.getElementById(`timer${i}`);
        if (!tEl) continue;
        
        const isCurrentTurn = (turn === i);
        tEl.style.opacity = "1";
        tEl.style.color = "#fff"; 
        
        if (isCurrentTurn) {
            tEl.style.fontWeight = "bold";
            if (isImp) {
                tEl.innerText = `00:${String(Math.max(0, currentLimit)).padStart(2, '0')}`;
                if (currentLimit <= 5) tEl.style.color = "#ff4d4d";
            } else {
                tEl.innerText = `∞`;
            }
        } else {
            tEl.style.fontWeight = "normal";
            tEl.innerText = isImp ? `00:20` : `∞`;
        }
    }
}

// --- 입력 처리 ---
function handleInput(e) {
    if (isGameOver || (mode === "ai" && (turn !== playerColor || aiTimeout))) return;

    const rect = c.getBoundingClientRect();
    const cX = e.touches ? e.touches[0].clientX : e.clientX;
    const cY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const scaleX = c.width / rect.width;
    const scaleY = c.height / rect.height;
    
    const x = Math.round(((cX - rect.left) * scaleX) / cell) - 1;
    const y = Math.round(((cY - rect.top) * scaleY) / cell) - 1;

    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE && board[y][x] === 0) {
        const forbidden = checkRenjuForbidden(x, y, turn);
        if (forbidden) { 
            showToast(`⚠️ ${forbidden} (흑 금수)`); 
            updateStatus(`⚠️ ${forbidden}`, true); 
            return; 
        }

        if (placeMode === "direct") {
            placeStone(x, y);
        } else {
            tempMove = { x, y };
            document.getElementById("confirmPlaceBtn").style.display = "block";
            draw();
        }
    }
}

function finalConfirmPlace() {
    if (!tempMove || isGameOver) return;
    const forbidden = checkRenjuForbidden(tempMove.x, tempMove.y, turn);
    if (forbidden) { updateStatus(`⚠️ ${forbidden}`, true); return; }
    
    placeStone(tempMove.x, tempMove.y);
    tempMove = null;
    document.getElementById("confirmPlaceBtn").style.display = "none";
}

c.addEventListener('mousedown', handleInput);
c.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleInput(e);
}, { passive: false });

function placeStone(x, y) {
    board[y][x] = turn; 
    lastMove = { x, y }; 
    moveHistory.push({ x, y, p: turn });
    saveGameSession();
    draw();
    
    if (checkWinStrict(x, y, turn)) { 
        endGame(turn); 
        return; 
    }
    
    if (moveHistory.length === SIZE * SIZE) {
        isGameOver = true; 
        if (timerInterval) clearInterval(timerInterval);
        clearGameSession();
        document.getElementById("finishResultText").innerText = "무승부";
        document.getElementById("finishConfirmModal").style.display = "flex";
        return;
    }
    
    turn = 3 - turn; 
    startTurn();
}

// --- 게임 종료 및 제어 ---
function endGame(w) {
    clearGameSession();
    isGameOver = true; 
    if (timerInterval) clearInterval(timerInterval); 
    endReason = "정상종료";
    saveHistory(w, "정상종료");
    renderWinRate();
    
    document.getElementById("finishResultText").innerText = (w === 1 ? '흑' : '백') + " 승리!";
    document.getElementById("finishConfirmModal").style.display = "flex";
    
    if (typeof confetti === 'function' && (w === playerColor || mode !== 'ai')) {
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    }
}

function endByTimeout() {
    clearGameSession();
    const winner = 3 - turn; 
    isGameOver = true; 
    endReason = "시간패";
    document.getElementById("finishResultText").innerText = (turn === 1 ? "흑" : "백") + " 시간초과 패배!";
    document.getElementById("finishConfirmModal").style.display = "flex";
    saveHistory(winner, "시간패");
    renderWinRate();
}

function handleGiveUp() {
    clearGameSession();
    if (isGameOver) return;
    isGameOver = true;
    endReason = "기권패";

    const loser  = (mode === 'ai') ? playerColor : turn;
    const winner = 3 - loser;

    document.getElementById("finishResultText").innerText = (loser === 1 ? "흑" : "백") + " 기권패!";
    document.getElementById("finishConfirmModal").style.display = "flex";
    saveHistory(winner, "기권패");
    renderWinRate();
}

// ─── 무르기 ───────────────────────────────────────────────────────
function undo() {
    if (moveHistory.length === 0 || isGameOver) return;
    if (level === 'impossible' && mode === 'ai') return;
    if (aiTimeout) { clearTimeout(aiTimeout); aiTimeout = null; }

    let stepsToRemove = (mode === "ai") ? 2 : 1;
    if (mode === "ai" && moveHistory.length < 2) stepsToRemove = 1;

    for (let i = 0; i < stepsToRemove; i++) {
        let last = moveHistory.pop();
        if (last) board[last.y][last.x] = 0;
    }

    lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
    tempMove = null;
    document.getElementById("confirmPlaceBtn").style.display = "none";

    if (mode === "ai") {
        turn = playerColor;
        undoCounts[playerColor]++;
    } else {
        const nextTurn = moveHistory.length > 0 ? 3 - moveHistory[moveHistory.length - 1].p : 1;
        undoCounts[nextTurn]++;
        turn = nextTurn;
    }

    saveGameSession();
    draw();
    startTurn();
    const playerName = (turn === 1) ? "흑" : "백";
    updateStatus(`${playerName} 무르기 완료 (남은 기회: ${3 - undoCounts[turn]}회)`, true);
}

function setupConfirmBtn(callback) {
    const oldBtn = document.getElementById("confirmActionBtn");
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    newBtn.onclick = () => { callback(); closeActionConfirm(); };
}

function askUndo() {
    if (isGameOver || (level === 'impossible' && mode === 'ai')) return;
    if (moveHistory.length === 0) return;

    const actingPlayer = (mode === "ai") ? playerColor : moveHistory[moveHistory.length - 1].p;
    const currentCount = undoCounts[actingPlayer];
    const playerName = (actingPlayer === 1) ? "흑" : "백";

    if (currentCount >= 3) { showToast(`⚠️ ${playerName}님 무르기 제한 초과 (3/3)`); return; }

    document.getElementById("actionTitle").innerText = "무르기 확인";
    document.getElementById("actionDesc").innerText = `${playerName}님의 방금 수를 무르시겠습니까?\n(남은 기회: ${3 - currentCount}회)`;
    setupConfirmBtn(undo);
    document.getElementById("actionConfirmModal").style.display = "flex";
}

function askGiveUp() {
    if (isGameOver) return;
    document.getElementById("actionTitle").innerText = "기권 확인";
    document.getElementById("actionDesc").innerText = "정말로 게임을 기권하시겠습니까?";
    setupConfirmBtn(handleGiveUp);
    document.getElementById("actionConfirmModal").style.display = "flex";
}

function closeActionConfirm() { document.getElementById("actionConfirmModal").style.display = "none"; }

// --- 렌주룰 및 승리 판정 ---
function checkWinStrict(x, y, t) {
    const ds = [[1,0],[0,1],[1,1],[1,-1]];
    for(let [dx, dy] of ds) {
        let count = 1;
        for(let i=1; i<6; i++) if(board[y+dy*i]?.[x+dx*i]===t) count++; else break;
        for(let i=1; i<6; i++) if(board[y-dy*i]?.[x-dx*i]===t) count++; else break;
        if (t === 1 && count === 5) return true; 
        if (t === 2 && count >= 5) return true;  
    }
    return false;
}

function checkRenjuForbidden(x, y, t) {
    if (t !== 1) return false; 
    if (checkWinStrict(x, y, 1)) return false; 

    board[y][x] = 1;
    const ds = [[1,0],[0,1],[1,1],[1,-1]];
    for(let [dx, dy] of ds) {
        let count = 1;
        for(let i=1; i<10; i++) if(board[y+dy*i]?.[x+dx*i]===1) count++; else break;
        for(let i=1; i<10; i++) if(board[y-dy*i]?.[x-dx*i]===1) count++; else break;
        if(count > 5) { board[y][x] = 0; return "장륙 금수"; }
    }
    let fourCount = 0, openThreeCount = 0;
    for(let [dx, dy] of ds) {
        if (isRealFour(x, y, dx, dy, 1)) fourCount++;
        if (isRealOpenThree(x, y, dx, dy, 1)) openThreeCount++;
    }
    board[y][x] = 0;
    if (fourCount >= 2) return "44 금수";
    if (openThreeCount >= 2) return "33 금수";
    return false;
}

function isRealFour(x, y, dx, dy, t) {
    let count = 0;
    for(let i=-4; i<=4; i++) {
        let nx = x+dx*i, ny = y+dy*i;
        if (nx>=0 && nx<SIZE && ny>=0 && ny<SIZE && (board[ny][nx] === 0 || (nx===x && ny===y))) {
            let temp = board[ny][nx]; board[ny][nx] = t;
            if (checkWinStrict(nx, ny, t)) count++;
            board[ny][nx] = temp;
        }
    }
    return count > 0;
}

function isRealOpenThree(x, y, dx, dy, t) {
    let foundOpenFour = false;
    for(let i=-4; i<=4; i++) {
        let nx = x+dx*i, ny = y+dy*i;
        if (nx>=0 && nx<SIZE && ny>=0 && ny<SIZE && board[ny][nx] === 0 && !(nx===x && ny===y)) {
            board[ny][nx] = t;
            if (isOpenFour(nx, ny, dx, dy, t)) foundOpenFour = true;
            board[ny][nx] = 0;
            if (foundOpenFour) break;
        }
    }
    return foundOpenFour;
}

function isOpenFour(x, y, dx, dy, t) {
    let count = 1, leftIdx = 1, rightIdx = 1;
    while(board[y+dy*leftIdx]?.[x+dx*leftIdx]===t) { count++; leftIdx++; }
    while(board[y-dy*rightIdx]?.[x-dx*rightIdx]===t) { count++; rightIdx++; }
    if (count === 4) {
        let p1 = board[y+dy*leftIdx]?.[x+dx*leftIdx];
        let p2 = board[y-dy*rightIdx]?.[x-dx*rightIdx];
        return (p1 === 0 && p2 === 0);
    }
    return false;
}

// ============================================================
// --- AI 알고리즘 ---
// ============================================================

function triggerAi() {
    if (isGameOver) return;
    const min = 600, max = 1500;
    const delay = Math.random() * (max - min) + min;
    aiTimeout = setTimeout(() => {
        let best;
        switch(level) {
            case 'easy':       best = getBestMoveHeuristic(0.5, true);  break;
            case 'medium':     best = getBestMoveHeuristic(0.9, false); break;
            case 'hard':       best = getMinimaxMove(7);                break;  // ★ depth 7
            case 'impossible': best = getMCTSMove(1200);                break;  // ★ MCTS 1.2초
        }
        if (best && best.x !== -1) {
            if (turn === 1 && checkRenjuForbidden(best.x, best.y, 1)) {
                best = getBestMoveHeuristic(0.5, true);
            }
            placeStone(best.x, best.y);
        }
        aiTimeout = null;
    }, delay);
}

// ─── 휴리스틱 (초보/중수) ─────────────────────────────────────────
function getBestMoveHeuristic(dW, isRandom) {
    let bX = -1, bY = -1, mS = -1;
    for (let y=0; y<SIZE; y++) for (let x=0; x<SIZE; x++) {
        if (board[y][x] === 0) {
            if (turn === 1 && checkRenjuForbidden(x, y, 1)) continue;
            let s = getPointBetter(x, y, turn) + (getPointBetter(x, y, 3-turn) * dW);
            if (isRandom) s *= (0.8 + Math.random() * 0.4);
            if (s > mS) { mS = s; bX = x; bY = y; }
        }
    }
    return {x: bX, y: bY};
}

// ─── 후보 수 생성 (공통) ──────────────────────────────────────────
function getCandidates(aiTurn, limit = 20) {
    let candidates = [];
    const visited = new Set();
    for (let y=0; y<SIZE; y++) for (let x=0; x<SIZE; x++) {
        if (board[y][x] !== 0) {
            for (let dy=-2; dy<=2; dy++) for (let dx=-2; dx<=2; dx++) {
                const nx = x+dx, ny = y+dy;
                const key = ny*SIZE+nx;
                if (nx>=0 && nx<SIZE && ny>=0 && ny<SIZE && board[ny][nx]===0 && !visited.has(key)) {
                    visited.add(key);
                    if (aiTurn === 1 && checkRenjuForbidden(nx, ny, 1)) continue;
                    const centerBonus = (7-Math.abs(7-nx) + 7-Math.abs(7-ny)) * 5;
                    const s = getPointBetter(nx, ny, aiTurn) * 1.2
                            + getPointBetter(nx, ny, 3-aiTurn)
                            + centerBonus;
                    candidates.push({x: nx, y: ny, s});
                }
            }
        }
    }
    // 첫 수: 중앙
    if (candidates.length === 0) return [{x:7, y:7, s:0}];
    candidates.sort((a,b) => b.s - a.s);
    return candidates.slice(0, limit);
}

// ─── 미니맥스 + 알파베타 (고수 depth 7) ──────────────────────────
function getMinimaxMove(depth) {
    const winMove = findImmediateWin(turn);     if (winMove) return winMove;
    const threatMove = findImmediateWin(3-turn); if (threatMove) return threatMove;

    let bestScore = -Infinity;
    let bestMove  = {x: -1, y: -1};
    const candidates = getCandidates(turn, 20);

    for (let m of candidates) {
        board[m.y][m.x] = turn;
        const score = minimax(depth - 1, -Infinity, Infinity, false, turn);
        board[m.y][m.x] = 0;
        if (score > bestScore) { bestScore = score; bestMove = m; }
    }
    return bestMove;
}

function findImmediateWin(t) {
    for(let y=0; y<SIZE; y++) for(let x=0; x<SIZE; x++) {
        if(board[y][x]===0) {
            if(t===1 && checkRenjuForbidden(x,y,1)) continue;
            board[y][x] = t;
            const win = checkWinStrict(x, y, t);
            board[y][x] = 0;
            if (win) return {x, y};
        }
    }
    return null;
}

function minimax(depth, alpha, beta, isMax, aiTurn) {
    if (depth === 0) return evaluateBetter(aiTurn);

    const currTurn = isMax ? aiTurn : 3 - aiTurn;
    // 내부 탐색 후보는 깊이에 따라 줄임 (속도 vs 품질 균형)
    const branchLimit = depth >= 5 ? 8 : depth >= 3 ? 6 : 5;
    const candidates  = getCandidates(currTurn, branchLimit);

    if (isMax) {
        let maxE = -Infinity;
        for (let m of candidates) {
            board[m.y][m.x] = currTurn;
            if (checkWinStrict(m.x, m.y, currTurn)) {
                board[m.y][m.x] = 0;
                return 1000000 + depth;
            }
            const ev = minimax(depth-1, alpha, beta, false, aiTurn);
            board[m.y][m.x] = 0;
            maxE  = Math.max(maxE, ev);
            alpha = Math.max(alpha, ev);
            if (beta <= alpha) break;
        }
        return maxE;
    } else {
        let minE = Infinity;
        for (let m of candidates) {
            board[m.y][m.x] = currTurn;
            if (checkWinStrict(m.x, m.y, currTurn)) {
                board[m.y][m.x] = 0;
                return -1000000 - depth;
            }
            const ev = minimax(depth-1, alpha, beta, true, aiTurn);
            board[m.y][m.x] = 0;
            minE = Math.min(minE, ev);
            beta = Math.min(beta, ev);
            if (beta <= alpha) break;
        }
        return minE;
    }
}

function evaluateBetter(aiTurn) {
    let score = 0;
    for(let y=0; y<SIZE; y++) for(let x=0; x<SIZE; x++) {
        if(board[y][x] === aiTurn)    score += getPointBetter(x, y, aiTurn);
        else if(board[y][x] !== 0)    score -= getPointBetter(x, y, 3-aiTurn) * 1.1;
    }
    return score;
}

function getPointBetter(x, y, t) {
    let total = 0;
    const ds = [[1,0],[0,1],[1,1],[1,-1]];
    for (let [dx, dy] of ds) {
        let count = 1, openEnds = 0;
        for (let i=1; i<5; i++) {
            const nx=x+dx*i, ny=y+dy*i;
            if (nx>=0&&nx<SIZE&&ny>=0&&ny<SIZE) {
                if (board[ny][nx]===t) count++;
                else if (board[ny][nx]===0) { openEnds++; break; }
                else break;
            } else break;
        }
        for (let i=1; i<5; i++) {
            const nx=x-dx*i, ny=y-dy*i;
            if (nx>=0&&nx<SIZE&&ny>=0&&ny<SIZE) {
                if (board[ny][nx]===t) count++;
                else if (board[ny][nx]===0) { openEnds++; break; }
                else break;
            } else break;
        }
        if      (count >= 5) total += 500000;
        else if (count === 4) total += openEnds===2 ? 50000 : openEnds===1 ? 5000 : 0;
        else if (count === 3) total += openEnds===2 ?  5000 : openEnds===1 ?  500 : 0;
        else if (count === 2) total += openEnds===2 ?   500 : 0;
    }
    return total;
}

// ============================================================
// ─── MCTS (불가능 단계) ───────────────────────────────────────
// ============================================================

const MCTS_C = 1.414; // UCB1 탐색 상수

class MCTSNode {
    constructor(move, parent, boardSnap, nodeTurn) {
        this.move      = move;       // {x, y} | null (루트)
        this.parent    = parent;
        this.children  = [];
        this.wins      = 0;
        this.visits    = 0;
        this.nodeTurn  = nodeTurn;   // 이 노드에서 방금 둔 플레이어
        this.boardSnap = boardSnap;  // 이 노드 시점의 보드 (flat Int8Array)
        this.untriedMoves = null;    // 아직 확장 안 한 후보수 (지연 초기화)
    }

    // UCB1 점수
    ucb1(parentVisits) {
        if (this.visits === 0) return Infinity;
        return this.wins / this.visits
             + MCTS_C * Math.sqrt(Math.log(parentVisits) / this.visits);
    }

    // 가장 유망한 자식
    bestChild() {
        return this.children.reduce((a, b) =>
            b.ucb1(this.visits) > a.ucb1(this.visits) ? b : a);
    }
}

// 보드 ↔ flat Int8Array 변환 유틸
function boardToFlat(b) {
    const f = new Int8Array(SIZE * SIZE);
    for (let y=0; y<SIZE; y++) for (let x=0; x<SIZE; x++) f[y*SIZE+x] = b[y][x];
    return f;
}
function flatToBoard(f) {
    const b = Array.from({length:SIZE}, (_,y) =>
        Array.from({length:SIZE}, (_,x) => f[y*SIZE+x]));
    return b;
}
function applyMoveFlat(f, x, y, t) {
    const nf = f.slice();
    nf[y*SIZE+x] = t;
    return nf;
}

// flat 배열용 승리 판정
function checkWinFlat(f, x, y, t) {
    const ds = [[1,0],[0,1],[1,1],[1,-1]];
    const get = (xx,yy) => (xx>=0&&xx<SIZE&&yy>=0&&yy<SIZE) ? f[yy*SIZE+xx] : -1;
    for (let [dx,dy] of ds) {
        let cnt = 1;
        for (let i=1; i<6; i++) { if (get(x+dx*i, y+dy*i)===t) cnt++; else break; }
        for (let i=1; i<6; i++) { if (get(x-dx*i, y-dy*i)===t) cnt++; else break; }
        if (t===1 && cnt===5) return true;
        if (t===2 && cnt>=5)  return true;
    }
    return false;
}

// flat 배열용 렌주 금수 (빠른 버전: 장륙만 체크, 33/44는 롤아웃에서 생략)
function isWinMoveFlat(f, x, y, t) {
    const nf = applyMoveFlat(f, x, y, t);
    return checkWinFlat(nf, x, y, t);
}

// flat 보드에서 후보수 생성 (빠른 버전)
function getCandidatesFlat(f, t, limit=15) {
    const get = (xx,yy) => (xx>=0&&xx<SIZE&&yy>=0&&yy<SIZE) ? f[yy*SIZE+xx] : -1;
    const visited = new Uint8Array(SIZE*SIZE);
    const cands = [];
    for (let y=0; y<SIZE; y++) for (let x=0; x<SIZE; x++) {
        if (f[y*SIZE+x] !== 0) {
            for (let dy=-2; dy<=2; dy++) for (let dx=-2; dx<=2; dx++) {
                const nx=x+dx, ny=y+dy, key=ny*SIZE+nx;
                if (nx>=0&&nx<SIZE&&ny>=0&&ny<SIZE && f[key]===0 && !visited[key]) {
                    visited[key] = 1;
                    // 간단 점수 계산
                    let s = 0;
                    const ds2 = [[1,0],[0,1],[1,1],[1,-1]];
                    for (let [ddx,ddy] of ds2) {
                        let c1=0,c2=0;
                        for(let i=1;i<5;i++){if(get(nx+ddx*i,ny+ddy*i)===t)c1++;else break;}
                        for(let i=1;i<5;i++){if(get(nx-ddx*i,ny-ddy*i)===t)c1++;else break;}
                        for(let i=1;i<5;i++){if(get(nx+ddx*i,ny+ddy*i)===3-t)c2++;else break;}
                        for(let i=1;i<5;i++){if(get(nx-ddx*i,ny-ddy*i)===3-t)c2++;else break;}
                        s += c1*c1*10 + c2*c2*5;
                    }
                    cands.push({x:nx, y:ny, s});
                }
            }
        }
    }
    if (cands.length === 0) return [{x:7, y:7}];
    cands.sort((a,b)=>b.s-a.s);
    return cands.slice(0, limit);
}

// 롤아웃: 랜덤 + 휴리스틱 혼합 플레이아웃
function rollout(f, startTurn, aiTurn, maxDepth=30) {
    let cur = f.slice();
    let t = startTurn;
    for (let d=0; d<maxDepth; d++) {
        const cands = getCandidatesFlat(cur, t, 8);
        // 즉시 승리수 있으면 바로 둠
        let move = null;
        for (let m of cands) {
            if (isWinMoveFlat(cur, m.x, m.y, t)) { move=m; break; }
        }
        if (!move) move = cands[Math.floor(Math.random()*Math.min(cands.length,5))];
        cur = applyMoveFlat(cur, move.x, move.y, t);
        if (checkWinFlat(cur, move.x, move.y, t)) {
            return t === aiTurn ? 1 : 0;
        }
        t = 3 - t;
    }
    // 종료 전 평가 (점수 기반 무승부 처리)
    let aiScore=0, oppScore=0;
    const ds3=[[1,0],[0,1],[1,1],[1,-1]];
    const get=(xx,yy)=>(xx>=0&&xx<SIZE&&yy>=0&&yy<SIZE)?cur[yy*SIZE+xx]:-1;
    for(let y=0;y<SIZE;y++) for(let x=0;x<SIZE;x++){
        if(cur[y*SIZE+x]===aiTurn){
            for(let[dx,dy]of ds3){let c=1;for(let i=1;i<5;i++){if(get(x+dx*i,y+dy*i)===aiTurn)c++;else break;}aiScore+=c*c;}
        } else if(cur[y*SIZE+x]!==0){
            for(let[dx,dy]of ds3){let c=1;for(let i=1;i<5;i++){if(get(x+dx*i,y+dy*i)===3-aiTurn)c++;else break;}oppScore+=c*c;}
        }
    }
    if (aiScore > oppScore) return 0.6;
    if (aiScore < oppScore) return 0.4;
    return 0.5;
}

// MCTS 메인 함수 (timeLimitMs 밀리초 동안 반복)
function getMCTSMove(timeLimitMs = 1200) {
    const aiTurn = turn;

    // 즉시 승리/방어
    const winMove = findImmediateWin(aiTurn);     if (winMove) return winMove;
    const block   = findImmediateWin(3 - aiTurn); if (block)   return block;

    const rootFlat = boardToFlat(board);
    const root = new MCTSNode(null, null, rootFlat, 3 - aiTurn); // 루트: 상대가 방금 둔 상태

    const deadline = Date.now() + timeLimitMs;
    let iters = 0;

    while (Date.now() < deadline) {
        // 1. Selection
        let node = root;
        let f    = root.boardSnap.slice();
        let t    = aiTurn; // 루트의 다음 차례 = AI

        while (node.children.length > 0 && getUntriedMoves(node, f, t).length === 0) {
            node = node.bestChild();
            f    = node.boardSnap;
            t    = 3 - node.nodeTurn;
        }

        // 2. Expansion
        const untried = getUntriedMoves(node, f, t);
        if (untried.length > 0) {
            const idx  = Math.floor(Math.random() * untried.length);
            const move = untried.splice(idx, 1)[0];
            node.untriedMoves = untried;

            const nf   = applyMoveFlat(f, move.x, move.y, t);
            const child = new MCTSNode(move, node, nf, t);
            node.children.push(child);
            node = child;
            f    = nf;
            t    = 3 - t;
        }

        // 3. Simulation (rollout)
        const result = rollout(f, t, aiTurn, 25);

        // 4. Backpropagation
        let cur = node;
        while (cur) {
            cur.visits++;
            // nodeTurn이 aiTurn이면 AI가 둔 수 → 이겼을 때 wins 증가
            if (cur.nodeTurn === aiTurn) cur.wins += result;
            else                         cur.wins += (1 - result);
            cur = cur.parent;
        }
        iters++;
    }

    // 가장 많이 방문한 자식 선택 (가장 신뢰도 높음)
    if (root.children.length === 0) return getBestMoveHeuristic(0.9, false);
    const best = root.children.reduce((a,b) => b.visits > a.visits ? b : a);
    return best.move;
}

// untriedMoves 지연 초기화
function getUntriedMoves(node, f, t) {
    if (node.untriedMoves === null) {
        node.untriedMoves = getCandidatesFlat(f, t, 15);
    }
    return node.untriedMoves;
}

// ============================================================
// --- 기보 관리 ---
// ============================================================
function saveHistory(w, reason){
    let h=JSON.parse(localStorage.getItem("omok_final_history")||"[]");
    h.unshift({
        date: new Date().toLocaleString(),
        winner: w === 1 ? '흑' : '백',
        moves: moveHistory.length,
        data: [...moveHistory],
        isImp: (level === 'impossible' && mode === 'ai'),
        reason: reason,
        mode: mode,
        playerColor: playerColor,
        playerWon: (mode === 'ai') ? (w === playerColor) : null
    });
    localStorage.setItem("omok_final_history", JSON.stringify(h.slice(0,5)));
}

function showHistory(){
    let h=JSON.parse(localStorage.getItem("omok_final_history")||"[]");
    let list=document.getElementById("historyList"); if(!list) return;
    list.innerHTML=h.length?"":"<p style='color:#999;text-align:center;'>기록 없음</p>";
    h.forEach((item, idx)=>{
        let d = item.date.includes(',') ? item.date.split(',')[1] : item.date;
        let reasonTag = (item.reason && item.reason !== "정상종료") ? `<span style="color:#ff4d4d; font-size:10px; margin-left:4px;">(${item.reason})</span>` : "";
        list.innerHTML+=`<div class="history-item" onclick="replay(${idx})"><div><strong style="color:${item.isImp?'#8e44ad':'inherit'}">${item.winner} 승</strong>${reasonTag} (${item.moves}수)<br><small>${d}</small></div><button class="btn" style="padding:4px 8px; font-size:12px; background:#eee;" onclick="deleteHistory(event, ${idx})">삭제</button></div>`;
    });
    document.getElementById("historyModal").style.display="flex";
}

function deleteHistory(e, idx){ e.stopPropagation(); let h=JSON.parse(localStorage.getItem("omok_final_history")||"[]"); h.splice(idx, 1); localStorage.setItem("omok_final_history", JSON.stringify(h)); renderWinRate(); showHistory(); }

function openDeleteConfirm() { document.getElementById('deleteConfirmModal').style.display = 'flex'; }

function closeDeleteConfirm() { document.getElementById('deleteConfirmModal').style.display = 'none'; }

function clearAllHistory(){ localStorage.removeItem("omok_final_history"); closeDeleteConfirm(); showHistory(); renderWinRate(); showToast("모든 기보가 삭제되었습니다."); }

function replay(idx){
    let h=JSON.parse(localStorage.getItem("omok_final_history")||"[]");
    let g = h[idx]; if(!g) return;
    board = Array.from({length:SIZE},()=>Array(SIZE).fill(0));
    moveHistory = g.data; isGameOver = true; if(timerInterval) clearInterval(timerInterval);
    endReason = g.reason || ""; moveHistory.forEach(m => board[m.y][m.x] = m.p);
    document.getElementById("historyModal").style.display = "none"; document.getElementById("startModal").style.display = "none";
    viewFinalRecord();
}

function viewFinalRecord(){
    document.getElementById("finishConfirmModal").style.display="none"; document.getElementById("undoBtn").style.display="none";
    document.getElementById("giveUpBtn").style.display="none"; document.getElementById("mainGoBtn").style.display="block";
    document.getElementById("confirmPlaceBtn").style.display="none";
    let statusText = "복기 중: " + moveHistory.length + "수"; if(endReason && endReason !== "정상종료") statusText += ` (${endReason})`;
    updateStatus(statusText); draw();
}

// --- 유틸리티 및 PWA ---
function showToast(message) {
    const toast = document.getElementById("toast"); if(!toast) return;
    toast.innerText = message; toast.classList.add("show");
    setTimeout(() => { toast.classList.remove("show"); }, 2500);
}

function handleEmailContact(email) {
    const start = Date.now(); window.location.href = `mailto:${email}`;
    setTimeout(() => { if (Date.now() - start < 1000) { navigator.clipboard.writeText(email).then(() => { showToast("📧 이메일 주소가 복사되었습니다!"); }); } }, 500);
}

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; const banner = document.getElementById('install-banner'); if(banner) banner.style.display = 'flex'; });

document.getElementById('install-confirm-btn')?.addEventListener('click', async () => { if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; document.getElementById('install-banner').style.display = 'none'; } });

document.getElementById('install-close-btn')?.addEventListener('click', () => { document.getElementById('install-banner').style.display = 'none'; });

// --- 최근 5게임 승률 렌더링 ---
function renderWinRate() {
    const all = JSON.parse(localStorage.getItem("omok_final_history") || "[]");

    const emptyEl   = document.getElementById("winrateEmpty");
    const contentEl = document.getElementById("winrateContent");
    const iconsEl   = document.getElementById("winrateIcons");
    const winEl     = document.getElementById("winrateWin");
    const loseEl    = document.getElementById("winrateLose");
    const drawEl    = document.getElementById("winrateDraw");
    const pctEl     = document.getElementById("winratePct");

    if (!emptyEl) return;

    const aiGames = all.filter(item => item.mode === 'ai').slice(0, 5);

    if (aiGames.length === 0) {
        emptyEl.style.display   = "block";
        contentEl.style.display = "none";
        return;
    }

    emptyEl.style.display   = "none";
    contentEl.style.display = "block";

    let wins = 0, losses = 0, draws = 0;
    iconsEl.innerHTML = "";

    const ordered = [...aiGames].reverse();

    const barConfig = {
        win:  { height: 44, color: '#2f6fed', label: 'W' },
        lose: { height: 14, color: '#e74c3c', label: 'L' },
        draw: { height: 28, color: '#c8a96e', label: 'D' },
    };

    ordered.forEach((item, i) => {
        let type;
        if (item.playerWon === null || item.playerWon === undefined) {
            type = 'draw'; draws++;
        } else if (item.playerWon === true) {
            type = 'win';  wins++;
        } else {
            type = 'lose'; losses++;
        }

        const cfg = barConfig[type];
        const isLatest = (i === ordered.length - 1);

        const wrap = document.createElement("div");
        wrap.style.cssText = `
            display:flex; flex-direction:column;
            align-items:center; justify-content:flex-end;
            gap:3px; height:52px;
        `;

        const bar = document.createElement("div");
        bar.style.cssText = `
            width:26px; height:${cfg.height}px;
            background:${cfg.color};
            border-radius:6px 6px 3px 3px;
            opacity:${isLatest ? '1' : '0.45'};
            box-shadow:${isLatest ? `0 2px 8px ${cfg.color}55` : 'none'};
        `;

        const lbl = document.createElement("span");
        lbl.style.cssText = `
            font-size:9px; font-weight:800;
            color:${isLatest ? cfg.color : '#ccc'};
        `;
        lbl.textContent = cfg.label;

        wrap.appendChild(bar);
        wrap.appendChild(lbl);
        iconsEl.appendChild(wrap);
    });

    const decided = wins + losses;
    const pct = decided > 0 ? Math.round((wins / decided) * 100) : 0;

    winEl.textContent  = `${wins}승`;
    loseEl.textContent = `${losses}패`;

    if (draws > 0) {
        drawEl.style.display = "inline";
        drawEl.textContent   = `${draws}무`;
    } else {
        drawEl.style.display = "none";
    }

    pctEl.textContent = `승률 ${pct}%`;
}

// ─── 게임 세션 저장/복원 ──────────────────────────────────────────
function saveGameSession() {
    if (isGameOver || moveHistory.length === 0) {
        localStorage.removeItem("omok_live_session");
        return;
    }
    localStorage.setItem("omok_live_session", JSON.stringify({
        board, turn, moveHistory, lastMove,
        playerColor, level, mode, undoCounts, placeMode
    }));
}

function clearGameSession() {
    localStorage.removeItem("omok_live_session");
}

function resumeGame(saved) {
    board       = saved.board;
    turn        = saved.turn;
    moveHistory = saved.moveHistory;
    lastMove    = saved.lastMove;
    playerColor = saved.playerColor;
    level       = saved.level;
    mode        = saved.mode;
    undoCounts  = saved.undoCounts ?? { 1: 0, 2: 0 };
    placeMode   = saved.placeMode ?? "direct";
    isGameOver  = false;
    tempMove    = null;

    document.getElementById("startModal").style.display = "none";
    document.getElementById("mainGoBtn").style.display = "none";
    document.getElementById("confirmPlaceBtn").style.display = "none";
    document.getElementById("finishConfirmModal").style.display = "none";

    const isImp = (level === 'impossible' && mode === 'ai');
    const ub = document.getElementById("undoBtn");
    if (ub) {
        ub.style.display = "block";
        ub.disabled = isImp;
        ub.innerText = isImp ? "무르기 불가" : "무르기";
    }
    const gb = document.getElementById("giveUpBtn");
    if (gb) gb.style.display = "block";

    draw();
    startTurn();
    showToast("이전 게임을 이어합니다!");
}

function giveUpOrphanGame(saved) {
    moveHistory = saved.moveHistory;
    mode        = saved.mode;
    playerColor = saved.playerColor;
    level       = saved.level;

    const loser  = saved.playerColor;
    const winner = 3 - loser;
    saveHistory(winner, "기권패(새로고침)");
    clearGameSession();
    renderWinRate();
    showToast("기권패로 처리되었습니다.");
}

function checkOrphanSession() {
    const raw = localStorage.getItem("omok_live_session");
    if (!raw) return;

    let saved;
    try { saved = JSON.parse(raw); } catch { clearGameSession(); return; }
    if (!saved || !saved.moveHistory || saved.moveHistory.length === 0) {
        clearGameSession(); return;
    }

    const modeLabel  = saved.mode === 'ai' ? 'AI 대전' : '친구 대전';
    const levelLabel = { easy:'초보', medium:'중수', hard:'고수', impossible:'불가능' }[saved.level] ?? '';
    const infoLine   = saved.mode === 'ai'
        ? `${modeLabel} · ${levelLabel} · ${saved.moveHistory.length}수 진행`
        : `${modeLabel} · ${saved.moveHistory.length}수 진행`;

    const overlay = document.createElement("div");
    overlay.id = "orphanOverlay";
    overlay.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,0.75);
        display:flex; align-items:center; justify-content:center;
        z-index:20000; padding:20px;
    `;

    document.body.appendChild(overlay);
    renderMain();

    function renderMain() {
        overlay.innerHTML = `
            <div style="background:#fff; border-radius:24px; padding:28px;
                        max-width:320px; width:100%; text-align:center;
                        box-shadow:0 20px 50px rgba(0,0,0,0.3);">
                <div style="font-size:2rem; margin-bottom:8px;">♟️</div>
                <div style="font-weight:800; font-size:1.2rem; margin-bottom:8px; color:#333;">
                    이전 게임이 있어요
                </div>
                <div style="font-size:13px; color:#888; margin-bottom:22px; line-height:1.7;
                            background:#f7f3ec; border-radius:10px; padding:10px 14px;">
                    ${infoLine}
                </div>
                <button id="orphanResume" style="width:100%; padding:14px; border-radius:12px;
                    border:none; background:#2f6fed; color:#fff; font-weight:800;
                    font-size:15px; cursor:pointer; margin-bottom:8px;">
                    이어하기
                </button>
                <button id="orphanGiveup" style="width:100%; padding:14px; border-radius:12px;
                    border:none; background:#f0f0f0; color:#777; font-weight:700;
                    font-size:14px; cursor:pointer;">
                    기권하기
                </button>
            </div>
        `;

        document.getElementById("orphanResume").onclick = () => {
            overlay.remove();
            resumeGame(saved);
        };

        document.getElementById("orphanGiveup").onclick = renderConfirm;
    }

    function renderConfirm() {
        overlay.innerHTML = `
            <div style="background:#fff; border-radius:24px; padding:28px;
                        max-width:320px; width:100%; text-align:center;
                        box-shadow:0 20px 50px rgba(0,0,0,0.3);">
                <div style="font-size:2rem; margin-bottom:8px;">⚠️</div>
                <div style="font-weight:800; font-size:1.1rem; margin-bottom:10px; color:#333;">
                    정말 기권하시겠어요?
                </div>
                <div style="font-size:13px; color:#999; margin-bottom:22px; line-height:1.6;">
                    기권패로 기록되며<br>이 게임은 복구할 수 없어요.
                </div>
                <div style="display:flex; gap:10px;">
                    <button id="orphanGiveupConfirm" style="flex:1; padding:13px; border-radius:12px;
                        border:none; background:#e74c3c; color:#fff; font-weight:800;
                        font-size:14px; cursor:pointer;">기권</button>
                    <button id="orphanGiveupCancel" style="flex:1; padding:13px; border-radius:12px;
                        border:none; background:#f0f0f0; color:#333; font-weight:700;
                        font-size:14px; cursor:pointer;">돌아가기</button>
                </div>
            </div>
        `;

        document.getElementById("orphanGiveupConfirm").onclick = () => {
            overlay.remove();
            giveUpOrphanGame(saved);
        };

        document.getElementById("orphanGiveupCancel").onclick = renderMain;
    }
}

// ── 초기화 ──
renderWinRate();
updateUI();
checkOrphanSession();