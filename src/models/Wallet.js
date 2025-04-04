const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema({
  address: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  score: {
    type: Number,
    required: true
  },
  pnl: {
    type: Number,
    required: true
  },
  totalTrades: {
    type: Number,
    required: true
  },
  gasSpent: {
    type: Number,
    required: true
  },
  walletValue: {
    type: Number,
    default: 0
  },
  achievements: [{
    title: String,
    description: String
  }],
  roasts: [{
    text: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient leaderboard queries
WalletSchema.index({ score: -1 });
WalletSchema.index({ walletValue: -1 });
WalletSchema.index({ totalTrades: -1 });
WalletSchema.index({ gasSpent: -1 });

module.exports = mongoose.model('Wallet', WalletSchema); 