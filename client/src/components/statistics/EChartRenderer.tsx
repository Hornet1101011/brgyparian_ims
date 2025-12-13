import React, { useMemo, useRef, useEffect } from 'react';
import { Spin, Empty } from 'antd';
import type { EChartsOption } from 'echarts';
import * as echarts from 'echarts';

interface EChartRendererProps {
  option?: EChartsOption;
  loading?: boolean;
  height?: number | string;
}

/**
 * Reusable ECharts renderer component using native echarts library
 * 
 * Handles:
 * - Loading states with Ant Design Spin
 * - Empty states when no data is provided
 * - Proper chart lifecycle management
 * - Cleanup on unmount to prevent memory leaks
 * 
 * @param option - ECharts configuration object
 * @param loading - Show loading spinner when true
 * @param height - Chart height in pixels (default: 300)
 */
const EChartRendererComponent = ({ option, loading = false, height = 300 }: EChartRendererProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  // Validate data existence
  const hasData = useMemo(
    () => !!option && !!option.series && Array.isArray(option.series) && option.series.length > 0,
    [option]
  );

  // Initialize and update chart
  useEffect(() => {
    if (!containerRef.current) return;
    if (loading || !hasData) return;

    try {
      // Create chart instance if not exists
      if (!chartInstanceRef.current) {
        chartInstanceRef.current = echarts.init(containerRef.current, null, { renderer: 'svg' });
      }

      // Validate instance is still valid
      if (!chartInstanceRef.current) return;

      // Update chart option with animation disabled to prevent interaction issues
      if (option) {
        // Add animation: false to prevent tooltip/interaction errors
        const safeOption = {
          ...option,
          animation: false,
          tooltip: {
            ...(option.tooltip || {}),
            trigger: 'item',
            confine: true,
          },
        };
        chartInstanceRef.current.setOption(safeOption, { lazyUpdate: true, notMerge: true });
      }
    } catch (error) {
      console.error('ECharts initialization error:', error);
    }
  }, [option, hasData, loading]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      try {
        if (chartInstanceRef.current && !loading && hasData) {
          chartInstanceRef.current.resize();
        }
      } catch (error) {
        // Silently ignore resize errors during cleanup
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [loading, hasData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        if (chartInstanceRef.current) {
          // Clear any pending interactions
          chartInstanceRef.current.off('mousemove');
          chartInstanceRef.current.off('mouseout');
          chartInstanceRef.current.off('click');
          
          // Dispose the chart
          chartInstanceRef.current.dispose();
          chartInstanceRef.current = null;
        }
      } catch (error) {
        // Silently ignore cleanup errors
        chartInstanceRef.current = null;
      }
    };
  }, []);

  // Show loading state
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: `${height}px`,
          width: '100%'
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  // Show empty state
  if (!hasData) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: `${height}px`,
          width: '100%'
        }}
      >
        <Empty description="No data available" />
      </div>
    );
  }

  // Render chart container
  return (
    <div
      ref={containerRef}
      style={{ height: `${height}px`, width: '100%' }}
    />
  );
};

const EChartRenderer = React.memo(
  EChartRendererComponent,
  (prevProps: EChartRendererProps, nextProps: EChartRendererProps): boolean => {
    // Custom comparison: only re-render if option, loading, or height changes
    return (
      prevProps.option === nextProps.option &&
      prevProps.loading === nextProps.loading &&
      prevProps.height === nextProps.height
    );
  }
);

EChartRenderer.displayName = 'EChartRenderer';

export default EChartRenderer;
