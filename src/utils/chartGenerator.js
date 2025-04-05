const { createCanvas } = require('canvas');

/**
 * Generate a line chart for wallet balance history using Node.js Canvas
 * 
 * @param {Array} data - Array of {value, label} points
 * @param {boolean} darkMode - Whether to use dark mode colors
 * @param {boolean} compactMode - Whether to use compact mode for share modal (no labels, simplified)
 * @returns {string} - Base64 encoded PNG image
 */
function generateChart(data, darkMode = false, compactMode = false) {
  try {
    console.log('Starting chart generation with data:', JSON.stringify(data));
    console.log('Chart options:', { darkMode, compactMode });
    
    // Input validation with detailed error messages
    if (!data) {
      throw new Error('Data parameter is null or undefined');
    }
    
    if (!Array.isArray(data)) {
      throw new Error(`Data is not an array: ${typeof data}`);
    }
    
    if (data.length === 0) {
      throw new Error('Data array is empty');
    }
    
    // Validate data points format
    data.forEach((point, index) => {
      if (!point) {
        throw new Error(`Data point at index ${index} is null or undefined`);
      }
      
      if (typeof point !== 'object') {
        throw new Error(`Data point at index ${index} is not an object: ${typeof point}`);
      }
      
      // Check for value field
      if (point.value === undefined || point.value === null) {
        throw new Error(`Missing value in data point at index ${index}: ${JSON.stringify(point)}`);
      }
      
      // Check if value can be parsed as a number
      const parsedValue = parseFloat(point.value);
      if (isNaN(parsedValue)) {
        throw new Error(`Cannot parse value as number in data point at index ${index}: ${point.value}`);
      }
      
      // Check for label field
      if (!point.label && point.label !== '') {
        throw new Error(`Missing label in data point at index ${index}: ${JSON.stringify(point)}`);
      }
    });

    // Extract values and dates with explicit conversion and additional checks
    const values = [];
    const labels = [];
    
    for (let i = 0; i < data.length; i++) {
      const point = data[i];
      let value;
      
      // Handle different value formats with explicit parsing
      if (typeof point.value === 'number') {
        value = point.value;
      } else {
        // Handle string values, ensuring we can parse them
        value = parseFloat(String(point.value).replace(/[^\d.-]/g, ''));
      }
      
      if (isNaN(value)) {
        console.warn(`Invalid value at index ${i}, using 0:`, point.value);
        value = 0;
      }
      
      values.push(value);
      labels.push(String(point.label || ''));
    }
    
    console.log('Processed values:', values);
    console.log('Processed labels:', labels);
    
    // Calculate data range with safety checks
    const minValue = Math.max(0, Math.min(...values) * 0.9);
    const maxValue = Math.max(...values) * 1.1 || 1; // Fallback to 1 if max is 0
    const valueRange = maxValue - minValue || 1; // Avoid division by zero
    
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
    
    // Canvas setup - adjust dimensions for compact mode
    const width = compactMode ? 600 : 800;
    const height = compactMode ? 300 : 400;
    
    // Adjust padding for compact mode (minimal padding for modal view)
    const padding = compactMode 
      ? { top: 10, right: 10, bottom: 20, left: 10 }
      : { top: 40, right: 20, bottom: 60, left: 60 };
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Fill background
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);
    
    // Draw title if not in compact mode
    if (!compactMode) {
      ctx.fillStyle = colors.text;
      // Use simpler fonts to avoid rendering issues
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SOL Balance Over Time', width / 2, 20);
      
      // Draw y-axis label
      ctx.save();
      ctx.translate(15, height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText('SOL Balance', 0, 0);
      ctx.restore();
    }
    
    // Calculate chart area
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    // Draw grid lines (skip in compact mode)
    if (!compactMode) {
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
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(value.toFixed(2), padding.left - 10, y + 4);
      }
    } else {
      // In compact mode, just draw subtle horizontal lines
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 0.5;
      
      // Draw 3 simple horizontal lines for visual reference
      for (let i = 0; i < 3; i++) {
        const y = padding.top + (i / 2) * chartHeight;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
      }
    }
    
    // Draw chart points with checks for sufficient data
    if (values.length < 2) {
      // Handle case with insufficient data points
      console.warn('Not enough data points for a line chart, generating simplified version');
      
      // Create at least two points for a minimal chart
      const x1 = padding.left;
      const x2 = width - padding.right;
      const y = padding.top + chartHeight / 2; // Center point
      
      // Draw a simple horizontal line
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Add a label explaining the issue (not in compact mode)
      if (!compactMode) {
        ctx.fillStyle = colors.text;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Insufficient data for detailed chart', width / 2, height / 2 - 40);
      }
    } else {
      // Normal chart with multiple points
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
      
      // Draw data points (smaller in compact mode)
      const pointRadius = compactMode ? 3 : 5;
      points.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, pointRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = colors.line;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      
      // Draw x-axis labels (skip in compact mode or draw smaller)
      if (!compactMode) {
        ctx.fillStyle = colors.text;
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        
        labels.forEach((label, index) => {
          const x = padding.left + (index / (labels.length - 1)) * chartWidth;
          ctx.fillText(label, x, height - padding.bottom / 2);
        });
      } else if (labels.length > 1) {
        // For compact mode, just draw first and last label
        ctx.fillStyle = colors.text;
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        
        // Draw first label
        ctx.fillText(labels[0], padding.left, height - 5);
        
        // Draw last label
        ctx.fillText(labels[labels.length - 1], width - padding.right, height - 5);
      }
    }
    
    // Convert canvas to base64
    console.log('Converting canvas to base64');
    const imageBase64 = canvas.toDataURL('image/png').split(',')[1];
    console.log('Successfully generated chart image, length:', imageBase64.length);
    return imageBase64;
  } catch (error) {
    console.error('Error generating chart:', error);
    
    // Generate a simple error chart showing what went wrong
    try {
      const width = 800;
      const height = 400;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      
      // Fill background
      ctx.fillStyle = darkMode ? '#111827' : '#ffffff';
      ctx.fillRect(0, 0, width, height);
      
      // Draw error message
      ctx.fillStyle = darkMode ? '#ffffff' : '#333333';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Error Generating Chart', width / 2, 50);
      
      // Draw detailed error message
      ctx.font = '14px sans-serif';
      ctx.fillText(error.message, width / 2, 100);
      
      // Draw hint for troubleshooting
      ctx.font = '12px sans-serif';
      ctx.fillText('Check the server logs for more details', width / 2, 140);
      
      // Convert canvas to base64
      const errorImage = canvas.toDataURL('image/png').split(',')[1];
      return errorImage;
    } catch (fallbackError) {
      console.error('Error creating fallback error chart:', fallbackError);
      throw error; // Throw the original error
    }
  }
}

module.exports = { generateChart }; 