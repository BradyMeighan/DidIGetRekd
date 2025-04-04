# Did I Just Get Rekd - Backend

This is the backend service for the "Did I Just Get Rekd" application, which analyzes Solana wallets and provides a leaderboard of roasted wallets.

## Features

- Analyze Solana wallets using the Helius API
- Generate AI-powered roasts with GPT-4o-mini
- Store wallet data and roasts in MongoDB
- Leaderboard API for displaying top wallets by various metrics

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   cd backend
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in your credentials:
   ```
   cp .env.example .env
   ```
   
   You'll need:
   - MongoDB connection string (or use Railway's MongoDB integration)
   - OpenAI API key
   - Helius API key

4. Start the development server:
   ```
   npm run dev
   ```

## API Endpoints

### Wallet Endpoints

- `GET /api/wallet/:address` - Get wallet data, analyze it with Helius, and generate a roast
- `POST /api/wallet/:address/roast` - Generate a new roast for an existing wallet

### Leaderboard Endpoints

- `GET /api/leaderboard` - Get top wallets sorted by score, PnL, etc.
  - Query params: `sort` (score, pnl, totalTrades, gasSpent), `limit`, `page`
- `GET /api/leaderboard/stats` - Get overall statistics about wallets in the database

## Railway Deployment Guide

This backend is designed to be deployed on Railway with MongoDB integration. Follow these steps:

### 1. Set up a MongoDB Service in Railway

1. Create a new project in Railway (or open your existing project)
2. Click "New Service" → "Database" → "MongoDB"
3. Wait for the MongoDB service to be provisioned

### 2. Deploy the Backend Service

1. In the same Railway project, click "New Service" → "GitHub Repo"
2. Select your repository and the backend directory
3. Railway will automatically deploy your service

### 3. Connect MongoDB to your Backend

1. In your backend service, go to the "Variables" tab
2. Create a new environment variable:
   - Name: `MONGODB_URI`
   - Value: `${{ MongoDB.MONGO_URL }}`
3. Add your other required environment variables:
   - `OPENAI_API_KEY`
   - `HELIUS_API_KEY`

### 4. Verify the Connection

1. After deploying, check your service logs
2. Look for the message "Connected to MongoDB successfully"
3. If there are any connection issues, verify your environment variables

### 5. Test Your API

1. Find your service URL in the "Settings" tab
2. Test the health endpoint: `https://your-service-url/health`
3. If everything is working, you should see `{"status":"ok"}`

### Note for MongoDB Beginners

- Railway takes care of all MongoDB setup automatically
- You don't need to create databases, collections, or users manually
- Your Mongoose models will create the necessary collections when first connected
- The `MONGODB_URI` variable from Railway includes all authentication details

## Environment Variables

- `MONGODB_URI` - MongoDB connection string (set by Railway: `${{ MongoDB.MONGO_URL }}`)
- `OPENAI_API_KEY` - OpenAI API key for generating roasts
- `HELIUS_API_KEY` - Helius API key for Solana blockchain queries
- `PORT` - Port to run the server on (set automatically by Railway)

## Development

- Use `npm run dev` to start the development server with hot-reloading
- The server runs on `http://localhost:3001` by default 