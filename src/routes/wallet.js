const express = require('express');
const router = express.Router();
const walletService = require('../services/walletService');

/**
 * @route GET /api/wallet/:address
 * @desc Get wallet statistics and generate roast
 */
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const result = await walletService.analyzeWallet(address);
    res.json(result);
  } catch (error) {
    console.error('Error processing wallet request:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/wallet/:address
 * @desc Analyze wallet with options
 */
router.post('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const options = req.body || {};
    
    const result = await walletService.analyzeWallet(address, options);
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
    const { address, stats } = req.body;
    
    if (!address || !stats) {
      return res.status(400).json({ error: 'Address and stats are required' });
    }
    
    // Generate roast using OpenAI
    const OpenAI = require('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    const prompt = `Generate a funny, sarcastic roast of this Solana wallet based on its statistics:
    - Wallet: ${address.slice(0, 6)}...${address.slice(-4)}
    - PnL: ${stats.pnl > 0 ? '+' : ''}${stats.pnl} SOL
    - Total Trades: ${stats.totalTrades || 0}
    - Gas Spent: ${stats.gasSpent || 0} SOL
    
    The roast should be funny but not too mean, about 2-3 sentences, and include specific details from the wallet stats.`;
    
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

module.exports = router; 