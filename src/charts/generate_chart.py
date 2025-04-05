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

def generate_chart(data_json, dark_mode=False, compact_mode=False, chart_type='balance'):
    """
    Generate a line chart for wallet balance or PnL history
    
    Args:
        data_json: JSON string or list containing chart data
        dark_mode: Whether to use dark mode colors
        compact_mode: Whether to use a more compact chart design
        chart_type: Type of chart to generate ('balance' or 'pnl')
    
    Returns:
        Base64 encoded PNG image
    """
    try:
        # Parse the input data
        if isinstance(data_json, str):
            data = json.loads(data_json)
        else:
            data = data_json
        
        # Extract values and dates
        dates = [point.get('label', '') for point in data]
        values = [float(point.get('value', 0)) for point in data]
        
        if not values or len(values) < 2:
            print("Warning: Not enough data points for chart.", file=sys.stderr)
            # Create at least two points if we don't have enough
            if len(values) == 0:
                values = [0, 0]
                dates = ['Start', 'End']
            elif len(values) == 1:
                values = [values[0], values[0]]
                dates = ['Start', dates[0] if dates else 'End']
        
        # Determine if trend is positive (upward)
        is_positive = values[-1] >= values[0]
        
        # Set style based on mode
        if dark_mode:
            plt.style.use('dark_background')
            positive_color = '#22c55e'  # Green
            negative_color = '#ef4444'  # Red
            grid_color = 'rgba(255, 255, 255, 0.1)'
            text_color = 'white'
        else:
            plt.style.use('default')
            positive_color = '#16a34a'  # Green
            negative_color = '#dc2626'  # Red
            grid_color = 'rgba(0, 0, 0, 0.1)'
            text_color = 'black'
        
        line_color = positive_color if is_positive else negative_color
        area_color = positive_color if is_positive else negative_color
        
        # Create figure and axis with appropriate size
        fig_width = 6 if compact_mode else 8
        fig_height = 3 if compact_mode else 4
        fig, ax = plt.subplots(figsize=(fig_width, fig_height), dpi=100)
        
        # Plot the line
        marker_size = 4 if compact_mode else 5
        line_width = 1.5 if compact_mode else 2
        ax.plot(range(len(values)), values, color=line_color, linewidth=line_width, marker='o', markersize=marker_size)
        
        # Handle area filling differently based on chart type
        if chart_type == 'pnl':
            # For PnL charts, fill above zero with green and below with red
            ax.axhline(y=0, color=grid_color, linestyle='-', alpha=0.8, linewidth=1)
            
            # Fill above/below zero with appropriate colors
            ax.fill_between(
                range(len(values)), 
                values, 
                0, 
                where=[v >= 0 for v in values], 
                color=positive_color, 
                alpha=0.2
            )
            ax.fill_between(
                range(len(values)), 
                values, 
                0, 
                where=[v < 0 for v in values], 
                color=negative_color, 
                alpha=0.2
            )
        else:
            # For balance charts, fill the whole area under the curve
            ax.fill_between(
                range(len(values)), 
                values, 
                alpha=0.2, 
                color=area_color
            )
        
        # Configure x-axis
        ax.set_xticks(range(len(dates)))
        rotation = 30 if compact_mode else 45
        ax.set_xticklabels(dates, rotation=rotation, ha='right', fontsize=8 if compact_mode else 10)
        
        # Configure y-axis with appropriate padding
        if chart_type == 'pnl':
            # For PnL, ensure we show the zero line
            max_abs_val = max(abs(min(values)), abs(max(values)))
            padding = max_abs_val * 0.2
            y_min = min(min(values) - padding, -padding)  # Ensure some negative space is shown
            y_max = max(max(values) + padding, padding)   # Ensure some positive space is shown
            ax.set_ylim(y_min, y_max)
        else:
            # For balance, provide appropriate padding
            min_val = min(values) * 0.9 if min(values) > 0 else min(values) * 1.1 if min(values) < 0 else 0
            max_val = max(values) * 1.1
            ax.set_ylim(min_val, max_val)
        
        # Add grid
        ax.grid(True, linestyle='--', alpha=0.3, color=grid_color)
        
        # Set title and labels
        if not compact_mode:
            if chart_type == 'pnl':
                ax.set_title('PnL Performance')
                ax.set_ylabel('PnL %')
            else:
                ax.set_title('SOL Balance Over Time')
                ax.set_ylabel('SOL Balance')
        
        # Add value labels to the points if not in compact mode
        if not compact_mode:
            for i, v in enumerate(values):
                if chart_type == 'pnl':
                    label_text = f"{v:+.1f}%" if abs(v) < 100 else f"{v:+.0f}%"
                else:
                    label_text = f"{v:.2f}" if v < 10 else f"{v:.1f}" if v < 100 else f"{v:.0f}"
                
                # Determine position of the label (above/below the point)
                y_offset = 0.03 * (max_val - min_val) if 'min_val' in locals() else 0.03 * (y_max - y_min)
                if i > 0 and i < len(values) - 1:
                    # Only show labels for first, last, and min/max points to avoid clutter
                    if v != max(values) and v != min(values):
                        continue
                
                va = 'bottom' if (i == 0 or i == len(values) - 1 or v == max(values)) else 'top'
                label_y = v + y_offset if va == 'bottom' else v - y_offset
                
                ax.annotate(
                    label_text, 
                    (i, label_y),
                    textcoords="offset points",
                    xytext=(0, 0),
                    ha='center',
                    va=va,
                    fontsize=8,
                    color=text_color,
                    bbox=dict(boxstyle="round,pad=0.3", fc='white' if not dark_mode else 'black', alpha=0.6)
                )
        
        # Tight layout to ensure all elements fit
        plt.tight_layout()
        
        # Save to BytesIO object instead of file
        buf = BytesIO()
        plt.savefig(buf, format='png', transparent=False)
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
        print("Usage: python generate_chart.py '[{\"value\": 1.2, \"label\": \"Jan 1\"}, ...]' [dark_mode] [compact_mode] [chart_type]")
        sys.exit(1)
    
    data_json = sys.argv[1]
    dark_mode = len(sys.argv) > 2 and sys.argv[2].lower() == 'true'
    compact_mode = len(sys.argv) > 3 and sys.argv[3].lower() == 'true'
    chart_type = sys.argv[4] if len(sys.argv) > 4 else 'balance'
    
    # Generate and output chart
    img_base64 = generate_chart(data_json, dark_mode, compact_mode, chart_type)
    if img_base64:
        print(img_base64)
    else:
        sys.exit(1) 