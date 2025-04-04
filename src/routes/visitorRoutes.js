const express = require('express');
const router = express.Router();
const VisitorCount = require('../models/VisitorCount');

// Cache to minimize DB operations
let cachedCount = null;
let lastCacheUpdate = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/visitors/count
 * Returns the current visitor count
 */
router.get('/visitors/count', async (req, res) => {
  try {
    // Check cache first
    const now = Date.now();
    if (cachedCount && lastCacheUpdate && (now - lastCacheUpdate) < CACHE_DURATION) {
      return res.json({ count: cachedCount });
    }
    
    // Get the visitor count from the database
    const visitorCount = await VisitorCount.findOne();
    
    if (!visitorCount) {
      // Create initial count if none exists
      const newCount = new VisitorCount({ count: 1 });
      await newCount.save();
      
      // Update cache
      cachedCount = 1;
      lastCacheUpdate = now;
      
      return res.json({ count: 1 });
    }
    
    // Update cache
    cachedCount = visitorCount.count;
    lastCacheUpdate = now;
    
    return res.json({ count: visitorCount.count });
  } catch (error) {
    console.error('Error fetching visitor count:', error);
    return res.status(500).json({ error: 'Failed to get visitor count' });
  }
});

/**
 * POST /api/visitors/increment
 * Increments the visitor count
 */
router.post('/visitors/increment', async (req, res) => {
  try {
    // Check if we already have a count
    let visitorCount = await VisitorCount.findOne();
    
    if (!visitorCount) {
      // Create initial count if none exists
      visitorCount = new VisitorCount({ count: 1 });
      await visitorCount.save();
      
      // Update cache
      cachedCount = 1;
      lastCacheUpdate = Date.now();
      
      return res.json({ count: 1 });
    }
    
    // Increment the count and update lastUpdate
    visitorCount.count += 1;
    visitorCount.lastUpdate = Date.now();
    await visitorCount.save();
    
    // Update cache
    cachedCount = visitorCount.count;
    lastCacheUpdate = Date.now();
    
    return res.json({ count: visitorCount.count });
  } catch (error) {
    console.error('Error incrementing visitor count:', error);
    return res.status(500).json({ error: 'Failed to increment visitor count' });
  }
});

/**
 * POST /api/visitors/reset
 * Resets the visitor count (admin only)
 */
router.post('/visitors/reset', async (req, res) => {
  try {
    // This would typically have authentication, omitted for simplicity
    
    // Find and update the visitor count
    const visitorCount = await VisitorCount.findOneAndUpdate(
      {}, 
      { count: 0, lastReset: Date.now() },
      { new: true, upsert: true }
    );
    
    // Update cache
    cachedCount = 0;
    lastCacheUpdate = Date.now();
    
    return res.json({ count: visitorCount.count, message: 'Visitor count reset successfully' });
  } catch (error) {
    console.error('Error resetting visitor count:', error);
    return res.status(500).json({ error: 'Failed to reset visitor count' });
  }
});

module.exports = router; 