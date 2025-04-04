const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate a roast for a wallet based on its statistics
 * @param {Object} walletStats - Wallet statistics
 * @returns {Promise<string>} - AI-generated roast
 */
async function generateRoast(walletStats) {
  try {
    const { score, pnl, totalTrades, gasSpent, achievements } = walletStats;
    
    // Construct a prompt for the roast
    const prompt = `Generate a humorous, sarcastic roast (1-2 sentences) for a Solana wallet with the following stats:
- Wallet Score: ${score}/100
- PnL: ${pnl} SOL
- Total Trades: ${totalTrades}
- Gas Spent: ${gasSpent} SOL
- Achievements: ${achievements.map(a => a.title).join(', ') || 'None'}

Make it funny, sarcastic, and crypto-themed. Include relevant emojis.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a sarcastic crypto trader who loves to roast people\'s wallets. Be funny, direct, and use crypto slang.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 100,
      temperature: 0.7
    });

    // Return the generated roast
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating roast with OpenAI:', error);
    // Return a fallback roast in case of API failure
    return `You spent ${walletStats.gasSpent.toFixed(2)} SOL on fees alone. The validators thank you for your service. 🫡`;
  }
}

module.exports = {
  generateRoast
}; 