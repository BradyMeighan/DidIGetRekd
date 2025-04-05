import sys
import json
import os
import matplotlib.pyplot as plt
import matplotlib
import numpy as np
from datetime import datetime
import base64
from io import BytesIO
import io
import matplotlib.dates as mdates
import matplotlib.ticker as ticker

# Set matplotlib to non-interactive mode
matplotlib.use('Agg')

def generate_chart(data_json, dark_mode=False):
    """
    Generate a line chart for wallet balance history or PnL
    
    Args:
        data_json (str): JSON string with chart options and data points
        dark_mode (bool): Whether to use dark mode styling
    
    Returns:
        str: Base64 encoded PNG image
    """
    try:
        # Parse the JSON data
        data = json.loads(data_json)
        
        # Extract chart options and data points
        chart_type = data.get('chart_type', 'balance')
        x_axis_label = data.get('x_axis_label', 'Time')
        y_axis_label = data.get('y_axis_label', 'Balance')
        tooltip_format = data.get('tooltip_format', '${value:.2f}')
        title = data.get('title', 'Wallet Balance History')
        show_value_labels = data.get('show_value_labels', False)
        is_synthetic = data.get('is_synthetic', False)
        data_points = data.get('data', [])
        
        if not data_points:
            raise ValueError("No data points provided")
        
        # Create figure with appropriate size and DPI
        plt.figure(figsize=(10, 6), dpi=100)
        
        # Parse dates and values
        dates = []
        values = []
        
        for point in data_points:
            try:
                date_str = point.get('timestamp', point.get('x', ''))
                value = float(point.get('sol_balance', point.get('y', 0)))
                
                if date_str:
                    date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                    dates.append(date_obj)
                    values.append(value)
            except (ValueError, TypeError) as e:
                print(f"Error parsing data point: {e}")
        
        if not dates or not values:
            raise ValueError("No valid data points could be parsed")
        
        # Set style based on dark_mode
        if dark_mode:
            plt.style.use('dark_background')
            grid_color = 'gray'
            line_color = '#4da6ff'  # Light blue
            fill_color = 'rgba(77, 166, 255, 0.2)'  # Transparent light blue
            text_color = 'white'
            indicator_color = 'yellow'
        else:
            plt.style.use('default')
            grid_color = 'lightgray'
            line_color = '#1a75ff'  # Darker blue
            fill_color = 'rgba(26, 117, 255, 0.1)'  # Transparent blue
            text_color = 'black'
            indicator_color = 'orangered'
        
        # Determine if trend is positive, negative, or neutral
        if len(values) > 1:
            first_val = values[0]
            last_val = values[-1]
            if last_val > first_val:
                trend = 'positive'
                if chart_type == 'pnl':
                    line_color = '#00b33c'  # Green
                    fill_color = 'rgba(0, 179, 60, 0.2)'  # Transparent green
            elif last_val < first_val:
                trend = 'negative'
                if chart_type == 'pnl':
                    line_color = '#ff3333'  # Red
                    fill_color = 'rgba(255, 51, 51, 0.2)'  # Transparent red
            else:
                trend = 'neutral'
        else:
            trend = 'neutral'
        
        # Plot the line with gradient
        plt.plot(dates, values, marker='o', linestyle='-', color=line_color, linewidth=2.5, 
                 markerfacecolor='white', markeredgecolor=line_color, markersize=5)
        
        # Fill area under the curve for balance charts
        if chart_type == 'balance':
            plt.fill_between(dates, 0, values, color=fill_color, alpha=0.9)
        
        # For PnL charts, fill above/below zero differently
        elif chart_type == 'pnl':
            above_zero = np.maximum(values, 0)
            below_zero = np.minimum(values, 0)
            
            plt.fill_between(dates, 0, above_zero, color='rgba(0, 179, 60, 0.2)', alpha=0.9)
            plt.fill_between(dates, 0, below_zero, color='rgba(255, 51, 51, 0.2)', alpha=0.9)
        
        # Format the x-axis to show dates nicely
        ax = plt.gca()
        
        # Determine the best date format based on the date range
        date_range = max(dates) - min(dates)
        if date_range.days < 2:  # Less than 2 days
            date_fmt = mdates.DateFormatter('%H:%M')
            ax.xaxis.set_major_locator(mdates.HourLocator(interval=3))
        elif date_range.days < 14:  # Less than 2 weeks
            date_fmt = mdates.DateFormatter('%m/%d')
            ax.xaxis.set_major_locator(mdates.DayLocator(interval=1))
        elif date_range.days < 180:  # Less than 6 months
            date_fmt = mdates.DateFormatter('%m/%d')
            ax.xaxis.set_major_locator(mdates.WeekdayLocator(interval=2))
        else:  # More than 6 months
            date_fmt = mdates.DateFormatter('%b %Y')
            ax.xaxis.set_major_locator(mdates.MonthLocator(interval=1))
        
        ax.xaxis.set_major_formatter(date_fmt)
        plt.xticks(rotation=45)
        
        # Add grid
        plt.grid(True, linestyle='--', alpha=0.7, color=grid_color)
        
        # Set y-axis limits for better visualization
        min_value = min(values)
        max_value = max(values)
        y_range = max_value - min_value
        
        # For PnL, ensure 0 is included in the range
        if chart_type == 'pnl':
            min_y = min(0, min_value - 0.1 * abs(y_range))
            max_y = max(0, max_value + 0.1 * abs(y_range))
        else:
            # For balance, don't go below 0 (or very close to 0)
            min_y = max(0, min_value - 0.05 * abs(y_range))
            max_y = max_value + 0.1 * abs(y_range)
        
        # Ensure we don't divide by zero or have NaNs
        if min_y == max_y:
            if min_y == 0:
                max_y = 0.1
            else:
                min_y = 0.9 * min_y
                max_y = 1.1 * max_y
        
        plt.ylim(min_y, max_y)
        
        # Format y-axis with K, M suffixes for large values
        if max_value >= 1000:
            def y_fmt(x, pos):
                if x >= 1_000_000:
                    return f'{x/1_000_000:.1f}M'
                elif x >= 1_000:
                    return f'{x/1_000:.1f}K'
                else:
                    return f'{x:.1f}'
            
            ax.yaxis.set_major_formatter(ticker.FuncFormatter(y_fmt))
        
        # Set labels and title
        plt.xlabel(x_axis_label, fontsize=12, labelpad=10, color=text_color)
        plt.ylabel(y_axis_label, fontsize=12, labelpad=10, color=text_color)
        plt.title(title, fontsize=16, pad=20, color=text_color)
        
        # Add indicator for synthetic data if this is synthetic
        if is_synthetic:
            plt.figtext(0.99, 0.01, 'Estimated data', fontsize=8, 
                      color=indicator_color, ha='right', style='italic')
        
        # Add value labels if requested
        if show_value_labels:
            for i, (date, value) in enumerate(zip(dates, values)):
                # Only label first, last, min, max and a few points in between
                if (i == 0 or i == len(values) - 1 or 
                    value == max_value or value == min_value or 
                    i % max(1, len(values) // 5) == 0):
                    
                    plt.annotate(
                        f'{value:.2f}',
                        (date, value),
                        xytext=(0, 10),
                        textcoords='offset points',
                        ha='center',
                        fontsize=9,
                        color=text_color,
                        bbox=dict(boxstyle='round,pad=0.3', fc='white' if not dark_mode else 'black', 
                                 alpha=0.7, ec='none')
                    )
        
        # Add a subtle watermark
        plt.figtext(0.5, 0.5, 'Did I Just Get REK\'D?', fontsize=40, 
                  color=grid_color, ha='center', va='center', alpha=0.07, rotation=30)
        
        # Tight layout for better spacing
        plt.tight_layout()
        
        # Save the figure to a BytesIO object
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight')
        buf.seek(0)
        
        # Encode the image to base64
        img_str = base64.b64encode(buf.getvalue()).decode('utf-8')
        
        # Clean up to prevent memory leaks
        plt.close('all')
        
        return img_str
    
    except Exception as e:
        print(f"Error generating chart: {e}")
        # Create a simple error chart
        plt.figure(figsize=(10, 6), dpi=100)
        
        if dark_mode:
            plt.style.use('dark_background')
            text_color = 'white'
        else:
            plt.style.use('default')
            text_color = 'black'
        
        plt.text(0.5, 0.5, f"Error generating chart: {e}", 
                 ha='center', va='center', fontsize=12, color=text_color)
        
        # Save the error image
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight')
        buf.seek(0)
        img_str = base64.b64encode(buf.getvalue()).decode('utf-8')
        plt.close('all')
        
        return img_str

if __name__ == "__main__":
    # Get arguments
    if len(sys.argv) < 2:
        print("Usage: python generate_chart.py '[{\"value\": 1.2, \"label\": \"Jan 1\"}, ...]' [dark_mode]")
        sys.exit(1)
    
    data_json = sys.argv[1]
    dark_mode = len(sys.argv) > 2 and sys.argv[2].lower() == 'true'
    
    # Generate and output chart
    img_str = generate_chart(data_json, dark_mode)
    if img_str:
        print(img_str)
    else:
        sys.exit(1) 