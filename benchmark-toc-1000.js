// benchmark-toc-1000.js
// 目次が1000件のときの初回算出・表示および更新処理時間の計測

const { performance } = require('perf_hooks');

const REACTION_RATE = 0.35;
function calculateR(expectedParticipants) {
  return Math.max(8, (expectedParticipants || 200) * REACTION_RATE);
}
function calculateLevel(voteScore, R) {
  if (voteScore === 0) return 0;
  return Math.max(0, Math.min(1, Math.log(1 + Math.abs(voteScore)) / Math.log(1 + R)));
}
function calculateStep(level) {
  return Math.max(0, Math.min(12, Math.round(level * 12)));
}
function getMinimapOpacity(level) {
  return 0.3 + 0.5 * level;
}

// 1000件のノードを生成 (目次掲載条件: isH1 || hasReactions || isTopLevel)
const nodes = [];
for (let i = 0; i < 1000; i++) {
  const isH1 = i % 50 === 0;
  nodes.push({
    id: `node-${i}`,
    index: i,
    node: {
      content: isH1 ? `# 見出し ${i}` : `テキスト行 ${i}`,
      type: i % 2 === 0 ? 'chat' : 'doc',
      heading: isH1 ? 'h1' : null,
      indent: 0,
      timestamp: Date.now() - (1000 - i) * 1000,
      reactions: i % 3 === 0 ? { user1: '⇧', user2: '⇧' } : {},
      emojiReactions: i % 4 === 0 ? { 'user3|👍': true } : {},
    },
  });
}

const R = calculateR(200);

console.log('=== 目次1000件パフォーマンス計測 ===\n');

// 1. 初回生成時間 (filter + map + level/step計算)
const t0 = performance.now();
const initialOutlineItems = nodes
  .filter(({ node }) => {
    const text = node.content?.trim() ?? '';
    if (!text) return false;
    const hasReactions = (!!node.reactions && Object.keys(node.reactions).length > 0) ||
      (!!node.emojiReactions && Object.keys(node.emojiReactions).length > 0);
    const isTopLevel = (node.indent ?? 0) === 0;
    const isH1 = node.heading === 'h1' || /^[#＃]/.test(node.content ?? '');
    return isH1 || hasReactions || isTopLevel;
  })
  .map(({ node, index, id }) => {
    let up = 0, down = 0;
    for (const v of Object.values(node.reactions || {})) {
      if (v === '⇧') up++;
      else if (v === '⇩') down++;
    }
    const voteScore = up - down;
    const level = calculateLevel(voteScore, R);
    const step = calculateStep(level);
    const opacity = getMinimapOpacity(level);
    return {
      index,
      text: node.content,
      isH1: node.heading === 'h1',
      blockId: id,
      indent: node.indent,
      voteScore,
      level,
      step,
      opacity,
      type: node.type,
    };
  });
const t1 = performance.now();
const initialDuration = t1 - t0;

console.log(`目次1000件 初回計算処理時間: ${initialDuration.toFixed(3)} ms (件数: ${initialOutlineItems.length}件)`);

// 2. 1件のリアクション更新による再計算時間 (スロットル後の単一バッチ)
const t2 = performance.now();
nodes[500].node.reactions['user99'] = '⇧'; // 1件更新
const updatedOutlineItems = nodes
  .filter(({ node }) => {
    const text = node.content?.trim() ?? '';
    if (!text) return false;
    const hasReactions = (!!node.reactions && Object.keys(node.reactions).length > 0) ||
      (!!node.emojiReactions && Object.keys(node.emojiReactions).length > 0);
    const isTopLevel = (node.indent ?? 0) === 0;
    const isH1 = node.heading === 'h1' || /^[#＃]/.test(node.content ?? '');
    return isH1 || hasReactions || isTopLevel;
  })
  .map(({ node, index, id }) => {
    let up = 0, down = 0;
    for (const v of Object.values(node.reactions || {})) {
      if (v === '⇧') up++;
      else if (v === '⇩') down++;
    }
    const voteScore = up - down;
    const level = calculateLevel(voteScore, R);
    const step = calculateStep(level);
    const opacity = getMinimapOpacity(level);
    return {
      index,
      text: node.content,
      isH1: node.heading === 'h1',
      blockId: id,
      indent: node.indent,
      voteScore,
      level,
      step,
      opacity,
      type: node.type,
    };
  });
const t3 = performance.now();
const updateDuration = t3 - t2;

console.log(`目次1000件 更新再計算処理時間: ${updateDuration.toFixed(3)} ms`);

if (initialDuration >= 50 || updateDuration >= 50) {
  console.log(`⚠ 50ms 以上かかりました (初回: ${initialDuration.toFixed(1)}ms, 更新: ${updateDuration.toFixed(1)}ms)`);
} else {
  console.log(`✔ 50ms 未満で完了しました (初回: ${initialDuration.toFixed(1)}ms < 50ms, 更新: ${updateDuration.toFixed(1)}ms < 50ms)`);
}
