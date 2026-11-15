// simulate-users.js
// 150人規模の同時接続・仕切り位置シミュレーションテストスクリプト
// 実行例:
//   node simulate-users.js
//   node simulate-users.js --count 150 --dist center --mode wander
//   node simulate-users.js -c 300 -d few-doc -m churn

const { io } = require('socket.io-client');
const readline = require('readline');
const { Loro, LoroMap } = require('loro-crdt');

// ─── 設定デフォルト値 ───
const DEFAULT_URL = process.env.SERVER_URL || 'http://localhost:3005';
const NUM_BANDS = 16;
const SIMULATED_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '✨', '🔥'];

// ─── 引数解析 ───
const args = process.argv.slice(2);
function getArg(flag, shortFlag) {
  const idx = args.findIndex((a) => a === flag || a === shortFlag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('-')) {
    return args[idx + 1];
  }
  return null;
}

const parsedCount = parseInt(getArg('--count', '-c') || '', 10);
const parsedDist = getArg('--dist', '-d');
const parsedMode = getArg('--mode', '-m');
const parsedUrl = getArg('--url', '-u') || DEFAULT_URL;
const parsedDocId = getArg('--doc', '--docId');
const parsedNoReactions = args.includes('--no-reactions');
const parsedEnableReactions = !parsedNoReactions;
const parsedReactionRate = parseFloat(getArg('--rate', '-r') || '3.0'); // リアクション毎秒件数 (デフォルト3件/s)

// ─── 分布ジェネレータ ───
// ratio: 0.0 (上端/チャット最大) 〜 1.0 (下端/ドキュメント最大)
function generateRatio(distType) {
  switch (distType) {
    case 'chat-bias': {
      // チャット側に偏る (仕切りが上部 0.05〜0.35 に偏る)
      // ベータ分布的・べき乗で上部に集中
      const r = Math.pow(Math.random(), 1.8) * 0.35 + 0.02;
      return Math.min(0.95, Math.max(0.02, parseFloat(r.toFixed(3))));
    }
    case 'center': {
      // 中央 (0.5) に集中 (正規分布 Box-Muller)
      const u1 = Math.max(0.0001, Math.random());
      const u2 = Math.random();
      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      const val = 0.5 + z * 0.04; // 平均0.5, 標準偏差0.04 (99+のテストが確実に発生)
      return Math.min(0.95, Math.max(0.05, parseFloat(val.toFixed(3))));
    }
    case 'few-doc': {
      // ごく少数だけドキュメント側 (90%がチャット側 0.05〜0.35、10%がドキュメント側 0.70〜0.95)
      if (Math.random() < 0.1) {
        const docSide = 0.70 + Math.random() * 0.25;
        return parseFloat(docSide.toFixed(3));
      } else {
        const chatSide = 0.05 + Math.random() * 0.30;
        return parseFloat(chatSide.toFixed(3));
      }
    }
    case 'uniform':
    default: {
      // 一様分布 (0.03〜0.97)
      const u = 0.03 + Math.random() * 0.94;
      return parseFloat(u.toFixed(3));
    }
  }
}

// ─── 対話型プロンプト（引数不足時） ───
async function promptOptions() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query) => new Promise((resolve) => rl.question(query, resolve));

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║       🔬 Chatment 仕切り位置 負荷・分散シミュレータ       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // 1. 接続数
  let count = parsedCount;
  if (!count || isNaN(count)) {
    console.log('【パラメータ 1: 接続数】');
    console.log('  1) 10人');
    console.log('  2) 30人');
    console.log('  3) 80人');
    console.log('  4) 150人  (推奨 / デフォルト)');
    console.log('  5) 300人  (打ち切り99+の限界テスト)');
    const ans = (await question('選択番号 [1-5] (Enterで 150人): ')).trim();
    const map = { '1': 10, '2': 30, '3': 80, '4': 150, '5': 300 };
    count = map[ans] || (ans && !isNaN(parseInt(ans, 10)) ? parseInt(ans, 10) : 150);
  }

  // 2. 分布
  let dist = parsedDist;
  if (!dist || !['uniform', 'chat-bias', 'center', 'few-doc'].includes(dist)) {
    console.log('\n【パラメータ 2: 位置の分布】');
    console.log('  1) uniform   : 一様分布 (全体に均等分散)');
    console.log('  2) chat-bias : チャット側に偏る (上端0.05〜0.35に集中)');
    console.log('  3) center    : 中央に集中 (0.5付近に超密集・集約丸のテスト)');
    console.log('  4) few-doc   : ごく少数だけドキュメント側 (9割がチャット、1割がドキュメント)');
    const ans = (await question('選択番号 [1-4] (Enterで center): ')).trim();
    const map = { '1': 'uniform', '2': 'chat-bias', '3': 'center', '4': 'few-doc' };
    dist = map[ans] || 'center';
  }

  // 3. 動き
  let mode = parsedMode;
  if (!mode || !['all-at-once', 'churn', 'wander'].includes(mode)) {
    console.log('\n【パラメータ 3: 接続の動き】');
    console.log('  1) wander      : 位置がゆっくり動く (接続維持のままリアルタイムランダムウォーク)');
    console.log('  2) all-at-once : 一斉に接続 (指定位置で静止維持)');
    console.log('  3) churn       : 少しずつ接続して離脱 (参加と離脱の動的入れ替わり)');
    const ans = (await question('選択番号 [1-3] (Enterで wander): ')).trim();
    const map = { '1': 'wander', '2': 'all-at-once', '3': 'churn' };
    mode = map[ans] || 'wander';
  }

  rl.close();
  return {
    count,
    dist,
    mode,
    url: parsedUrl,
    docId: parsedDocId,
    enableReactions: parsedEnableReactions,
    reactionRate: parsedReactionRate,
  };
}

// ─── ルーム取得 ───
async function resolveDocId(serverUrl, specifiedDocId) {
  if (specifiedDocId) return specifiedDocId;
  try {
    const res = await fetch(`${serverUrl}/api/rooms`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rooms = await res.json();
    const openRooms = rooms.filter((r) => r.status === 'open');
    if (openRooms.length > 0) {
      // 最新のオープンルームを使用
      console.log(`📌 利用可能なルーム "${openRooms[0].title || openRooms[0].docId}" (docId: ${openRooms[0].docId}) を自動選択しました。`);
      return openRooms[0].docId;
    }
  } catch (err) {
    console.warn(`⚠️ ルーム一覧の取得に失敗 (${err.message})。デフォルトルームを使用します。`);
  }
  return 'default';
}

// ─── クライアント管理クラス ───
class SimulatedClient {
  constructor({ id, username, docId, serverUrl, initialRatio, mode, enableReactions = true, totalClients = 150, reactionRate = 3.0 }) {
    this.id = id;
    this.username = username;
    this.docId = docId;
    this.serverUrl = serverUrl;
    this.ratio = initialRatio;
    this.mode = mode;
    this.enableReactions = enableReactions;
    this.totalClients = totalClients;
    this.reactionRate = reactionRate;
    this.socket = null;
    this.wanderTimer = null;
    this.churnTimer = null;
    this.reactionTimer = null;
    this.isConnected = false;
    this.doc = null;
    this.userId = `user-sim-${id}-${Math.random().toString(36).slice(2, 6)}`;
  }

  connect() {
    this.socket = io(this.serverUrl, {
      transports: ['websocket'],
      path: '/socket.io',
      reconnection: false,
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      // join-doc
      this.socket.emit('join-doc', { docId: this.docId, isAdmin: false });

      // login
      this.socket.emit('login', {
        userName: this.username,
        colorIndex: this.id % 24,
        attribute: 'tester',
        ageGroup: '20s',
      });
    });

    this.socket.on('sync-snapshot', (snapshot) => {
      // join-doc がサーバー側で完了した確実に安全なタイミングで仕切り位置送信
      this.socket.emit('ratioChange', this.ratio);

      if (this.enableReactions && snapshot) {
        try {
          this.doc = new Loro();
          this.doc.import(Buffer.isBuffer(snapshot) ? snapshot : Buffer.from(snapshot));
          if (!this.reactionTimer) {
            this.startReactions(this.totalClients, this.reactionRate);
          }
        } catch (err) {
          // ignore
        }
      }

      // モードに応じた挙動
      if (this.mode === 'wander' && !this.wanderTimer) {
        this.startWandering();
      }
    });

    this.socket.on('receive-update', (update) => {
      if (this.doc && update) {
        try {
          this.doc.import(Buffer.isBuffer(update) ? update : Buffer.from(update));
        } catch (e) {
          // ignore
        }
      }
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      this.stop();
    });

    this.socket.on('connect_error', () => {
      this.isConnected = false;
    });
  }

  // 位置のランダムウォーク (ゆっくり動く)
  startWandering() {
    const wanderInterval = 1200 + Math.random() * 1500; // 1.2〜2.7秒ごと
    this.wanderTimer = setInterval(() => {
      if (!this.isConnected || !this.socket) return;
      // ±0.015 〜 ±0.035 の微小変化
      const delta = (Math.random() - 0.5) * 0.04;
      this.ratio = Math.min(0.96, Math.max(0.04, parseFloat((this.ratio + delta).toFixed(3))));
      this.socket.emit('ratioChange', this.ratio);
    }, wanderInterval);
  }

  // 👍👎 (1人1投稿あたり1票) および絵文字リアクションのシミュレーション
  startReactions(totalClients = 150, targetReactionRate = 3.0) {
    // 全体で targetReactionRate (件/秒) になるよう、クライアント1体あたりの間隔 (ms) を算出
    const baseInterval = (totalClients / Math.max(0.1, targetReactionRate)) * 1000;
    // ジッター (±20%)
    const getInterval = () => baseInterval * (0.8 + Math.random() * 0.4);

    const scheduleNext = () => {
      this.reactionTimer = setTimeout(() => {
        if (!this.isConnected || !this.socket || !this.doc) return;
        try {
          const stream = this.doc.getMovableList('stream');
          if (!stream || stream.length === 0) return;
          const targetIdx = Math.floor(Math.random() * stream.length);
          const nodeMap = stream.get(targetIdx);
          if (!nodeMap) return;

          const blockId = (nodeMap.get('blockId') || '').toString();

          // 70%の確率で 👍👎 投票、30%の確率で絵文字リアクション
          const isVote = Math.random() < 0.7;

          if (isVote) {
            // 👍👎 (内部値 ⇧ / ⇩) は1人1票
            let reactions;
            try {
              reactions = nodeMap.getOrCreateContainer('reactions', new LoroMap());
            } catch {
              reactions = nodeMap.setContainer('reactions', new LoroMap());
            }

            const currentVote = reactions.get(this.userId);
            // 85% 👍, 15% 👎
            const targetVote = Math.random() < 0.85 ? '⇧' : '⇩';
            let newVote = targetVote;
            if (currentVote === targetVote) {
              newVote = ''; // トグル解除
              reactions.delete(this.userId);
            } else {
              reactions.set(this.userId, newVote);
            }

            this.doc.commit({ message: `vote:${this.userId}:${blockId}:${newVote}` });
            const update = this.doc.exportFrom();
            this.socket.emit('send-update', { docId: this.docId, update });
            this.socket.emit('user-action', {
              type: 'vote',
              targetId: blockId,
              contentPreview: newVote || 'none',
              actionDetails: newVote ? `投票: ${newVote === '⇧' ? '👍' : '👎'}` : '投票解除',
              before: currentVote ? { vote: currentVote } : null,
              after: newVote ? { vote: newVote } : null,
            });
          } else {
            // 絵文字リアクション
            let emojiReactions;
            try {
              emojiReactions = nodeMap.getOrCreateContainer('emojiReactions', new LoroMap());
            } catch {
              emojiReactions = nodeMap.setContainer('emojiReactions', new LoroMap());
            }

            const emoji = SIMULATED_EMOJIS[Math.floor(Math.random() * SIMULATED_EMOJIS.length)];
            const key = `${this.userId}|${emoji}`;
            const exists = emojiReactions.get(key) === true;
            const isAdding = !exists;

            if (exists) {
              emojiReactions.delete(key);
            } else {
              emojiReactions.set(key, true);
            }

            this.doc.commit({ message: `emojiReaction:${this.userId}:${blockId}:${emoji}` });
            const update = this.doc.exportFrom();
            this.socket.emit('send-update', { docId: this.docId, update });
            this.socket.emit('user-action', {
              type: 'emojiReaction',
              targetId: blockId,
              contentPreview: emoji,
              actionDetails: isAdding ? `絵文字リアクション追加: ${emoji}` : `絵文字リアクション削除: ${emoji}`,
              before: exists ? { emoji, active: true } : null,
              after: isAdding ? { emoji, active: true } : null,
            });
          }
        } catch (err) {
          // ignore
        } finally {
          scheduleNext();
        }
      }, getInterval());
    };

    scheduleNext();
  }

  updateRatio(newRatio) {
    this.ratio = newRatio;
    if (this.isConnected && this.socket) {
      this.socket.emit('ratioChange', this.ratio);
    }
  }

  stop() {
    if (this.wanderTimer) {
      clearInterval(this.wanderTimer);
      this.wanderTimer = null;
    }
    if (this.churnTimer) {
      clearTimeout(this.churnTimer);
      this.churnTimer = null;
    }
    if (this.reactionTimer) {
      clearInterval(this.reactionTimer);
      this.reactionTimer = null;
    }
  }

  disconnect() {
    this.stop();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
  }
}

// ─── メイン実行部 ───
async function run() {
  const config = await promptOptions();
  const targetDocId = await resolveDocId(config.url, config.docId);

  console.log('\n───────────────────────────────────────────────────');
  console.log(`🎯 実行パラメータ:`);
  console.log(`   ・接続数       : ${config.count} 本`);
  console.log(`   ・位置の分布   : ${config.dist}`);
  console.log(`   ・接続の動き   : ${config.mode}`);
  console.log(`   ・対象サーバー : ${config.url}`);
  console.log(`   ・対象 docId   : ${targetDocId}`);
  console.log('───────────────────────────────────────────────────');
  console.log('💡 停止するには Ctrl + C を押してください。\n');

  const clients = [];

  // ランダムなユーザー名生成
  function createUsername(i) {
    const prefixes = ['Tester', 'User', 'Guest', 'Sim', 'Bot', 'Viewer'];
    const p = prefixes[i % prefixes.length];
    return `${p}_${String(i + 1).padStart(3, '0')}`;
  }

  // クライアント作成
  for (let i = 0; i < config.count; i++) {
    const initRatio = generateRatio(config.dist);
    const client = new SimulatedClient({
      id: i,
      username: createUsername(i),
      docId: targetDocId,
      serverUrl: config.url,
      initialRatio: initRatio,
      mode: config.mode,
      enableReactions: config.enableReactions,
      totalClients: config.count,
      reactionRate: config.reactionRate,
    });
    clients.push(client);
  }

  // 接続開始フロー
  if (config.mode === 'churn') {
    // 少しずつ接続して離脱モード:
    // まず半数を接続し、順次残りを接続・離脱サイクルに入れる
    console.log('⏳ churn モード: 順次参加・離脱を開始します...');
    clients.forEach((c, idx) => {
      const delay = idx * 250; // 250ms毎に参加
      setTimeout(() => {
        c.connect();
        scheduleChurn(c);
      }, delay);
    });

    function scheduleChurn(client) {
      const stayDuration = 6000 + Math.random() * 8000; // 6〜14秒滞在
      client.churnTimer = setTimeout(() => {
        if (!client.isConnected) return;
        client.disconnect();
        // 2〜4秒後に新しい位置で再参加
        setTimeout(() => {
          client.ratio = generateRatio(config.dist);
          client.connect();
          scheduleChurn(client);
        }, 2000 + Math.random() * 2000);
      }, stayDuration);
    }
  } else {
    // 一斉接続 / wanderモード:
    // ソケットを短時間（10〜20ms間隔）で順次オープンしてサーバー負荷を過剰スパイクさせない
    const rampInterval = Math.max(5, Math.floor(2000 / config.count));
    console.log(`⏳ 接続開始中 (${rampInterval}ms 間隔で ${config.count} 本を接続)...`);
    clients.forEach((c, idx) => {
      setTimeout(() => {
        c.connect();
      }, idx * rampInterval);
    });
  }

  // ─── ターミナル側 リアルタイムヒストグラム表示 ───
  // ブラウザ画面の帯集計（Band 0〜15）と手元で一目で照合できるようにする
  const statsInterval = setInterval(() => {
    const activeClients = clients.filter((c) => c.isConnected);
    const bands = new Array(NUM_BANDS).fill(0);

    for (const c of activeClients) {
      const clamped = Math.max(0, Math.min(1, c.ratio));
      const bandIndex = Math.min(NUM_BANDS - 1, Math.floor(clamped * NUM_BANDS));
      bands[bandIndex]++;
    }

    // 画面クリアせず簡潔にステータス表示
    console.log(`\n─── 📊 現在の接続状況 [${new Date().toLocaleTimeString()}] 接続中: ${activeClients.length}/${config.count}人 ───`);
    console.log(' [帯]   比率範囲    人数   グラフ (ブラウザの丸表示と照合用)');
    for (let i = 0; i < NUM_BANDS; i++) {
      const startT = (i / NUM_BANDS).toFixed(2);
      const endT = ((i + 1) / NUM_BANDS).toFixed(2);
      const count = bands[i];
      const barLen = Math.min(40, Math.round(count * (40 / Math.max(1, config.count))));
      const bar = '█'.repeat(barLen) + (count > 0 && barLen === 0 ? '▏' : '');
      const countStr = String(count).padStart(3, ' ');
      const bandLabel = i === 0 ? '上 (チャット)' : i === NUM_BANDS - 1 ? '下 (Doc)    ' : `帯 ${String(i).padStart(2, ' ')}        `;
      console.log(` [${String(i).padStart(2, '0')}] ${startT}-${endT} : ${countStr}人  ${bar}`);
    }
  }, 3000);

  // 終了処理
  const cleanExit = () => {
    console.log('\n\n🛑 テストを終了し、全接続を切断しています...');
    clearInterval(statsInterval);
    clients.forEach((c) => c.disconnect());
    setTimeout(() => {
      console.log('✅ 切断完了しました。終了します。\n');
      process.exit(0);
    }, 800);
  };

  process.on('SIGINT', cleanExit);
  process.on('SIGTERM', cleanExit);
}

run().catch((err) => {
  console.error('❌ エラーが発生しました:', err);
  process.exit(1);
});
