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

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Log MongoDB connection string (without credentials)
const mongoUriForLogging = process.env.MONGODB_URI 
  ? process.env.MONGODB_URI.replace(/mongodb(\+srv)?:\/\/[^@]+@/, 'mongodb$1://***:***@')
  : 'MongoDB URI not set';

console.log('Connecting to MongoDB:', mongoUriForLogging);

// Connect to MongoDB
// MONGODB_URI will be set by Railway: ${{ MongoDB.MONGO_URL }}
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB successfully');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
}); 