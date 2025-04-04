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
 * Fetches wallet transactions from Helius API
 * @param {string} address - Wallet address to fetch transactions for
 * @returns {Promise<Array>} - Array of transactions
 */
async function fetchWalletTransactions(address) {
  try {
    const apiKey = process.env.HELIUS_API_KEY;
    
    if (!apiKey) {
      console.warn('HELIUS_API_KEY is not set, cannot fetch transactions');
      return [];
    }
    
    console.log(`Fetching transactions for wallet: ${address}`);
    
    // Use the Helius API to get transactions
    const txUrl = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}`;
    console.log(`Using Helius transactions API: ${txUrl}`);
    const txResponse = await axios.get(txUrl);
    
    // Log a sample transaction to understand the data structure
    if (txResponse.data?.transactions?.length > 0) {
      console.log('Sample transaction structure:');
      console.log(JSON.stringify(txResponse.data.transactions[0], null, 2));
    }
    
    // Also get the balance using RPC
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
    const rpcResponse = await axios.post(rpcUrl, {
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [address]
    });
    console.log('RPC balance response:', rpcResponse.data);
    
    // Return the transactions
    return txResponse.data?.transactions || [];
  } catch (error) {
    console.error('Error fetching transactions from Helius:', error.message);
    return [];
  }
}

/**
 * Calculate wallet statistics from transactions
 * @param {Array} transactions - Array of wallet transactions
 * @returns {Object} - Wallet statistics
 */
function calculateWalletStats(transactions) {
  console.log(`Calculating stats for ${transactions.length} transactions`);
  
  if (!transactions || transactions.length === 0) {
    return generateMockData();
  }
  
  try {
    // Log a sample transaction for debugging
    if (transactions.length > 0) {
      console.log('Sample transaction for stat calculation:');
      console.log(JSON.stringify(transactions[0], null, 2));
    }
    
    // Sort transactions by time (most recent first)
    const sortedTxs = [...transactions].sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    // Initialize counters
    let totalTrades = transactions.length;
    let transfersCount = 0;
    let swapCount = 0;
    let mintCount = 0;
    let failedTxCount = 0;
    let totalGasSpent = 0;
    
    // Process each transaction
    transactions.forEach(tx => {
      // Count transaction types based on what we can determine
      if (tx.description?.includes('transfer') || tx.description?.includes('Transfer')) {
        transfersCount++;
      } else if (tx.description?.includes('swap') || tx.description?.includes('Swap')) {
        swapCount++;
      } else if (tx.description?.includes('mint') || tx.description?.includes('Mint')) {
        mintCount++;
      }
      
      // Count failed transactions
      if (tx.status === 'failed' || tx.successful === false) {
        failedTxCount++;
      }
      
      // Calculate gas fees - CRITICAL FIX: Convert lamports to SOL
      if (tx.fee) {
        // Convert from lamports to SOL (1 SOL = 1,000,000,000 lamports)
        totalGasSpent += tx.fee / 1000000000;
      }
    });
    
    // Define date range
    const firstActivityDate = sortedTxs[sortedTxs.length - 1]?.timestamp || new Date().toISOString();
    const lastActivityDate = sortedTxs[0]?.timestamp || new Date().toISOString();
    
    // Calculate success rate
    const successfulTxCount = totalTrades - failedTxCount;
    const successRate = totalTrades > 0 ? Math.round((successfulTxCount / totalTrades) * 100) : 0;
    
    // Calculate average gas per transaction
    const avgGasPerTx = totalTrades > 0 ? (totalGasSpent / totalTrades) : 0;
    
    // Calculate score (simplified)
    const score = calculateScore({
      totalTrades,
      successRate,
      avgGasPerTx
    });
    
    // Generate transaction history for visualization
    const txHistory = generateTxHistory(transactions);
    
    // Generate simplified token holdings (we can't reliably determine this from transaction history)
    const tokens = [
      { name: 'SOL', amount: Math.max(0.1, totalTrades / 20).toFixed(2), value: (totalTrades * 2).toFixed(2) }
    ];
    
    // Generate simplified NFT holdings (also can't reliably determine)
    const nfts = [
      { name: 'NFT Collection', floor: 0, owned: mintCount > 0 ? 1 : 0 }
    ];
    
    // Generate achievements
    const achievements = generateAchievements({
      score,
      totalTrades,
      successRate,
      totalGasSpent,
      swapCount
    });
    
    return {
      address: transactions[0]?.account || transactions[0]?.address || "unknown",
      totalTrades,
      // PnL can't be accurately determined from transaction history alone
      pnl: "Unknown",
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
    console.error(error.stack);
    return generateMockData();
  }
}

/**
 * Calculate a wallet score based on various metrics
 */
function calculateScore(stats) {
  // Simplified scoring algorithm
  let score = 50; // Start at a neutral score
  
  // More transactions = higher score
  if (stats.totalTrades > 100) score += 15;
  else if (stats.totalTrades > 50) score += 10;
  else if (stats.totalTrades > 10) score += 5;
  
  // Higher success rate = higher score
  if (stats.successRate > 95) score += 15;
  else if (stats.successRate > 90) score += 10;
  else if (stats.successRate > 80) score += 5;
  else if (stats.successRate < 70) score -= 5;
  else if (stats.successRate < 50) score -= 10;
  
  // Gas efficiency
  if (stats.avgGasPerTx < 0.0005) score += 10;
  else if (stats.avgGasPerTx > 0.001) score -= 5;
  
  // Cap the score between 0 and 100
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Generate transaction history for the chart
 */
function generateTxHistory(transactions) {
  // Create a map for the last 30 days
  const txHistory = [];
  const now = new Date();
  
  // Generate empty day entries
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    
    txHistory.push({
      day: i + 1,
      value: 0,
      transactions: 0
    });
  }
  
  // Fill in with real transaction data if available
  transactions.forEach(tx => {
    const txDate = new Date(tx.timestamp);
    if (isNaN(txDate.getTime())) return; // Skip invalid dates
    
    // Only count transactions from the last 30 days
    const diffTime = now - txDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays >= 0 && diffDays < 30) {
      const dayIndex = 29 - diffDays;
      
      txHistory[dayIndex].transactions++;
      
      // Positive value for successful tx, negative for failed
      if (tx.status === 'failed' || tx.successful === false) {
        txHistory[dayIndex].value -= 0.5;
      } else {
        txHistory[dayIndex].value += 0.5;
      }
    }
  });
  
  // Format values
  txHistory.forEach(day => {
    day.value = parseFloat(day.value.toFixed(1));
  });
  
  return txHistory;
}

/**
 * Generate simplified token holdings (we can't get accurate token data from Helius transactions history)
 */
function generateSimplifiedTokenHoldings(transactions, totalTrades) {
  // We don't have accurate data for token holdings, so we'll make a simplified estimate
  return [
    { 
      name: 'SOL', 
      amount: Math.max(0.1, totalTrades / 20).toFixed(2), 
      value: (totalTrades * 2).toFixed(2) 
    }
  ];
}

/**
 * Generate simplified NFT holdings (not possible to accurately determine from Helius)
 */
function generateSimplifiedNFTs(mintCount) {
  return [
    { name: 'NFT Collection', floor: 0, owned: mintCount > 0 ? 1 : 0 }
  ];
}

/**
 * Generate achievements based on wallet stats
 */
function generateAchievements({ score, totalTrades, successRate, totalGasSpent }) {
  const achievements = [];
  
  // Score-based achievements
  if (score < 30) {
    achievements.push({ 
      title: 'Rug Victim 🫠', 
      description: 'Wallet shows signs of unsuccessful transactions.' 
    });
  } else if (score < 60) {
    achievements.push({ 
      title: 'Paper Hands 🧻', 
      description: 'A cautious trader or still learning the ropes.' 
    });
  } else if (score < 90) {
    achievements.push({ 
      title: 'Diamond Hands 💎🙌', 
      description: 'Holds through thick and thin.' 
    });
  } else {
    achievements.push({ 
      title: 'Giga Chad Ape 🦍', 
      description: 'An experienced trader with high success rates.' 
    });
  }
  
  // Activity achievements
  if (totalGasSpent > 0.5) {
    achievements.push({ 
      title: 'Gas Guzzler 🛢️', 
      description: `Spent ${totalGasSpent.toFixed(2)} SOL on gas fees.` 
    });
  }
  
  if (totalTrades > 50) {
    achievements.push({ 
      title: 'Active Trader 🎰', 
      description: `Made ${totalTrades} transactions on Solana.` 
    });
  }
  
  if (successRate < 80) {
    achievements.push({
      title: 'Transaction Fumbler 🤦',
      description: `${100-successRate}% of your transactions failed. Maybe check your settings?`
    });
  }
  
  return achievements;
}

/**
 * Generate a roast based on wallet statistics
 */
async function generateRoast(address, stats) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return getDefaultRoast(stats);
    }
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Convert stats to readable format for OpenAI
    const walletPreview = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Unknown";
    const gasSpent = stats.gasSpent || "Unknown";
    const totalTrades = stats.totalTrades || 0;
    const successRate = stats.successRate || 0;
    
    const prompt = `Generate a funny, sarcastic roast of this Solana wallet:
      - Address: ${walletPreview}
      - Gas Spent: ${gasSpent} SOL
      - Total Transactions: ${totalTrades}
      - Success Rate: ${successRate}%
      
      The roast should be funny but not too mean, about 1-2 sentences, and include specific details from the wallet stats.`;
      
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a hilarious crypto roast generator that creates short, witty, sarcastic roasts based on wallet statistics." },
        { role: "user", content: prompt }
      ],
      max_tokens: 100,
      temperature: 0.7
    });
    
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating roast:', error);
    return getDefaultRoast(stats);
  }
}

/**
 * Get a default roast when OpenAI is unavailable
 */
function getDefaultRoast(stats) {
  const roasts = [
    `${stats.gasSpent} SOL spent on gas fees? You might as well have burned your money for warmth.`,
    `A ${stats.successRate}% success rate? My toaster has a better success rate at making toast.`,
    `${stats.totalTrades} transactions and what do you have to show for it? Not much, apparently.`,
    `This wallet has more failed transactions than a beginner's cooking attempts.`,
    `Congratulations on your ${stats.totalTrades} trades! Too bad quantity doesn't equal quality.`
  ];
  
  // Try to pick a relevant roast based on stats
  if (parseFloat(stats.gasSpent) > 1) {
    return roasts[0];
  } else if (stats.successRate < 80) {
    return roasts[1];
  } else if (stats.totalTrades > 50) {
    return roasts[2];
  }
  
  // Otherwise, pick a random one
  return roasts[Math.floor(Math.random() * roasts.length)];
}

module.exports = {
  analyzeWallet,
  generateRoast
}; 