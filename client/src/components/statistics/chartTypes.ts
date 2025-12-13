/**
 * Centralized Chart Metadata and Configuration
 * 
 * Defines chart types, configuration structure, and all available charts
 * for statistics and analytics visualization.
 */

/**
 * Chart type union - supports pie, bar, line, and area charts
 */
export type ChartKind = 'pie' | 'bar' | 'line' | 'area';

/**
 * Chart configuration interface
 * 
 * @property id - Unique identifier for the chart
 * @property title - Display title shown in the chart
 * @property defaultType - Default chart type to render
 * @property endpoint - API endpoint to fetch chart data
 */
export interface ChartConfig {
  id: string;
  title: string;
  defaultType: ChartKind;
  endpoint: string;
}

/**
 * Map of all available charts
 * 
 * Each chart is identified by a unique key and includes metadata
 * for rendering and data fetching.
 */
export const CHART_CONFIGS: Record<string, ChartConfig> = {
  gender: {
    id: 'gender',
    title: 'Residents by Gender',
    defaultType: 'pie',
    endpoint: '/api/analytics/gender',
  },
  age: {
    id: 'age',
    title: 'Residents by Age Group',
    defaultType: 'bar',
    endpoint: '/api/analytics/age',
  },
  occupation: {
    id: 'occupation',
    title: 'Residents by Occupation',
    defaultType: 'pie',
    endpoint: '/api/analytics/occupation',
  },
  nationality: {
    id: 'nationality',
    title: 'Residents by Nationality',
    defaultType: 'pie',
    endpoint: '/api/analytics/nationality',
  },
  'blood-type': {
    id: 'blood-type',
    title: 'Residents by Blood Type',
    defaultType: 'pie',
    endpoint: '/api/analytics/blood-type',
  },
  disability: {
    id: 'disability',
    title: 'Residents with Disabilities',
    defaultType: 'pie',
    endpoint: '/api/analytics/disability',
  },
  'business-type': {
    id: 'business-type',
    title: 'Businesses by Type',
    defaultType: 'pie',
    endpoint: '/api/analytics/business-type',
  },
  'business-size': {
    id: 'business-size',
    title: 'Businesses by Size',
    defaultType: 'bar',
    endpoint: '/api/analytics/business-size',
  },
  'children-count': {
    id: 'children-count',
    title: 'Families by Children Count',
    defaultType: 'bar',
    endpoint: '/api/analytics/children-count',
  },
  'income-brackets': {
    id: 'income-brackets',
    title: 'Residents by Income Bracket',
    defaultType: 'bar',
    endpoint: '/api/analytics/income-brackets',
  },
};

/**
 * Get chart configuration by ID
 * 
 * @param chartId - The chart identifier
 * @returns ChartConfig if found, undefined otherwise
 */
export function getChartConfig(chartId: string): ChartConfig | undefined {
  return CHART_CONFIGS[chartId];
}

/**
 * Get all chart IDs
 * 
 * @returns Array of all available chart identifiers
 */
export function getChartIds(): string[] {
  return Object.keys(CHART_CONFIGS);
}

/**
 * Check if a chart ID exists
 * 
 * @param chartId - The chart identifier to check
 * @returns true if the chart exists, false otherwise
 */
export function isValidChartId(chartId: string): chartId is keyof typeof CHART_CONFIGS {
  return chartId in CHART_CONFIGS;
}
