import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Card, Row, Col, Divider, Skeleton, Empty, Form, Select, DatePicker, Space, Typography, Checkbox, Drawer, Button, Switch, Modal, message, Alert, Dropdown } from 'antd';
import { DownOutlined, DownloadOutlined, FileTextOutlined, BarChartOutlined, SyncOutlined } from '@ant-design/icons';
import { QueryClient, QueryClientProvider, useQueries } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { EChartsOption } from 'echarts';
import EChartRenderer from '../statistics/EChartRenderer';
import { buildChartOption } from '../statistics/chartOptionFactory';
import type { Moment } from 'moment';
import jsPDF from 'jspdf';
import {
  useDashboardSummary,
  useGenderAnalytics,
  useAgeAnalytics,
  useOccupationAnalytics,
  useNationalityAnalytics,
  useBloodTypeAnalytics,
  useDisabilityAnalytics,
  useBusinessTypeAnalytics,
  useBusinessSizeAnalytics,
  useChildrenCountAnalytics,
  useIncomeAnalytics,
  useEducationAnalytics,
  useCivilStatusAnalytics,
  useReligionAnalytics,
  useDocumentAnalytics,
} from '../../hooks/useAnalytics';
import type { AnalyticsDataPoint } from '../../utils/dataNormalization';


const { RangePicker } = DatePicker;

// Type definitions
type ChartDataRecord = Record<string, unknown>;
type ChartQueryType = UseQueryResult<unknown[], Error>;

// Chart definitions - maps to hooks
const CHART_DEFINITIONS = {
  gender: { title: 'Sex Distribution', chartType: 'pie' as const, hook: 'useGenderAnalytics' },
  age: { title: 'Age Groups', chartType: 'bar' as const, hook: 'useAgeAnalytics' },
  occupation: { title: 'Occupation', chartType: 'line' as const, hook: 'useOccupationAnalytics' },
  nationality: { title: 'Nationality', chartType: 'area' as const, hook: 'useNationalityAnalytics' },
  'blood-type': { title: 'Blood Type', chartType: 'bar' as const, hook: 'useBloodTypeAnalytics' },
  disability: { title: 'Disability Status', chartType: 'pie' as const, hook: 'useDisabilityAnalytics' },
  'business-type': { title: 'Business Type', chartType: 'area' as const, hook: 'useBusinessTypeAnalytics' },
  'business-size': { title: 'Business Size', chartType: 'bar' as const, hook: 'useBusinessSizeAnalytics' },
  'children-count': { title: 'Children Count', chartType: 'line' as const, hook: 'useChildrenCountAnalytics' },
  'income-brackets': { title: 'Income Brackets', chartType: 'area' as const, hook: 'useIncomeAnalytics' },
  education: { title: 'Education Level', chartType: 'bar' as const, hook: 'useEducationAnalytics' },
  'civil-status': { title: 'Marital Status', chartType: 'pie' as const, hook: 'useCivilStatusAnalytics' },
  religion: { title: 'Religion', chartType: 'area' as const, hook: 'useReligionAnalytics' },
  documents: { title: 'Document Requests', chartType: 'bar' as const, hook: 'useDocumentAnalytics' },
} as const;

type ChartId = keyof typeof CHART_DEFINITIONS;

const defaultQueryClient = new QueryClient({ 
  defaultOptions: { 
    queries: { 
      retry: 2,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      throwOnError: false // Prevent throwing errors on query failure
    } 
  } 
});

const StatisticsInner: React.FC = () => {
  // Use all analytics hooks
  const summaryQuery = useDashboardSummary();
  const genderQuery = useGenderAnalytics();
  const ageQuery = useAgeAnalytics();
  const occupationQuery = useOccupationAnalytics();
  const nationalityQuery = useNationalityAnalytics();
  const bloodTypeQuery = useBloodTypeAnalytics();
  const disabilityQuery = useDisabilityAnalytics();
  const businessTypeQuery = useBusinessTypeAnalytics();
  const businessSizeQuery = useBusinessSizeAnalytics();
  const childrenCountQuery = useChildrenCountAnalytics();
  const incomeQuery = useIncomeAnalytics();
  const educationQuery = useEducationAnalytics();
  const civilStatusQuery = useCivilStatusAnalytics();
  const religionQuery = useReligionAnalytics();
  const documentQuery = useDocumentAnalytics();

  // Map all queries
  const allQueries = {
    gender: genderQuery,
    age: ageQuery,
    occupation: occupationQuery,
    nationality: nationalityQuery,
    'blood-type': bloodTypeQuery,
    disability: disabilityQuery,
    'business-type': businessTypeQuery,
    'business-size': businessSizeQuery,
    'children-count': childrenCountQuery,
    'income-brackets': incomeQuery,
    education: educationQuery,
    'civil-status': civilStatusQuery,
    religion: religionQuery,
    documents: documentQuery,
  };

  // Chart selection and settings
  const [selectedCharts, setSelectedCharts] = useState<ChartId[]>(['gender', 'age', 'occupation', 'nationality']);
  const [autoEnableWhenData, setAutoEnableWhenData] = useState<boolean>(false);
  
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chartSettings, setChartSettings] = useState<Record<string, any>>(() => {
    try {
      const raw = localStorage.getItem('statsChartSettings');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  });
  const [settingsChartId, setSettingsChartId] = useState<ChartId>('gender');
  const [chartsDropdownOpen, setChartsDropdownOpen] = useState<boolean>(false);
  const [pendingSelectedCharts, setPendingSelectedCharts] = useState<ChartId[]>(selectedCharts);

  // Filters state
  const [filters, setFilters] = useState<{ dateRange: Moment[]; residentType: string }>({ dateRange: [], residentType: '' });

  // Persist chart settings
  useEffect(() => {
    try {
      localStorage.setItem('statsChartSettings', JSON.stringify(chartSettings));
    } catch (e) {
      // ignore
    }
  }, [chartSettings]);

  // Chart IDs list
  const chartIds = useMemo(() => Object.keys(CHART_DEFINITIONS) as ChartId[], []);

  // Transform analytics data to chart format
  const chartData = useMemo(() => {
    const result: Record<ChartId, ChartDataRecord[]> = Object.create(null);
    
    (Object.entries(allQueries) as [ChartId, UseQueryResult<any, unknown>][]).forEach(([chartId, query]) => {
      if (query.data?.data) {
        result[chartId] = (query.data.data as AnalyticsDataPoint[]).map(point => ({
          type: point.type || 'Unknown',
          value: point.value || 0,
        }));
      } else {
        result[chartId] = [];
      }
    });
    
    return result;
  }, [allQueries]);

  // Chart loading state
  const chartLoading = useMemo(() => {
    const result: Record<ChartId, boolean> = Object.create(null);
    
    (Object.entries(allQueries) as [ChartId, UseQueryResult<any, unknown>][]).forEach(([chartId, query]) => {
      result[chartId] = query.isLoading || query.isFetching;
    });
    
    return result;
  }, [allQueries]);

  // Summary data
  const totalResidents = useMemo(() => summaryQuery.data?.totalResidents ?? 0, [summaryQuery.data]);
  const totalDocuments = useMemo(() => summaryQuery.data?.totalDocuments ?? 0, [summaryQuery.data]);
  const pendingRequests = useMemo(() => summaryQuery.data?.pendingRequests ?? 0, [summaryQuery.data]);
  
  const ageBarData = useMemo(() => {
    const ageData = chartData['age'];
    return (Array.isArray(ageData) ? ageData : []) as ChartDataRecord[];
  }, [chartData]);
  const ageMax = useMemo(() => {
    if (!Array.isArray(ageBarData) || ageBarData.length === 0) return 0;
    return Math.max(...ageBarData.map((d: ChartDataRecord) => Number(d.value) || 0));
  }, [ageBarData]);
  const ageAxisMax = useMemo(() => Math.ceil(ageMax / 5) * 5 || 5, [ageMax]);

  // Report state
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' ? window.innerWidth < 700 : false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 700);
    try {
      window.addEventListener('resize', onResize);
    } catch (e) {}
    return () => { try { window.removeEventListener('resize', onResize); } catch (e) {} };
  }, []);

  // Report generation
  const generateNarrativeReport = () => {
    const parts: string[] = [];

    if (totalResidents > 0) {
      parts.push(`There are currently ${totalResidents} residents.`);
    } else {
      parts.push('Resident count is not available.');
    }

    const genderData = chartData['gender'] || [];
    if (genderData.length > 0) {
      const male = genderData.find(g => String(g.type).toLowerCase().startsWith('m'));
      const female = genderData.find(g => String(g.type).toLowerCase().startsWith('f'));
      if (male || female) {
        parts.push(`Gender distribution: ${male ? `${male.value} males` : ''}${male && female ? ', ' : ''}${female ? `${female.value} females` : ''}.`);
      }
    }

    const ageData = chartData['age'] || [];
    if (ageData.length > 0) {
      const sorted = [...ageData].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
      const topAgeGroup = sorted[0]?.type?.toString() || '';
      if (topAgeGroup) {
        parts.push(`The most common age group is ${topAgeGroup}.`);
      }
    }

    if (totalDocuments > 0) {
      parts.push(`There are ${totalDocuments} processed documents in the system.`);
    }

    if (pendingRequests > 0) {
      parts.push(`There are currently ${pendingRequests} pending requests awaiting processing.`);
    }

    setReportText(parts.join(' '));
  };

  useEffect(() => {
    generateNarrativeReport();
  }, [chartData, totalResidents, totalDocuments, pendingRequests]);

  const openReport = () => {
    setReportModalOpen(true);
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      message.success('Report copied to clipboard');
    } catch (e) {
      message.error('Failed to copy');
    }
  };

  const downloadPdf = async () => {
    const doc = new jsPDF({ orientation: 'portrait' });
    const title = 'Analytics Report';
    doc.setFontSize(16);
    doc.text(title, 14, 20);
    doc.setFontSize(11);
    const split = doc.splitTextToSize(reportText, 180);
    doc.text(split, 14, 30);
    doc.save('analytics-report.pdf');
  };

  const downloadFullAnalytics = async () => {
    message.loading({ content: 'Preparing report...', key: 'report' });
    try {
      const html2canvas = (await import('html2canvas')).default;
      const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
      
      pdf.setFontSize(24);
      pdf.text('Barangay Analytics Report', 40, 80);
      pdf.setFontSize(12);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, 40, 110);
      
      pdf.save('barangay-analytics-report.pdf');
      message.success({ content: 'Report ready', key: 'report' });
    } catch (err) {
      console.error('Export failed', err);
      message.error({ content: 'Failed to export report', key: 'report' });
    }
  };

  // Chart refs
  const chartRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dashboardRef = useRef<HTMLDivElement | null>(null);

  // Memoize all chart options at component level
  const chartOptions = useMemo(() => {
    const opts: Record<ChartId, EChartsOption | undefined> = Object.create(null);
    selectedCharts.forEach((chartId: ChartId) => {
      const rawData = chartData[chartId];
      const data = (Array.isArray(rawData) ? rawData : []) as ChartDataRecord[];
      const hasData = Array.isArray(data) && data.length > 0;
      const cs = chartSettings[chartId] || {};
      const effectiveChartType = cs.chartType || CHART_DEFINITIONS[chartId].chartType;
      const chartTitle = CHART_DEFINITIONS[chartId].title;
      
      opts[chartId] = hasData ? buildChartOption(effectiveChartType, chartTitle, data as never) : undefined;
    });
    return opts;
  }, [selectedCharts, chartData, chartSettings]);

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BarChartOutlined style={{ fontSize: 24, color: '#1890ff' }} />
          <Typography.Title level={3} style={{ margin: 0, color: '#0f172a', fontWeight: 700 }}>
            Statistics & Analytics
          </Typography.Title>
        </div>
      }
      style={{ 
        borderRadius: 16, 
        boxShadow: '0 4px 20px rgba(15,23,42,0.08)',
        border: '1px solid #e2e8f0'
      }}
      styles={{ 
        body: { padding: 28 },
        header: { padding: '24px 28px', borderBottom: '1px solid #e2e8f0', backgroundColor: 'rgba(15, 23, 42, 0.01)' }
      }}
    >
      <div ref={dashboardRef}>
        {/* Top Metrics */}
        <Row gutter={[24, 24]} style={{ marginBottom: 32 }}>
          <Col xs={24} sm={12} md={8}>
            <Card 
              variant="borderless" 
              style={{ 
                borderRadius: 12, 
                boxShadow: '0 2px 12px rgba(24, 144, 255, 0.08)',
                border: '1px solid #e0f2fe',
                background: 'linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%)',
                textAlign: 'left' 
              }} 
              styles={{ body: { padding: 20 } }}
            >
              {summaryQuery.isLoading ? (
                <Skeleton active paragraph={false} />
              ) : (
                <div>
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', marginBottom: 8 }}>
                    Total Residents
                  </Typography.Text>
                  <Typography.Title level={2} style={{ margin: 0, color: '#1890ff', fontWeight: 700 }}>
                    {totalResidents.toLocaleString()}
                  </Typography.Title>
                </div>
              )}
            </Card>
          </Col>

          <Col xs={24} sm={12} md={8}>
            <Card 
              variant="borderless" 
              style={{ 
                borderRadius: 12, 
                boxShadow: '0 2px 12px rgba(82, 196, 26, 0.08)',
                border: '1px solid #d4edda',
                background: 'linear-gradient(135deg, #f6ffed 0%, #ffffff 100%)',
                textAlign: 'left' 
              }} 
              styles={{ body: { padding: 20 } }}
            >
              {summaryQuery.isLoading ? (
                <Skeleton active paragraph={false} />
              ) : (
                <div>
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', marginBottom: 8 }}>
                    Total Documents
                  </Typography.Text>
                  <Typography.Title level={2} style={{ margin: 0, color: '#52c41a', fontWeight: 700 }}>
                    {totalDocuments.toLocaleString()}
                  </Typography.Title>
                </div>
              )}
            </Card>
          </Col>

          <Col xs={24} sm={24} md={8}>
            <Card 
              style={{ 
                borderRadius: 12, 
                boxShadow: '0 2px 12px rgba(245, 158, 11, 0.08)',
                border: '1px solid #fce3bf',
                background: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)',
                textAlign: 'left' 
              }} 
              styles={{ body: { padding: 20 } }}
            >
              {summaryQuery.isLoading ? (
                <Skeleton active paragraph={false} />
              ) : (
                <div>
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', marginBottom: 8 }}>
                    Pending Requests
                  </Typography.Text>
                  <Typography.Title level={2} style={{ margin: 0, color: '#f59e0b', fontWeight: 700 }}>
                    {pendingRequests.toLocaleString()}
                  </Typography.Title>
                </div>
              )}
            </Card>
          </Col>
        </Row>

        <Divider style={{ margin: '32px 0', borderColor: '#e2e8f0' }} />

        {/* Filters Section */}
        <Card 
          title={<Typography.Title level={5} style={{ margin: 0, fontWeight: 600, color: '#0f172a' }}>Filters & Controls</Typography.Title>}
          style={{ marginBottom: 28, borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
          styles={{ body: { padding: 20 }, header: { padding: '16px 20px', borderBottom: '1px solid #e2e8f0' } }}
        >
          <Form layout={isMobile ? "vertical" : "inline"} style={{ marginBottom: 0, width: '100%', boxSizing: 'border-box', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
            <Form.Item label="Date Range" style={{ marginBottom: 0 }}>
              <RangePicker
                value={filters.dateRange.length > 0 ? (filters.dateRange as any) : undefined}
                onChange={dates => setFilters(f => ({ ...f, dateRange: (dates ? dates.filter(Boolean) : []) as Moment[] }))}
                allowClear
                style={{ width: 280 }}
              />
            </Form.Item>
            
            <Form.Item label="Resident Type" style={{ marginBottom: 0 }}>
              <Select
                value={filters.residentType}
                onChange={val => setFilters(f => ({ ...f, residentType: val }))}
                style={{ minWidth: 140 }}
                allowClear
                placeholder="All Types"
              >
                <Select.Option value="">All</Select.Option>
                <Select.Option value="active">Active</Select.Option>
                <Select.Option value="inactive">Inactive</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item label="Charts" style={{ marginBottom: 0 }}>
              <Dropdown
                open={chartsDropdownOpen}
                onOpenChange={(open) => {
                  if (open) setPendingSelectedCharts(selectedCharts.slice());
                  setChartsDropdownOpen(open);
                }}
                popupRender={() => (
                  <div style={{ padding: 16, background: '#fff', borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', minWidth: 340 }}>
                    <div style={{ maxHeight: 260, overflowY: 'auto', paddingRight: 8 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(Object.keys(CHART_DEFINITIONS) as ChartId[]).map(k => {
                          const checked = (pendingSelectedCharts || []).includes(k);
                          return (
                            <Checkbox key={k} checked={checked} onChange={(ev) => {
                              const next = new Set(pendingSelectedCharts || []);
                              if ((ev.target as HTMLInputElement).checked) next.add(k); else next.delete(k);
                              setPendingSelectedCharts(Array.from(next) as ChartId[]);
                            }}>
                              <span style={{ fontSize: 13 }}>{CHART_DEFINITIONS[k].title}</span>
                            </Checkbox>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                      <Button size="small" onClick={() => { setPendingSelectedCharts(selectedCharts.slice()); setChartsDropdownOpen(false); }}>Cancel</Button>
                      <Button size="small" type="primary" onClick={() => { setSelectedCharts(pendingSelectedCharts.slice()); setChartsDropdownOpen(false); }}>Apply</Button>
                    </div>
                  </div>
                )}
                trigger={['click']}
              >
                <Button>Charts <DownOutlined /></Button>
              </Dropdown>
            </Form.Item>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Switch checked={autoEnableWhenData} onChange={v => setAutoEnableWhenData(!!v)} />
                <span style={{ fontSize: 13, color: '#475569' }}>Auto-enable</span>
              </div>
              <Button onClick={() => { setSettingsOpen(true); setSettingsChartId(selectedCharts[0] || 'gender'); }}>
                Settings
              </Button>
              <Button type="primary" onClick={openReport} icon={<FileTextOutlined />}>
                Report
              </Button>
              <Button onClick={async () => { await downloadFullAnalytics(); }} icon={<DownloadOutlined />}>
                Export
              </Button>
            </div>
          </Form>
        </Card>

        {/* Chart Settings Drawer */}
        <Drawer 
          title={<Typography.Title level={5} style={{ margin: 0, fontWeight: 600 }}>Chart Settings</Typography.Title>}
          placement="right" 
          onClose={() => setSettingsOpen(false)} 
          open={settingsOpen} 
          width={420}
          styles={{ body: { padding: 20 } }}
        >
          <Form layout="vertical">
            <Form.Item label="Select Chart">
              <Select value={settingsChartId} onChange={(v) => setSettingsChartId(v as ChartId)}>
                {(Object.keys(CHART_DEFINITIONS) as ChartId[]).map(k => (
                  <Select.Option key={k} value={k}>{CHART_DEFINITIONS[k].title}</Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item label="Chart Type">
              <Select 
                value={(chartSettings[settingsChartId]?.chartType) || CHART_DEFINITIONS[settingsChartId]?.chartType} 
                onChange={(val) => setChartSettings(s => ({ ...s, [settingsChartId]: { ...(s[settingsChartId] || {}), chartType: val } }))}
              >
                <Select.Option value="pie">Pie</Select.Option>
                <Select.Option value="bar">Bar</Select.Option>
                <Select.Option value="line">Line</Select.Option>
                <Select.Option value="area">Area</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item label="Date Range">
              <RangePicker 
                value={(chartSettings[settingsChartId]?.dateRange) || filters.dateRange} 
                onChange={(dates) => setChartSettings(s => ({ ...s, [settingsChartId]: { ...(s[settingsChartId] || {}), dateRange: dates ? dates.filter(Boolean) : [] } }))} 
                allowClear 
              />
            </Form.Item>

            <Form.Item label="Show Labels">
              <Switch 
                checked={(chartSettings[settingsChartId]?.showLabels) ?? true} 
                onChange={(v) => setChartSettings(s => ({ ...s, [settingsChartId]: { ...(s[settingsChartId] || {}), showLabels: v } }))} 
              />
            </Form.Item>

            <Form.Item label="Show Tooltips">
              <Switch 
                checked={(chartSettings[settingsChartId]?.showTooltips) ?? true} 
                onChange={(v) => setChartSettings(s => ({ ...s, [settingsChartId]: { ...(s[settingsChartId] || {}), showTooltips: v } }))} 
              />
            </Form.Item>

            <Form.Item label="Show Legend">
              <Switch 
                checked={(chartSettings[settingsChartId]?.showLegend) ?? true} 
                onChange={(v) => setChartSettings(s => ({ ...s, [settingsChartId]: { ...(s[settingsChartId] || {}), showLegend: v } }))} 
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Space style={{ width: '100%' }}>
                <Button type="primary" onClick={() => { setSettingsOpen(false); }} style={{ flex: 1 }}>Done</Button>
                <Button onClick={() => { setChartSettings(s => ({ ...s, [settingsChartId]: {} })); }} style={{ flex: 1 }}>Reset</Button>
              </Space>
            </Form.Item>
          </Form>
        </Drawer>

        {/* Report Modal */}
        <Modal 
          title={<Typography.Title level={5} style={{ margin: 0, fontWeight: 600 }}>Analytics Report</Typography.Title>}
          open={reportModalOpen} 
          onCancel={() => setReportModalOpen(false)} 
          footer={[
            <Button key="copy" onClick={copyReport} icon={<FileTextOutlined />}>Copy</Button>,
            <Button key="download" type="primary" onClick={downloadPdf} icon={<DownloadOutlined />}>Download PDF</Button>
          ]}
          width={700}
        >
          <Typography.Paragraph style={{ maxHeight: 400, overflowY: 'auto', color: '#475569', lineHeight: 1.6 }}>
            {reportText || 'No data available for report.'}
          </Typography.Paragraph>
        </Modal>

        {/* Charts Section */}
        <div style={{ marginTop: 32 }}>
          <Divider style={{ margin: '0 0 28px 0', borderColor: '#e2e8f0' }} />
          
          {/* Error Alerts */}
          {chartIds.map(id => {
            const q = allQueries[id as keyof typeof allQueries];
            if (q?.isError) {
              return (
                <Alert
                  key={`alert-${id}`}
                  message={`Failed to load ${CHART_DEFINITIONS[id].title}`}
                  description={
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span>{String(q.error?.message || 'Unknown error')}</span>
                      <Button size="small" onClick={() => q.refetch?.()} icon={<SyncOutlined style={{ fontSize: 12 }} />}>
                        Retry
                      </Button>
                    </div>
                  }
                  type="error"
                  showIcon
                  style={{ marginBottom: 12 }}
                  closable
                />
              );
            }
            return null;
          })}

          {/* Charts Grid */}
          {selectedCharts.length === 0 ? (
            <Empty description="No charts selected" style={{ padding: '60px 20px', color: '#94a3b8' }} />
          ) : (
            <Row gutter={[24, 24]}>
              {selectedCharts.map((chartId) => {
                const chartTitle = CHART_DEFINITIONS[chartId].title;
                const loading = chartLoading[chartId];
                const chartOption = chartOptions[chartId];
                const q = allQueries[chartId as keyof typeof allQueries];
                const hasError = q?.isError;
                const hasData = chartData[chartId] && Array.isArray(chartData[chartId]) && chartData[chartId].length > 0;

                return (
                  <Col key={chartId} xs={24} md={12} lg={12}>
                    <Card
                      title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', width: '100%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <BarChartOutlined style={{ color: '#1890ff', fontSize: 18 }} />
                            <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 15 }}>{chartTitle}</span>
                          </div>
                          {loading && <SyncOutlined spin style={{ color: '#1890ff', fontSize: 14 }} />}
                        </div>
                      }
                      style={{ 
                        borderRadius: 12, 
                        boxShadow: '0 2px 12px rgba(15,23,42,0.08)',
                        border: hasError ? '1px solid #ff7875' : '1px solid #e2e8f0',
                        height: '100%'
                      }}
                      styles={{ 
                        body: { padding: 16 },
                        header: { padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }
                      }}
                    >
                      {hasError && (
                        <Alert
                          message="Failed to load chart data"
                          type="error"
                          showIcon
                          action={<Button size="small" onClick={() => q?.refetch?.()}>Retry</Button>}
                          style={{ marginBottom: 16 }}
                        />
                      )}
                      {loading && !hasData && (
                        <Skeleton active paragraph={{ rows: 4 }} />
                      )}
                      {!loading && !hasData && !hasError && (
                        <Empty 
                          description="No data available" 
                          style={{ padding: '40px 20px', color: '#94a3b8' }}
                        />
                      )}
                      {(hasData || chartOption) && (
                        <div ref={(el) => { if (el) chartRefs.current[chartId] = el; }} style={{ background: '#ffffff' }}>
                          <EChartRenderer 
                            option={chartOption} 
                            loading={loading && hasData} 
                            height={300} 
                          />
                        </div>
                      )}
                    </Card>
                  </Col>
                );
              })}
            </Row>
          )}
        </div>
      </div>
    </Card>
  );
};

const Statistics: React.FC = () => {
  return (
    <QueryClientProvider client={defaultQueryClient}>
      <StatisticsInner />
    </QueryClientProvider>
  );
};

export default Statistics;
