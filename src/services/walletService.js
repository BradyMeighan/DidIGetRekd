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
 * Fetch the current SOL price from CoinGecko API
 * @returns {Promise<number>} Current SOL price in USD
 */
async function fetchSolPrice() {
  try {
    console.log('Fetching current SOL price from CoinGecko...');
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    
    if (response.data && response.data.solana && response.data.solana.usd) {
      const price = response.data.solana.usd;
      console.log(`Current SOL price: $${price}`);
      return price;
    } else {
      console.log('Could not get SOL price from CoinGecko, using fallback price');
      return 125; // Fallback price if API fails
    }
  } catch (error) {
    console.error('Error fetching SOL price:', error.message);
    return 125; // Fallback price if API fails
  }
}

/**
 * Analyzes a wallet address and returns statistics
 * @param {string} address - The wallet address to analyze
 * @param {Object} options - Additional options
 * @returns {Object} Wallet statistics
 */
async function analyzeWallet(address, options = {}) {
  try {
    console.log(`Analyzing wallet: ${address} with options:`, options);
    
    // Fetch current SOL price
    const solPrice = await fetchSolPrice();
    
    // Check if we have the Helius API key
    if (!process.env.HELIUS_API_KEY) {
      console.log('HELIUS_API_KEY not set');
      return {
        stats: {
          address,
          error: "API_KEY_MISSING",
          message: "Helius API key is not configured"
        },
        roast: "Can't roast what I can't see. The Helius API key is missing."
      };
    }
    
    // Get comprehensive wallet data
    const walletData = await fetchWalletData(address);
    console.log('Wallet data retrieved:', Object.keys(walletData));
    
    // Always include at least the basic wallet info
    const baseStats = {
      address,
      nativeBalance: walletData.nativeBalance?.toFixed(4) || "0",
      totalTrades: 0,
      gasSpent: "0",
      successRate: 0,
      error: null,
      solPrice
    };
    
    // If no transactions found, return error state with basic balance info
    if (!walletData.signatures?.length && !walletData.transactions?.length) {
      console.log(`No transactions found for wallet ${address}`);
      
      // Still add token accounts if available
      const tokens = [];
      
      if (walletData.tokenAccounts?.length > 0) {
        // Add native SOL balance
        if (walletData.nativeBalance) {
          tokens.push({ 
            name: 'SOL', 
            amount: walletData.nativeBalance.toFixed(4), 
            value: (walletData.nativeBalance * solPrice).toFixed(2) // Use actual SOL price
          });
        }
        
        // Add token accounts
        walletData.tokenAccounts.forEach(acct => {
          if (acct.account?.data?.parsed?.info) {
            const tokenInfo = acct.account.data.parsed.info;
            const mint = tokenInfo.mint;
            const tokenAmount = tokenInfo.tokenAmount;
            
            if (tokenAmount && tokenAmount.uiAmount > 0) {
              tokens.push({
                name: mint.slice(0, 4) + '...',
                mint: mint,
                amount: tokenAmount.uiAmount.toString(),
                value: '?' // No price data
              });
            }
          }
        });
      }
      
      return {
        stats: {
          ...baseStats,
          tokens,
          // NFTs have been removed as they can't be accurately determined
          error: "NO_TRANSACTIONS",
          message: "No transactions found for this wallet"
        },
        roast: "This wallet is so inactive it makes a ghost town look busy. No transactions found!"
      };
    }
    
    // Calculate wallet stats (pass the SOL price)
    const stats = calculateWalletStats(walletData, solPrice);
    
    // Make sure the address is included
    stats.address = address;
    stats.solPrice = solPrice;
    
    // Generate a roast based on the stats
    const roast = await generateRoast(address, stats);
    
    return {
      stats,
      roast
    };
  } catch (error) {
    console.error(`Error analyzing wallet ${address}:`, error);
    
    return {
      stats: {
        address,
        error: "ANALYSIS_ERROR",
        message: error.message
      },
      roast: "Something went wrong analyzing this wallet. Maybe it's too embarrassed to show its transactions."
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
    const walletData = { address };
    
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
    } else {
      console.log('No SOL balance found or error in response:', balanceResponse.data);
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
      
      // Log the first token account for debugging
      if (walletData.tokenAccounts.length > 0) {
        console.log('Sample token account:', JSON.stringify(walletData.tokenAccounts[0]?.account?.data?.parsed?.info || {}, null, 2));
      }
    } else {
      console.log('No token accounts found or error in response:', tokenResponse.data);
    }
    
    // 3. PRIORITIZE: Get transaction signatures with getSignaturesForAddress
    // (this worked in the test when other methods failed)
    console.log('Fetching transaction signatures with getSignaturesForAddress...');
    let signaturesFound = false;
    
    try {
      const signaturesResponse = await axios.post(rpcUrl, {
        jsonrpc: "2.0",
        id: 3,
        method: "getSignaturesForAddress",
        params: [address, { limit: 50 }]
      });
      
      if (signaturesResponse.data?.result && signaturesResponse.data.result.length > 0) {
        walletData.signatures = signaturesResponse.data.result;
        signaturesFound = true;
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
              tx.signature = sigData.signature;
              
              // Extract transaction type and description from instructions
              if (tx.transaction?.message?.instructions) {
                const instructions = tx.transaction.message.instructions;
                let description = "";
                
                // Look for common instruction patterns
                for (const instruction of instructions) {
                  if (instruction.program === 'system') {
                    if (instruction.parsed?.type === 'transfer') {
                      const amount = instruction.parsed.info.lamports / 1000000000;
                      const source = instruction.parsed.info.source;
                      const destination = instruction.parsed.info.destination;
                      const isReceiving = destination === address;
                      
                      description = isReceiving 
                        ? `Received ${amount.toFixed(6)} SOL from ${source.slice(0, 4)}...`
                        : `Sent ${amount.toFixed(6)} SOL to ${destination.slice(0, 4)}...`;
                    }
                  }
                }
                
                // Set a default description if we couldn't determine one
                if (!description) {
                  description = tx.meta?.innerInstructions?.length > 0
                    ? "Complex Transaction"
                    : "SOL Transfer";
                }
                
                tx.description = description;
              }
              
              walletData.transactions.push(tx);
            }
          } catch (err) {
            console.error(`Error fetching transaction ${sigData.signature}:`, err.message);
          }
        }
        
        console.log(`Successfully retrieved ${walletData.transactions.length} transaction details`);
      } else {
        console.log('No transaction signatures found.');
      }
    } catch (error) {
      console.error('Error fetching transaction signatures:', error.message);
    }
    
    // 4. FALLBACK: If we didn't find signatures, try getConfirmedSignaturesForAddress2
    if (!signaturesFound) {
      try {
        console.log('Trying alternative getConfirmedSignaturesForAddress2...');
        const oldSigResponse = await axios.post(rpcUrl, {
          jsonrpc: "2.0",
          id: 5,
          method: "getConfirmedSignaturesForAddress2",
          params: [address, { limit: 50 }]
        });
        
        if (oldSigResponse.data?.result && oldSigResponse.data.result.length > 0) {
          walletData.signatures = oldSigResponse.data.result;
          signaturesFound = true;
          console.log(`Found ${walletData.signatures.length} signatures via fallback method`);
        } else {
          console.log('No signatures found via fallback method');
        }
      } catch (err) {
        console.error('Error with fallback signature method:', err.message);
      }
    }
    
    // 5. LAST RESORT: If we still don't have transactions, try Helius transactions endpoint
    if (!walletData.transactions || walletData.transactions.length === 0) {
      console.log('No transactions from RPC methods, trying Helius transactions endpoint...');
      try {
        const txUrl = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&limit=20`;
        const txResponse = await axios.get(txUrl);
        
        if (txResponse.data?.transactions && txResponse.data.transactions.length > 0) {
          walletData.transactions = txResponse.data.transactions;
          console.log(`Found ${walletData.transactions.length} transactions from Helius endpoint`);
        } else {
          console.log('No transactions found from Helius transactions endpoint either.');
        }
      } catch (err) {
        console.error('Error with Helius transactions endpoint:', err.message);
      }
    }
    
    return walletData;
  } catch (error) {
    console.error('Error fetching wallet data:', error.message);
    return { error: error.message };
  }
}

/**
 * Calculate wallet statistics from wallet data
 * @param {Object} walletData - Comprehensive wallet data
 * @param {number} solPrice - Current SOL price in USD
 * @returns {Object} - Wallet statistics
 */
function calculateWalletStats(walletData, solPrice) {
  console.log('Calculating wallet stats from data:', Object.keys(walletData));
  
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
      firstActivityDate = null;
      lastActivityDate = null;
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
    
    // Generate token holdings - start with SOL which is always accurate
    const tokens = [
      // SOL balance is reliable
      { name: 'SOL', amount: nativeBalance.toFixed(4), value: (nativeBalance * solPrice).toFixed(2) } // Use actual SOL price
    ];
    
    // Add token accounts if available
    if (walletData.tokenAccounts && walletData.tokenAccounts.length > 0) {
      console.log(`Processing ${walletData.tokenAccounts.length} token accounts for display`);
      
      // Process token accounts to add to the tokens array
      walletData.tokenAccounts.forEach((acct, index) => {
        try {
          if (acct.account?.data?.parsed?.info) {
            const tokenInfo = acct.account.data.parsed.info;
            const mint = tokenInfo.mint;
            const tokenAmount = tokenInfo.tokenAmount;
            
            // More detailed logging
            console.log(`Token account ${index}:`, {
              mint: mint,
              decimals: tokenAmount?.decimals,
              uiAmount: tokenAmount?.uiAmount,
              uiAmountString: tokenAmount?.uiAmountString
            });
            
            if (tokenAmount && parseFloat(tokenAmount.uiAmount) > 0) {
              // Use different naming strategies based on what we have
              let tokenName = mint.slice(0, 4) + '...';
              
              // Log the mint address for reference
              console.log(`Adding token with mint: ${mint} and amount: ${tokenAmount.uiAmount}`);
              
              tokens.push({
                name: tokenName,
                mint: mint,
                amount: tokenAmount.uiAmountString || tokenAmount.uiAmount.toString(),
                value: '?', // We don't have price data
                decimals: tokenAmount.decimals
              });
            } else {
              console.log(`Skipping zero balance token: ${mint}`);
            }
          }
        } catch (err) {
          console.error(`Error processing token account ${index}:`, err.message);
        }
      });
    }
    
    // Generate achievements
    const achievements = generateAchievements({
      score,
      totalTrades,
      successRate,
      totalGasSpent,
      nativeBalance
    });
    
    // Create summary stats for display
    const portfolioValue = nativeBalance * solPrice;
    const portfolioValueFormatted = portfolioValue.toFixed(2);
    
    return {
      address: walletData.address || "unknown",
      totalTrades,
      // Replace PnL with a different metric that we can calculate
      walletValue: portfolioValueFormatted,
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
      score: totalTrades > 0 ? score : null,
      // Visualization data
      txHistory,
      tokens,
      // Remove NFTs completely
      achievements: totalTrades > 0 ? achievements : [],
      solPrice
    };
  } catch (error) {
    console.error('Error calculating wallet stats:', error);
    console.error(error.stack);
    
    // Return basic information with error
    return {
      address: walletData.address || "unknown",
      nativeBalance: walletData.nativeBalance?.toFixed(4) || "0",
      error: "CALCULATION_ERROR",
      message: error.message
    };
  }
}

/**
 * Generate transaction history for the chart
 */
function generateTxHistory(signatures, transactions) {
  console.log(`Generating transaction history from ${signatures?.length || 0} signatures and ${transactions?.length || 0} transactions`);
  
  // Create a map for the last 30 days
  const txHistory = [];
  const now = new Date();
  const dayMap = new Map(); // To collect transaction counts by day
  
  // Generate empty day entries
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    
    const dayKey = date.toISOString().slice(0, 10); // YYYY-MM-DD format
    
    txHistory.push({
      day: i + 1,
      date: dayKey,
      value: 0,
      transactions: 0
    });
    
    // Initialize the day map
    dayMap.set(dayKey, { value: 0, transactions: 0 });
  }
  
  // Process all signatures to build the day map
  if (signatures && signatures.length > 0) {
    // Log a sample signature to understand format
    if (signatures.length > 0) {
      console.log('Sample signature for history generation:', JSON.stringify(signatures[0], null, 2));
    }
    
    signatures.forEach(sig => {
      if (!sig.blockTime) return;
      
      const txDate = new Date(sig.blockTime * 1000);
      if (isNaN(txDate.getTime())) return;
      
      // Log processing date
      console.log(`Processing signature from date: ${txDate.toISOString()}`);
      
      // Get the date part only
      const dayKey = txDate.toISOString().slice(0, 10);
      
      // Only count transactions from the last 30 days
      const diffTime = now - txDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays >= 0 && diffDays < 30) {
        // Update the day map
        if (dayMap.has(dayKey)) {
          const dayData = dayMap.get(dayKey);
          dayData.transactions++;
          
          // Positive value for successful tx, negative for failed
          if (sig.err) {
            dayData.value -= 0.5;
          } else {
            dayData.value += 0.5;
          }
          
          dayMap.set(dayKey, dayData);
        }
      }
    });
  } 
  // Fallback to transactions if available
  else if (transactions && transactions.length > 0) {
    // Log a sample transaction to understand format
    if (transactions.length > 0) {
      console.log('Sample transaction for history generation:', 
                  transactions[0].blockTime || transactions[0].timestamp);
    }
    
    transactions.forEach(tx => {
      // Try to get timestamp from blockTime first (RPC format) or timestamp (Helius format)
      const timestamp = tx.blockTime 
        ? new Date(tx.blockTime * 1000).toISOString() 
        : tx.timestamp;
      
      if (!timestamp) return;
      
      const txDate = new Date(timestamp);
      if (isNaN(txDate.getTime())) return;
      
      // Get the date part only
      const dayKey = txDate.toISOString().slice(0, 10);
      
      // Only count transactions from the last 30 days
      const diffTime = now - txDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays >= 0 && diffDays < 30) {
        // Update the day map
        if (dayMap.has(dayKey)) {
          const dayData = dayMap.get(dayKey);
          dayData.transactions++;
          
          // Positive value for successful tx, negative for failed
          if (tx.err || tx.meta?.err || !tx.successful) {
            dayData.value -= 0.5;
          } else {
            dayData.value += 0.5;
          }
          
          dayMap.set(dayKey, dayData);
        }
      }
    });
  }
  
  // Map the day data back to the txHistory array
  txHistory.forEach(day => {
    const dayData = dayMap.get(day.date);
    if (dayData) {
      day.value = parseFloat(dayData.value.toFixed(1));
      day.transactions = dayData.transactions;
      
      // Ensure value is between -3 and 3 for display purposes
      day.value = Math.max(-3, Math.min(3, day.value));
      
      // Ensure value is never zero if there are transactions
      // (this helps with chart visibility)
      if (day.transactions > 0 && day.value === 0) {
        day.value = 0.5;
      }
    }
  });
  
  // Log days that have transactions
  const daysWithTransactions = txHistory.filter(d => d.transactions > 0);
  console.log(`Generated transaction history with data: ${JSON.stringify(daysWithTransactions)}`);
  
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