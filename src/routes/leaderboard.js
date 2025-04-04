const express = require('express');
const Wallet = require('../models/Wallet');

const router = express.Router();

/**
 * GET /api/leaderboard
 * Get top wallets based on score, PnL, or custom metrics
 */
router.get('/', async (req, res) => {
  try {
    const { sort = 'score', limit = 10, page = 1, search = null } = req.query;
    
    console.log('Leaderboard query params:', { sort, limit, page, search });
    
    // Validate sort parameter
    const validSortFields = ['score', 'pnl', 'totalTrades', 'gasSpent'];
    if (!validSortFields.includes(sort)) {
      return res.status(400).json({ error: `Invalid sort parameter. Must be one of: ${validSortFields.join(', ')}` });
    }
    
    // Parse limit and page as integers
    const parsedLimit = parseInt(limit, 10);
    const parsedPage = parseInt(page, 10);
    
    // Validate limit and page
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return res.status(400).json({ error: 'Invalid limit parameter. Must be between 1 and 100.' });
    }
    
    if (isNaN(parsedPage) || parsedPage < 1) {
      return res.status(400).json({ error: 'Invalid page parameter. Must be a positive integer.' });
    }
    
    // Calculate skip value for pagination
    const skip = (parsedPage - 1) * parsedLimit;
    
    // Build query
    let query = {};
    
    // Add search filter if provided
    if (search) {
      query.address = { $regex: search, $options: 'i' };
    }
    
    console.log('MongoDB query:', JSON.stringify(query));
    
    // Get wallets sorted by the specified field
    const wallets = await Wallet.find(query)
      .sort({ [sort]: -1 }) // Sort in descending order
      .skip(skip)
      .limit(parsedLimit)
      .select('address score pnl totalTrades gasSpent achievements roasts');
    
    console.log(`Found ${wallets.length} wallets matching query`);
    
    // Get total count for pagination
    const total = await Wallet.countDocuments(query);
    
    console.log(`Total wallets in DB: ${total}`);
    
    // Format response
    const leaderboard = wallets.map(wallet => ({
      address: wallet.address,
      score: wallet.score,
      pnl: wallet.pnl,
      totalTrades: wallet.totalTrades,
      gasSpent: wallet.gasSpent,
      achievements: wallet.achievements,
      lastRoast: wallet.roasts[wallet.roasts.length - 1]?.text || null
    }));
    
    res.json({
      leaderboard,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        pages: Math.ceil(total / parsedLimit)
      }
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard', details: error.message });
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
          averageTrades: { $avg: '$totalTrades' }
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
        averageTrades: 0
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
    const { score, totalTrades, gasSpent, pnl, lastRoast } = req.body;
    
    console.log(`Adding/updating wallet ${address} to leaderboard`);
    console.log('Leaderboard data:', req.body);
    
    if (!address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }
    
    if (!score || typeof score !== 'number') {
      return res.status(400).json({ error: 'Score is required and must be a number' });
    }
    
    // Create or update wallet in leaderboard
    const wallet = await Wallet.findOneAndUpdate(
      { address },
      {
        address,
        score,
        totalTrades: totalTrades || 0,
        gasSpent: gasSpent || 0,
        pnl: pnl || 0,
        $push: lastRoast ? { 
          roasts: { 
            text: lastRoast, 
            createdAt: new Date() 
          } 
        } : []
      },
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true 
      }
    );
    
    console.log(`Wallet ${address} ${wallet.isNew ? 'added to' : 'updated in'} leaderboard`);
    
    res.status(200).json({ 
      message: 'Wallet added to leaderboard', 
      wallet: {
        address: wallet.address,
        score: wallet.score,
        totalTrades: wallet.totalTrades,
        gasSpent: wallet.gasSpent,
        pnl: wallet.pnl
      }
    });
  } catch (error) {
    console.error('Error adding wallet to leaderboard:', error);
    res.status(500).json({ error: 'Failed to add wallet to leaderboard', details: error.message });
  }
});

module.exports = router; 