const express = require('express');
const Wallet = require('../models/Wallet');

const router = express.Router();

/**
 * GET /api/leaderboard
 * Get top wallets based on score, PnL, or custom metrics
 */
router.get('/', async (req, res) => {
  try {
    // Get optional query parameters
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sortBy || 'score'; // Default sort by score
    const sortDir = req.query.sortDir === 'asc' ? 1 : -1; // Default descending
    
    // Validate the sort field
    const validSortFields = ['score', 'gasSpent', 'totalTrades', 'walletValue', 'lastSeen', 'nativeBalance'];
    if (!validSortFields.includes(sortBy)) {
      return res.status(400).json({ error: 'Invalid sort field' });
    }
    
    // Build the sort object
    const sortObj = {};
    sortObj[sortBy] = sortDir;
    
    // Get the leaderboard data
    const leaderboard = await Wallet.find({})
      .sort(sortObj)
      .limit(limit)
      .select('address score totalTrades gasSpent pnl walletValue nativeBalance lastRoast lastSeen createdAt')
      .lean();
      
    return res.json({
      success: true,
      leaderboard: leaderboard.map(wallet => ({
        address: wallet.address,
        score: wallet.score,
        totalTrades: wallet.totalTrades,
        gasSpent: wallet.gasSpent,
        pnl: wallet.pnl,
        walletValue: wallet.walletValue,
        nativeBalance: wallet.nativeBalance,
        lastRoast: wallet.lastRoast,
        lastSeen: wallet.lastSeen,
        createdAt: wallet.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/leaderboard/stats
 * Get overall leaderboard statistics
 */
router.get('/stats', async (req, res) => {
  try {
    // Get aggregate stats
    const stats = await Wallet.aggregate([
      {
        $group: {
          _id: null,
          totalWallets: { $sum: 1 },
          averageScore: { $avg: '$score' },
          totalPnl: { $sum: '$pnl' },
          averagePnl: { $avg: '$pnl' },
          totalGasSpent: { $sum: '$gasSpent' },
          averageGasSpent: { $avg: '$gasSpent' },
          totalTrades: { $sum: '$totalTrades' },
          averageTrades: { $avg: '$totalTrades' },
          totalWalletValue: { $sum: '$walletValue' },
          averageWalletValue: { $avg: '$walletValue' }
        }
      }
    ]);
    
    if (stats.length === 0) {
      return res.json({
        totalWallets: 0,
        averageScore: 0,
        totalPnl: 0,
        averagePnl: 0,
        totalGasSpent: 0,
        averageGasSpent: 0,
        totalTrades: 0,
        averageTrades: 0,
        totalWalletValue: 0,
        averageWalletValue: 0
      });
    }
    
    // Get top wallet by score
    const topWalletByScore = await Wallet.findOne().sort({ score: -1 }).select('address score');
    
    // Get top wallet by PnL
    const topWalletByPnl = await Wallet.findOne().sort({ pnl: -1 }).select('address pnl');
    
    // Format response
    res.json({
      ...stats[0],
      _id: undefined,
      topWalletByScore: topWalletByScore ? {
        address: topWalletByScore.address,
        score: topWalletByScore.score
      } : null,
      topWalletByPnl: topWalletByPnl ? {
        address: topWalletByPnl.address,
        pnl: topWalletByPnl.pnl
      } : null
    });
  } catch (error) {
    console.error('Error fetching leaderboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard stats', details: error.message });
  }
});

/**
 * POST /api/wallet/:address/leaderboard
 * Add or update a wallet on the leaderboard
 */
router.post('/:address/leaderboard', async (req, res) => {
  try {
    const { address } = req.params;
    const { score, totalTrades, gasSpent, pnl, walletValue, lastRoast } = req.body;
    
    if (!address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }
    
    // Create updateData object with the wallet's data
    const updateData = {
      address,
      score: score || 0,
      totalTrades: totalTrades || 0,
      gasSpent: gasSpent || 0,
      pnl: pnl || 0,
      walletValue: walletValue || 0,
      lastSeen: new Date()
    };
    
    // Add lastRoast to roasts array if provided
    if (lastRoast) {
      updateData.lastRoast = lastRoast;
    }
    
    const result = await Wallet.findOneAndUpdate(
      { address }, 
      { 
        $set: updateData,
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true, new: true }
    );
    
    console.log(`Added wallet ${address} to leaderboard with score: ${score}`);
    
    return res.json({
      success: true,
      wallet: {
        address: result.address,
        score: result.score,
        totalTrades: result.totalTrades,
        gasSpent: result.gasSpent,
        pnl: result.pnl,
        walletValue: result.walletValue,
        nativeBalance: result.nativeBalance,
        lastRoast: result.lastRoast,
        createdAt: result.createdAt,
        lastSeen: result.lastSeen
      }
    });
  } catch (error) {
    console.error('Error saving to leaderboard:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 