const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema({
  address: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  score: {
    type: Number,
    default: 0
  },
  totalTrades: {
    type: Number,
    default: 0
  },
  gasSpent: {
    type: Number,
    default: 0
  },
  pnl: {
    type: Number,
    default: 0
  },
  walletValue: {
    type: Number,
    default: 0
  },
  nativeBalance: {
    type: Number,
    default: 0
  },
  solPrice: {
    type: Number,
    default: 0
  },
  lastRoast: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  tokens: {
    type: Array,
    default: []
  },
  achievements: {
    type: Array,
    default: []
  },
  recentTransactions: {
    type: Array,
    default: []
  }
}, { timestamps: false });

// Index for efficient leaderboard queries
WalletSchema.index({ score: -1 });
WalletSchema.index({ walletValue: -1 });
WalletSchema.index({ totalTrades: -1 });
WalletSchema.index({ gasSpent: -1 });
WalletSchema.index({ nativeBalance: -1 });
WalletSchema.index({ lastUpdated: -1 });

module.exports = mongoose.model('Wallet', WalletSchema); 