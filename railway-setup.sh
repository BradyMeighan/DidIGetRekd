#!/bin/bash
# Railway setup script
echo "Setting up MongoDB for Did I Just Get Rekd backend..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "Railway CLI not found. Installing..."
    npm i -g @railway/cli
    echo "Railway CLI installed."
fi

# Login to Railway if not already logged in
if ! railway whoami &> /dev/null; then
    echo "Please login to Railway:"
    railway login
fi

# Create MongoDB and link to project
echo "Creating MongoDB service..."
railway add --plugin mongodb

echo "MongoDB service created successfully."
echo "Next steps:"
echo "1. Deploy your backend: railway up"
echo "2. Link MongoDB: In the Railway dashboard, add MONGODB_URI=${{ MongoDB.MONGO_URL }} to your Variables"
echo "3. Add your API keys: Set OPENAI_API_KEY and HELIUS_API_KEY in Variables"
echo "4. Your API will be available at your Railway-provided URL"
echo ""
echo "Done! Your Railway MongoDB is ready for use." 