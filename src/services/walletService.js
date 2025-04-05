const axios = require('axios');
const OpenAI = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize Helius API client
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_API_URL = `https://api.helius.xyz/v0/addresses`;

// Cache for SOL price to limit API calls
const solPriceCache = {
  price: null,
  timestamp: null
};

// Add these constants at the top of the file
const HELIUS_RATE_LIMIT = 10; // Lower the rate limit to 10 requests per second
const MAX_RETRIES = 5; // Increase max retries to 5
const INITIAL_RETRY_DELAY = 2000; // Increase initial delay to 2 seconds
const BATCH_SIZE = 5; // Reduce batch size to 5 transactions

/**
 * Helper function to add delay between API calls
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} Promise that resolves after delay
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper function to make API calls with better retry logic
 * @param {Function} apiCall - Function that returns a promise
 * @param {number} retries - Number of retries remaining
 * @param {number} delay - Current delay between retries
 * @returns {Promise} Result of API call
 */
async function makeApiCallWithRetry(apiCall, retries = MAX_RETRIES, delay = INITIAL_RETRY_DELAY) {
  try {
    return await apiCall();
  } catch (error) {
    console.log(`API call failed with error: ${error.message}, status: ${error.response?.status}`);
    
    // Check for rate limiting (429) or server errors (500+)
    if ((error.response?.status === 429 || error.response?.status >= 500) && retries > 0) {
      const waitTime = error.response?.status === 429 ? delay : delay / 2; // Longer delay for rate limits
      console.log(`Request failed with status ${error.response?.status}, retrying in ${waitTime}ms... (${retries} retries left)`);
      await sleep(waitTime);
      return makeApiCallWithRetry(apiCall, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * Fetch the current SOL price from CoinGecko
 * @returns {Promise<number>} - Current SOL price
 */
async function fetchSolPrice() {
  try {
    // Check cache first - only fetch new price if the cached price is older than 1 hour
    const now = Date.now();
    const oneHourMs = 60 * 60 * 1000;
    
    if (solPriceCache.price && solPriceCache.timestamp && (now - solPriceCache.timestamp < oneHourMs)) {
      console.log(`Using cached SOL price: $${solPriceCache.price} (cached ${Math.floor((now - solPriceCache.timestamp) / 60000)} minutes ago)`);
      return solPriceCache.price;
    }
    
    console.log('Fetching fresh SOL price from CoinGecko');
    const apiKey = process.env.COINGECKO_API_KEY;
    
    // Configure headers and URL based on API key
    const headers = {};
    
    // For demo API keys, use the regular API URL, not the pro-api URL
    // Demo keys start with 'CG-' prefix
    const isProKey = apiKey && !apiKey.startsWith('CG-');
    const baseUrl = isProKey ? 'https://pro-api.coingecko.com' : 'https://api.coingecko.com';
    
    if (apiKey) {
      console.log(`Using CoinGecko API key (${isProKey ? 'Pro' : 'Demo'} key detected)`);
      headers['x-cg-pro-api-key'] = apiKey;
    }
    
    const url = `${baseUrl}/api/v3/simple/price?ids=solana&vs_currencies=usd`;
    console.log(`Using CoinGecko URL: ${url}`);
    
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    if (data && data.solana && data.solana.usd) {
      // Update cache
      solPriceCache.price = data.solana.usd;
      solPriceCache.timestamp = now;
      
      console.log('Updated SOL price cache:', solPriceCache.price);
      return data.solana.usd;
    } else {
      console.error('Unexpected CoinGecko response:', data);
      
      // If we have a cached price, return that even if it's old
      if (solPriceCache.price) {
        console.log('Using outdated cached price as fallback');
        return solPriceCache.price;
      }
      
      // Last resort fallback
      return 100; // Default value if API fails
    }
  } catch (error) {
    console.error('Error fetching SOL price:', error);
    
    // Use cached price if available
    if (solPriceCache.price) {
      console.log('Using cached price due to API error');
      return solPriceCache.price;
    }
    
    return 100; // Default fallback value
  }
}

/**
 * Analyze a wallet address
 * @param {string} address - The wallet address to analyze
 * @param {Object} options - Analysis options
 * @returns {Object} Analysis results
 */
async function analyzeWallet(address, options = {}) {
  try {
    console.log(`Analyzing wallet: ${address}`);
    console.log('Options:', options);
    
    // Validate wallet address
    if (!address || !isValidSolanaAddress(address)) {
      console.error(`Invalid Solana address: ${address}`);
      return {
        stats: {
          error: 'INVALID_ADDRESS',
          message: 'Invalid Solana address format',
          address
        },
        roast: "I can't roast what I can't read. That address looks like someone mashed their keyboard."
      };
    }
    
    // Check if we have the Helius API key before fetching data
    if (!process.env.HELIUS_API_KEY) {
      console.log('HELIUS_API_KEY not set');
      return {
        stats: {
          error: "API_KEY_MISSING",
          message: "Helius API key is not configured",
          address
        },
        roast: "I would roast your wallet, but I can't even see it. Talk to the admin about setting up the API keys."
      };
    }
    
    // Fetch wallet data
    const walletData = await fetchWalletData(address);
    
    // Check if we got an error from the data fetching
    if (walletData.error) {
      console.error(`Error fetching wallet data: ${walletData.error}`);
      
      // Return a more specific error to the frontend
      return {
        stats: {
          error: walletData.error === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'API_ERROR',
          message: walletData.message || `Error fetching wallet data: ${walletData.error}`,
          address
        },
        roast: walletData.error === 'INSUFFICIENT_DATA'
          ? "This wallet is emptier than my bank account after a Solana NFT drop."
          : "I tried to analyze this wallet, but the blockchain said 'nope'. Try again later when the RPC gods are in a better mood."
      };
    }
    
    try {
      // Add a small delay to ensure all API calls have completed
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Fetch current SOL price with error handling
      let solPrice = 0;
      try {
        solPrice = await fetchSolPrice();
        console.log(`Current SOL price: $${solPrice}`);
      } catch (priceError) {
        console.error(`Error fetching SOL price: ${priceError.message}`);
        // Use fallback price if needed
        solPrice = 100;
        console.log(`Using fallback SOL price: $${solPrice}`);
      }
      
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
      if ((!walletData.signatures || walletData.signatures.length === 0) && 
          (!walletData.transactions || walletData.transactions.length === 0)) {
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
      const statsForRoast = {
        ...stats,
        // Ensure accurate transaction count by checking multiple sources
        totalTrades: stats.totalTrades || walletData.signatures?.length || walletData.transactions?.length || 0
      };
      console.log('Using stats for roast:', {
        totalTrades: statsForRoast.totalTrades,
        success_rate: statsForRoast.successRate,
        native_balance: statsForRoast.nativeBalance
      });
      
      // Generate roast with error handling
      let roast = "";
      try {
        roast = await generateRoast(walletData, statsForRoast);
      } catch (roastError) {
        console.error(`Error generating roast: ${roastError.message}`);
        roast = "I was gonna roast your wallet, but it looks like it's already been burned.";
      }
      
      // Generate achievements
      const achievements = generateAchievements(walletData);
      
      // Try to save to leaderboard but don't fail if it doesn't work
      try {
        await saveWalletToLeaderboard(address, walletData, stats, roast);
      } catch (leaderboardError) {
        console.error(`Error saving to leaderboard: ${leaderboardError.message}`);
      }
      
      return {
        stats,
        roast,
        achievements
      };
    } catch (analysisError) {
      console.error(`Error analyzing wallet data: ${analysisError.message}`);
      return {
        stats: {
          error: "ANALYSIS_ERROR",
          message: `Error analyzing wallet data: ${analysisError.message}`,
          address,
          nativeBalance: walletData.nativeBalance?.toFixed(4) || "0"
        },
        roast: "I tried to analyze this wallet but apparently it's too complicated for my tiny AI brain."
      };
    }
  } catch (error) {
    console.error(`Error analyzing wallet ${address}:`, error);
    
    // Return error with detailed information
    return {
      stats: {
        error: "SERVER_ERROR",
        message: `Server error: ${error.message}`,
        address
      },
      roast: "Something went wrong on our end. Our servers are getting rekt harder than your portfolio probably is."
    };
  }
}

/**
 * Validate a Solana address
 * @param {string} address - Address to validate
 * @returns {boolean} Whether the address is valid
 */
function isValidSolanaAddress(address) {
  // Basic validation - Solana addresses are 32-44 characters long and base58 encoded
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
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
    
    // 1. Get current SOL balance with retry
    console.log('Fetching SOL balance...');
    try {
      const balanceResponse = await makeApiCallWithRetry(async () => 
        axios.post(rpcUrl, {
          jsonrpc: "2.0",
          id: 1,
          method: "getBalance",
          params: [address]
        })
      );
      
      if (balanceResponse.data?.result?.value) {
        // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
        walletData.nativeBalance = balanceResponse.data.result.value / 1000000000;
        console.log(`Native SOL balance: ${walletData.nativeBalance} SOL`);
      }
    } catch (error) {
      console.error('Error fetching SOL balance:', error.message);
      // Continue even if balance fetch fails
      walletData.nativeBalance = 0;
    }

    // Initialize balance history array
    walletData.balanceHistory = [];
    
    // 2. Get transaction signatures with getSignaturesForAddress with retry
    console.log('Fetching transaction signatures...');
    try {
      const signaturesResponse = await makeApiCallWithRetry(async () => 
        axios.post(rpcUrl, {
          jsonrpc: "2.0",
          id: 3,
          method: "getSignaturesForAddress",
          params: [address, { limit: 50 }] // Reduced from 100 to 50 to avoid rate limits
        })
      );
      
      if (signaturesResponse.data?.result && signaturesResponse.data.result.length > 0) {
        walletData.signatures = signaturesResponse.data.result;
        console.log(`Found ${walletData.signatures.length} transaction signatures`);
        
        // Get full transaction details for historical balance tracking
        // Limit to 20 most recent transactions to avoid too many API calls
        const transactionsToFetch = walletData.signatures.slice(0, 20);
        console.log(`Will fetch details for ${transactionsToFetch.length} transactions...`);
        
        walletData.transactions = [];
        
        // Process transactions in smaller batches with more time between batches
        for (let i = 0; i < transactionsToFetch.length; i += BATCH_SIZE) {
          const batch = transactionsToFetch.slice(i, i + BATCH_SIZE);
          console.log(`Processing batch ${i/BATCH_SIZE + 1} of ${Math.ceil(transactionsToFetch.length/BATCH_SIZE)}`);
          
          // Process each transaction in the batch
          const batchPromises = batch.map(sigData => 
            makeApiCallWithRetry(async () => {
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
                const tx = txResponse.data.result;
                
                // Add metadata and balance info
                tx.blockTime = tx.blockTime || sigData.blockTime;
                tx.timestamp = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null;
                tx.successful = sigData.err === null;
                tx.fee = tx.meta?.fee || 0;
                tx.signature = sigData.signature;
                
                // Extract postBalance in SOL
                if (tx.meta?.postBalances && tx.meta.postBalances.length > 0) {
                  const accountIndex = tx.transaction.message.accountKeys.findIndex(key => key.pubkey === address || key === address);
                  if (accountIndex !== -1 && tx.meta.postBalances[accountIndex]) {
                    tx.postBalance = tx.meta.postBalances[accountIndex] / 1000000000; // Convert lamports to SOL
                    
                    // Add to balance history
                    walletData.balanceHistory.push({
                      timestamp: tx.timestamp,
                      balance: tx.postBalance,
                      signature: tx.signature
                    });
                  }
                }
                
                // Add a simple description
                tx.description = tx.meta?.innerInstructions?.length > 0 
                  ? "Complex Transaction" 
                  : "SOL Transaction";
                
                return tx;
              }
              return null;
            })
          );
          
          try {
            // Wait for all transactions in the batch to complete
            const batchResults = await Promise.all(batchPromises);
            const validResults = batchResults.filter(tx => tx !== null);
            console.log(`Successfully processed ${validResults.length}/${batch.length} transactions in batch`);
            walletData.transactions.push(...validResults);
          } catch (error) {
            console.error(`Error processing batch: ${error.message}`);
            // Continue with next batch
          }
          
          // Add longer delay between batches to avoid rate limits
          if (i + BATCH_SIZE < transactionsToFetch.length) {
            console.log(`Waiting 3 seconds before next batch...`);
            await sleep(3000); // 3 second delay between batches
          }
        }
        
        // Sort balance history by timestamp
        walletData.balanceHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        console.log(`Successfully retrieved ${walletData.transactions.length} transaction details`);
        console.log(`Balance history points: ${walletData.balanceHistory.length}`);
      }
    } catch (error) {
      console.error('Error fetching transaction signatures:', error.message);
      // Continue with other data even if transaction fetch fails
      walletData.signatures = [];
      walletData.transactions = [];
    }
    
    // 3. Get token accounts with retry
    console.log('Fetching token accounts...');
    try {
      const tokenResponse = await makeApiCallWithRetry(async () => 
        axios.post(rpcUrl, {
          jsonrpc: "2.0",
          id: 2,
          method: "getTokenAccountsByOwner",
          params: [
            address,
            { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
            { encoding: "jsonParsed" }
          ]
        })
      );
      
      if (tokenResponse.data?.result?.value) {
        walletData.tokenAccounts = tokenResponse.data.result.value;
        console.log(`Found ${walletData.tokenAccounts.length} token accounts`);
      } else {
        console.log('No token accounts found or error in response');
        walletData.tokenAccounts = [];
      }
    } catch (error) {
      console.error('Error fetching token accounts:', error.message);
      // Continue with minimal data even if token fetch fails
      walletData.tokenAccounts = [];
    }
    
    // Handle case where we have no transactions or signatures
    if ((!walletData.transactions || walletData.transactions.length === 0) && 
        (!walletData.signatures || walletData.signatures.length === 0)) {
      console.log('No transactions found through RPC methods');
      
      // First fallback: Try getConfirmedSignaturesForAddress2
      try {
        console.log('Trying getConfirmedSignaturesForAddress2 as fallback...');
        const confirmedResponse = await makeApiCallWithRetry(async () => 
          axios.post(rpcUrl, {
            jsonrpc: "2.0",
            id: 5,
            method: "getConfirmedSignaturesForAddress2",
            params: [address, { limit: 20 }]
          })
        );
        
        if (confirmedResponse.data?.result && confirmedResponse.data.result.length > 0) {
          console.log(`Found ${confirmedResponse.data.result.length} confirmed signatures`);
          walletData.signatures = confirmedResponse.data.result;
          // Since we found signatures, we would process them but we'll skip that here
          // to avoid code duplication
        }
      } catch (error) {
        console.error('Error with getConfirmedSignaturesForAddress2:', error.message);
      }
      
      // Second fallback: Try Helius transactions endpoint
      if (!walletData.signatures || walletData.signatures.length === 0) {
        try {
          console.log('Trying Helius transactions endpoint as last resort...');
          const txUrl = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&limit=10`;
          const txResponse = await makeApiCallWithRetry(async () => axios.get(txUrl));
          
          if (txResponse.data?.transactions && txResponse.data.transactions.length > 0) {
            walletData.transactions = txResponse.data.transactions;
            console.log(`Found ${walletData.transactions.length} transactions from Helius endpoint`);
          } else {
            console.log('No transactions found from Helius transactions endpoint either.');
          }
        } catch (error) {
          console.error('Error with Helius transactions endpoint:', error.message);
        }
      }
    }
    
    // Validate we have minimal data
    if (!walletData.nativeBalance && 
        (!walletData.balanceHistory || walletData.balanceHistory.length === 0) && 
        (!walletData.transactions || walletData.transactions.length === 0)) {
      console.error('Insufficient data retrieved for wallet analysis');
      return { 
        error: 'INSUFFICIENT_DATA', 
        message: 'Could not retrieve sufficient data to analyze this wallet'
      };
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
function calculateWalletStats(walletData, solPrice = 100) {
  try {
    console.log('Calculating wallet stats from data:', Object.keys(walletData));
    console.log(`Using SOL price from CoinGecko: $${solPrice}`);
    
    // Extract relevant data
    const address = walletData.address;
    const nativeBalance = walletData.nativeBalance || 0;
    const signatures = walletData.signatures || [];
    const transactions = walletData.transactions || [];
    const tokenAccounts = walletData.tokenAccounts || [];
    const balanceHistory = walletData.balanceHistory || [];
    
    // Calculate time-based PnL metrics
    const now = new Date();
    const timeRanges = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '1mo': 30 * 24 * 60 * 60 * 1000,
      '3mo': 90 * 24 * 60 * 60 * 1000
    };
    
    const pnlMetrics = {};
    
    // Calculate PnL for each time range
    Object.entries(timeRanges).forEach(([range, ms]) => {
      const cutoffDate = new Date(now.getTime() - ms);
      const relevantBalances = balanceHistory.filter(point => 
        new Date(point.timestamp) >= cutoffDate
      );
      
      if (relevantBalances.length > 0) {
        const startBalance = relevantBalances[0].balance;
        const endBalance = nativeBalance; // Current balance
        const pnlPercent = ((endBalance - startBalance) / startBalance) * 100;
        
        pnlMetrics[range] = {
          startBalance,
          endBalance,
          pnlPercent: pnlPercent.toFixed(2),
          startDate: relevantBalances[0].timestamp,
          endDate: now.toISOString()
        };
      }
    });
    
    // Calculate all-time PnL if we have historical data
    if (balanceHistory.length > 0) {
      const firstBalance = balanceHistory[0].balance;
      const pnlPercent = ((nativeBalance - firstBalance) / firstBalance) * 100;
      
      pnlMetrics.allTime = {
        startBalance: firstBalance,
        endBalance: nativeBalance,
        pnlPercent: pnlPercent.toFixed(2),
        startDate: balanceHistory[0].timestamp,
        endDate: now.toISOString()
      };
    }
    
    // Group balance history by time periods for charting
    const timeGroups = {};
    Object.entries(timeRanges).forEach(([range, ms]) => {
      const cutoffDate = new Date(now.getTime() - ms);
      const relevantPoints = balanceHistory
        .filter(point => new Date(point.timestamp) >= cutoffDate)
        .map(point => ({
          timestamp: point.timestamp,
          balance: point.balance,
          pnlPercent: ((point.balance - balanceHistory[0].balance) / balanceHistory[0].balance) * 100
        }));
      
      timeGroups[range] = relevantPoints;
    });
    
    // All-time balance history
    timeGroups.allTime = balanceHistory.map(point => ({
      timestamp: point.timestamp,
      balance: point.balance,
      pnlPercent: ((point.balance - balanceHistory[0].balance) / balanceHistory[0].balance) * 100
    }));

    // Calculate transaction metrics
    let totalTrades = signatures.length;
    let failedTxCount = 0;
    let totalGasSpent = 0;
    let swapCount = 0;
    let transfersCount = 0;
    let mintCount = 0;
    
    // Parse transaction details from full transaction data if available
    if (transactions.length > 0) {
      transactions.forEach(tx => {
        if (tx.err || tx.meta?.err || !tx.successful) {
          failedTxCount++;
        }
        
        // Add gas spent (in SOL)
        if (tx.fee || tx.meta?.fee) {
          totalGasSpent += (tx.fee || tx.meta?.fee) / 1000000000; // Convert lamports to SOL
        }
        
        // Try to identify transaction type
        const description = tx.description || '';
        
        // Extract more info from instructions if available
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
    }
    
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
    
    // Calculate account age in days
    let accountAgeDays = 0;
    if (firstActivityDate) {
      const firstDate = new Date(firstActivityDate);
      const now = new Date();
      const diffTime = Math.abs(now - firstDate);
      accountAgeDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    
    // Calculate average transactions per day
    const txPerDay = accountAgeDays > 0 ? (totalTrades / accountAgeDays) : 0;
    
    // Get token holdings
    const tokens = [];
    
    // Add SOL balance
    if (nativeBalance) {
      tokens.push({ 
        name: 'SOL', 
        amount: parseFloat(nativeBalance).toFixed(4), 
        value: (nativeBalance * solPrice).toFixed(2) 
      });
    }
    
    // Add any token accounts with balances
    if (tokenAccounts && tokenAccounts.length > 0) {
      tokenAccounts.forEach((acct, index) => {
        try {
          if (acct.account?.data?.parsed?.info) {
            const tokenInfo = acct.account.data.parsed.info;
            const mint = tokenInfo.mint;
            const tokenAmount = tokenInfo.tokenAmount;
            
            if (tokenAmount && tokenAmount.uiAmount > 0) {
              tokens.push({
                name: mint.slice(0, 4) + '...',
                mint: mint,
                amount: tokenAmount.uiAmount.toString(),
                value: '?' // Would need a price oracle for non-SOL tokens
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
    
    // Format transactions for display in the table
    let recentTransactions = [];
    if (transactions && transactions.length > 0) {
      recentTransactions = transactions.map(tx => {
        // Try to extract the amount from the transaction
        let amount = "--";
        
        // Check if we have a parsed transfer in the transaction
        if (tx.transaction?.message?.instructions) {
          tx.transaction.message.instructions.forEach(instruction => {
            if (instruction.program === 'system' && instruction.parsed?.type === 'transfer') {
              const lamports = instruction.parsed.info.lamports;
              amount = (lamports / 1000000000).toFixed(4); // Convert lamports to SOL without adding SOL text
            }
          });
        }
        
        // If we couldn't find an amount but have a description with an amount, extract it
        if (amount === "--" && tx.description && tx.description.includes("SOL")) {
          const match = tx.description.match(/(\d+\.\d+) SOL/);
          if (match && match[1]) {
            amount = match[1]; // Just the number, without adding SOL text again
          }
        }
        
        // Add SOL label only once at the end - check if it already has SOL
        if (amount !== "--") {
          if (!amount.toString().includes('SOL')) {
            amount = `${amount} SOL`;
          }
        }
        
        return {
          description: tx.description || 'Transaction',
          signature: tx.signature || null,
          timestamp: tx.timestamp || (tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null),
          successful: tx.successful !== undefined ? tx.successful : (tx.err === null),
          fee: tx.fee || tx.meta?.fee || 0,
          amount: amount
        };
      });
    }
    
    // Generate achievements with additional metrics
    const achievements = generateAchievements({
      score: calculateScore({
        totalTrades,
        successRate, 
        avgGasPerTx,
        nativeBalance,
        accountAgeDays,
        txPerDay
      }),
      totalTrades,
      successRate, 
      totalGasSpent,
      nativeBalance,
      accountAgeDays,
      txPerDay,
      swapCount,
      transfersCount,
      mintCount,
      tokens: tokens.length
    });
    
    // Generate transaction history data
    const txHistory = generateTransactionHistory(signatures, transactions);
    
    // Calculate wallet value using the SOL price from CoinGecko
    const portfolioValue = nativeBalance * solPrice;
    const portfolioValueFormatted = portfolioValue.toFixed(2);
    console.log(`Calculated wallet value: ${nativeBalance} SOL × $${solPrice} = $${portfolioValueFormatted}`);

    return {
      address: walletData.address || "unknown",
      nativeBalance: parseFloat(nativeBalance).toFixed(4),
      totalTrades,
      gasSpent: totalGasSpent.toFixed(6),
      successRate,
      solPrice,
      firstActivityDate,
      lastActivityDate,
      accountAgeDays,
      score: calculateScore({
        totalTrades,
        successRate, 
        avgGasPerTx,
        nativeBalance,
        accountAgeDays,
        txPerDay
      }),
      avgGasPerTx: avgGasPerTx.toFixed(6),
      walletValue: portfolioValueFormatted,
      tokens,
      pnlMetrics,
      balanceHistory: timeGroups,
      swapCount,
      transfersCount,
      mintCount,
      achievements,
      recentTransactions, // Add this to ensure we include recent transactions
    };
  } catch (error) {
    console.error('Error calculating wallet stats:', error);
    return {
      error: true,
      message: 'Error calculating wallet statistics: ' + error.message
    };
  }
}

/**
 * Generate transaction history for the chart
 */
function generateTransactionHistory(signatures, transactions) {
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

// Function to safely check if an object is a valid array
function isValidArray(obj) {
  return Array.isArray(obj) && obj !== null;
}

/**
 * Generate achievements based on wallet data
 * @param {Object} walletData - The wallet data
 * @returns {Array} List of achievements
 */
function generateAchievements(walletData) {
  try {
    const achievements = [];
    
    // Ensure walletData exists
    if (!walletData) {
      console.error('Cannot generate achievements: walletData is undefined');
      return [];
    }
    
    // Get the wallet age if we have transaction history
    let walletAge = 0;
    let activityGap = 0;
    let consecutiveDays = 0;
    
    // Check if signatures is a valid array
    if (isValidArray(walletData.signatures) && walletData.signatures.length > 0) {
      try {
        // Sort signatures by block time (oldest first)
        const sortedSignatures = [...walletData.signatures].sort((a, b) => {
          return a.blockTime - b.blockTime;
        });
        
        // Calculate wallet age in days
        const firstTxTime = new Date(sortedSignatures[0].blockTime * 1000);
        const now = new Date();
        walletAge = Math.floor((now - firstTxTime) / (1000 * 60 * 60 * 24));
        
        // Check for activity gaps
        if (sortedSignatures.length > 1) {
          let maxGap = 0;
          for (let i = 1; i < sortedSignatures.length; i++) {
            const gap = sortedSignatures[i].blockTime - sortedSignatures[i-1].blockTime;
            const gapDays = Math.floor(gap / (60 * 60 * 24));
            if (gapDays > maxGap) {
              maxGap = gapDays;
            }
          }
          activityGap = maxGap;
          
          // Check for consecutive days of activity
          const txDates = sortedSignatures.map(sig => {
            const date = new Date(sig.blockTime * 1000);
            return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
          });
          
          // Count consecutive days
          const uniqueDates = [...new Set(txDates)].sort();
          let maxConsecutive = 1;
          let current = 1;
          
          for (let i = 1; i < uniqueDates.length; i++) {
            const prevDate = new Date(uniqueDates[i-1]);
            const currDate = new Date(uniqueDates[i]);
            
            const diffTime = Math.abs(currDate - prevDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
              current++;
              maxConsecutive = Math.max(maxConsecutive, current);
            } else {
              current = 1;
            }
          }
          
          consecutiveDays = maxConsecutive;
        }
      } catch (error) {
        console.error('Error calculating wallet age:', error);
      }
    }
    
    // Account Age achievements
    if (walletAge > 730) { // 2 years
      achievements.push({ 
        title: 'OG Wallet 🧓', 
        description: 'Wallet age is over 2 years old'
      });
    } else if (walletAge < 30) {
      achievements.push({ 
        title: 'Fresh Wallet 👶', 
        description: 'Wallet created in the last 30 days'
      });
    }
    
    // Activity achievements
    if (activityGap > 180) { // 6 months
      achievements.push({ 
        title: 'Hibernator 💤', 
        description: 'No transactions for 6+ months at some point'
      });
    }
    
    if (consecutiveDays >= 7) {
      achievements.push({ 
        title: 'Non-Stop 🔄', 
        description: `Transactions ${consecutiveDays} days in a row`
      });
    }
    
    // Transaction count achievements
    const txCount = walletData.totalTrades || 0;
    
    if (txCount > 100) {
      achievements.push({ 
        title: 'Degenerate Trader 🎰', 
        description: `Made ${txCount} trades in total`
      });
    } else if (txCount > 50) {
      achievements.push({ 
        title: 'Active Trader 📊', 
        description: `Made ${txCount} trades in total`
      });
    }
    
    // Gas fees achievements
    const gasSpent = parseFloat(walletData.gasSpent || 0);
    
    // Only give Gas Guzzler if more than 1 SOL spent on gas
    if (gasSpent > 1) {
      achievements.push({ 
        title: 'Gas Guzzler 🔥', 
        description: `Spent ${gasSpent.toFixed(2)} SOL on fees alone`
      });
    }
    
    // Calculate gas per transaction accurately
    if (txCount > 0) {
      const gasPerTx = gasSpent / txCount;
      
      // Debug log to see what's happening
      console.log(`Gas per tx calculation: ${gasSpent} SOL / ${txCount} txs = ${gasPerTx.toFixed(6)} SOL per tx`);
      
      // Only give Penny Pincher if gas per transaction is very low AND we have real transactions
      if (gasPerTx < 0.0001 && txCount >= 5) {
        achievements.push({ 
          title: 'Penny Pincher 💰', 
          description: `Averaged ${gasPerTx.toFixed(6)} SOL per transaction`
        });
      }
    }
    
    // Wallet value achievements in USD
    const solPrice = parseFloat(walletData.solPrice || 100);
    const nativeBalance = parseFloat(walletData.nativeBalance || 0);

    // Calculate wallet value directly from SOL balance × price
    const walletValueUsd = nativeBalance * solPrice;

    console.log(`Achievement wallet value calculation: ${nativeBalance} SOL × $${solPrice} = $${walletValueUsd.toFixed(2)}`);

    // Only give Penny Pincher achievement if wallet has very low SOL balance
    // This takes precedence over the gas-based check above
    if (nativeBalance > 0 && nativeBalance < 0.1) {
      // Replace any existing Penny Pincher achievement
      const pennyPincherIndex = achievements.findIndex(a => a.title === 'Penny Pincher 💰');
      if (pennyPincherIndex >= 0) {
        achievements.splice(pennyPincherIndex, 1);
      }
      
      achievements.push({ 
        title: 'Penny Pincher 💰', 
        description: `Wallet balance is only ${nativeBalance.toFixed(4)} SOL ($${walletValueUsd.toFixed(2)})`
      });
    } else if (nativeBalance >= 1) {
      // Remove Penny Pincher achievement if wallet has significant SOL
      const pennyPincherIndex = achievements.findIndex(a => a.title === 'Penny Pincher 💰');
      if (pennyPincherIndex >= 0) {
        achievements.splice(pennyPincherIndex, 1);
      }
    }

    if (walletValueUsd > 10000) {
      achievements.push({ 
        title: 'Whale Alert 🐋', 
        description: `Wallet value exceeds $10,000 (Current: $${walletValueUsd.toFixed(2)})`
      });
    } else if (walletValueUsd < 100 && walletValueUsd > 0) {
      achievements.push({ 
        title: 'Shrimp 🦐', 
        description: `Wallet value under $100 (Current: $${walletValueUsd.toFixed(2)})`
      });
    }
    
    // Token variety achievements
    const tokenCount = isValidArray(walletData.tokens) ? walletData.tokens.length : 0;
    
    if (tokenCount > 10) {
      achievements.push({ 
        title: 'Token Collector 🪙', 
        description: `Holds ${tokenCount} different tokens`
      });
    }
    
    // Check for meme tokens - ensure tokens is an array first
    const memeTokens = ['BONK', 'SLERF', 'WIF', 'SNEK'];
    let hasMultipleMemeTokens = false;
    
    if (isValidArray(walletData.tokens)) {
      try {
        const memeTokensFound = walletData.tokens.filter(token => 
          token && token.name && memeTokens.some(meme => 
            token.name.toString().toUpperCase().includes(meme)
          )
        );
        hasMultipleMemeTokens = memeTokensFound.length >= 2;
      } catch (error) {
        console.error('Error checking for meme tokens:', error);
        hasMultipleMemeTokens = false;
      }
    }
    
    if (hasMultipleMemeTokens) {
      achievements.push({ 
        title: 'Meme Lord 👑', 
        description: 'Holds multiple meme tokens'
      });
    }
    
    // Portfolio balance achievements - ensure tokens is an array first
    let solBalance = 0;
    let hasStablecoins = false;

    if (isValidArray(walletData.tokens)) {
      try {
        // Find SOL token
        const solToken = walletData.tokens.find(t => t && t.name === 'SOL');
        if (solToken && solToken.amount) {
          solBalance = parseFloat(solToken.amount) || 0;
        }
        
        // Check for stablecoins
        const stablecoins = ['USDC', 'USDT', 'DAI', 'TUSD'];
        hasStablecoins = walletData.tokens.some(token => 
          token && token.name && stablecoins.some(stable => 
            token.name.toString().toUpperCase().includes(stable)
          )
        );
      } catch (error) {
        console.error('Error checking token portfolio:', error);
      }
    }

    if (hasStablecoins) {
      achievements.push({ 
        title: 'Stablecoin Lover 💲', 
        description: 'Holds stablecoins as part of portfolio'
      });
    }
    
    // Trading pattern achievements based on wallet score
    let tradingPattern = '';
    let tradingDescription = '';
    
    // Only assign achievements if there are actual transactions
    if (txCount > 0) {
      if (walletData.score < 30) {
        tradingPattern = 'Rug Victim 🫠';
        tradingDescription = 'Looks like you bought high and sold low. Classic.';
      } else if (walletData.score < 60) {
        tradingPattern = 'Paper Hands 🧻';
        tradingDescription = 'Selling at the first sign of trouble';
      } else if (walletData.score < 90) {
        tradingPattern = 'Diamond Hands 💎🙌';
        tradingDescription = 'HODL is your middle name';
      } else {
        tradingPattern = 'Giga Chad Ape 🦍';
        tradingDescription = 'The wolf of Solana Street';
      }
      
      achievements.push({ 
        title: tradingPattern, 
        description: tradingDescription
      });
    }
    
    // Make sure we're not giving hibernator achievement incorrectly
    if (activityGap > 180 && txCount > 5) { // Only if they actually have a history of transactions
      achievements.push({ 
        title: 'Hibernator 💤', 
        description: 'No transactions for 6+ months at some point'
      });
    }
    
    // Make sure we only give transaction-based achievements if they actually have transactions
    if (gasSpent > 1 && txCount > 5) {
      achievements.push({ 
        title: 'Gas Guzzler 🔥', 
        description: `Spent ${gasSpent.toFixed(2)} SOL on fees alone`
      });
    }
    
    return achievements;
  } catch (error) {
    console.error('Error generating achievements:', error);
    return [];
  }
}

/**
 * Generate a roast for a wallet based on its data
 * @param {Object} walletData - The wallet data
 * @param {Object} additionalStats - Additional validated stats
 * @returns {Promise<string>} The roast
 */
async function generateRoast(walletData, additionalStats = {}) {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiApiKey) {
    console.log("OpenAI API key not set. Using fallback roast generator.");
    
    // Array of generic roast messages
    const fallbackRoasts = [
      "This wallet is more mysterious than the Solana whitepaper - even I can't tell what's happening here.",
      "Your wallet is too unique to roast properly. Is that a good thing? I'll let you decide.",
      "I'd roast this wallet, but I'd need an API key for that. Consider this a lucky escape.",
      "No roast available right now. Consider your wallet... un-roastable.",
      "Unable to generate a personalized roast at this time. Your wallet remains un-judged... for now."
    ];
    
    // Return a random roast from the fallback array
    return fallbackRoasts[Math.floor(Math.random() * fallbackRoasts.length)];
  }
  
  try {
    const openai = new OpenAI({
      apiKey: openaiApiKey
    });
    
    // First log what we're working with
    console.log('Raw data for roast:', {
      address: walletData.address?.substring(0, 10) + '...',
      hasStats: !!walletData.stats,
      statsKeys: walletData.stats ? Object.keys(walletData.stats) : [],
      totalTrades: walletData.totalTrades,
      stats_totalTrades: walletData.stats?.totalTrades,
      additionalStats_totalTrades: additionalStats?.totalTrades
    });
    
    // Safely extract the wallet address
    const walletPreview = walletData.address ? `${walletData.address.slice(0, 6)}...${walletData.address.slice(-4)}` : "Unknown";
    
    // Use additionalStats as priority, then fall back to normal extraction
    // Extract all values, with explicit fallbacks and parse as numbers
    const totalTrades = parseInt(additionalStats.totalTrades || walletData.stats?.totalTrades || walletData.totalTrades || 0);
    const successRate = parseInt(additionalStats.successRate || walletData.stats?.successRate || walletData.successRate || 0);
    const nativeBalance = parseFloat(additionalStats.nativeBalance || walletData.stats?.nativeBalance || walletData.nativeBalance || 0);
    
    // Log what we're actually using
    console.log('Final transaction data for roast:', {
      totalTrades,
      successRate,
      nativeBalance
    });
    
    // Get SOL price directly from sources that have it
    let solPrice;
    if (additionalStats.solPrice && !isNaN(parseFloat(additionalStats.solPrice))) {
      solPrice = parseFloat(additionalStats.solPrice);
      console.log(`Using SOL price from additionalStats: $${solPrice}`);
    } else if (walletData.stats?.solPrice && !isNaN(parseFloat(walletData.stats.solPrice))) {
      solPrice = parseFloat(walletData.stats.solPrice);
      console.log(`Using SOL price from walletData.stats: $${solPrice}`);
    } else if (walletData.solPrice && !isNaN(parseFloat(walletData.solPrice))) {
      solPrice = parseFloat(walletData.solPrice);
      console.log(`Using SOL price from walletData: $${solPrice}`);
    } else {
      // Fallback to cached price or default
      const cachedPrice = solPriceCache.price;
      solPrice = cachedPrice || 100;
      console.log(`Using fallback SOL price: $${solPrice}`);
    }
    
    // Calculate wallet value from native balance and SOL price
    const walletValueUsd = nativeBalance * solPrice;
    
    console.log('Roast data:', {
      totalTrades,
      successRate,
      nativeBalance,
      solPrice,
      walletValueUsd: walletValueUsd.toFixed(2)
    });
    
    // Create a thorough prompt for better roasts
    const prompt = `ROAST THIS WALLET WITH STREET/HOOD SLANG:

WALLET DATA:
- SOL Balance: ${Math.floor(nativeBalance)} SOL (worth $${walletValueUsd.toFixed(2)})
- Total Transactions: ${totalTrades}

KEEP IT 100 WITH THESE INSTRUCTIONS:
- Talk like you from the hood - use slang like "no cap", "bussin", "fr fr", "on god", "drippy", etc.
- Use ACTUAL wallet stats in your roast - don't make up fake numbers
- This wallet got ${Math.floor(nativeBalance)} SOL worth $${walletValueUsd.toFixed(2)}
- This wallet made ${totalTrades} transactions
- If they broke, flame them for it
- If they got paper hands or panic sold, clown them
- If they holding bags, roast them about it
- Talk about them buying high and selling low if they losing
- Keep it mad disrespectful but funny af

THE ROAST SHOULD SOUND LIKE IT'S COMING FROM A STREET-SMART CRYPTO GANGSTA. 
USE AUTHENTIC-SOUNDING STREET SLANG BUT MAKE SURE IT'S STILL UNDERSTANDABLE.
LIMIT RESPONSES TO 2-3 SENTENCES MAX.`;
    
    // Use the right model for better roasts 
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Use the best model for humor
      messages: [
        { 
          role: "system", 
          content: "You are ThugRoastGPT, a hardcore street-smart crypto roaster from the hood. You talk with raw street slang, use terms like 'no cap', 'fr fr', 'bussin', 'sus', etc. Your roasts are SAVAGE and use actual wallet data to flame people. You sound like a mix of a drill rapper and crypto trader. Keep your roasts short, disrespectful but hilariously accurate. NEVER break character. LIMIT responses to 2-3 sentences MAXIMUM."
        },
        { role: "user", content: prompt }
      ],
      max_tokens: 150,
      temperature: 1.0, // Maximum creativity
      top_p: 0.95, // Slightly constrained sampling
      frequency_penalty: 0.5, // Penalize repetition
      presence_penalty: 0.5 // Encourage diversity
    });
    
    // Return the roast
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error generating roast:", error);
    return "Something went wrong while trying to roast your wallet. Maybe it's too hot to handle?";
  }
}

/**
 * Generate fake wallet data for testing or when errors occur
 * @param {string} address - The wallet address
 * @returns {Object} Fake wallet data
 */
function generateFakeData(address) {
  console.log(`Generating fake data for ${address} (FOR DEVELOPMENT USE ONLY)`);
  
  // Use the address string to create deterministic but random-seeming data
  const seed = address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const random = (min, max) => {
    const x = Math.sin(seed * 9999) * 10000;
    const rand = x - Math.floor(x);
    return Math.floor(rand * (max - min + 1)) + min;
  };
  
  // Generate basic stats
  const score = random(0, 100);
  const nativeBalance = (random(1, 50) / 10).toFixed(4);
  const solPrice = 125;
  const walletValue = (parseFloat(nativeBalance) * solPrice).toFixed(2);
  const totalTrades = random(10, 500);
  const gasSpent = (random(5, 300) / 100).toFixed(2);
  
  // Transaction history - last 30 days
  const txHistory = Array.from({ length: 30 }, (_, i) => ({
    day: i + 1,
    date: new Date(Date.now() - (29-i) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    value: random(-20, 30) / 10,
    transactions: random(0, 15)
  }));
  
  // Tokens
  const tokens = [
    { name: 'SOL', amount: nativeBalance, value: walletValue },
    { name: 'BONK', amount: random(1000, 1000000), value: (random(10, 500) / 10).toFixed(2) },
    { name: 'JUP', amount: random(10, 500), value: (random(20, 800) / 10).toFixed(2) },
    { name: 'USDC', amount: random(10, 2000) / 10, value: (random(10, 2000) / 10).toFixed(2) }
  ];
  
  // Achievements
  const achievements = [];
  if (score < 30) achievements.push({ title: 'Rug Victim 🫠', description: 'You bought high and sold low. Classic.' });
  else if (score < 60) achievements.push({ title: 'Paper Hands 🧻', description: 'Selling at the first sign of trouble, huh?' });
  else if (score < 90) achievements.push({ title: 'Diamond Hands 💎🙌', description: 'HODL is your middle name!' });
  else achievements.push({ title: 'Crypto Wizard 🧙‍♂️', description: 'You have mastered the art of the trade!' });
  
  // Add more random achievements
  const randomAchievements = [
    { title: 'Gas Guzzler 🔥', description: `Spent ${gasSpent} SOL on gas fees alone!` },
    { title: 'Busy Bee 🐝', description: `Made ${totalTrades} trades in total.` },
    { title: 'Meme Lord 👑', description: 'HODLing those meme coins like a boss!' },
    { title: 'Whale Alert 🐋', description: 'Your wallet value is impressive!' }
  ];
  
  // Add 1-2 random achievements
  const numRandomAchievements = random(1, 2);
  for (let i = 0; i < numRandomAchievements; i++) {
    const idx = random(0, randomAchievements.length - 1);
    achievements.push(randomAchievements[idx]);
    randomAchievements.splice(idx, 1);
  }
  
  // Roast
  const roasts = [
    `You spent ${gasSpent} SOL on fees alone. The validators thank you for your service. 🫡`,
    `Your portfolio looks like you let a hamster make your trading decisions. And the hamster was drunk. 🐹🍺`,
    `Congratulations on buying every single local top and selling every bottom. That takes skill! 📉`,
    `You call those diamond hands? More like cubic zirconia at best. 💎❌`,
    `Your wallet has more rugs than a Persian carpet store. 🧿`,
    `Your trading strategy seems to be "buy high, sell low" - classic! 📊`,
    `I've seen better returns from a savings account in Zimbabwe. 🏦`
  ];
  
  const roastIndex = random(0, roasts.length - 1);
  
  // Return fake data in the same format as the real data
  return {
    address,
    score,
    solPrice,
    nativeBalance,
    walletValue,
    tokens,
    achievements,
    roast: roasts[roastIndex],
    txHistory,
    totalTrades,
    gasSpent,
    pnl: (random(-500, 1000) / 10).toFixed(2)
  };
}

/**
 * Save wallet data to leaderboard
 * @param {string} address - Wallet address
 * @param {Object} walletData - Wallet data
 * @param {Object} stats - Wallet stats
 * @param {string} roast - The generated roast
 * @returns {Object} Leaderboard response
 */
async function saveWalletToLeaderboard(address, walletData, stats, roast) {
  try {
    console.log('Saving wallet to leaderboard...');
    
    // Get the SOL price from stats or use default
    const solPrice = parseFloat(stats.solPrice || walletData.solPrice || 100);
    console.log(`Using SOL price: $${solPrice}`);
    
    // Get the native SOL balance
    const nativeBalance = parseFloat(stats.nativeBalance || walletData.nativeBalance || 0);
    console.log(`Native SOL balance: ${nativeBalance}`);
    
    // Calculate wallet value in USD
    const walletValue = nativeBalance * solPrice;
    console.log(`Calculated wallet value: ${nativeBalance} SOL * $${solPrice} = $${walletValue.toFixed(2)}`);
    
    const leaderboardData = {
      address,
      score: stats.score || 0,
      totalTrades: stats.totalTrades || 0,
      gasSpent: stats.gasSpent || 0,
      pnl: stats.pnl || 0,
      walletValue: walletValue.toFixed(2), // USD value
      nativeBalance, // Raw SOL balance (not USD divided by price)
      solPrice, // Store the SOL price used for calculations
      lastRoast: roast
    };

    console.log('Saving to leaderboard:', {
      address: leaderboardData.address,
      walletValue: leaderboardData.walletValue,
      nativeBalance: leaderboardData.nativeBalance,
      solPrice: leaderboardData.solPrice
    });

    // Get the API URL from environment or use default
    const apiUrl = process.env.API_URL || 'http://localhost:3001/api';

    const response = await axios.post(
      `${apiUrl}/leaderboard/${address}/leaderboard`,
      leaderboardData
    );

    return response.data;
  } catch (error) {
    console.error('Error saving to leaderboard:', error);
    return { error: 'Failed to save to leaderboard' };
  }
}

module.exports = {
  analyzeWallet,
  generateAchievements,
  saveWalletToLeaderboard,
  generateRoast
}; 