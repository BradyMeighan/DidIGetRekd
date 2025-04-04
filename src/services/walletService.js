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
 * Analyzes a wallet address and returns statistics
 * @param {string} address - The wallet address to analyze
 * @param {Object} options - Additional options
 * @returns {Object} Wallet statistics
 */
async function analyzeWallet(address, options = {}) {
  try {
    console.log(`Analyzing wallet: ${address} with options:`, options);
    
    // Check if we have the Helius API key
    if (!process.env.HELIUS_API_KEY) {
      console.log('HELIUS_API_KEY not set, using mock data');
      const mockData = generateMockData(address);
      
      return {
        stats: mockData,
        roast: await generateRoast(address, mockData)
      };
    }
    
    // Fetch wallet transactions
    const transactions = await fetchWalletTransactions(address);
    
    if (!transactions || transactions.length === 0) {
      console.log(`No transactions found for wallet ${address}, using mock data`);
      const mockData = generateMockData(address);
      
      return {
        stats: mockData,
        roast: await generateRoast(address, mockData)
      };
    }
    
    console.log(`Found ${transactions.length} transactions for wallet ${address}`);
    
    // Calculate wallet stats
    const stats = calculateWalletStats(transactions);
    
    // Make sure the address is included
    stats.address = address;
    
    // Generate a roast based on the stats
    const roast = await generateRoast(address, stats);
    
    return {
      stats,
      roast
    };
  } catch (error) {
    console.error(`Error analyzing wallet ${address}:`, error);
    
    // Fallback to mock data
    const mockData = generateMockData(address);
    return {
      stats: mockData,
      roast: await generateRoast(address, mockData)
    };
  }
}

/**
 * Generates mock wallet data for testing
 */
function generateMockData(address) {
  const totalTrades = Math.floor(Math.random() * 50) + 5;
  const failedTxCount = Math.floor(totalTrades * Math.random() * 0.4);
  const successRate = totalTrades > 0 ? Math.round(((totalTrades - failedTxCount) / totalTrades) * 100) : 0;
  const gasSpent = (Math.random() * 0.5 + 0.05).toFixed(4);
  const avgGasPerTx = (parseFloat(gasSpent) / Math.max(1, totalTrades)).toFixed(6);
  
  // Generate transaction history for the last 30 days
  const txHistory = [];
  for (let i = 0; i < 30; i++) {
    txHistory.push({
      day: i + 1,
      value: (Math.random() * 2 - 1).toFixed(1),
      transactions: Math.floor(Math.random() * 5)
    });
  }
  
  // Generate token holdings
  const tokens = [
    { name: 'SOL', amount: Math.random() * 5 + 0.5, value: (Math.random() * 200 + 50).toFixed(2) },
    { name: 'BONK', amount: Math.random() * 100000 + 1000, value: (Math.random() * 50 + 10).toFixed(2) },
    { name: 'JUP', amount: Math.random() * 50 + 5, value: (Math.random() * 100 + 20).toFixed(2) }
  ];
  
  // Generate NFT holdings
  const nfts = [
    { name: 'DeGods', floor: 120, owned: Math.random() > 0.7 ? 1 : 0 },
    { name: 'Okay Bears', floor: 80, owned: Math.random() > 0.6 ? 1 : 0 },
    { name: 'Froganas', floor: 30, owned: Math.random() > 0.5 ? 1 : 0 }
  ];
  
  // Calculate score
  const score = calculateScore({
    totalTrades,
    successRate,
    avgGasPerTx: parseFloat(avgGasPerTx),
    transfersCount: Math.floor(totalTrades * 0.7),
    swapCount: Math.floor(totalTrades * 0.2),
    mintCount: Math.floor(totalTrades * 0.1)
  });
  
  // Generate achievements
  const achievements = generateAchievements({
    score,
    totalTrades,
    successRate,
    totalGasSpent: parseFloat(gasSpent),
    swapCount: Math.floor(totalTrades * 0.2)
  });
  
  return {
    address: address || "unknown",
    totalTrades,
    pnl: (Math.random() * 10 - 5).toFixed(2),
    gasSpent,
    successRate,
    avgGasPerTx,
    transfersCount: Math.floor(totalTrades * 0.7),
    swapCount: Math.floor(totalTrades * 0.2),
    mintCount: Math.floor(totalTrades * 0.1),
    failedTxCount,
    firstActivityDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    lastActivityDate: new Date().toISOString(),
    score,
    // Visualization data
    txHistory,
    tokens,
    nfts,
    achievements
  };
}

/**
 * Fetch wallet transactions from Helius API
 * @param {string} address - Wallet address
 * @returns {Promise<Array>} Transactions
 */
async function fetchWalletTransactions(address) {
  try {
    console.log(`Fetching transactions for wallet: ${address}`);
    console.log(`Using Helius API URL: ${HELIUS_API_URL}/${address}/transactions`);
    
    const response = await axios.get(
      `${HELIUS_API_URL}/${address}/transactions?api-key=${HELIUS_API_KEY}&limit=100`
    );
    
    console.log(`Helius API response status: ${response.status}`);
    
    if (response.data && Array.isArray(response.data)) {
      console.log(`Retrieved ${response.data.length} transactions for wallet: ${address}`);
      return response.data;
    }
    
    console.warn('Helius API returned non-array data:', response.data);
    return [];
  } catch (error) {
    console.error('Error fetching wallet transactions:', error);
    if (error.response) {
      console.error('Helius API error response:', {
        status: error.response.status,
        data: error.response.data
      });
    }
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
  console.log(`Calculating stats for ${transactions.length} transactions`);
  
  if (!transactions || transactions.length === 0) {
    return generateMockData();
  }
  
  try {
    // Sort transactions by time (most recent first)
    const sortedTxs = [...transactions].sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    // Get first and last activity dates
    const firstActivityDate = sortedTxs[sortedTxs.length - 1].timestamp;
    const lastActivityDate = sortedTxs[0].timestamp;
    
    // Count different transaction types
    let transfersCount = 0;
    let swapCount = 0;
    let mintCount = 0;
    let failedTxCount = 0;
    let totalGasSpent = 0;
    
    // Track success/failure
    transactions.forEach(tx => {
      // Count transaction types
      if (tx.type === 'TRANSFER') transfersCount++;
      if (tx.type === 'SWAP') swapCount++;
      if (tx.type === 'MINT' || tx.type === 'NFT_MINT') mintCount++;
      
      // Count failures
      if (!tx.successful) failedTxCount++;
      
      // Sum gas
      totalGasSpent += parseFloat(tx.fee || 0);
    });
    
    const totalTrades = transactions.length;
    const successCount = totalTrades - failedTxCount;
    const successRate = totalTrades > 0 ? Math.round((successCount / totalTrades) * 100) : 0;
    const avgGasPerTx = totalTrades > 0 ? (totalGasSpent / totalTrades) : 0;
    
    // Calculate a score based on activity
    let score = calculateScore({
      totalTrades,
      successRate,
      avgGasPerTx,
      transfersCount,
      swapCount,
      mintCount
    });
    
    // Generate transaction history for visualization (last 30 days)
    const txHistory = generateTxHistory(transactions);
    
    // Generate token holdings based on swaps and transfers
    const tokens = generateTokenHoldings(transactions);
    
    // Generate NFT holdings based on mints
    const nfts = generateNftHoldings(transactions);
    
    // Generate achievements based on stats
    const achievements = generateAchievements({
      score,
      totalTrades,
      successRate,
      totalGasSpent,
      swapCount
    });
    
    // Return stats object
    return {
      address: transactions[0]?.account || "unknown",
      totalTrades,
      pnl: calculatePnl(transactions),
      gasSpent: totalGasSpent.toFixed(4),
      successRate,
      avgGasPerTx: avgGasPerTx.toFixed(6),
      transfersCount,
      swapCount,
      mintCount,
      failedTxCount,
      firstActivityDate,
      lastActivityDate,
      score,
      // Visualization data
      txHistory,
      tokens,
      nfts, 
      achievements
    };
  } catch (error) {
    console.error('Error calculating wallet stats:', error);
    return generateMockData();
  }
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
  return transactions.slice(0, 10).map((tx, index) => {
    try {
      // Extract key information for display
      const amount = tx.nativeTransfers && tx.nativeTransfers.length > 0 ? 
        tx.nativeTransfers.reduce((sum, transfer) => sum + transfer.amount, 0) / 1e9 : 0;
      
      return {
        timestamp: tx.timestamp * 1000, // Convert to milliseconds
        type: tx.type || 'TRANSACTION',
        amount: amount,
        gas: tx.fee ? tx.fee / 1e9 : 0,
        successful: tx.successful || false,
        signature: tx.signature || `tx_${index}`
      };
    } catch (err) {
      console.error('Error processing transaction for frontend:', err);
      return {
        timestamp: Date.now() - (index * 60000),
        type: 'UNKNOWN',
        amount: 0,
        gas: 0,
        successful: false,
        signature: `error_${index}`
      };
    }
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
      console.warn('OPENAI_API_KEY is not set. Using default roast.');
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

    console.log('Calling OpenAI for roast generation');
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
    console.log('Roast generated successfully');
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

// Generate transaction history for the last 30 days
const generateTxHistory = (transactions) => {
  const txHistory = [];
  const now = new Date();
  
  // Create 30 days of data
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    
    // Find transactions for this day
    const dayTxs = transactions.filter(tx => {
      const txDate = new Date(tx.timestamp);
      return txDate.getDate() === date.getDate() && 
             txDate.getMonth() === date.getMonth() && 
             txDate.getFullYear() === date.getFullYear();
    });
    
    // Calculate day's value (can be positive or negative)
    const successfulTxs = dayTxs.filter(tx => tx.successful);
    const failedTxs = dayTxs.filter(tx => !tx.successful);
    
    // Simple formula: successful transactions are positive, failed are negative
    const value = (successfulTxs.length - failedTxs.length) / Math.max(1, dayTxs.length);
    
    txHistory.push({
      day: i + 1,
      value: parseFloat(value.toFixed(1)),
      transactions: dayTxs.length
    });
  }
  
  return txHistory;
};

// Generate token holdings based on transactions
const generateTokenHoldings = (transactions) => {
  // This is a simplification - in a real app, you'd analyze the actual token transfers
  const tokens = [
    { name: 'SOL', amount: Math.max(0.1, transactions.length / 10), value: (transactions.length * 5).toFixed(2) }
  ];
  
  // Add some tokens based on swap count
  const swapTxs = transactions.filter(tx => tx.type === 'SWAP');
  if (swapTxs.length > 0) {
    tokens.push({ name: 'BONK', amount: swapTxs.length * 10000, value: (swapTxs.length * 2).toFixed(2) });
  }
  
  if (swapTxs.length > 2) {
    tokens.push({ name: 'JUP', amount: swapTxs.length * 5, value: (swapTxs.length * 8).toFixed(2) });
  }
  
  return tokens;
};

// Generate NFT holdings
const generateNftHoldings = (transactions) => {
  const mintTxs = transactions.filter(tx => tx.type === 'MINT' || tx.type === 'NFT_MINT');
  
  // Default NFTs (always include these in the list)
  const nfts = [
    { name: 'DeGods', floor: 120, owned: mintTxs.length > 5 ? 1 : 0 },
    { name: 'Okay Bears', floor: 80, owned: mintTxs.length > 2 ? 1 : 0 },
    { name: 'Froganas', floor: 30, owned: mintTxs.length > 0 ? 2 : 0 }
  ];
  
  return nfts;
};

// Generate achievements based on stats
const generateAchievements = ({ score, totalTrades, successRate, totalGasSpent, swapCount }) => {
  const achievements = [];
  
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
  
  // Activity-based achievements
  if (totalGasSpent > 1.5) {
    achievements.push({ 
      title: 'Gas Guzzler 🛢️', 
      description: 'Funding validators one tx at a time.' 
    });
  }
  
  if (totalTrades > 100) {
    achievements.push({ 
      title: 'Degenerate Trader 🎰', 
      description: 'Sleep? Who needs that?' 
    });
  }
  
  if (successRate < 50) {
    achievements.push({
      title: 'Transaction Fumbler 🤦',
      description: 'Half your transactions failed. Have you tried turning it off and on again?'
    });
  }
  
  if (swapCount > 10) {
    achievements.push({
      title: 'Swap King 👑',
      description: 'You swap tokens more often than you change clothes.'
    });
  }
  
  return achievements;
};

// Calculate PnL (simplified - in a real app this would be much more complex)
const calculatePnl = (transactions) => {
  // This is a simplification - in a real app, you'd analyze the actual token transfers and their values
  // For now, just return a small random value based on transaction count
  const swapTxs = transactions.filter(tx => tx.type === 'SWAP');
  const successfulSwaps = swapTxs.filter(tx => tx.successful);
  
  // More successful swaps = higher chance of positive PnL
  const pnlFactor = (successfulSwaps.length / Math.max(1, swapTxs.length)) - 0.5;
  const pnl = pnlFactor * transactions.length * 0.2;
  
  return pnl.toFixed(2);
};

module.exports = {
  analyzeWallet,
  generateRoast
}; 