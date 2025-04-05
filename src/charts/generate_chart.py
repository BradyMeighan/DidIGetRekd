import sys
import json
import os
import matplotlib.pyplot as plt
import matplotlib
import numpy as np
from datetime import datetime
import base64
from io import BytesIO

# Set matplotlib to non-interactive mode
matplotlib.use('Agg')

def generate_chart(data_json, dark_mode=False):
    """
    Generate a line chart for wallet balance history
    
    Args:
        data_json: JSON string containing chart data
        dark_mode: Whether to use dark mode colors
    
    Returns:
        Base64 encoded PNG image
    """
    try:
        # Parse the input JSON data
        data = json.loads(data_json)
        
        # Extract values and dates
        dates = [point.get('label', '') for point in data]
        values = [float(point.get('value', 0)) for point in data]
        
        # Set style based on mode
        if dark_mode:
            plt.style.use('dark_background')
            line_color = '#22c55e' if values[-1] >= values[0] else '#ef4444'
            area_color = 'rgba(34, 197, 94, 0.2)' if values[-1] >= values[0] else 'rgba(239, 68, 68, 0.2)'
            grid_color = 'rgba(255, 255, 255, 0.1)'
        else:
            plt.style.use('default')
            line_color = '#16a34a' if values[-1] >= values[0] else '#dc2626'
            area_color = 'rgba(22, 163, 74, 0.15)' if values[-1] >= values[0] else 'rgba(220, 38, 38, 0.15)'
            grid_color = 'rgba(0, 0, 0, 0.1)'
        
        # Create figure and axis
        fig, ax = plt.subplots(figsize=(8, 4), dpi=100)
        
        # Plot the line
        ax.plot(range(len(values)), values, color=line_color, linewidth=2, marker='o', markersize=5)
        
        # Fill area under curve
        ax.fill_between(range(len(values)), values, color=area_color.replace('rgba', 'rgba').replace(')', ''), alpha=0.3)
        
        # Configure x-axis
        ax.set_xticks(range(len(dates)))
        ax.set_xticklabels(dates, rotation=45, ha='right')
        
        # Configure y-axis with padding
        min_val = min(values) * 0.9 if min(values) > 0 else 0
        max_val = max(values) * 1.1
        ax.set_ylim(min_val, max_val)
        
        # Add grid
        ax.grid(True, linestyle='--', alpha=0.3, color=grid_color.replace('rgba', 'rgba').replace(')', ''))
        
        # Set title and labels
        ax.set_title('SOL Balance Over Time')
        ax.set_ylabel('SOL Balance')
        
        # Tight layout to ensure all elements fit
        plt.tight_layout()
        
        # Save to BytesIO object instead of file
        buf = BytesIO()
        plt.savefig(buf, format='png')
        buf.seek(0)
        
        # Encode as base64 for easy transfer
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        plt.close(fig)
        
        return img_base64
        
    except Exception as e:
        print(f"Error generating chart: {e}", file=sys.stderr)
        return None

if __name__ == "__main__":
    # Get arguments
    if len(sys.argv) < 2:
        print("Usage: python generate_chart.py '[{\"value\": 1.2, \"label\": \"Jan 1\"}, ...]' [dark_mode]")
        sys.exit(1)
    
    data_json = sys.argv[1]
    dark_mode = len(sys.argv) > 2 and sys.argv[2].lower() == 'true'
    
    # Generate and output chart
    img_base64 = generate_chart(data_json, dark_mode)
    if img_base64:
        print(img_base64)
    else:
        sys.exit(1) 