const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Directory to store bug reports
const REPORTS_DIR = path.join(__dirname, '..', 'data', 'bug-reports');

// Ensure the reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

/**
 * POST /api/bug-report
 * Receives bug reports from users and stores them as JSON files
 */
router.post('/bug-report', async (req, res) => {
  try {
    const { description, email, category, deviceInfo, timestamp } = req.body;
    
    // Basic validation
    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }
    
    // Create a unique filename
    const fileName = `bug_${Date.now()}_${Math.floor(Math.random() * 1000)}.json`;
    const filePath = path.join(REPORTS_DIR, fileName);
    
    // Get client IP (with respect to privacy)
    const clientIp = req.headers['x-forwarded-for'] || 
                    req.connection.remoteAddress || 
                    'unknown';
                    
    // Create report object
    const report = {
      description,
      email: email || 'anonymous',
      category: category || 'other',
      deviceInfo: deviceInfo || {},
      clientIp: clientIp.split(',')[0], // Take just the first IP if multiple
      timestamp: timestamp || new Date().toISOString(),
      userAgent: req.headers['user-agent'] || 'unknown'
    };
    
    // Write the report to file
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
    
    console.log(`Bug report saved: ${filePath}`);
    
    // Log to console for monitoring
    console.log(`New bug report: ${category} - ${description.substring(0, 50)}...`);
    
    return res.status(200).json({ 
      success: true, 
      message: 'Bug report received. Thank you for your feedback!'
    });
    
  } catch (error) {
    console.error('Error saving bug report:', error);
    return res.status(500).json({ 
      error: 'Failed to save bug report',
      details: error.message
    });
  }
});

/**
 * GET /api/bug-report/count
 * Returns the count of bug reports (admin use only)
 */
router.get('/bug-report/count', (req, res) => {
  try {
    // This would typically have authentication, omitted for simplicity
    
    if (!fs.existsSync(REPORTS_DIR)) {
      return res.status(200).json({ count: 0 });
    }
    
    const files = fs.readdirSync(REPORTS_DIR);
    return res.status(200).json({ count: files.length });
    
  } catch (error) {
    console.error('Error counting bug reports:', error);
    return res.status(500).json({ error: 'Failed to count bug reports' });
  }
});

module.exports = router; 