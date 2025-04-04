const express = require('express');
const Wallet = require('../models/Wallet');
const heliusService = require('../services/helius');
const openaiService = require('../services/openai');

const router = express.Router();

/**
 * Validate Solana wallet address format
 */
function isValidSolanaAddress(address) {
  // Basic validation - Solana addresses are 32-44 characters long
  return typeof address === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

/**
 * GET /api/wallet/:address
 * Get wallet data, analyze it, and store in DB
 */
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate wallet address
    if (!isValidSolanaAddress(address)) {
      return res.status(400).json({ error: 'Invalid Solana wallet address' });
    }
    
    // Check if we already have this wallet in our database
    let wallet = await Wallet.findOne({ address });
    
    // If not in database or data is older than 24 hours, fetch fresh data
    if (!wallet || Date.now() - wallet.updatedAt > 24 * 60 * 60 * 1000) {
      // Get stats from Helius API
      const walletStats = await heliusService.calculateWalletStats(address);
      
      // Generate a roast using OpenAI
      const roast = await openaiService.generateRoast(walletStats);
      
      // Prepare wallet data
      const walletData = {
        address,
        score: walletStats.score,
        pnl: walletStats.pnl,
        totalTrades: walletStats.totalTrades,
        gasSpent: walletStats.gasSpent,
        achievements: walletStats.achievements,
        roasts: [{ text: roast }],
        updatedAt: Date.now()
      };
      
      if (wallet) {
        // Update existing wallet
        wallet = await Wallet.findOneAndUpdate(
          { address }, 
          { 
            ...walletData,
            $push: { roasts: { text: roast } }
          }, 
          { new: true }
        );
      } else {
        // Create new wallet entry
        wallet = await Wallet.create(walletData);
      }
    }
    
    // Return wallet data with the latest roast
    res.json({
      address: wallet.address,
      score: wallet.score,
      pnl: wallet.pnl,
      totalTrades: wallet.totalTrades,
      gasSpent: wallet.gasSpent,
      achievements: wallet.achievements,
      roast: wallet.roasts[wallet.roasts.length - 1].text
    });
  } catch (error) {
    console.error('Error processing wallet request:', error);
    res.status(500).json({ error: 'Failed to process wallet data', details: error.message });
  }
});

/**
 * POST /api/wallet/:address/roast
 * Generate a new roast for a wallet
 */
router.post('/:address/roast', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Find wallet in database
    const wallet = await Wallet.findOne({ address });
    
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    // Generate a new roast
    const walletStats = {
      score: wallet.score,
      pnl: wallet.pnl,
      totalTrades: wallet.totalTrades,
      gasSpent: wallet.gasSpent,
      achievements: wallet.achievements
    };
    
    const roast = await openaiService.generateRoast(walletStats);
    
    // Add new roast to wallet
    wallet.roasts.push({ text: roast });
    await wallet.save();
    
    res.json({ roast });
  } catch (error) {
    console.error('Error generating new roast:', error);
    res.status(500).json({ error: 'Failed to generate roast', details: error.message });
  }
});

module.exports = router; 