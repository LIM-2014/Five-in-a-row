/**
 * 오목 마스터: 렌주룰 (Gomoku Master: Renju Rules)
 * 최종 통합 소스 코드 (플레이어별 독립 무르기 및 기보 삭제 보정)
 */

// --- 전역 변수 및 초기화 ---
let mode = "ai", level = "easy", board = [], turn = 1, isGameOver = false, lastMove = null, playerColor = 1;
let currentLimit = 20, timerInterval, moveHistory = [], endReason = "";
let undoCounts = { 1: 0, 2: 0 }; // 핵심: 흑(1)과 백(2) 각각의 무르기 횟수 관리
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
    undoCounts = { 1: 0, 2: 0 }; // 시작 시 각 플레이어 횟수 초기화
    tempMove = null;
    lastMove = null;

    // UI 정리
    document.getElementById("startModal").style.display = "none";
    document.getElementById("mainGoBtn").style.display = "none";
    document.getElementById("confirmPlaceBtn").style.display = "none";
    document.getElementById("finishConfirmModal").style.display = "none";
    
    const isImp = (level === 'impossible' && mode === 'ai');
    const ub = document.getElementById("undoBtn");
    if(ub) {
        ub.style.display = "block";
        ub.disabled = isImp;
        ub.innerText = isImp ? "무르기 불가" : "무르기";
    }
    
    const gb = document.getElementById("giveUpBtn");
    if(gb) gb.style.display = "block";
    
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
        if (el) el.classList.toggle("active", level === l);
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
        s.innerText = "AI 생각 중..."; s.classList.add("thinking");
    } else {
        s.innerText = (turn === 1 ? "흑 차례" : "백 차례");
    }
}

function updateTimerUI() {
    const isImp = (level === 'impossible' && mode === 'ai');
    for (let i = 1; i <= 2; i++) {
        const tEl = document.getElementById(`timer${i}`);
        if (!tEl) continue;
        const isCurrent = (turn === i);
        if (isCurrent) {
            if (isImp) {
                tEl.innerText = `00:${String(Math.max(0, currentLimit)).padStart(2, '0')}`;
                if (currentLimit <= 5) tEl.style.color = "red"; else tEl.style.color = "inherit";
            } else { tEl.innerText = `∞`; tEl.style.color = "inherit"; }
            tEl.style.fontWeight = "bold";
        } else {
            tEl.innerText = isImp ? `00:20` : `∞`;
            tEl.style.fontWeight = "normal";
            tEl.style.color = "#ccc";
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
c.addEventListener('touchstart', (e) => { e.preventDefault(); handleInput(e); }, { passive: false });

function placeStone(x, y) {
    board[y][x] = turn; 
    lastMove = { x, y }; 
    moveHistory.push({ x, y, p: turn }); 
    draw();
    
    if (checkWinStrict(x, y, turn)) { 
        endGame(turn); 
        return; 
    }
    
    if (moveHistory.length === SIZE * SIZE) {
        isGameOver = true; 
        if (timerInterval) clearInterval(timerInterval);
        document.getElementById("finishResultText").innerText = "무승부";
        document.getElementById("finishConfirmModal").style.display = "flex";
        return;
    }
    
    turn = 3 - turn; 
    startTurn();
}

// --- 게임 종료 및 제어 ---
function endGame(w) {
    isGameOver = true; 
    if (timerInterval) clearInterval(timerInterval); 
    endReason = "정상종료";
    saveHistory(w, "정상종료");
    
    document.getElementById("finishResultText").innerText = (w === 1 ? '흑' : '백') + " 승리!";
    document.getElementById("finishConfirmModal").style.display = "flex";
    
    if (typeof confetti === 'function' && (w === playerColor || mode !== 'ai')) {
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    }
}

function endByTimeout() {
    const winner = 3 - turn; 
    isGameOver = true; 
    endReason = "시간패";
    document.getElementById("finishResultText").innerText = (turn === 1 ? "흑" : "백") + " 시간초과 패배!";
    document.getElementById("finishConfirmModal").style.display = "flex";
    saveHistory(winner, "시간패");
}

function handleGiveUp() {
    if (isGameOver) return;
    const winner = 3 - turn; 
    isGameOver = true; 
    endReason = "기권패";
    document.getElementById("finishResultText").innerText = (turn === 1 ? "흑" : "백") + " 기권패!";
    document.getElementById("finishConfirmModal").style.display = "flex";
    saveHistory(winner, "기권패");
}

// --- 무르기 시스템 (수정 버전) ---
function undo() {
    if (moveHistory.length === 0 || isGameOver) return;
    if (level === 'impossible' && mode === 'ai') return;
    if (aiTimeout) { clearTimeout(aiTimeout); aiTimeout = null; }

    // 1. 무르기를 적용받을 대상(방금 돌을 둔 사람)을 찾습니다.
    const lastPlayer = moveHistory[moveHistory.length - 1].p;
    
    // 2. 그 플레이어의 무르기 횟수를 증가시킵니다.
    undoCounts[lastPlayer]++;

    // 3. 돌을 제거합니다. (AI 모드는 2수, 친구 모드는 1수)
    let stepsToRemove = (mode === "ai") ? 2 : 1;
    if (mode === "ai" && moveHistory.length < 2) stepsToRemove = 1;

    for (let i = 0; i < stepsToRemove; i++) {
        let last = moveHistory.pop();
        if (last) board[last.y][last.x] = 0;
    }

    lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
    tempMove = null;
    document.getElementById("confirmPlaceBtn").style.display = "none";
    
    // 4. 턴을 돌려줍니다.
    // 방금 둔 사람(lastPlayer)의 차례로 다시 바꿉니다.
    turn = lastPlayer;

    draw();
    startTurn();
    
    const playerName = (lastPlayer === 1) ? "흑" : "백";
    updateStatus(`${playerName} 무르기 완료 (남은 기회: ${3 - undoCounts[lastPlayer]}/3)`, true);
}

function askUndo() {
    if (isGameOver || (level === 'impossible' && mode === 'ai') || moveHistory.length === 0) return;
    
    // 방금 돌을 둔 플레이어를 확인합니다.
    const lastPlayer = moveHistory[moveHistory.length - 1].p;
    const currentCount = undoCounts[lastPlayer];
    const playerName = (lastPlayer === 1) ? "흑" : "백";

    if (currentCount >= 3) { 
        showToast(`⚠️ ${playerName}님은 무르기 기회를 모두 사용했습니다.`); 
        return; 
    }

    document.getElementById("actionTitle").innerText = "무르기 확인";
    document.getElementById("actionDesc").innerText = `${playerName}님의 방금 수를 무르시겠습니까?\n(사용 후 남은 기회: ${2 - currentCount}회)`;
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

// --- AI 알고리즘 ---
function triggerAi() {
    if (isGameOver) return;
    const min = 600, max = 1500;
    const delay = Math.random() * (max - min) + min;
    aiTimeout = setTimeout(() => {
        let best;
        switch(level) {
            case 'easy': best = getBestMoveHeuristic(0.5, true); break;
            case 'medium': best = getBestMoveHeuristic(0.9, false); break;
            case 'hard': best = getMinimaxMove(3); break;
            case 'impossible': best = getMinimaxMove(4); break; 
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

function getMinimaxMove(depth) {
    let bestScore = -Infinity; let move = {x: -1, y: -1}; let candidates = [];
    let winMove = findImmediateWin(turn); if(winMove) return winMove;
    let threatMove = findImmediateWin(3-turn); if(threatMove) return threatMove;

    for(let y=0; y<SIZE; y++) for(let x=0; x<SIZE; x++) {
        if(board[y][x] === 0) {
            if (turn === 1 && checkRenjuForbidden(x, y, 1)) continue;
            let hasNeighbor = false;
            for(let dy=-2; dy<=2; dy++) {
                for(let dx=-2; dx<=2; dx++) { if(board[y+dy]?.[x+dx]) { hasNeighbor = true; break; } }
                if(hasNeighbor) break;
            }
            if (!hasNeighbor && moveHistory.length > 0) continue;
            let centerBonus = (7-Math.abs(7-x) + 7-Math.abs(7-y)) * 5;
            let s = getPointBetter(x, y, turn) * 1.2 + getPointBetter(x, y, 3-turn) + centerBonus;
            candidates.push({x, y, s});
        }
    }
    candidates.sort((a,b) => b.s - a.s);
    let searchRange = candidates.slice(0, 12);
    for (let m of searchRange) {
        board[m.y][m.x] = turn;
        let score = minimax(depth - 1, -Infinity, Infinity, false);
        board[m.y][m.x] = 0;
        if (score > bestScore) { bestScore = score; move = m; }
    }
    return move;
}

function findImmediateWin(t) {
    for(let y=0; y<SIZE; y++) for(let x=0; x<SIZE; x++) {
        if(board[y][x]===0) {
            if(t===1 && checkRenjuForbidden(x,y,1)) continue;
            if(checkWinStrict(x,y,t)) return {x,y};
        }
    }
    return null;
}

function minimax(depth, alpha, beta, isMax) {
    if (depth === 0) return evaluateBetter();
    let currTurn = isMax ? turn : 3 - turn;
    let candidates = [];
    for(let y=0; y<SIZE; y++) for(let x=0; x<SIZE; x++) {
        if(board[y][x] === 0) candidates.push({x, y, s: getPointBetter(x, y, currTurn)});
    }
    candidates.sort((a,b) => b.s - a.s);
    let searchRange = candidates.slice(0, 5);
    if (isMax) {
        let maxE = -Infinity;
        for (let m of searchRange) {
            board[m.y][m.x] = turn;
            if (checkWinStrict(m.x, m.y, turn)) { board[m.y][m.x]=0; return 1000000 + depth; }
            let ev = minimax(depth-1, alpha, beta, false);
            board[m.y][m.x] = 0; maxE = Math.max(maxE, ev); alpha = Math.max(alpha, ev);
            if (beta <= alpha) break;
        }
        return maxE;
    } else {
        let minE = Infinity;
        for (let m of searchRange) {
            board[m.y][m.x] = 3 - turn;
            if (checkWinStrict(m.x, m.y, 3-turn)) { board[m.y][m.x]=0; return -1000000 - depth; }
            let ev = minimax(depth-1, alpha, beta, true);
            board[m.y][m.x] = 0; minE = Math.min(minE, ev); beta = Math.min(beta, ev);
            if (beta <= alpha) break;
        }
        return minE;
    }
}

function evaluateBetter() {
    let score = 0;
    for(let y=0; y<SIZE; y++) for(let x=0; x<SIZE; x++) {
        if(board[y][x] === turn) score += getPointBetter(x, y, turn);
        else if(board[y][x] === 3-turn) score -= getPointBetter(x, y, 3-turn) * 1.1;
    }
    return score;
}

function getPointBetter(x, y, t) {
    let total = 0; const ds = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (let [dx, dy] of ds) {
        let count = 1, openEnds = 0;
        for (let i = 1; i < 5; i++) {
            let nx = x+dx*i, ny = y+dy*i;
            if (nx>=0 && nx<SIZE && ny>=0 && ny<SIZE) {
                if (board[ny][nx] === t) count++; else if (board[ny][nx] === 0) { openEnds++; break; } else break;
            } else break;
        }
        for (let i = 1; i < 5; i++) {
            let nx = x-dx*i, ny = y-dy*i;
            if (nx>=0 && nx<SIZE && ny>=0 && ny<SIZE) {
                if (board[ny][nx] === t) count++; else if (board[ny][nx] === 0) { openEnds++; break; } else break;
            } else break;
        }
        if (count >= 5) total += 500000;
        else if (count === 4) total += (openEnds === 2) ? 50000 : (openEnds === 1 ? 5000 : 0);
        else if (count === 3) total += (openEnds === 2) ? 5000 : (openEnds === 1 ? 500 : 0);
        else if (count === 2) total += (openEnds === 2) ? 500 : 0;
    }
    return total;
}

// --- 기보 관리 ---
function saveHistory(w, reason){
    let h=JSON.parse(localStorage.getItem("omok_final_history")||"[]");
    h.unshift({ date:new Date().toLocaleString(), winner:w===1?'흑':'백', moves:moveHistory.length, data:[...moveHistory], isImp: (level==='impossible' && mode === 'ai'), reason: reason });
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

function deleteHistory(e, idx){ e.stopPropagation(); let h=JSON.parse(localStorage.getItem("omok_final_history")||"[]"); h.splice(idx, 1); localStorage.setItem("omok_final_history", JSON.stringify(h)); showHistory(); }

function openDeleteConfirm() { document.getElementById('deleteConfirmModal').style.display = 'flex'; }

function closeDeleteConfirm() { document.getElementById('deleteConfirmModal').style.display = 'none'; }

function clearAllHistory(){ localStorage.removeItem("omok_final_history"); closeDeleteConfirm(); showHistory(); showToast("모든 기보가 삭제되었습니다."); }

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

updateUI();