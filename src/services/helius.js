const axios = require('axios');

// Helius API base URL
const HELIUS_API_URL = 'https://api.helius.xyz/v0';
const API_KEY = process.env.HELIUS_API_KEY;

/**
 * Get wallet portfolio data from Helius
 * @param {string} address - Solana wallet address
 * @returns {Promise<Object>} - Wallet portfolio data
 */
async function getWalletPortfolio(address) {
  try {
    const response = await axios.get(`${HELIUS_API_URL}/addresses/${address}/balances`, {
      params: {
        'api-key': API_KEY
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching wallet portfolio from Helius:', error);
    throw error;
  }
}

/**
 * Get transaction history for a wallet
 * @param {string} address - Solana wallet address
 * @param {number} limit - Number of transactions to fetch
 * @returns {Promise<Array>} - Transaction history
 */
async function getTransactionHistory(address, limit = 100) {
  try {
    const response = await axios.get(`${HELIUS_API_URL}/addresses/${address}/transactions`, {
      params: {
        'api-key': API_KEY,
        limit
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching transaction history from Helius:', error);
    throw error;
  }
}

/**
 * Calculate wallet statistics based on transaction history
 * @param {string} address - Solana wallet address
 * @returns {Promise<Object>} - Wallet statistics
 */
async function calculateWalletStats(address) {
  try {
    const [portfolio, transactions] = await Promise.all([
      getWalletPortfolio(address),
      getTransactionHistory(address, 500)
    ]);
    
    // Calculate gas spent (fees)
    let gasSpent = 0;
    transactions.forEach(tx => {
      if (tx.fee) {
        gasSpent += tx.fee / 1000000000; // Convert lamports to SOL
      }
    });
    
    // Calculate PnL (simplified version - in a real app you'd need more data)
    const totalBalanceInUsd = portfolio.tokens.reduce((sum, token) => {
      return sum + (token.marketData?.value?.usd || 0);
    }, 0);
    
    // Score calculation based on various factors
    const diversificationScore = Math.min(portfolio.tokens.length * 5, 20);
    const activityScore = Math.min(transactions.length / 5, 30);
    
    // More robust value score with exponential scaling for higher values
    let valueScore = 0;
    
    // Penalize wallets with less than $100 value
    if (totalBalanceInUsd < 100) {
      valueScore = Math.max(5, Math.floor(totalBalanceInUsd / 20));
    } 
    // Normal scaling for moderate wallets ($100-$1000)
    else if (totalBalanceInUsd < 1000) {
      valueScore = 15 + Math.floor((totalBalanceInUsd - 100) / 60);
    }
    // Higher scaling for valuable wallets ($1000-$10000)
    else if (totalBalanceInUsd < 10000) {
      valueScore = 30 + Math.floor((totalBalanceInUsd - 1000) / 500);
    }
    // Premium scaling for whale wallets (>$10000)
    else {
      valueScore = 45 + Math.min(Math.floor((totalBalanceInUsd - 10000) / 5000), 15);
    }
    
    // Cap the value score at 60
    valueScore = Math.min(valueScore, 60);
    
    const holdingPeriodScore = 20; // Placeholder - would need more data
    
    const score = Math.floor(diversificationScore + activityScore + valueScore + holdingPeriodScore);
    
    // Cap the final score at 100
    const finalScore = Math.min(score, 100);
    
    // Calculate achievements
    const achievements = [];
    
    if (transactions.length > 100) {
      achievements.push({
        title: 'Active Trader 📊',
        description: 'You\'ve made over 100 transactions. The market is your playground.'
      });
    }
    
    if (gasSpent > 1) {
      achievements.push({
        title: 'Gas Guzzler 🛢️',
        description: `You've spent ${gasSpent.toFixed(2)} SOL on gas fees. The validators thank you!`
      });
    }
    
    if (portfolio.tokens.length > 10) {
      achievements.push({
        title: 'Diversification King 👑',
        description: 'You hold more than 10 different tokens. Spreading the risk or collecting shitcoins?'
      });
    }
    
    return {
      address,
      score: finalScore,
      pnl: totalBalanceInUsd, // Simplified - should be based on buy/sell history
      totalTrades: transactions.length,
      gasSpent,
      achievements,
      portfolio: {
        nativeBalance: portfolio.nativeBalance,
        tokens: portfolio.tokens
      }
    };
  } catch (error) {
    console.error('Error calculating wallet stats:', error);
    throw error;
  }
}

module.exports = {
  getWalletPortfolio,
  getTransactionHistory,
  calculateWalletStats
}; 