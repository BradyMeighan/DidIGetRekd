const express = require('express');
const router = express.Router();
const walletService = require('../services/walletService');

/**
 * @route GET /api/wallet/test
 * @desc Test endpoint for API connection
 */
router.get('/test', (req, res) => {
  try {
    const heliusKey = process.env.HELIUS_API_KEY ? 'Set' : 'Missing';
    const openaiKey = process.env.OPENAI_API_KEY ? 'Set' : 'Missing';
    
    res.json({
      status: 'OK',
      message: 'Wallet API is working',
      config: {
        heliusApiKey: heliusKey,
        openaiApiKey: openaiKey
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Test endpoint failed', details: error.message });
  }
});

/**
 * @route GET /api/wallet/:address
 * @desc Get wallet statistics and generate roast
 */
router.get('/:address', async (req, res) => {
  try {
    console.log(`GET request for wallet: ${req.params.address}`);
    const { address } = req.params;
    
    if (!address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }
    
    const result = await walletService.analyzeWallet(address);
    console.log(`Analysis complete for wallet: ${address}`);
    
    // Ensure we have a complete data structure
    if (!result.stats) {
      result.stats = {};
    }
    
    // Generate visualization data if it doesn't exist
    if (!result.stats.txHistory) {
      console.log('Generating transaction history visualization data');
      result.stats.txHistory = Array(30).fill().map((_, i) => ({
        day: i + 1,
        value: parseFloat((Math.random() * 2 - 1).toFixed(1)),
        transactions: Math.floor(Math.random() * 5)
      }));
    }
    
    if (!result.stats.tokens) {
      console.log('Generating token holdings visualization data');
      result.stats.tokens = [
        { name: 'SOL', amount: Math.max(0.1, result.stats.totalTrades / 10), value: (result.stats.totalTrades * 5).toFixed(2) },
        { name: 'BONK', amount: result.stats.swapCount * 10000 || 5000, value: (result.stats.swapCount * 2 || 10).toFixed(2) },
        { name: 'JUP', amount: result.stats.swapCount * 5 || 25, value: (result.stats.swapCount * 8 || 40).toFixed(2) }
      ];
    }
    
    if (!result.stats.nfts) {
      console.log('Generating NFT holdings visualization data');
      const mintCount = result.stats.mintCount || 0;
      result.stats.nfts = [
        { name: 'DeGods', floor: 120, owned: mintCount > 5 ? 1 : 0 },
        { name: 'Okay Bears', floor: 80, owned: mintCount > 2 ? 1 : 0 },
        { name: 'Froganas', floor: 30, owned: mintCount > 0 ? 2 : 0 }
      ];
    }
    
    if (!result.stats.achievements) {
      console.log('Generating achievements visualization data');
      const achievements = [];
      const score = result.stats.score || 50;
      
      // Score-based achievements
      if (score < 30) {
        achievements.push({ 
          title: 'Rug Victim 🫠', 
          description: 'You bought high and sold low. Classic.' 
        });
      } else if (score < 60) {
        achievements.push({ 
          title: 'Paper Hands 🧻', 
          description: 'Selling at the first sign of trouble, huh?' 
        });
      } else if (score < 90) {
        achievements.push({ 
          title: 'Diamond Hands 💎🙌', 
          description: 'HODL is your middle name.' 
        });
      } else {
        achievements.push({ 
          title: 'Giga Chad Ape 🦍', 
          description: 'The wolf of Solana Street.' 
        });
      }
      
      // Add activity-based achievements
      if (result.stats.gasSpent > 1.5) {
        achievements.push({ 
          title: 'Gas Guzzler 🛢️', 
          description: 'Funding validators one tx at a time.' 
        });
      }
      
      if (result.stats.totalTrades > 100) {
        achievements.push({ 
          title: 'Degenerate Trader 🎰', 
          description: 'Sleep? Who needs that?' 
        });
      }
      
      result.stats.achievements = achievements;
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error analyzing wallet:', error);
    res.status(500).json({ error: 'Error analyzing wallet' });
  }
});

/**
 * @route POST /api/wallet/:address
 * @desc Analyze wallet with options
 */
router.post('/:address', async (req, res) => {
  try {
    console.log(`POST request for wallet: ${req.params.address}`);
    console.log('Options:', req.body);
    
    const { address } = req.params;
    const options = req.body || {};
    
    if (!address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }
    
    const result = await walletService.analyzeWallet(address, options);
    console.log(`Analysis complete for wallet: ${address}`);
    res.json(result);
  } catch (error) {
    console.error('Error processing wallet analysis request:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/wallet/roast
 * @desc Generate a roast based on wallet stats
 */
router.post('/roast', async (req, res) => {
  try {
    console.log('Roast request received');
    const { address, stats } = req.body;
    
    if (!address || !stats) {
      return res.status(400).json({ error: 'Address and stats are required' });
    }
    
    // Generate roast using OpenAI
    const OpenAI = require('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OpenAI API key is missing, using fallback roast');
      const fallbackRoasts = [
        "This wallet has a PnL of ${stats.pnl} SOL - even a hamster with a trading wheel could do better.",
        "Congrats on your ${stats.totalTrades} trades! Too bad quantity doesn't equal quality.",
        "${stats.gasSpent} SOL on gas fees? You might as well have burned your money for warmth.",
        "I've seen more profitable strategies from someone throwing darts at a chart blindfolded."
      ];
      const randomRoast = fallbackRoasts[Math.floor(Math.random() * fallbackRoasts.length)];
      return res.json({ roast: randomRoast });
    }
    
    const prompt = `Generate a funny, sarcastic roast of this Solana wallet based on its statistics:
    - Wallet: ${address.slice(0, 6)}...${address.slice(-4)}
    - PnL: ${stats.pnl > 0 ? '+' : ''}${stats.pnl} SOL
    - Total Trades: ${stats.totalTrades || 0}
    - Gas Spent: ${stats.gasSpent || 0} SOL
    
    The roast should be funny but not too mean, about 2-3 sentences, and include specific details from the wallet stats.`;
    
    console.log('Calling OpenAI for roast generation');
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a hilarious crypto roast generator that creates short, witty, sarcastic roasts based on wallet statistics." },
        { role: "user", content: prompt }
      ],
      max_tokens: 150,
      temperature: 0.7,
    });
    
    const roast = response.choices[0].message.content.trim();
    console.log('Roast generated successfully');
    res.json({ roast });
  } catch (error) {
    console.error('Error generating roast:', error);
    // Provide a fallback roast
    const fallbackRoasts = [
      "This wallet is so basic it probably thinks gas fees are for a car.",
      "I've seen more profitable strategies from a toddler playing with Monopoly money.",
      "Congrats on those trades! Maybe next time try opening your eyes while clicking.",
      "Your wallet is like a leaky faucet, but instead of water, it's SOL.",
      "This wallet screams 'I make financial decisions based on TikTok videos.'"
    ];
    const randomRoast = fallbackRoasts[Math.floor(Math.random() * fallbackRoasts.length)];
    res.json({ roast: randomRoast });
  }
});

/**
 * @route POST /api/wallet/:address/roast
 * @desc Generate a new roast based on wallet stats
 */
router.post('/:address/roast', async (req, res) => {
  try {
    const { address } = req.params;
    console.log(`POST /api/wallet/${address}/roast - Generating new roast`);
    
    // Get wallet data first
    const walletData = await walletService.analyzeWallet(address);
    
    // Generate a new roast
    const roast = await walletService.generateRoast(address, walletData.stats);
    
    res.json({ roast });
  } catch (error) {
    console.error('Error generating new roast:', error);
    res.status(500).json({ error: 'Error generating roast' });
  }
});

module.exports = router; 