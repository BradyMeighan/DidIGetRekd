require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const walletRoutes = require('./routes/wallet');
const leaderboardRoutes = require('./routes/leaderboard');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/wallet', walletRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

// Health check endpoint - respond immediately
app.get('/health', (req, res) => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL;
  
  // Check environment variables
  const envStatus = {
    MONGODB_URI: mongoUri ? 'Set' : 'Missing',
    HELIUS_API_KEY: process.env.HELIUS_API_KEY ? 'Set' : 'Missing',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'Set' : 'Missing',
    PORT: process.env.PORT || 3001
  };
  
  res.status(200).json({ 
    status: 'ok',
    environment: envStatus,
    timestamp: new Date().toISOString()
  });
});

// Log environment variables (without sensitive data)
console.log('Environment variables:');
console.log('PORT:', PORT);
console.log('MONGODB_URI:', process.env.MONGODB_URI ? '*** MongoDB URI is set ***' : 'MONGODB_URI is not set');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '*** OpenAI API Key is set ***' : 'OPENAI_API_KEY is not set');
console.log('HELIUS_API_KEY:', process.env.HELIUS_API_KEY ? '*** Helius API Key is set ***' : 'HELIUS_API_KEY is not set');

// Connect to MongoDB
const connectToMongoDB = async () => {
  try {
    // Try both MONGO_URL and MONGODB_URI
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL;
    
    if (!mongoUri) {
      throw new Error('No MongoDB connection string found in environment variables');
    }

    console.log('Attempting to connect to MongoDB...');
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log('Connected to MongoDB successfully');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
};

// Start the application
connectToMongoDB();

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
}); 