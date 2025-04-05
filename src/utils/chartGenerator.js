const { createCanvas } = require('canvas');

/**
 * Generate a line chart for wallet balance history using Node.js Canvas
 * 
 * @param {Array} data - Array of {value, label} points
 * @param {boolean} darkMode - Whether to use dark mode colors
 * @param {boolean} compactMode - Whether to use compact mode for share modal (no labels, simplified)
 * @param {string} chartType - Chart type ('balance' or 'pnl')
 * @returns {string} - Base64 encoded PNG image
 */
function generateChart(data, darkMode = false, compactMode = false, chartType = 'balance') {
  try {
    console.log('Starting chart generation with data:', JSON.stringify(data));
    console.log('Chart options:', { darkMode, compactMode, chartType });
    
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
    
    // Calculate data range with safety checks for different chart types
    let minValue, maxValue, valueRange;
    
    if (chartType === 'pnl') {
      // For PnL charts, ensure we include 0 in the range
      minValue = Math.min(0, ...values) * 1.1; // Multiply by 1.1 to add padding for negatives
      maxValue = Math.max(0, ...values) * 1.1; // Multiply by 1.1 to add padding for positives
      valueRange = maxValue - minValue || 100; // Default to 100 range if all values are 0
    } else {
      // For balance charts, start from 0 or slightly lower than min value
      minValue = Math.max(0, Math.min(...values) * 0.9);
      maxValue = Math.max(...values) * 1.1 || 1; // Fallback to 1 if max is 0
      valueRange = maxValue - minValue || 1; // Avoid division by zero
    }
    
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
      grid: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      // Add zero line color for PnL charts
      zeroLine: darkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'
    };
    
    // Canvas setup - adjust dimensions for compact mode
    const width = 800;
    const height = 400;
    
    // Adjust padding for compact mode (minimal padding for modal view)
    const padding = compactMode 
      ? { top: 10, right: 5, bottom: 20, left: 5 }
      : { top: 40, right: 20, bottom: 60, left: 60 };
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Fill background
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);
    
    // Draw title if not in compact mode
    if (!compactMode) {
      ctx.fillStyle = colors.text;
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.textAlign = 'center';
      
      // Set appropriate title based on chart type
      const title = chartType === 'pnl' ? 'PnL Over Time (%)' : 'SOL Balance Over Time';
      ctx.fillText(title, width / 2, 20);
      
      // Draw y-axis label
      ctx.save();
      ctx.translate(15, height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      
      // Set appropriate y-axis label based on chart type
      const yLabel = chartType === 'pnl' ? 'PnL (%)' : 'SOL Balance';
      ctx.fillText(yLabel, 0, 0);
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
        ctx.font = '12px Arial, sans-serif';
        ctx.textAlign = 'right';
        
        // Format labels based on chart type
        const label = chartType === 'pnl' 
          ? `${value.toFixed(1)}%` 
          : value.toFixed(2);
        
        ctx.fillText(label, padding.left - 10, y + 4);
      }
      
      // For PnL charts, draw a special zero line if 0 is within the range
      if (chartType === 'pnl' && minValue <= 0 && maxValue >= 0) {
        // Calculate the y-position of the zero line
        const zeroY = padding.top + chartHeight - ((0 - minValue) / valueRange) * chartHeight;
        
        ctx.beginPath();
        ctx.moveTo(padding.left, zeroY);
        ctx.lineTo(width - padding.right, zeroY);
        ctx.strokeStyle = colors.zeroLine;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Add "0%" label to the zero line
        ctx.fillStyle = colors.text;
        ctx.font = 'bold 12px Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('0%', padding.left - 10, zeroY + 4);
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
      
      // For PnL charts in compact mode, still draw the zero line
      if (chartType === 'pnl' && minValue <= 0 && maxValue >= 0) {
        const zeroY = padding.top + chartHeight - ((0 - minValue) / valueRange) * chartHeight;
        
        ctx.beginPath();
        ctx.moveTo(padding.left, zeroY);
        ctx.lineTo(width - padding.right, zeroY);
        ctx.strokeStyle = colors.zeroLine;
        ctx.lineWidth = 1;
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
        ctx.font = '14px Arial, sans-serif';
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
      
      // Calculate zero Y position for PnL charts (for fill above/below)
      const zeroY = chartType === 'pnl' && minValue <= 0 
        ? padding.top + chartHeight - ((0 - minValue) / valueRange) * chartHeight 
        : padding.top + chartHeight;
      
      // For PnL charts, fill differently above and below the zero line
      if (chartType === 'pnl' && minValue <= 0 && maxValue >= 0) {
        // First detect segments that are above or below zero
        let currentSegment = [];
        let segmentType = values[0] >= 0 ? 'above' : 'below';
        
        for (let i = 0; i < points.length; i++) {
          const point = points[i];
          const value = values[i];
          const newType = value >= 0 ? 'above' : 'below';
          
          // If we've crossed the zero line, draw the current segment and start a new one
          if (newType !== segmentType && currentSegment.length > 0) {
            drawAreaSegment(currentSegment, segmentType === 'above', zeroY);
            currentSegment = [];
            segmentType = newType;
          }
          
          currentSegment.push(point);
          
          // If we're at the end, draw the final segment
          if (i === points.length - 1 && currentSegment.length > 0) {
            drawAreaSegment(currentSegment, segmentType === 'above', zeroY);
          }
        }
      } else {
        // For balance charts, fill area under the line normally
        ctx.beginPath();
        ctx.moveTo(points[0].x, zeroY); // Start at bottom left
        
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
        ctx.lineTo(points[points.length - 1].x, zeroY);
        ctx.closePath();
        
        // Fill the area
        ctx.fillStyle = colors.area;
        ctx.fill();
      }
      
      // Helper function to draw a segment of the area
      function drawAreaSegment(segmentPoints, isAboveZero, zeroLine) {
        if (segmentPoints.length === 0) return;
        
        ctx.beginPath();
        ctx.moveTo(segmentPoints[0].x, zeroLine); // Start at the zero line
        
        // Draw up to first point
        ctx.lineTo(segmentPoints[0].x, segmentPoints[0].y);
        
        // Draw line through all segment points
        for (let i = 1; i < segmentPoints.length; i++) {
          const prevPoint = segmentPoints[i - 1];
          const currentPoint = segmentPoints[i];
          
          // Control points for curve
          const cp1x = prevPoint.x + (currentPoint.x - prevPoint.x) / 3;
          const cp2x = prevPoint.x + 2 * (currentPoint.x - prevPoint.x) / 3;
          
          ctx.bezierCurveTo(
            cp1x, prevPoint.y,
            cp2x, currentPoint.y,
            currentPoint.x, currentPoint.y
          );
        }
        
        // Close the path down to the zero line
        ctx.lineTo(segmentPoints[segmentPoints.length - 1].x, zeroLine);
        ctx.closePath();
        
        // Fill with appropriate color (green for above, red for below)
        if (isAboveZero) {
          ctx.fillStyle = darkMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(22, 163, 74, 0.15)';
        } else {
          ctx.fillStyle = darkMode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(220, 38, 38, 0.15)';
        }
        ctx.fill();
      }
      
      // Draw the line over the area
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
      points.forEach((point, i) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, pointRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        
        // Use green/red colors based on the value (for PnL charts)
        if (chartType === 'pnl') {
          ctx.strokeStyle = values[i] >= 0 
            ? (darkMode ? '#22c55e' : '#16a34a')  // Green
            : (darkMode ? '#ef4444' : '#dc2626'); // Red
        } else {
          ctx.strokeStyle = colors.line;
        }
        
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      
      // Draw x-axis labels (skip in compact mode or draw smaller)
      if (!compactMode) {
        ctx.fillStyle = colors.text;
        ctx.font = '12px Arial, sans-serif';
        ctx.textAlign = 'center';
        
        // If we have many labels, draw a subset to avoid overcrowding
        const maxLabelsToShow = Math.min(10, labels.length);
        const labelStep = Math.ceil(labels.length / maxLabelsToShow);
        
        for (let i = 0; i < labels.length; i += labelStep) {
          const x = padding.left + (i / (labels.length - 1)) * chartWidth;
          ctx.fillText(labels[i], x, height - padding.bottom / 2);
        }
        
        // Always show the last label
        if (labels.length > 1 && (labels.length - 1) % labelStep !== 0) {
          const x = padding.left + chartWidth;
          ctx.fillText(labels[labels.length - 1], x, height - padding.bottom / 2);
        }
      } else if (labels.length > 1) {
        // For compact mode, just draw first and last label
        ctx.fillStyle = colors.text;
        ctx.font = '9px Arial, sans-serif';
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
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Error Generating Chart', width / 2, 50);
      
      // Draw detailed error message
      ctx.font = '14px Arial, sans-serif';
      ctx.fillText(error.message, width / 2, 100);
      
      // Draw hint for troubleshooting
      ctx.font = '12px Arial, sans-serif';
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