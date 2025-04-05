const { createCanvas } = require('canvas');

/**
 * Generate a line chart for wallet balance history using Node.js Canvas
 * 
 * @param {Array} data - Array of {value, label} points
 * @param {boolean} darkMode - Whether to use dark mode colors
 * @returns {string} - Base64 encoded PNG image
 */
function generateChart(data, darkMode = false) {
  try {
    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error('Invalid data format');
    }

    // Extract values and dates
    const values = data.map(point => typeof point.value === 'number' ? point.value : parseFloat(point.value || 0));
    const labels = data.map(point => String(point.label || ''));
    
    // Calculate data range
    const minValue = Math.max(0, Math.min(...values) * 0.9);
    const maxValue = Math.max(...values) * 1.1;
    const valueRange = maxValue - minValue;
    
    // Determine colors based on mode and trend
    const trendIsUp = values[values.length - 1] >= values[0];
    
    // Set colors based on trend and dark mode
    const colors = {
      background: darkMode ? '#111827' : '#ffffff',
      text: darkMode ? '#ffffff' : '#333333',
      line: trendIsUp 
        ? (darkMode ? '#22c55e' : '#16a34a')  // Green
        : (darkMode ? '#ef4444' : '#dc2626'), // Red
      area: trendIsUp 
        ? (darkMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(22, 163, 74, 0.15)') 
        : (darkMode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(220, 38, 38, 0.15)'),
      grid: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
    };
    
    // Canvas setup
    const width = 800;
    const height = 400;
    const padding = { top: 40, right: 20, bottom: 60, left: 60 };
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Fill background
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);
    
    // Draw title
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('SOL Balance Over Time', width / 2, 20);
    
    // Draw y-axis label
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('SOL Balance', 0, 0);
    ctx.restore();
    
    // Calculate chart area
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    // Draw grid lines
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    
    // Horizontal grid lines
    const numGridLines = 5;
    for (let i = 0; i <= numGridLines; i++) {
      const y = padding.top + chartHeight - (i / numGridLines) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      
      // Draw y-axis labels
      const value = minValue + (i / numGridLines) * valueRange;
      ctx.fillStyle = colors.text;
      ctx.font = '12px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(value.toFixed(2), padding.left - 10, y + 4);
    }
    
    // Draw chart points
    const points = values.map((value, index) => {
      const x = padding.left + (index / (values.length - 1)) * chartWidth;
      const y = padding.top + chartHeight - ((value - minValue) / valueRange) * chartHeight;
      return { x, y };
    });
    
    // Draw area under the line
    ctx.beginPath();
    ctx.moveTo(points[0].x, padding.top + chartHeight); // Start at bottom left
    
    // Draw up to first point
    ctx.lineTo(points[0].x, points[0].y);
    
    // Draw line through all points
    for (let i = 1; i < points.length; i++) {
      // Use bezier curve for smoother lines
      const prevPoint = points[i - 1];
      const currentPoint = points[i];
      
      // Control points for curve
      const cp1x = prevPoint.x + (currentPoint.x - prevPoint.x) / 3;
      const cp2x = prevPoint.x + 2 * (currentPoint.x - prevPoint.x) / 3;
      
      ctx.bezierCurveTo(
        cp1x, prevPoint.y,
        cp2x, currentPoint.y,
        currentPoint.x, currentPoint.y
      );
    }
    
    // Close the path down to the x-axis
    ctx.lineTo(points[points.length - 1].x, padding.top + chartHeight);
    ctx.closePath();
    
    // Fill the area
    ctx.fillStyle = colors.area;
    ctx.fill();
    
    // Draw the line again over the area
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    
    for (let i = 1; i < points.length; i++) {
      const prevPoint = points[i - 1];
      const currentPoint = points[i];
      
      // Control points for curve
      const cp1x = prevPoint.x + (currentPoint.x - prevPoint.x) / 3;
      const cp2x = prevPoint.x + 2 * (currentPoint.x - prevPoint.x) / 3;
      
      ctx.bezierCurveTo(
        cp1x, prevPoint.y,
        cp2x, currentPoint.y,
        currentPoint.x, currentPoint.y
      );
    }
    
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw data points
    points.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    
    // Draw x-axis labels
    ctx.fillStyle = colors.text;
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    
    labels.forEach((label, index) => {
      const x = padding.left + (index / (labels.length - 1)) * chartWidth;
      ctx.fillText(label, x, height - padding.bottom / 2);
    });
    
    // Convert canvas to base64
    const imageBase64 = canvas.toDataURL('image/png').split(',')[1];
    return imageBase64;
  } catch (error) {
    console.error('Error generating chart:', error);
    throw error;
  }
}

module.exports = { generateChart }; 