// load-test.js
// サーバー (server/index.js) の実際のイベントフローに合わせた負荷テストスクリプト
// 実行: node load-test.js
const { io } = require("socket.io-client");
const { LoroDoc } = require("loro-crdt");

// ─── テスト設定 ──────────────────────────────────────────────
// 【本番環境】Render デプロイ先
// socket.io-client は https:// を指定すると自動的に wss:// で接続する
const SERVER_URL = "https://chatment-ver-2.onrender.com";
const TOTAL_USERS = 50;                         // 同時接続する仮想ユーザー数
// ※ Render 無料プランはコネクション数に
//   制限があるため、まず20人で確認
const TARGET_DOC_ID = "6a4a8b10b7f71a3d9920302b"; // URL の # 以降の docId
const RAMP_INTERVAL_MS = 500;                   // ユーザーを何msずつズラして起動するか
// ※ 本番はネットワーク遅延があるため
//   ローカルより長めに設定
const ACTION_INTERVAL_MS = 800;                 // 各ユーザーが行動する間隔(ms)
// ※ 本番サーバーの応答時間を考慮して
//   ローカルより長めに設定
const ACTION_COUNT = 20;                        // 1ユーザーあたりの行動回数

// ─── 統計カウンタ ─────────────────────────────────────────────
const stats = {
    connected: 0,
    disconnected: 0,
    connectErrors: 0,
    roomErrors: 0,
    loginAcks: 0,
    snapshotReceived: 0,
    // 送信カウンタ
    emitSendUpdate: 0,
    emitRatioChange: 0,
    emitLogin: 0,
};

// テスト終了時に集計を出力する
function printSummary() {
    const total = stats.emitSendUpdate + stats.emitRatioChange + stats.emitLogin;
    console.log("\n");
    console.log("═══════════════════════════════════════════");
    console.log("          📊 負荷テスト 結果サマリ          ");
    console.log("═══════════════════════════════════════════");
    console.log(`  仮想ユーザー数         : ${TOTAL_USERS} 人`);
    console.log(`  接続成功              : ${stats.connected} 人`);
    console.log(`  切断完了              : ${stats.disconnected} 人`);
    console.log(`  接続エラー            : ${stats.connectErrors} 件`);
    console.log(`  room-error 受信       : ${stats.roomErrors} 件`);
    console.log(`  login-ack 受信        : ${stats.loginAcks} 件`);
    console.log(`  sync-snapshot 受信    : ${stats.snapshotReceived} 件`);
    console.log("───────────────────────────────────────────");
    console.log(`  send-update 送信      : ${stats.emitSendUpdate} 回`);
    console.log(`  ratioChange 送信      : ${stats.emitRatioChange} 回`);
    console.log(`  login(再送信) 送信    : ${stats.emitLogin} 回`);
    console.log(`  合計 emit             : ${total} 回`);
    console.log("═══════════════════════════════════════════\n");
}

// ─── メイン ──────────────────────────────────────────────────
console.log(`🚀 負荷テスト開始: ${TOTAL_USERS} 人 / docId: ${TARGET_DOC_ID}`);
console.log(`   サーバー: ${SERVER_URL}`);
console.log(`   ユーザー起動間隔: ${RAMP_INTERVAL_MS}ms / 行動間隔: ${ACTION_INTERVAL_MS}ms / 行動回数: ${ACTION_COUNT}回\n`);

let finishedCount = 0;

for (let i = 0; i < TOTAL_USERS; i++) {
    setTimeout(() => {
        simulateUser(i);
    }, i * RAMP_INTERVAL_MS);
}

/**
 * 1人の仮想ユーザーの全ライフサイクルをシミュレートする
 * フロー:
 *   connect → join-doc → (sync-snapshot受信) → login → (login-ack受信)
 *   → [行動ループ × ACTION_COUNT] → disconnect
 */
function simulateUser(index) {
    const username = `LoadTestUser_${index}`;
    const colorIndex = index;

    // ユーザーごとに独立した LoroDoc を持つ（サーバーと同じ構造）
    // sync-snapshot を受け取った後にインポートし、
    // そこからの差分更新を send-update で送ることで「正規の Loro バイナリ」を生成できる
    const localDoc = new LoroDoc();
    localDoc.setPeerId(BigInt(index + 1)); // peer ID をユーザーごとに一意に設定

    const socket = io(SERVER_URL, {
        transports: ["websocket"],
        path: "/socket.io",
        reconnection: false, // テスト中の自動再接続は無効化
    });

    // ── サーバーからの応答イベントを受け取る ──────────────
    socket.on("room-error", (msg) => {
        stats.roomErrors++;
        console.error(`❌ [${username}] room-error: ${msg}`);
        socket.disconnect();
    });

    socket.on("sync-snapshot", (_snapshotData) => {
        // join-doc 後にサーバーが送ってくるスナップショット
        // ⚠️ localDoc への import は行わない。
        // 理由: Loro WASM の import は Node.js の concurrent setInterval から
        //       呼ばれると "WouldBlock" パニック や detached state を引き起こす。
        // load-test の localDoc は「送信専用」として使い、
        // サーバーとの状態同期は行わない（負荷テストの目的には不要）
        stats.snapshotReceived++;
    });

    // receive-update は統計のみ。localDoc への import は行わない（WASMパニック防止）
    socket.on("receive-update", (_updateData) => {
        // 他ユーザーの更新を受け取ったことは確認できるが、マージはしない
    });

    socket.on("login-ack", ({ userName, colorIndex: ci }) => {
        stats.loginAcks++;
        if (index < 3) {
            console.log(`  ✅ [${userName}] login-ack: colorIndex=${ci}`);
        }
    });

    // ── 接続エラー ──────────────────────────────────────────
    socket.on("connect_error", (err) => {
        stats.connectErrors++;
        console.error(`❌ [${username}] 接続エラー: ${err.message}`);
        checkAllFinished();
    });

    // ── 切断 ────────────────────────────────────────────────
    socket.on("disconnect", (reason) => {
        stats.disconnected++;
        if (index < 3 || reason !== "io client disconnect") {
            console.log(`🔴 [${username}] 切断 (${reason})`);
        }
        checkAllFinished();
    });

    // ── メインフロー ─────────────────────────────────────────
    socket.on("connect", () => {
        stats.connected++;
        if (index < 5) {
            console.log(`🟢 [${username}] 接続 (ID: ${socket.id})`);
        }

        // ステップ1: join-doc（先にルームに入る）
        socket.emit("join-doc", { docId: TARGET_DOC_ID, isAdmin: false });

        // ステップ2: 500ms 後に login
        setTimeout(() => {
            socket.emit("login", {
                userName: username,
                colorIndex: colorIndex,
                attribute: "load-tester",
                ageGroup: "20s",
            });

            // ステップ3: ログイン後に行動ループ開始
            setTimeout(() => {
                startActionLoop(socket, localDoc, username, index);
            }, 500);

        }, 500);
    });
}

/**
 * ランダムな行動を ACTION_COUNT 回繰り返す
 */
function startActionLoop(socket, localDoc, username, index) {
    let actionsDone = 0;

    const intervalId = setInterval(() => {
        if (!socket.connected) {
            clearInterval(intervalId);
            return;
        }

        actionsDone++;
        const rand = Math.random();

        if (rand < 0.5) {
            // ─ 行動A: 正規の Loro 更新データを送信 (50%) ─
            // localDoc に実際の変更を加えて差分バイナリを生成することで
            // サーバーの applyUpdate が受け付ける正規フォーマットになる
            const validUpdate = generateValidLoroUpdate(localDoc, username, actionsDone);
            if (validUpdate) {
                socket.emit("send-update", {
                    docId: TARGET_DOC_ID,
                    update: Array.from(validUpdate), // Uint8Array → Array に変換して送信
                });
                stats.emitSendUpdate++;
            }

        } else if (rand < 0.8) {
            // ─ 行動B: スプリット比率変更 (30%) ─
            const ratio = parseFloat((Math.random() * 0.6 + 0.2).toFixed(2));
            socket.emit("ratioChange", ratio);
            stats.emitRatioChange++;

        } else {
            // ─ 行動C: ageGroup を変えて再ログイン (20%) ─
            const ageGroups = ["10s", "20s", "30s", "40s", "50s"];
            socket.emit("login", {
                userName: username,
                colorIndex: index,
                attribute: "load-tester",
                ageGroup: ageGroups[Math.floor(Math.random() * ageGroups.length)],
            });
            stats.emitLogin++;
        }

        // ACTION_COUNT 回の行動が終わったら切断
        if (actionsDone >= ACTION_COUNT) {
            clearInterval(intervalId);
            setTimeout(() => {
                socket.disconnect();
                if (index < 5) {
                    console.log(`🔴 [${username}] ${ACTION_COUNT}回の行動が完了。切断します`);
                }
            }, 300);
        }
    }, ACTION_INTERVAL_MS);
}

/**
 * localDoc に実際の変更を加えて「正規の Loro 差分バイナリ」を生成する
 *
 * サーバーの snapshot-manager.js は以下の構造を期待している:
 *   doc.getMovableList('stream') でリストを管理
 *   各要素に { id, type, content, ... } を push
 *
 * ここでは実際に stream リストに要素を追加することで
 * サーバーが受け入れられる正規の Loro update バイナリを生成する
 */
function generateValidLoroUpdate(localDoc, username, actionCount) {
    try {
        // サーバーと同じコンテナ名 'stream' に要素を追加
        const stream = localDoc.getMovableList("stream");

        // チャットメッセージを模したオブジェクトを追加
        // サーバーの saveLoroChangeLog が解析する message フォーマットに合わせる:
        //   "chat:<author>:<id>:<content>"
        const msgId = `lt-${username}-${actionCount}-${Date.now()}`;
        const msgContent = `Load test message #${actionCount} from ${username}`;
        const message = `chat:${username}:${msgId}:${msgContent}`;

        stream.push({
            id: msgId,
            type: "chat",
            content: msgContent,
        });

        // commit で変更を確定し、message (メタデータ) を付与する
        localDoc.commit({ message });

        // サーバーが前回同期した状態からの差分を export する
        // mode: 'update' で差分のみのバイナリを得る
        const update = localDoc.export({ mode: "update" });
        return update;

    } catch (err) {
        // localDoc の状態が予期しない場合は null を返してスキップ
        console.error(`  ⚠️ [${username}] Loro update 生成エラー: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}

/**
 * 全ユーザーの処理が終わったらサマリを表示してプロセス終了
 */
function checkAllFinished() {
    finishedCount++;
    if (finishedCount >= TOTAL_USERS) {
        printSummary();
        setTimeout(() => process.exit(0), 500);
    }
}