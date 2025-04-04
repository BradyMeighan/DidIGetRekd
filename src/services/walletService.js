const axios = require('axios');
const OpenAI = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize Helius API client
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_API_URL = `https://api.helius.xyz/v0/addresses`;

/**
 * Get wallet statistics and analysis
 * @param {string} address - Wallet address to analyze
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Wallet statistics and roast
 */
async function analyzeWallet(address, options = {}) {
  try {
    console.log(`Analyzing wallet: ${address}`);

    // Use Helius API to get wallet transactions
    const transactions = await fetchWalletTransactions(address);
    
    if (!transactions || transactions.length === 0) {
      console.log(`No transactions found for wallet: ${address}`);
      return { 
        stats: null, 
        roast: "This wallet is so inactive that even our algorithms fell asleep trying to analyze it." 
      };
    }

    // Process transactions to extract statistics
    const stats = calculateWalletStats(transactions);
    
    // Generate a roast
    const roast = await generateRoast(address, stats);

    const result = { 
      stats, 
      roast
    };

    // Include transactions if requested
    if (options.includeTransactions) {
      result.transactions = processTransactionsForFrontend(transactions);
    }

    return result;
  } catch (error) {
    console.error('Error analyzing wallet:', error);
    throw new Error(`Failed to analyze wallet: ${error.message}`);
  }
}

/**
 * Fetch wallet transactions from Helius API
 * @param {string} address - Wallet address
 * @returns {Promise<Array>} Transactions
 */
async function fetchWalletTransactions(address) {
  try {
    console.log(`Fetching transactions for wallet: ${address}`);
    const response = await axios.get(
      `${HELIUS_API_URL}/${address}/transactions?api-key=${HELIUS_API_KEY}&limit=100`
    );
    
    if (response.data && Array.isArray(response.data)) {
      console.log(`Retrieved ${response.data.length} transactions for wallet: ${address}`);
      return response.data;
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching wallet transactions:', error);
    // Return empty array rather than throwing to allow for empty wallets
    return [];
  }
}

/**
 * Calculate wallet statistics from transactions
 * @param {Array} transactions - Wallet transactions
 * @returns {Object} Wallet statistics
 */
function calculateWalletStats(transactions) {
  // Initialize stats
  const stats = {
    totalTrades: 0,
    pnl: 0,
    gasSpent: 0,
    score: 0,
    swapCount: 0,
    mintCount: 0,
    transfersCount: 0,
    successRate: 0,
    failedTxCount: 0,
    firstActivityDate: null,
    lastActivityDate: null,
    avgGasPerTx: 0,
  };

  if (!transactions || transactions.length === 0) {
    return stats;
  }

  // Track successful and failed transactions
  let successfulTxCount = 0;
  let failedTxCount = 0;

  // Process each transaction
  transactions.forEach(tx => {
    // Track activity dates
    const timestamp = new Date(tx.timestamp * 1000);
    if (!stats.firstActivityDate || timestamp < stats.firstActivityDate) {
      stats.firstActivityDate = timestamp;
    }
    if (!stats.lastActivityDate || timestamp > stats.lastActivityDate) {
      stats.lastActivityDate = timestamp;
    }

    // Count total trades
    stats.totalTrades++;

    // Track transaction type
    if (tx.type === 'SWAP') {
      stats.swapCount++;
    } else if (tx.type === 'NFT_MINT' || tx.type === 'MINT') {
      stats.mintCount++;
    } else if (tx.type === 'TRANSFER') {
      stats.transfersCount++;
    }

    // Track success rate
    if (tx.successful) {
      successfulTxCount++;
    } else {
      failedTxCount++;
    }

    // Calculate gas spent
    if (tx.fee) {
      stats.gasSpent += tx.fee / 1e9; // Convert lamports to SOL
    }

    // Estimate PnL (very crude approximation, would need better data)
    // For demo purposes, we'll use a simplistic approach
    if (tx.type === 'SWAP' && tx.successful) {
      // Simulate some PnL based on transaction values
      const txValue = tx.nativeTransfers.reduce((sum, transfer) => sum + transfer.amount, 0) / 1e9;
      
      // Add some randomness for demonstration, but weighted by transaction value
      const pnlFactor = Math.random() > 0.5 ? 1 : -1; // Random gain or loss
      stats.pnl += pnlFactor * txValue * Math.random() * 0.2; // Up to 20% gain/loss per tx
    }
  });

  // Calculate success rate
  stats.successRate = (successfulTxCount / stats.totalTrades) * 100;
  stats.failedTxCount = failedTxCount;
  
  // Calculate average gas per transaction
  stats.avgGasPerTx = stats.gasSpent / stats.totalTrades;

  // Calculate wallet score (0-100)
  stats.score = calculateScore(stats);

  // Round decimal values for cleaner display
  stats.pnl = parseFloat(stats.pnl.toFixed(4));
  stats.gasSpent = parseFloat(stats.gasSpent.toFixed(4));
  stats.avgGasPerTx = parseFloat(stats.avgGasPerTx.toFixed(6));
  stats.successRate = parseFloat(stats.successRate.toFixed(2));

  return stats;
}

/**
 * Calculate a score based on wallet stats
 * @param {Object} stats - Wallet statistics
 * @returns {number} Score between 0-100
 */
function calculateScore(stats) {
  // Base score
  let score = 50;
  
  // Activity score - more transactions = higher score
  const activityScore = Math.min(stats.totalTrades / 10, 20);
  score += activityScore;
  
  // PnL score
  if (stats.pnl > 0) {
    score += Math.min(stats.pnl * 2, 20); // Bonus for positive PnL (max +20)
  } else {
    score -= Math.min(Math.abs(stats.pnl), 20); // Penalty for negative PnL (max -20)
  }
  
  // Success rate score
  score += (stats.successRate - 90) / 2; // +5 for 100% success, -5 for 80% success
  
  // Gas efficiency score
  if (stats.avgGasPerTx < 0.001) {
    score += 5; // Very efficient
  } else if (stats.avgGasPerTx > 0.01) {
    score -= 5; // Very inefficient
  }
  
  // Ensure score is between 0-100
  return Math.max(0, Math.min(100, Math.floor(score)));
}

/**
 * Process transactions for frontend display
 * @param {Array} transactions - Raw transactions
 * @returns {Array} Processed transactions
 */
function processTransactionsForFrontend(transactions) {
  return transactions.slice(0, 10).map(tx => {
    // Extract key information for display
    const amount = tx.nativeTransfers ? 
      tx.nativeTransfers.reduce((sum, transfer) => sum + transfer.amount, 0) / 1e9 : 0;
    
    return {
      timestamp: tx.timestamp * 1000, // Convert to milliseconds
      type: tx.type || 'TRANSACTION',
      amount: amount,
      gas: tx.fee ? tx.fee / 1e9 : 0,
      successful: tx.successful || false,
      signature: tx.signature
    };
  });
}

/**
 * Generate a roast for a wallet based on stats
 * @param {string} address - Wallet address
 * @param {Object} stats - Wallet statistics
 * @returns {Promise<string>} Generated roast
 */
async function generateRoast(address, stats) {
  try {
    // Default roast if OpenAI is not available
    if (!process.env.OPENAI_API_KEY) {
      return getDefaultRoast(stats);
    }

    const prompt = `Generate a funny, sarcastic roast of this Solana wallet based on its statistics:
    - Wallet: ${address.slice(0, 6)}...${address.slice(-4)}
    - PnL: ${stats.pnl > 0 ? '+' : ''}${stats.pnl} SOL
    - Total Trades: ${stats.totalTrades}
    - Gas Spent: ${stats.gasSpent} SOL
    - Success Rate: ${stats.successRate}%
    - Failed Transactions: ${stats.failedTxCount}
    - NFT Mints: ${stats.mintCount}
    - Swaps: ${stats.swapCount}
    - First Activity: ${stats.firstActivityDate ? stats.firstActivityDate.toLocaleDateString() : 'N/A'}
    - Last Activity: ${stats.lastActivityDate ? stats.lastActivityDate.toLocaleDateString() : 'N/A'}
    
    The roast should be funny but not too mean, around 2-3 sentences, and include specific details from the wallet statistics.`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a hilarious crypto roast generator that creates short, witty, sarcastic roasts based on wallet statistics." },
        { role: "user", content: prompt }
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    const roast = response.choices[0].message.content.trim();
    return roast;
  } catch (error) {
    console.error('Error generating roast:', error);
    return getDefaultRoast(stats);
  }
}

/**
 * Get a default roast if OpenAI fails
 * @param {Object} stats - Wallet statistics
 * @returns {string} Default roast
 */
function getDefaultRoast(stats) {
  const roasts = [
    `This wallet has a PnL of ${stats.pnl} SOL - even a hamster with a trading wheel could do better.`,
    `Congrats on your ${stats.totalTrades} trades! Too bad quantity doesn't equal quality.`,
    `${stats.gasSpent} SOL on gas fees? You might as well have burned your money for warmth.`,
    `A ${stats.successRate}% success rate? My toaster has a better success rate at making toast.`,
    `I've seen more profitable strategies from someone throwing darts at a chart blindfolded.`
  ];
  
  // Pick a random roast
  return roasts[Math.floor(Math.random() * roasts.length)];
}

module.exports = {
  analyzeWallet
}; 