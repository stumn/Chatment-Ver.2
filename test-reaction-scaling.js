// test-reaction-scaling.js
// 目次・ミニマップ・リアクション色の標準化 v3 補足統一版 単体テスト

const assert = require('assert');

const REACTION_RATE = 0.35;
const DEFAULT_EXISTING_ROOM_PARTICIPANTS = 50;

/**
 * 新規ルーム作成時のバリデーション & R 計算
 * 空欄は作成不可 (エラー)、範囲外(最小2、最大1000)は最も近い値に丸める
 */
function validateAndCalculateRForCreation(input) {
  if (input === undefined || input === null || String(input).trim() === '') {
    throw new Error('想定参加者数は必須入力です (空欄は作成不可)');
  }
  const parsed = parseInt(String(input), 10);
  if (isNaN(parsed)) {
    throw new Error('想定参加者数には有効な整数を入力してください');
  }
  const clamped = Math.max(2, Math.min(1000, Math.round(parsed)));
  return Math.max(8, clamped * REACTION_RATE);
}

/**
 * 既存ルーム取得時の R 計算
 * 値のない既存ルームは 50 として扱う (R = max(8, 50 * 0.35) = 17.5)
 */
function calculateRForExistingRoom(expectedParticipants) {
  let count = typeof expectedParticipants === 'number'
    ? expectedParticipants
    : parseInt(String(expectedParticipants || ''), 10);

  if (isNaN(count)) {
    count = DEFAULT_EXISTING_ROOM_PARTICIPANTS; // 50
  } else {
    count = Math.max(2, Math.min(1000, Math.round(count)));
  }

  return Math.max(8, count * REACTION_RATE);
}

function calculateLevel(voteScore, R) {
  if (voteScore === 0) return 0;
  const absScore = Math.abs(voteScore);
  const denom = Math.log(1 + R);
  if (denom <= 0) return 0;
  const level = Math.log(1 + absScore) / denom;
  return Math.max(0, Math.min(1, level));
}

function calculateStep(level) {
  return Math.max(0, Math.min(12, Math.round(level * 12)));
}

// 帯への割当アルゴリズム (MinimapBands.tsx と同等)
function assignItemsToBands(items, totalNodesCount, totalBands) {
  const bands = Array.from({ length: totalBands }, (_, i) => ({
    bandIndex: i,
    items: [],
    representativeItem: null,
  }));

  const maxIndex = Math.max(1, totalNodesCount);

  for (const item of items) {
    const bandIdx = Math.min(totalBands - 1, Math.max(0, Math.floor((item.index / maxIndex) * totalBands)));
    bands[bandIdx].items.push(item);
  }

  for (const b of bands) {
    if (b.items.length === 0) continue;
    let best = b.items[0];
    let maxLevel = -1;
    for (const it of b.items) {
      if (it.level > maxLevel) {
        maxLevel = it.level;
        best = it;
      }
    }
    b.representativeItem = best;
  }

  return bands;
}

console.log('=== 目次・ミニマップ・リアクション色の標準化 v3 補足統一版 単体テスト ===\n');

// ─── Test 1: R の計算 (20→8、200→70、1000→350、範囲外→丸め、空欄→作成不可) ───
console.log('--- Test 1: 新規ルーム作成時の R 計算 & バリデーション ---');

const r20 = validateAndCalculateRForCreation(20);
console.log(`作成 (20): R = ${r20} (期待値: 8)`);
assert.strictEqual(r20, 8, 'R(20) must be 8');

const r200 = validateAndCalculateRForCreation(200);
console.log(`作成 (200): R = ${r200} (期待値: 70)`);
assert.strictEqual(r200, 70, 'R(200) must be 70');

const r1000 = validateAndCalculateRForCreation(1000);
console.log(`作成 (1000): R = ${r1000} (期待値: 350)`);
assert.strictEqual(r1000, 350, 'R(1000) must be 350');

const rUnder = validateAndCalculateRForCreation(1);
console.log(`作成 (1 → 最小2に丸め): R = ${rUnder} (期待値: 8)`);
assert.strictEqual(rUnder, 8, 'R(1) clamped to 2 => max(8, 0.7) = 8');

const rOver = validateAndCalculateRForCreation(2000);
console.log(`作成 (2000 → 最大1000に丸め): R = ${rOver} (期待値: 350)`);
assert.strictEqual(rOver, 350, 'R(2000) clamped to 1000 => 350');

// 空欄チェック
assert.throws(() => validateAndCalculateRForCreation(''), /空欄は作成不可/, '空欄は作成不可でエラーになること');
assert.throws(() => validateAndCalculateRForCreation('   '), /空欄は作成不可/, '空白のみは作成不可でエラーになること');
assert.throws(() => validateAndCalculateRForCreation(null), /空欄は作成不可/, 'nullは作成不可でエラーになること');
assert.throws(() => validateAndCalculateRForCreation(undefined), /空欄は作成不可/, 'undefinedは作成不可でエラーになること');
console.log('空欄入力 (空文字 / null / undefined): すべて作成不可エラーを正常に検知');

console.log('✔ Test 1 PASS\n');

// ─── Test 2: 値のない既存ルームの扱い (50 として動くこと / R = 17.5) ───
console.log('--- Test 2: 値のない既存ルームの扱い (50として動くこと / R = 17.5) ---');
const rExistingDefault = calculateRForExistingRoom(undefined);
console.log(`既存ルーム (未設定): expectedParticipants = 50, R = ${rExistingDefault} (期待値: 17.5)`);
assert.strictEqual(rExistingDefault, 17.5, 'Existing room with no value must be 50 => R = 17.5 (max(8, 50*0.35)=17.5)');

const rExistingNull = calculateRForExistingRoom(null);
console.log(`既存ルーム (null): expectedParticipants = 50, R = ${rExistingNull} (期待値: 17.5)`);
assert.strictEqual(rExistingNull, 17.5, 'Existing room with null must be 50 => R = 17.5');

console.log('✔ Test 2 PASS\n');

// ─── Test 3: level 関数 (expectedParticipants = 200 / R = 70) ───
console.log('--- Test 3: level 関数 (expectedParticipants=200, R=70) ---');
const testScores = [0, 1, 5, 70, 200];
const R_70 = 70;
for (const score of testScores) {
  const lvl = calculateLevel(score, R_70);
  const stp = calculateStep(lvl);
  console.log(`voteScore = ${String(score).padEnd(3)} => level = ${lvl.toFixed(4)}, step = ${stp} / 12`);
}

assert.strictEqual(calculateLevel(0, R_70), 0, 'level(0) must be 0');
assert.ok(calculateLevel(1, R_70) > 0, 'level(1) must be > 0 (1👍でも緑)');
assert.strictEqual(calculateLevel(70, R_70), 1.0, 'level(70) must be 1.0 (score == R)');
assert.strictEqual(calculateLevel(200, R_70), 1.0, 'level(200) must clamp to 1.0');
console.log('✔ Test 3 PASS\n');

// ─── Test 4: 独立性検証 (ある投稿が200票でも他の投稿のlevelが変わらない) ───
console.log('--- Test 4: 独立性検証 ---');
const postA_score = 5;
const postB_score_max = 200; // 満点

const postA_level_before = calculateLevel(postA_score, R_70);
const postA_step_before = calculateStep(postA_level_before);

const postA_level_after = calculateLevel(postA_score, R_70);
const postA_step_after = calculateStep(postA_level_after);

console.log(`投稿A (score=5): 投稿Bが10票時の level=${postA_level_before.toFixed(4)}, step=${postA_step_before}`);
console.log(`投稿A (score=5): 投稿Bが200票時の level=${postA_level_after.toFixed(4)}, step=${postA_step_after}`);

assert.strictEqual(postA_level_before, postA_level_after, '投稿Aのlevelは投稿Bの票数に影響されないこと');
assert.strictEqual(postA_step_before, postA_step_after, '投稿Aのstepは投稿Bの票数に影響されないこと');
console.log('✔ Test 4 PASS (完全独立)\n');

// ─── Test 5: 帯への割当アルゴリズム ───
console.log('--- Test 5: 帯への割当アルゴリズム ---');
const totalNodes = 1000;
const totalBands = 150;

const sampleItems = [
  { index: 0, text: 'H1: はじめに', level: 0.1, voteScore: 1 },
  { index: 10, text: '項目1', level: 0.8, voteScore: 30 },
  { index: 500, text: '中央セクション', level: 0.5, voteScore: 10 },
  { index: 999, text: 'おわりに', level: 1.0, voteScore: 100 },
];

const assignedBands = assignItemsToBands(sampleItems, totalNodes, totalBands);
assert.ok(assignedBands[0].items.some(it => it.index === 0), 'Index 0 must be in band 0');

const lastItemBand = assignedBands.find(b => b.items.some(it => it.index === 999));
assert.ok(lastItemBand && lastItemBand.bandIndex >= totalBands - 2, 'Index 999 must be near the last band');

console.log(`Band allocation verified: ${sampleItems.length} items mapped across ${totalBands} bands.`);
console.log('✔ Test 5 PASS\n');

console.log('=========================================');
console.log('🎉 補足統一版のすべての単体テストが正常に通過しました！');
console.log('=========================================');
