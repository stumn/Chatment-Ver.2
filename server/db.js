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

module.exports = { connectDB, DocumentSnapshot };
