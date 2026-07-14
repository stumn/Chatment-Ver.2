const mongoose = require('mongoose');

const documentSnapshotSchema = new mongoose.Schema({
  docId: { type: String, required: true, unique: true, index: true },
  snapshot: { type: Buffer, required: true },
  updatedAt: { type: Date, default: Date.now },
});

documentSnapshotSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});
const DocumentSnapshot = mongoose.model('DocumentSnapshot', documentSnapshotSchema);

const userSchema = new mongoose.Schema({
  userName: { type: String, required: true, unique: true, index: true },
  colorIndex: { type: Number, required: true },
  attribute: { type: String, default: '' },    // 属性（学部生, 院生, 教員, その他）
  ageGroup: { type: String, default: '' },      // 年代（10s, 20s, ...）
  rooms: [{                                     // ログインしたルームの履歴
    roomId: { type: String },                   // Room._id
    docId: { type: String },                    // Room.docId
    joinedAt: { type: Date, default: Date.now },
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

userSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});
const User = mongoose.model('User', userSchema);

const roomSchema = new mongoose.Schema({
  docId: { type: String, required: true, unique: true, index: true },
  title: { type: String, default: '' },        // ルームのタイトル
  status: { type: String, enum: ['open', 'closed', 'hidden'], default: 'open', index: true },
  userIds: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

roomSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});
const Room = mongoose.model('Room', roomSchema);

const systemLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  level: { type: String, required: true },
  event: { type: String, required: true },
  roomId: { type: String, index: true },       // Room._id
  docId: { type: String, index: true },        // Room.docId
  details: { type: mongoose.Schema.Types.Mixed },
});
const SystemLog = mongoose.model('SystemLog', systemLogSchema);

const userActionLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  roomId: { type: String, index: true },       // Room._id
  docId: { type: String, required: true, index: true },
  type: { type: String, required: true },
  author: { type: String, required: true },
  userAttribute: { type: String, default: '' }, // ユーザー属性
  userAgeGroup: { type: String, default: '' },  // ユーザー年代
  targetId: { type: String },
  contentPreview: { type: String },
  actionDetails: { type: String },
  before: { type: mongoose.Schema.Types.Mixed, default: null }, // 操作前の状態
  after: { type: mongoose.Schema.Types.Mixed, default: null },  // 操作後の状態
});
const UserActionLog = mongoose.model('UserActionLog', userActionLogSchema);


async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/compact-chatment';
  try {
    await mongoose.connect(uri);
    console.log('[DB] Connected to MongoDB');
  } catch (err) {
    console.error('[DB] MongoDB connection error:', err.message);
    process.exit(1);
  }
}

module.exports = { connectDB, DocumentSnapshot, User, Room, SystemLog, UserActionLog };
