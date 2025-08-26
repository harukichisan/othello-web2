'use client';
import Image from "next/image";
import React, { useEffect, useMemo, useState } from 'react';

/** =======================
 *  型・定数
 *  ======================= */
type Cell = 0 | 1 | 2; // 0: empty, 1: black, 2: white
const SIZE = 8;
const DIRS: Array<[number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

type AiLevel = 'easy' | 'normal' | 'hard';
type Screen = 'home' | 'game';

// 猫スキン候補（public 直下のパス）
const CAT_OPTIONS = [
  { id: "american",  label: "アメリカンショートヘア",   src: "/pieces/american-shorthair.png" },
  { id: "siamese",   label: "シャム",                 src: "/pieces/siamese.png" },
  { id: "scottish",  label: "スコティッシュフォールド", src: "/pieces/scottish-fold.png" },
  { id: "norwegian", label: "ノルウェージャンフォレスト", src: "/pieces/norwegian-forest.png" },
  { id: "british",   label: "ブリティッシュショートヘア", src: "/pieces/british-shorthair.png" },
];

type Skin = { black: string; white: string };

const initialBoard = (): Cell[][] => {
  const b: Cell[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  b[3][3] = 2; b[3][4] = 1; b[4][3] = 1; b[4][4] = 2;
  return b;
};

const opponent = (p: Cell): Cell => (p === 1 ? 2 : 1);
const inBounds = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

/** =======================
 *  ルール系ユーティリティ
 *  ======================= */
function flipsForMove(board: Cell[][], r: number, c: number, player: Cell): [number, number][] {
  if (board[r][c] !== 0) return [];
  const opp = opponent(player);
  const flips: [number, number][] = [];

  for (const [dr, dc] of DIRS) {
    const path: [number, number][] = [];
    let rr = r + dr, cc = c + dc;
    while (inBounds(rr, cc) && board[rr][cc] === opp) { path.push([rr, cc]); rr += dr; cc += dc; }
    if (path.length && inBounds(rr, cc) && board[rr][cc] === player) flips.push(...path);
  }
  return flips;
}

function validMoves(board: Cell[][], player: Cell) {
  const moves: Array<{ r: number; c: number; flips: [number, number][] }> = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const f = flipsForMove(board, r, c, player);
    if (f.length) moves.push({ r, c, flips: f });
  }
  return moves;
}

function applyMove(board: Cell[][], r: number, c: number, player: Cell): Cell[][] {
  const f = flipsForMove(board, r, c, player);
  if (!f.length) return board;
  const nb = board.map(row => row.slice());
  nb[r][c] = player; for (const [rr, cc] of f) nb[rr][cc] = player;
  return nb;
}

function countPieces(board: Cell[][]) {
  let black = 0, white = 0, empty = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (board[r][c] === 1) black++;
    else if (board[r][c] === 2) white++;
    else empty++;
  }
  return { black, white, empty };
}

/** 簡易評価（位置重み＋石差） */
const WEIGHTS: number[][] = [
  [120, -20, 20, 10, 10, 20, -20, 120],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [10, -5, 3, 3, 3, 3, -5, 10],
  [10, -5, 3, 3, 3, 3, -5, 10],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [120, -20, 20, 10, 10, 20, -20, 120],
];
function evaluate(board: Cell[][], me: Cell): number {
  const { black, white } = countPieces(board);
  const material = me === 1 ? black - white : white - black;
  let pos = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] === me) pos += WEIGHTS[r][c];
  return material * 10 + pos;
}

/** AI：弱い=ランダム / 普通=重み貪欲 / 強い=2手読み */
function aiPick(board: Cell[][], player: Cell, level: AiLevel): { r: number; c: number } | null {
  const moves = validMoves(board, player);
  if (!moves.length) return null;

  if (level === 'easy') return moves[Math.floor(Math.random() * moves.length)];

  if (level === 'normal') {
    let best = moves[0], bestScore = -Infinity;
    for (const m of moves) {
      const next = applyMove(board, m.r, m.c, player);
      const score = evaluate(next, player);
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return { r: best.r, c: best.c };
  }

  // hard: shallow minimax (depth=2)
  let bestMove = moves[0], bestScore = -Infinity;
  const opp = opponent(player);
  for (const m of moves) {
    const next = applyMove(board, m.r, m.c, player);
    const oppMoves = validMoves(next, opp);
    let worst = Infinity;
    if (oppMoves.length === 0) worst = -evaluate(next, opp);
    else for (const om of oppMoves) {
      const nn = applyMove(next, om.r, om.c, opp);
      const s = evaluate(nn, player);
      if (s < worst) worst = s;
    }
    if (worst > bestScore) { bestScore = worst; bestMove = m; }
  }
  return { r: bestMove.r, c: bestMove.c };
}

function getWinnerLabel(board: Cell[][]): 'Black' | 'White' | 'Draw' {
  const { black, white } = countPieces(board);
  if (black > white) return 'Black';
  if (white > black) return 'White';
  return 'Draw';
}

/** =======================
 *  メインコンポーネント
 *  ======================= */
export default function OthelloApp() {
  const [screen, setScreen] = useState<Screen>('home');

  // 対戦設定（ホーム）
  const [preOpponent, setPreOpponent] = useState<'cpu' | 'player'>('cpu');
  const [preLevel, setPreLevel] = useState<AiLevel>('normal');
  const [preFirst, setPreFirst] = useState<'you' | 'cpu'>('you');

  // 猫スキン（ホーム選択＆ゲーム反映）
  const [preSkin, setPreSkin] = useState<Skin>({
    black: CAT_OPTIONS[0].src, // 黒=アメリカン
    white: CAT_OPTIONS[1].src, // 白=シャム
  });
  const [skin, setSkin] = useState<Skin>(preSkin);

  // ゲーム状態
  const [board, setBoard] = useState<Cell[][]>(initialBoard);
  const [player, setPlayer] = useState<Cell>(1); // 1: Black
  const [history, setHistory] = useState<{ board: Cell[][]; player: Cell }[]>([]);
  const [aiSide, setAiSide] = useState<0 | 1 | 2>(0); // 0:none, 1:black, 2:white
  const [aiLevel, setAiLevel] = useState<AiLevel>('normal');
  const [aiThinking, setAiThinking] = useState(false);

  // 導出
  const moves = useMemo(() => validMoves(board, player), [board, player]);
  const { black, white, empty } = useMemo(() => countPieces(board), [board]);
  const gameOver = useMemo(() => {
    if (empty === 0) return true;
    const myMoves = moves.length;
    const oppMoves = validMoves(board, opponent(player)).length;
    return myMoves === 0 && oppMoves === 0;
  }, [board, moves, player, empty]);

  // ヘルパ
  const hardReset = () => { setBoard(initialBoard()); setPlayer(1); setHistory([]); };
  const commitMove = (r: number, c: number) => {
    const f = flipsForMove(board, r, c, player); if (!f.length) return;
    setHistory(h => [...h, { board, player }]);
    const nb = applyMove(board, r, c, player);
    const opp = opponent(player);
    if (validMoves(nb, opp).length) { setBoard(nb); setPlayer(opp); }
    else { setBoard(nb); setPlayer(player); }
  };

  // 操作
  const place = (r: number, c: number) => {
    if (screen !== 'game' || gameOver) return;
    if ((aiSide === 1 && player === 1) || (aiSide === 2 && player === 2)) return; // AI手番は無効
    commitMove(r, c);
  };
  const undo = () => { const prev = history.at(-1); if (!prev) return; setBoard(prev.board); setPlayer(prev.player); setHistory(h => h.slice(0, -1)); };
  const passTurn = () => { if (moves.length === 0) setPlayer(opponent(player)); };
  const backToHome = () => { setScreen('home'); hardReset(); setAiSide(0); };

  // ホームから開始
  const startGameFromHome = () => {
    hardReset();
    setSkin(preSkin); // ホームの選択を反映
    if (preOpponent === 'player') { setAiSide(0); setScreen('game'); return; }
    setAiLevel(preLevel);
    if (preFirst === 'you') { setAiSide(2); setPlayer(1); }
    else { setAiSide(1); setPlayer(1); }
    setScreen('game');
  };

  // AI思考
  useEffect(() => {
    if (screen !== 'game' || aiSide === 0) return;
    const aiTurn = (aiSide === 1 && player === 1) || (aiSide === 2 && player === 2);
    if (!aiTurn) return;

    const m = aiPick(board, player, aiLevel);
    if (!m) { if (moves.length === 0) setPlayer(opponent(player)); return; }

    setAiThinking(true);
    const id = setTimeout(() => {
      setAiThinking(false);
      if (!flipsForMove(board, m.r, m.c, player).length) return;
      setHistory(h => [...h, { board, player }]);
      const nb = applyMove(board, m.r, m.c, player);
      const opp = opponent(player);
      if (validMoves(nb, opp).length) { setBoard(nb); setPlayer(opp); }
      else { setBoard(nb); setPlayer(player); }
    }, 200);
    return () => clearTimeout(id);
  }, [board, player, aiSide, aiLevel, screen, moves]);

  /** ========== 画面 ========== */
  if (screen === 'home') {
    return (
      <div className="min-h-[100dvh] w-full flex items-start justify-center p-4 sm:p-6">
        <div className="w-full max-w-3xl rounded-2xl border shadow-sm p-4 sm:p-6 space-y-6 bg-white">
          <h1 className="text-xl sm:text-2xl font-semibold">Othello / Reversi</h1>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl bg-gray-50 p-4 sm:p-5">
              <div className="font-semibold mb-3">対戦設定</div>

              <div className="flex gap-2 mb-3">
                <button className={`flex-1 px-4 py-2 rounded ${preOpponent==='cpu'?'bg-emerald-600 text-white':'bg-white border'}`} onClick={()=>setPreOpponent('cpu')}>CPU</button>
                <button className={`flex-1 px-4 py-2 rounded ${preOpponent==='player'?'bg-emerald-600 text-white':'bg-white border'}`} onClick={()=>setPreOpponent('player')}>Player</button>
              </div>

              {preOpponent==='cpu' && (
                <>
                  <div className="text-sm mb-1">難易度</div>
                  <div className="flex gap-2 mb-3">
                    {(['easy','normal','hard'] as AiLevel[]).map(l => (
                      <button key={l} className={`flex-1 px-4 py-2 rounded ${preLevel===l?'bg-emerald-600 text-white':'bg-white border'}`} onClick={()=>setPreLevel(l)}>
                        {l==='easy'?'弱い':l==='normal'?'普通':'強い'}
                      </button>
                    ))}
                  </div>

                  <div className="text-sm mb-1">先手</div>
                  <div className="flex gap-2 mb-1">
                    <button className={`flex-1 px-4 py-2 rounded ${preFirst==='you'?'bg-emerald-600 text-white':'bg-white border'}`} onClick={()=>setPreFirst('you')}>あなた（黒）</button>
                    <button className={`flex-1 px-4 py-2 rounded ${preFirst==='cpu'?'bg-emerald-600 text-white':'bg-white border'}`} onClick={()=>setPreFirst('cpu')}>CPU（黒）</button>
                  </div>
                  <p className="text-xs text-gray-500">※ 黒が先手です。</p>
                </>
              )}

              {/* 猫スキン選択UI */}
              <div className="text-sm mb-1 mt-3">コマ（猫スキン）</div>
              <div className="grid grid-cols-2 gap-3">
                {/* 黒 */}
                <div className="rounded-lg bg-white border p-3">
                  <div className="text-xs text-gray-500 mb-2">黒のコマ</div>
                  <div className="grid grid-cols-5 gap-2">
                    {CAT_OPTIONS.map(opt => {
                      const active = preSkin.black === opt.src;
                      return (
                        <button
                          key={`b-${opt.id}`}
                          onClick={() => setPreSkin(s => ({ ...s, black: opt.src }))}
                          className={`aspect-square rounded-lg border overflow-hidden ${active ? "ring-2 ring-emerald-500 border-emerald-500" : ""}`}
                          aria-label={`黒: ${opt.label}`}
                        >
                          <img src={opt.src} alt={opt.label} className="w-full h-full object-contain" />
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* 白 */}
                <div className="rounded-lg bg-white border p-3">
                  <div className="text-xs text-gray-500 mb-2">白のコマ</div>
                  <div className="grid grid-cols-5 gap-2">
                    {CAT_OPTIONS.map(opt => {
                      const active = preSkin.white === opt.src;
                      return (
                        <button
                          key={`w-${opt.id}`}
                          onClick={() => setPreSkin(s => ({ ...s, white: opt.src }))}
                          className={`aspect-square rounded-lg border overflow-hidden ${active ? "ring-2 ring-emerald-500 border-emerald-500" : ""}`}
                          aria-label={`白: ${opt.label}`}
                        >
                          <img src={opt.src} alt={opt.label} className="w-full h-full object-contain" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="h-3" />
              <button className="w-full px-4 py-3 rounded bg-emerald-600 text-white" onClick={startGameFromHome}>ゲーム開始</button>
            </div>

            <div className="rounded-xl bg-gray-50 p-4 sm:p-5 text-sm leading-relaxed">
              <p className="mb-2 font-medium">ルール（要約）</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>自分の石で相手の石を挟むと、挟んだ石が自分の色に反転します。</li>
                <li>置ける場所（薄い点で表示）がない場合はパス。両者置けないとゲーム終了。</li>
                <li>最後に石数が多い方が勝ち。</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // screen === 'game'
  const winnerLabel = gameOver ? getWinnerLabel(board) : null;

  return (
    <div className="min-h-[100dvh] w-full flex items-start justify-center p-4 sm:p-6 pb-24">
      <div className="w-full max-w-5xl rounded-2xl border shadow-sm p-4 sm:p-6 bg-white">
        <header className="flex flex-wrap items-center gap-2 justify-between mb-4">
          <h2 className="text-xl sm:text-2xl font-semibold">Othello / Reversi</h2>
          <div className="hidden sm:flex gap-2">
            <button className="px-3 py-2 rounded border" onClick={backToHome}>Home</button>
            <button className="px-3 py-2 rounded border" onClick={undo} disabled={history.length===0}>Undo</button>
            <button className="px-3 py-2 rounded border" onClick={passTurn} disabled={moves.length!==0 || gameOver}>Pass</button>
            <button className="px-3 py-2 rounded bg-emerald-600 text-white" onClick={hardReset}>New Game</button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 sm:gap-6">
          {/* 盤面 */}
          <div className="flex justify-center">
            <div className="p-4 rounded-xl frame-bg shadow-lg">
              <div
                className="grid touch-manipulation select-none board-bg"
                style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0,1fr))`, width: 'min(96vw, 640px)' }}
              >
                {Array.from({ length: SIZE * SIZE }, (_, i) => {
                const r = Math.floor(i / SIZE), c = i % SIZE;
                const cell = board[r][c];
                const legal = moves.some(m => m.r===r && m.c===c);
                return (
                  <button
                    key={`${r}-${c}`}
                    onClick={()=>place(r,c)}
                    className={`aspect-square border border-emerald-900 bg-emerald-700 relative ${legal?'hover:bg-emerald-600 active:bg-emerald-500':''}`}
                    aria-label={`cell ${r},${c}`}
                  >
                    {/* 合法手ヒント */}
                    {cell===0 && legal && (
                      <span className="absolute inset-0 m-auto block rounded-full" style={{height:12,width:12,background:'rgba(0,0,0,.35)'}}/>
                    )}
                    {/* 石（猫ピース表示） */}
                    {cell !== 0 && (
                      <span className="absolute inset-1 flex items-center justify-center">
                        <Image
                          src={cell === 1 ? skin.black : skin.white}
                          alt={cell === 1 ? "Black cat piece" : "White cat piece"}
                          width={128}
                          height={128}
                          style={{ width: "100%", height: "100%", objectFit: "contain" }}
                          priority={false}
                        />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* サイドバー */}
          <aside className="space-y-4">
            <div className="p-4 rounded-xl bg-gray-50 flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500">Turn</div>
                <div className="text-lg font-semibold flex items-center gap-2">
                  <span className={`inline-block h-4 w-4 rounded-full ${player===1?'bg-black':'bg-white border'}`} />
                  {player===1?'Black':'White'} {aiThinking && <span className="text-sm text-gray-500">(AI…)</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">Score</div>
                <div className="font-medium">Black {black} – {white} White</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gray-50 text-xs sm:text-sm leading-relaxed">
              <p className="mb-2 font-medium">ルール（要約）</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>自分の石で相手の石を挟むと、挟んだ石が自分の色に反転します。</li>
                <li>置ける場所（薄い点で表示）がない場合はパス。両者置けないとゲーム終了。</li>
                <li>最後に石数が多い方が勝ち。</li>
              </ul>
            </div>

            {gameOver && (
              <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-200 space-y-2">
                <div className="font-semibold">Game Over</div>
                <div className="text-sm">Final: Black {black} – {white} White</div>
                <div className="text-sm font-medium">Winner: {winnerLabel}</div>
                <div className="pt-2 grid grid-cols-2 gap-2">
                  <button className="px-3 py-2 rounded bg-emerald-600 text-white" onClick={hardReset}>もう一度</button>
                  <button className="px-3 py-2 rounded border" onClick={backToHome}>ホームへ</button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* モバイル操作バー */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-2 grid grid-cols-4 gap-2">
          <button className="py-3 rounded border" onClick={backToHome}>Home</button>
          <button className="py-3 rounded border" onClick={undo} disabled={history.length===0}>Undo</button>
          <button className="py-3 rounded border" onClick={passTurn} disabled={moves.length!==0 || gameOver}>Pass</button>
          <button className="py-3 rounded bg-emerald-600 text-white" onClick={hardReset}>New</button>
        </div>
      </div>
    </div>
  );
}

/** =======================
 *  開発用セルフテスト（任意）
 *  ======================= */
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (function testInitialBoard(){
    const b = initialBoard(); const {black,white,empty}=countPieces(b);
    console.assert(black===2 && white===2, 'initial pieces 2/2');
    console.assert(empty===SIZE*SIZE-4, 'initial empty 60');
  })();
  (function testOpeningMoves(){
    const b = initialBoard(); const mB=validMoves(b,1), mW=validMoves(b,2);
    console.assert(mB.length===4 && mW.length===4, 'opening both 4 moves');
  })();
}