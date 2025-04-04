const mongoose = require('mongoose');

const visitorCountSchema = new mongoose.Schema({
  count: {
    type: Number,
    required: true,
    default: 0
  },
  lastReset: {
    type: Date,
    default: Date.now
  },
  lastUpdate: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

const VisitorCount = mongoose.model('VisitorCount', visitorCountSchema);

module.exports = VisitorCount; 