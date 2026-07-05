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
});

const systemLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  level: { type: String, required: true },
  event: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed },
});

const SystemLog = mongoose.model('SystemLog', systemLogSchema);

const userActionLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  docId: { type: String, required: true, index: true },
  type: { type: String, required: true },
  author: { type: String, required: true },
  targetId: { type: String },
  contentPreview: { type: String },
  actionDetails: { type: String },
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

module.exports = { connectDB, DocumentSnapshot, User, SystemLog, UserActionLog };
