import type { EChartsOption } from 'echarts';
import type { AnalyticsDataPoint } from '../../types/admin';

type ChartType = 'pie' | 'bar' | 'line' | 'area';

/**
 * Chart Option Factory for Apache ECharts
 * 
 * Centralizes configuration for tooltips, titles, and toolboxes.
 * Uses ECharts native color themes and avoids hardcoded colors.
 */

/**
 * Build a fully configured ECharts option
 * 
 * @param chartType - Type of chart: "pie", "bar", "line", or "area"
 * @param title - Chart title
 * @param data - Array of analytics data points
 * @returns EChartsOption for rendering
 */
export function buildChartOption(
  chartType: ChartType,
  title: string,
  data: AnalyticsDataPoint[]
): EChartsOption {
  const baseOption: EChartsOption = {
    title: buildTitle(title),
    tooltip: buildTooltip(),
    toolbox: buildToolbox(title),
  };

  switch (chartType) {
    case 'pie':
      return { ...baseOption, ...buildPieChart(data) };
    case 'bar':
      return { ...baseOption, ...buildBarChart(data) };
    case 'line':
      return { ...baseOption, ...buildLineChart(data) };
    case 'area':
      return { ...baseOption, ...buildAreaChart(data) };
    default:
      const _exhaustive: never = chartType;
      return _exhaustive;
  }
}

/**
 * Build title configuration
 */
function buildTitle(text: string): EChartsOption['title'] {
  return {
    text,
    left: 'center',
    top: 8,
    textStyle: {
      fontSize: 16,
      fontWeight: 500,
    },
  };
}

/**
 * Build tooltip configuration
 */
function buildTooltip(): EChartsOption['tooltip'] {
  return {
    trigger: 'axis',
    axisPointer: {
      type: 'shadow',
    },
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderColor: '#ccc',
    textStyle: {
      color: '#fff',
    },
  };
}

/**
 * Generate a descriptive filename from chart title
 */
function generateChartFilename(title: string): string {
  return `${title.toLowerCase().replace(/\s+/g, '-')}-chart.png`;
}

/**
 * Build toolbox configuration with standardized tools
 */
function buildToolbox(chartTitle: string): EChartsOption['toolbox'] {
  return {
    feature: {
      saveAsImage: {
        show: true,
        title: 'Save as Image',
        type: 'png',
        pixelRatio: 2,
        name: generateChartFilename(chartTitle),
      },
      dataView: {
        show: true,
        title: 'Data View',
        readOnly: true,
      },
      restore: {
        show: true,
        title: 'Restore',
      },
    },
    orient: 'vertical',
    right: 16,
    top: 'center',
  };
}

/**
 * Build pie chart configuration
 */
function buildPieChart(data: AnalyticsDataPoint[]): EChartsOption {
  return {
    series: [
      {
        type: 'pie',
        radius: '60%',
        center: ['50%', '50%'],
        data: data.map((item) => ({
          name: item.name || item.type,
          value: item.value,
        })),
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      },
    ],
  };
}

/**
 * Build bar chart configuration
 */
function buildBarChart(data: AnalyticsDataPoint[]): EChartsOption {
  return {
    xAxis: {
      type: 'category',
      data: data.map((item) => item.type),
      boundaryGap: true,
    },
    yAxis: {
      type: 'value',
    },
    tooltip: {
      ...buildTooltip(),
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
      },
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        start: 0,
        end: 100,
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        start: 0,
        end: 100,
        height: 20,
      },
    ],
    series: [
      {
        type: 'bar',
        data: data.map((item) => item.value),
        emphasis: {
          focus: 'series',
        },
      },
    ],
    grid: {
      left: '3%',
      right: '3%',
      bottom: '8%',
      top: '15%',
      containLabel: true,
    },
  };
}

/**
 * Build line chart configuration
 */
function buildLineChart(data: AnalyticsDataPoint[]): EChartsOption {
  return buildCartesianChart(data, false);
}

/**
 * Build area chart configuration
 */
function buildAreaChart(data: AnalyticsDataPoint[]): EChartsOption {
  return buildCartesianChart(data, true);
}

/**
 * Build shared cartesian chart configuration for line and area charts
 */
function buildCartesianChart(
  data: AnalyticsDataPoint[],
  includeAreaStyle: boolean
): EChartsOption {
  return {
    xAxis: {
      type: 'category',
      data: data.map((item) => item.type),
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        start: 0,
        end: 100,
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        start: 0,
        end: 100,
        height: 20,
      },
    ],
    series: [
      {
        type: 'line',
        data: data.map((item) => item.value),
        smooth: true,
        ...(includeAreaStyle && { areaStyle: {} }),
        emphasis: {
          focus: 'series',
        },
      },
    ],
    grid: {
      left: '3%',
      right: '3%',
      bottom: '8%',
      top: '15%',
      containLabel: true,
    },
  };
}
