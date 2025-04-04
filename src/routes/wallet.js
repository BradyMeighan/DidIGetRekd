const express = require('express');
const router = express.Router();
const walletService = require('../services/walletService');
const axios = require('axios');
const path = require('path');
const { generateChart } = require('../utils/chartGenerator');

/**
 * @route GET /api/wallet/test
 * @desc Test endpoint for API connection
 */
router.get('/test', (req, res) => {
  try {
    const heliusKey = process.env.HELIUS_API_KEY ? 'Set' : 'Missing';
    const openaiKey = process.env.OPENAI_API_KEY ? 'Set' : 'Missing';
    const flipsideKey = process.env.FLIPSIDE_API_KEY ? 'Set' : 'Missing';
    
    res.json({
      status: 'OK',
      message: 'Wallet API is working',
      config: {
        heliusApiKey: heliusKey,
        openaiApiKey: openaiKey,
        flipsideApiKey: flipsideKey
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Test endpoint failed', details: error.message });
  }
});

/**
 * POST /api/wallet/chart
 * Generate a chart from transaction data using Node.js Canvas
 * IMPORTANT: This route must be defined BEFORE the /:address routes
 */
router.post('/chart', async (req, res) => {
  try {
    const { data, darkMode, compactMode, chartType, address, timeRange } = req.body;
    
    console.log('Chart request received:', { 
      dataLength: data?.length || 0, 
      darkMode,
      compactMode,
      chartType,
      address,
      timeRange,
      sampleData: data?.slice(0, 2) 
    });
    
    // If address and timeRange are provided, fetch data from Flipside
    // This allows us to get chart data directly from the chart endpoint
    if (address && !data) {
      console.log(`Fetching chart data for wallet ${address} with timeRange ${timeRange || 'all'}`);
      try {
        const chartData = await walletService.getWalletBalanceChartData(address, timeRange || 'all');
        
        if (!chartData || chartData.length === 0) {
          return res.status(400).json({ 
            error: 'No chart data available for this wallet', 
            success: false 
          });
        }
        
        // Transform data to format expected by chart generator
        const transformedData = chartData.map(point => ({
          value: chartType === 'pnl' 
            ? calculatePnLPercentage(chartData[0].sol_balance, point.sol_balance) 
            : point.sol_balance,
          label: formatDateLabel(point.timestamp, timeRange || 'all')
        }));
        
        // Generate chart with the fetched data
        const imageData = generateChart(
          transformedData, 
          Boolean(darkMode), 
          Boolean(compactMode), 
          chartType || 'balance'
        );
        
        console.log('Chart generated successfully with Flipside data, image data length:', imageData?.length || 0);
        
        return res.json({
          success: true,
          imageData
        });
      } catch (error) {
        console.error('Error fetching chart data from Flipside:', error);
        return res.status(500).json({ 
          error: 'Failed to fetch chart data', 
          details: error.message,
          success: false 
        });
      }
    }
    
    // Original functionality for cases where data is provided directly
    if (!data || !Array.isArray(data)) {
      console.error('Invalid chart data format:', data);
      return res.status(400).json({ error: 'Invalid chart data', success: false });
    }
    
    // Clean the data to ensure it has correct format
    const cleanData = data.map(point => {
      const value = parseFloat(point.value || 0) || 0;
      const label = String(point.label || '');
      
      console.log('Processing data point:', { 
        originalValue: point.value, 
        parsedValue: value,
        originalLabel: point.label,
        cleanLabel: label
      });
      
      return { value, label };
    });
    
    // Generate chart using our JavaScript chart generator
    console.log(`Generating chart with ${cleanData.length} data points:`, cleanData);
    
    try {
      const imageData = generateChart(
        cleanData, 
        Boolean(darkMode), 
        Boolean(compactMode), 
        chartType || 'balance'
      );
      console.log('Chart generated successfully, image data length:', imageData?.length || 0);
      
      // Return the base64 encoded image with explicit success flag
      const response = {
        success: true,
        imageData
      };
      
      console.log('Sending response with success:', response.success);
      return res.json(response);
    } catch (chartError) {
      console.error('Error in chart generation:', chartError);
      return res.status(500).json({ 
        error: 'Chart generation failed', 
        details: chartError.message,
        success: false 
      });
    }
  } catch (error) {
    console.error('Error in chart endpoint:', error);
    return res.status(500).json({ 
      error: 'Failed to generate chart', 
      details: error.message,
      success: false
    });
  }
});

/**
 * Format date label based on time range
 * @param {string|number} timestamp - ISO date string or timestamp
 * @param {string} timeRange - all, year, month, week
 * @returns {string} Formatted date string
 */
function formatDateLabel(timestamp, timeRange) {
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return String(timestamp).substring(0, 10);
    }
    
    switch(timeRange) {
      case 'week':
        return date.toLocaleDateString('en-US', { weekday: 'short' });
      case 'month':
        return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      case 'year':
        return date.toLocaleDateString('en-US', { month: 'short' });
      default: // 'all' or any other value
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }
  } catch (e) {
    console.error('Error formatting date label:', e);
    return String(timestamp);
  }
}

/**
 * Calculate PnL percentage between first and current balance
 * @param {number} firstBalance - Starting balance
 * @param {number} currentBalance - Current balance
 * @returns {number} PnL percentage
 */
function calculatePnLPercentage(firstBalance, currentBalance) {
  if (!firstBalance || firstBalance === 0) return 0;
  
  const pnlPercent = ((currentBalance - firstBalance) / firstBalance) * 100;
  
  // Round to 1 decimal place
  return Math.round(pnlPercent * 10) / 10;
}

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
    
    // If there's an error in the stats, keep it but don't add visualization data
    if (result.stats.error) {
      console.log(`Error during wallet analysis: ${result.stats.error} - ${result.stats.message}`);
      return res.json(result);
    }
    
    // Ensure we have a complete data structure
    if (!result.stats) {
      result.stats = {
        address,
        error: "EMPTY_RESULT",
        message: "No wallet statistics were generated"
      };
      return res.json(result);
    }
    
    // Generate transaction history if it doesn't exist
    if (!result.stats.txHistory) {
      console.log('No transaction history found, creating empty chart data');
      result.stats.txHistory = Array(30).fill().map((_, i) => ({
        day: i + 1,
        value: 0,
        transactions: 0
      }));
    }
    
    // If tokens array doesn't exist, create empty one
    if (!result.stats.tokens) {
      console.log('No token data found');
      result.stats.tokens = [];
      
      // If we at least have native balance, add SOL
      if (result.stats.nativeBalance) {
        const nativeBalance = parseFloat(result.stats.nativeBalance);
        result.stats.tokens.push({
          name: 'SOL',
          amount: nativeBalance.toFixed(4),
          value: (nativeBalance * 20).toFixed(2) // estimated value
        });
      }
    }
    
    // If achievements array doesn't exist, create empty one
    if (!result.stats.achievements) {
      console.log('No achievements data found');
      result.stats.achievements = [];
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error analyzing wallet:', error);
    res.status(500).json({ 
      error: 'Error analyzing wallet',
      message: error.message,
      stats: {
        address: req.params.address,
        error: "SERVER_ERROR",
        message: "Server error occurred during analysis"
      }
    });
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

/**
 * @route GET /api/wallet/helius-test/:address
 * @desc Debug endpoint to see raw Helius API data
 */
router.get('/helius-test/:address', async (req, res) => {
  try {
    const { address } = req.params;
    console.log(`Testing Helius API for wallet: ${address}`);
    
    // Check API key
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      return res.status(400).json({ error: 'HELIUS_API_KEY not set in environment variables' });
    }
    
    const results = {};
    
    // 1. Get balances
    const balanceUrl = `https://api.helius.xyz/v0/addresses/${address}/balances?api-key=${heliusApiKey}`;
    console.log('Calling Helius balances endpoint:', balanceUrl);
    const balanceResponse = await axios.get(balanceUrl);
    results.balance = balanceResponse.data;
    
    // 2. Get transactions (try with a larger limit)
    const txUrl = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${heliusApiKey}&limit=20`;
    console.log('Calling Helius transactions endpoint:', txUrl);
    const txResponse = await axios.get(txUrl);
    results.transactions = {
      count: txResponse.data.transactions?.length || 0,
      sample: txResponse.data.transactions?.slice(0, 2) || []
    };
    
    // 3. Get signatures (often more reliable than transactions endpoint)
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
    console.log('Calling getSignaturesForAddress RPC method');
    const signaturesResponse = await axios.post(rpcUrl, {
      jsonrpc: "2.0",
      id: 2,
      method: "getSignaturesForAddress",
      params: [address, { limit: 10 }]
    });
    results.signatures = signaturesResponse.data;
    
    // 4. Get token accounts (more detailed token data)
    console.log('Calling getTokenAccountsByOwner RPC method');
    const tokenAccountsResponse = await axios.post(rpcUrl, {
      jsonrpc: "2.0",
      id: 3,
      method: "getTokenAccountsByOwner",
      params: [
        address,
        { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
        { encoding: "jsonParsed" }
      ]
    });
    results.tokenAccounts = tokenAccountsResponse.data;
    
    // 5. Get basic balance
    console.log('Calling getBalance RPC method');
    const balanceRpcResponse = await axios.post(rpcUrl, {
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [address]
    });
    results.rpcBalance = balanceRpcResponse.data;
    
    // 6. If we have signatures, try to get detailed transaction data for one of them
    if (signaturesResponse.data?.result && signaturesResponse.data.result.length > 0) {
      const firstSig = signaturesResponse.data.result[0].signature;
      console.log(`Getting transaction details for signature: ${firstSig}`);
      const txDetailResponse = await axios.post(rpcUrl, {
        jsonrpc: "2.0",
        id: 4,
        method: "getTransaction",
        params: [firstSig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]
      });
      results.transactionDetail = txDetailResponse.data;
    }
    
    // Return all results
    res.json(results);
  } catch (error) {
    console.error('Error testing Helius API:', error.message);
    res.status(500).json({ 
      error: 'Error testing Helius API', 
      message: error.message,
      stack: error.stack
    });
  }
});

/**
 * @route GET /api/wallet/transactions-test/:address
 * @desc Test endpoint to check multiple methods for fetching transaction history
 */
router.get('/transactions-test/:address', async (req, res) => {
  try {
    const { address } = req.params;
    console.log(`Testing transaction history methods for wallet: ${address}`);
    
    // Check API key
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      return res.status(400).json({ error: 'HELIUS_API_KEY not set in environment variables' });
    }
    
    const results = {
      address,
      methods: {}
    };
    
    // Try Method 1: Standard Helius transactions endpoint
    try {
      console.log('METHOD 1: Testing Helius transactions endpoint');
      const txUrl = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${heliusApiKey}&limit=50`;
      const txResponse = await axios.get(txUrl);
      
      results.methods.heliusTransactions = {
        success: true,
        transactionCount: txResponse.data.transactions?.length || 0,
        sample: txResponse.data.transactions?.slice(0, 2) || [],
        hasData: (txResponse.data.transactions?.length || 0) > 0
      };
    } catch (error) {
      results.methods.heliusTransactions = {
        success: false,
        error: error.message
      };
    }
    
    // Try Method 2: Helius RPC getSignaturesForAddress (most reliable)
    try {
      console.log('METHOD 2: Testing getSignaturesForAddress RPC method');
      const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
      const signaturesResponse = await axios.post(rpcUrl, {
        jsonrpc: "2.0",
        id: 2,
        method: "getSignaturesForAddress",
        params: [address, { limit: 50 }]
      });
      
      results.methods.getSignaturesForAddress = {
        success: true,
        signatureCount: signaturesResponse.data.result?.length || 0,
        sample: signaturesResponse.data.result?.slice(0, 2) || [],
        hasData: (signaturesResponse.data.result?.length || 0) > 0
      };
      
      // If we have signatures, try to get a transaction detail
      if (signaturesResponse.data.result?.length > 0) {
        const firstSig = signaturesResponse.data.result[0].signature;
        
        // Get transaction details
        const txDetailResponse = await axios.post(rpcUrl, {
          jsonrpc: "2.0",
          id: 3,
          method: "getTransaction",
          params: [firstSig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]
        });
        
        results.methods.getSignaturesForAddress.txDetail = {
          success: !!txDetailResponse.data.result,
          sample: txDetailResponse.data.result ? txDetailResponse.data.result : null
        };
      }
    } catch (error) {
      results.methods.getSignaturesForAddress = {
        success: false,
        error: error.message
      };
    }
    
    // Try Method 3: getConfirmedSignaturesForAddress2 (older method)
    try {
      console.log('METHOD 3: Testing getConfirmedSignaturesForAddress2 RPC method');
      const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
      const olderSigResponse = await axios.post(rpcUrl, {
        jsonrpc: "2.0",
        id: 4,
        method: "getConfirmedSignaturesForAddress2",
        params: [address, { limit: 50 }]
      });
      
      results.methods.getConfirmedSignaturesForAddress2 = {
        success: true,
        signatureCount: olderSigResponse.data.result?.length || 0,
        sample: olderSigResponse.data.result?.slice(0, 2) || [],
        hasData: (olderSigResponse.data.result?.length || 0) > 0
      };
    } catch (error) {
      results.methods.getConfirmedSignaturesForAddress2 = {
        success: false,
        error: error.message
      };
    }
    
    // Try Method 4: getParsedTransactionWithConfig
    if (results.methods.getSignaturesForAddress?.hasData) {
      try {
        console.log('METHOD 4: Testing getParsedTransactionWithConfig RPC method');
        const firstSig = results.methods.getSignaturesForAddress.sample[0].signature;
        const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
        
        const parsedTxResponse = await axios.post(rpcUrl, {
          jsonrpc: "2.0",
          id: 5,
          method: "getParsedTransaction",
          params: [
            firstSig,
            { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }
          ]
        });
        
        results.methods.getParsedTransaction = {
          success: true,
          hasData: !!parsedTxResponse.data.result,
          sample: parsedTxResponse.data.result
        };
      } catch (error) {
        results.methods.getParsedTransaction = {
          success: false,
          error: error.message
        };
      }
    }
    
    // Check for account activity using getAccountInfo
    try {
      console.log('Checking account info');
      const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
      const accountResponse = await axios.post(rpcUrl, {
        jsonrpc: "2.0",
        id: 6,
        method: "getAccountInfo",
        params: [address, { encoding: "jsonParsed" }]
      });
      
      results.accountInfo = {
        success: true,
        exists: !!accountResponse.data.result?.value,
        executable: accountResponse.data.result?.value?.executable || false,
        lamports: accountResponse.data.result?.value?.lamports || 0,
        owner: accountResponse.data.result?.value?.owner || null,
        rentEpoch: accountResponse.data.result?.value?.rentEpoch || 0
      };
    } catch (error) {
      results.accountInfo = {
        success: false,
        error: error.message
      };
    }
    
    // Final assessment
    const anyMethodHasTransactions = 
      results.methods.heliusTransactions?.hasData ||
      results.methods.getSignaturesForAddress?.hasData ||
      results.methods.getConfirmedSignaturesForAddress2?.hasData;
    
    results.assessment = {
      hasTransactions: anyMethodHasTransactions,
      accountExists: results.accountInfo?.exists || false,
      bestMethod: anyMethodHasTransactions ? 
        (results.methods.getSignaturesForAddress?.hasData ? 'getSignaturesForAddress' : 
         (results.methods.heliusTransactions?.hasData ? 'heliusTransactions' : 'getConfirmedSignaturesForAddress2')) 
        : 'none'
    };
    
    // Return all results
    res.json(results);
  } catch (error) {
    console.error('Error testing transaction methods:', error.message);
    res.status(500).json({ 
      error: 'Error testing transaction methods', 
      message: error.message
    });
  }
});

/**
 * @route GET /api/wallet/token/:mintAddress
 * @desc Get information about a token by mint address
 */
router.get('/token/:mintAddress', async (req, res) => {
  try {
    const { mintAddress } = req.params;
    console.log(`Looking up token info for mint: ${mintAddress}`);
    
    // Check API key
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      return res.status(400).json({ error: 'HELIUS_API_KEY not set in environment variables' });
    }
    
    // Use Helius RPC to get token information
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
    
    // First, try to get the token metadata
    const metadataResponse = await axios.post(rpcUrl, {
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [
        "JBu1AL4obBcCMqKBBxhpWCNUt136ijcuMZLFvTP7iWdB", // Example address with many tokens
        { mint: mintAddress },
        { encoding: "jsonParsed" }
      ]
    });
    
    // Then get the token supply
    const supplyResponse = await axios.post(rpcUrl, {
      jsonrpc: "2.0",
      id: 2,
      method: "getTokenSupply",
      params: [mintAddress]
    });
    
    // Get token account metadata
    const metadataProgramId = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
    const programIdsResponse = await axios.post(rpcUrl, {
      jsonrpc: "2.0",
      id: 3,
      method: "getProgramAccounts",
      params: [
        metadataProgramId,
        {
          encoding: "jsonParsed",
          filters: [
            {
              memcmp: {
                offset: 33,
                bytes: mintAddress
              }
            }
          ]
        }
      ]
    });
    
    // Combine the results
    const tokenInfo = {
      mint: mintAddress,
      supply: supplyResponse.data?.result?.value?.uiAmount || "Unknown",
      decimals: supplyResponse.data?.result?.value?.decimals || 0,
      accounts: metadataResponse.data?.result?.value?.length || 0,
      metadata: null
    };
    
    // Try to extract name and symbol from metadata if available
    if (programIdsResponse.data?.result?.length > 0) {
      try {
        const metadataAccount = programIdsResponse.data.result[0];
        if (metadataAccount.account?.data?.parsed) {
          tokenInfo.metadata = metadataAccount.account.data.parsed;
        } else if (metadataAccount.account?.data) {
          tokenInfo.metadata = {
            raw: metadataAccount.account.data
          };
        }
      } catch (error) {
        console.error('Error parsing token metadata:', error);
      }
    }
    
    // Return token information
    res.json({ token: tokenInfo });
  } catch (error) {
    console.error('Error getting token info:', error.message);
    res.status(500).json({
      error: 'Error getting token info',
      message: error.message
    });
  }
});

/**
 * @route GET /api/wallet/flipside/test/:address
 * @desc Test endpoint for Flipside API integration
 */
router.get('/flipside/test/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }
    
    console.log(`Testing Flipside API integration for wallet: ${address}`);
    
    // Check if Flipside API key is configured
    if (!process.env.FLIPSIDE_API_KEY) {
      return res.status(400).json({ 
        error: 'Flipside API key not configured',
        message: 'FLIPSIDE_API_KEY not found in environment variables'
      });
    }
    
    // Test all Flipside functions
    const startTime = Date.now();
    
    const results = {
      address,
      currentBalance: null,
      historicalBalances: null,
      transactions: null,
      executionTime: null,
      errors: []
    };
    
    try {
      results.currentBalance = await walletService.getWalletCurrentBalance(address);
    } catch (error) {
      console.error('Error testing current balance:', error);
      results.errors.push({
        step: 'currentBalance',
        message: error.message
      });
    }
    
    try {
      const balanceHistory = await walletService.getWalletHistoricalBalances(address);
      results.historicalBalances = {
        count: balanceHistory.length,
        sample: balanceHistory.slice(0, 3)
      };
    } catch (error) {
      console.error('Error testing historical balances:', error);
      results.errors.push({
        step: 'historicalBalances',
        message: error.message
      });
    }
    
    try {
      const transactions = await walletService.getWalletTransactions(address, 10);
      results.transactions = {
        count: transactions.length,
        sample: transactions.slice(0, 3)
      };
    } catch (error) {
      console.error('Error testing transactions:', error);
      results.errors.push({
        step: 'transactions',
        message: error.message
      });
    }
    
    results.executionTime = Date.now() - startTime;
    results.success = results.errors.length === 0;
    
    res.json(results);
  } catch (error) {
    console.error('Error testing Flipside API integration:', error);
    res.status(500).json({ 
      error: 'Test failed',
      message: error.message
    });
  }
});

/**
 * @route GET /api/wallet/chart-data/:address
 * @desc Get SOL balance chart data for a wallet using Flipside
 */
router.get('/chart-data/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { timeRange = 'all' } = req.query;
    
    console.log(`GET /api/wallet/chart-data/${address} with timeRange=${timeRange}`);
    
    if (!address) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }
    
    // Use the new Flipside-powered function for chart data
    const chartData = await walletService.getWalletBalanceChartData(address, timeRange);
    
    if (!chartData || !Array.isArray(chartData) || chartData.length === 0) {
      console.log('No chart data available for wallet');
      return res.json({ 
        success: false, 
        error: 'No chart data available for this wallet',
        chartData: [] 
      });
    }
    
    // Calculate PnL if there are at least 2 data points
    let pnlData = null;
    if (chartData.length >= 2) {
      const initialBalance = chartData[0].sol_balance;
      const latestBalance = chartData[chartData.length - 1].sol_balance;
      
      if (initialBalance > 0) {
        const pnlValue = latestBalance - initialBalance;
        const pnlPercentage = (pnlValue / initialBalance) * 100;
        
        pnlData = {
          initialBalance,
          latestBalance,
          pnlValue,
          pnlPercentage
        };
      }
    }
    
    res.json({
      success: true,
      chartData,
      pnlData,
      dataPoints: chartData.length,
      timeRange
    });
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching chart data',
      message: error.message
    });
  }
});

module.exports = router; 