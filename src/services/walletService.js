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
    
    // Get comprehensive wallet data
    const walletData = await fetchWalletData(address);
    console.log('Wallet data retrieved:', Object.keys(walletData));
    
    // If no meaningful data found, use mock data
    if (!walletData || (!walletData.transactions?.length && !walletData.signatures?.length)) {
      console.log(`No transactions or signatures found for wallet ${address}, using mock data`);
      const mockData = generateMockData(address);
      
      return {
        stats: mockData,
        roast: await generateRoast(address, mockData)
      };
    }
    
    // Calculate wallet stats
    const stats = calculateWalletStats(walletData);
    
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
 * Fetch comprehensive wallet data from multiple Helius endpoints
 * @param {string} address - Wallet address
 * @returns {Object} Combined wallet data
 */
async function fetchWalletData(address) {
  try {
    const apiKey = process.env.HELIUS_API_KEY;
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
    const walletData = {};
    
    // 1. Get SOL balance
    console.log('Fetching SOL balance...');
    const balanceResponse = await axios.post(rpcUrl, {
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [address]
    });
    
    if (balanceResponse.data?.result?.value) {
      // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
      walletData.nativeBalance = balanceResponse.data.result.value / 1000000000;
      console.log(`Native SOL balance: ${walletData.nativeBalance} SOL`);
    }
    
    // 2. Get token accounts
    console.log('Fetching token accounts...');
    const tokenResponse = await axios.post(rpcUrl, {
      jsonrpc: "2.0",
      id: 2,
      method: "getTokenAccountsByOwner",
      params: [
        address,
        { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
        { encoding: "jsonParsed" }
      ]
    });
    
    if (tokenResponse.data?.result?.value) {
      walletData.tokenAccounts = tokenResponse.data.result.value;
      console.log(`Found ${walletData.tokenAccounts.length} token accounts`);
    }
    
    // 3. Get transaction signatures (more reliable than transactions endpoint)
    console.log('Fetching transaction signatures...');
    const signaturesResponse = await axios.post(rpcUrl, {
      jsonrpc: "2.0",
      id: 3,
      method: "getSignaturesForAddress",
      params: [address, { limit: 50 }]
    });
    
    if (signaturesResponse.data?.result) {
      walletData.signatures = signaturesResponse.data.result;
      console.log(`Found ${walletData.signatures.length} transaction signatures`);
      
      // Get full transaction details for the 10 most recent transactions
      const transactionsToFetch = walletData.signatures.slice(0, 10);
      console.log(`Fetching details for ${transactionsToFetch.length} recent transactions...`);
      
      walletData.transactions = [];
      
      for (const sigData of transactionsToFetch) {
        try {
          const txResponse = await axios.post(rpcUrl, {
            jsonrpc: "2.0",
            id: 4,
            method: "getTransaction",
            params: [
              sigData.signature,
              { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }
            ]
          });
          
          if (txResponse.data?.result) {
            // Add more easily accessible metadata
            const tx = txResponse.data.result;
            tx.blockTime = tx.blockTime || sigData.blockTime;
            tx.timestamp = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null;
            tx.successful = sigData.err === null;
            tx.fee = tx.meta?.fee || 0;
            
            walletData.transactions.push(tx);
          }
        } catch (err) {
          console.error(`Error fetching transaction ${sigData.signature}:`, err.message);
        }
      }
      
      console.log(`Successfully retrieved ${walletData.transactions.length} transaction details`);
    }
    
    // 4. If we couldn't get transaction details via RPC, try Helius transactions endpoint
    if (!walletData.transactions || walletData.transactions.length === 0) {
      console.log('No transactions from RPC, trying Helius transactions endpoint...');
      const txUrl = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&limit=20`;
      const txResponse = await axios.get(txUrl);
      
      if (txResponse.data?.transactions) {
        walletData.transactions = txResponse.data.transactions;
        console.log(`Found ${walletData.transactions.length} transactions from Helius endpoint`);
      }
    }
    
    return walletData;
  } catch (error) {
    console.error('Error fetching wallet data:', error.message);
    return {};
  }
}

/**
 * Calculate wallet statistics from wallet data
 * @param {Object} walletData - Comprehensive wallet data
 * @returns {Object} - Wallet statistics
 */
function calculateWalletStats(walletData) {
  console.log('Calculating wallet stats from data:', Object.keys(walletData));
  
  if (!walletData || (!walletData.transactions?.length && !walletData.signatures?.length)) {
    return generateMockData();
  }
  
  try {
    // Use signatures for count and timestamps if available
    const signatures = walletData.signatures || [];
    const transactions = walletData.transactions || [];
    
    // Get native SOL balance
    const nativeBalance = walletData.nativeBalance || 0;
    
    // Calculate total tx count from signatures (more accurate)
    const totalTrades = signatures.length;
    
    // Count failed transactions
    const failedTxCount = signatures.filter(sig => sig.err !== null).length;
    
    // Count transaction types based on available data
    let transfersCount = 0;
    let swapCount = 0;
    let mintCount = 0;
    let totalGasSpent = 0;
    
    // Calculate gas fees and identify transaction types from available transaction data
    transactions.forEach(tx => {
      // Calculate gas fees from transaction data
      if (tx.meta?.fee) {
        totalGasSpent += tx.meta.fee / 1000000000; // Convert lamports to SOL
      } else if (tx.fee) {
        totalGasSpent += tx.fee / 1000000000; // Alternative format
      }
      
      // Try to determine transaction type
      const description = tx.description || '';
      const instructions = tx.transaction?.message?.instructions || [];
      
      if (description.toLowerCase().includes('transfer') || 
          instructions.some(i => i.program === 'system' && i.parsed?.type === 'transfer')) {
        transfersCount++;
      } else if (description.toLowerCase().includes('swap')) {
        swapCount++;
      } else if (description.toLowerCase().includes('mint') || 
                instructions.some(i => i.program === 'spl-token' && i.parsed?.type === 'mintTo')) {
        mintCount++;
      }
    });
    
    // Get first and last activity dates
    let firstActivityDate, lastActivityDate;
    
    if (signatures.length > 0) {
      // Most recent is first in the array
      lastActivityDate = new Date(signatures[0].blockTime * 1000).toISOString();
      
      // Oldest is last in the array
      firstActivityDate = new Date(signatures[signatures.length - 1].blockTime * 1000).toISOString();
    } else if (transactions.length > 0) {
      // Sort by timestamp for safety
      const sortedTxs = [...transactions].sort((a, b) => {
        return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
      });
      
      lastActivityDate = sortedTxs[0].timestamp || new Date().toISOString();
      firstActivityDate = sortedTxs[sortedTxs.length - 1].timestamp || new Date().toISOString();
    } else {
      firstActivityDate = new Date().toISOString();
      lastActivityDate = new Date().toISOString();
    }
    
    // Calculate success rate
    const successfulTxCount = totalTrades - failedTxCount;
    const successRate = totalTrades > 0 ? Math.round((successfulTxCount / totalTrades) * 100) : 0;
    
    // Calculate average gas per transaction
    const avgGasPerTx = totalTrades > 0 ? (totalGasSpent / totalTrades) : 0;
    
    // Calculate score
    const score = calculateScore({
      totalTrades,
      successRate,
      avgGasPerTx,
      nativeBalance
    });
    
    // Generate transaction history
    const txHistory = generateTxHistory(signatures, transactions);
    
    // Generate token holdings
    const tokens = [
      // SOL balance is reliable
      { name: 'SOL', amount: nativeBalance.toFixed(4), value: (nativeBalance * 20).toFixed(2) } // use $20 as example price
    ];
    
    // Add token accounts if available
    if (walletData.tokenAccounts && walletData.tokenAccounts.length > 0) {
      // Process token accounts to add to the tokens array
      walletData.tokenAccounts.forEach(acct => {
        if (acct.account?.data?.parsed?.info) {
          const tokenInfo = acct.account.data.parsed.info;
          const mint = tokenInfo.mint;
          const tokenAmount = tokenInfo.tokenAmount;
          
          if (tokenAmount && tokenAmount.uiAmount > 0) {
            tokens.push({
              name: mint.slice(0, 4) + '...',  // Use first few chars of mint address
              amount: tokenAmount.uiAmount.toString(),
              value: '?' // We don't have price data
            });
          }
        }
      });
    }
    
    // Generate NFT placeholder (we don't have reliable NFT data)
    const nfts = [
      { name: 'NFT Collection', floor: 0, owned: walletData.tokenAccounts?.length > 5 ? 1 : 0 }
    ];
    
    // Generate achievements
    const achievements = generateAchievements({
      score,
      totalTrades,
      successRate,
      totalGasSpent,
      nativeBalance
    });
    
    return {
      address: walletData.address || "unknown",
      totalTrades,
      // PnL can't be accurately determined without historical price data
      pnl: "Unknown",
      nativeBalance: nativeBalance.toFixed(4),
      gasSpent: totalGasSpent.toFixed(6),
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
 * Generate transaction history for the chart
 */
function generateTxHistory(signatures, transactions) {
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
  
  // Use signatures first (more reliable)
  if (signatures && signatures.length > 0) {
    signatures.forEach(sig => {
      if (!sig.blockTime) return;
      
      const txDate = new Date(sig.blockTime * 1000);
      if (isNaN(txDate.getTime())) return;
      
      // Only count transactions from the last 30 days
      const diffTime = now - txDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays >= 0 && diffDays < 30) {
        const dayIndex = 29 - diffDays;
        
        txHistory[dayIndex].transactions++;
        
        // Positive value for successful tx, negative for failed
        if (sig.err) {
          txHistory[dayIndex].value -= 0.5;
        } else {
          txHistory[dayIndex].value += 0.5;
        }
      }
    });
  } 
  // Fallback to transactions if available
  else if (transactions && transactions.length > 0) {
    transactions.forEach(tx => {
      const timestamp = tx.timestamp || (tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null);
      if (!timestamp) return;
      
      const txDate = new Date(timestamp);
      if (isNaN(txDate.getTime())) return;
      
      // Only count transactions from the last 30 days
      const diffTime = now - txDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays >= 0 && diffDays < 30) {
        const dayIndex = 29 - diffDays;
        
        txHistory[dayIndex].transactions++;
        
        // Positive value for successful tx, negative for failed
        if (tx.err || tx.meta?.err || !tx.successful) {
          txHistory[dayIndex].value -= 0.5;
        } else {
          txHistory[dayIndex].value += 0.5;
        }
      }
    });
  }
  
  // Format values and ensure they're not too extreme
  txHistory.forEach(day => {
    day.value = parseFloat(day.value.toFixed(1));
    // Clamp between -3 and 3 for reasonable display
    day.value = Math.max(-3, Math.min(3, day.value));
  });
  
  return txHistory;
}

/**
 * Calculate a wallet score based on various metrics
 */
function calculateScore(stats) {
  // Balanced scoring algorithm
  let score = 50; // Start at a neutral score
  
  // More transactions = higher score (20% of total)
  if (stats.totalTrades > 100) score += 15;
  else if (stats.totalTrades > 50) score += 10;
  else if (stats.totalTrades > 10) score += 5;
  
  // Higher success rate = higher score (20% of total)
  if (stats.successRate > 95) score += 15;
  else if (stats.successRate > 90) score += 10;
  else if (stats.successRate > 80) score += 5;
  else if (stats.successRate < 70) score -= 5;
  else if (stats.successRate < 50) score -= 10;
  
  // Gas efficiency (10% of total)
  if (stats.avgGasPerTx < 0.0005) score += 10;
  else if (stats.avgGasPerTx > 0.001) score -= 5;
  
  // SOL balance (10% of total)
  if (stats.nativeBalance > 10) score += 10;
  else if (stats.nativeBalance > 1) score += 5;
  
  // Cap the score between 0 and 100
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Generate achievements based on wallet stats
 */
function generateAchievements({ score, totalTrades, successRate, totalGasSpent, nativeBalance }) {
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
  
  // SOL balance achievements
  if (nativeBalance > 10) {
    achievements.push({ 
      title: 'SOL Whale 🐳', 
      description: `Holding ${nativeBalance.toFixed(2)} SOL.` 
    });
  }
  
  // Activity achievements
  if (totalGasSpent > 0.5) {
    achievements.push({ 
      title: 'Gas Guzzler 🛢️', 
      description: `Spent ${totalGasSpent.toFixed(4)} SOL on gas fees.` 
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