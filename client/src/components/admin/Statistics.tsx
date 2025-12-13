import React, { useEffect, useState, useCallback, useRef, useMemo, useTransition } from 'react';
import { Card, Row, Col, Divider, Skeleton, Empty, Form, Select, DatePicker, Space, Typography, Checkbox, Drawer, Button, Switch, Modal, message, Alert, Dropdown, Spin } from 'antd';
import { DownOutlined, DownloadOutlined, FileTextOutlined, BarChartOutlined, SyncOutlined } from '@ant-design/icons';
import { QueryClient, QueryClientProvider, useQueries } from '@tanstack/react-query';
import { Pie, Bar, Line, Area } from '@ant-design/charts';
import { axiosInstance, analyticsAPI } from '../../services/api';
import type { Moment } from 'moment';
import jsPDF from 'jspdf';

const { RangePicker } = DatePicker;

// Chart definitions with proper typing
const CHART_DEFINITIONS = {
  gender: { title: 'Sex Distribution', chartType: 'pie' as const, endpoint: '/analytics/gender', colors: ['#1890ff', '#00bcd4', '#888888'] as string[] },
  age: { title: 'Age Groups', chartType: 'bar' as const, endpoint: '/analytics/age', colors: ['#1890ff'] as string[] },
  occupation: { title: 'Occupation', chartType: 'line' as const, endpoint: '/analytics/occupation', colors: ['#f5222d'] as string[] },
  nationality: { title: 'Nationality', chartType: 'area' as const, endpoint: '/analytics/nationality', colors: ['#13c2c2'] as string[] },
  'blood-type': { title: 'Blood Type', chartType: 'bar' as const, endpoint: '/analytics/blood-type', colors: ['#722ed1'] as string[] },
  disability: { title: 'Disability Status', chartType: 'pie' as const, endpoint: '/analytics/disability', colors: ['#faad14', '#52c41a'] as string[] },
  'business-type': { title: 'Business Type', chartType: 'area' as const, endpoint: '/analytics/business-type', colors: ['#1890ff'] as string[] },
  'business-size': { title: 'Business Size', chartType: 'bar' as const, endpoint: '/analytics/business-size', colors: ['#52c41a'] as string[] },
  'children-count': { title: 'Children Count', chartType: 'line' as const, endpoint: '/analytics/children-count', colors: ['#eb2f96'] as string[] },
  'income-brackets': { title: 'Income Brackets', chartType: 'area' as const, endpoint: '/analytics/income-brackets', colors: ['#faad14'] as string[] },
};

type ChartId = keyof typeof CHART_DEFINITIONS;

const defaultQueryClient = new QueryClient({ 
  defaultOptions: { 
    queries: { 
      retry: 1,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false 
    } 
  } 
});

const StatisticsInner: React.FC = () => {
  const [isPending, startTransition] = useTransition();
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summary, setSummary] = useState<any>(null);

  // chart data keyed by chart id
  const [chartData, setChartData] = useState<Record<string, any[]>>({});
  const [chartLoading, setChartLoading] = useState<Record<string, boolean>>({});

  // Filters with stable date references
  const [filters, setFilters] = useState<{ dateRange: Moment[]; residentType: string }>({ dateRange: [], residentType: '' });
  
  // Memoize formatted date strings for query keys
  const filterDateStart = useMemo(() => filters.dateRange?.[0]?.format?.('YYYY-MM-DD') || null, [filters.dateRange?.[0]?.valueOf()]);
  const filterDateEnd = useMemo(() => filters.dateRange?.[1]?.format?.('YYYY-MM-DD') || null, [filters.dateRange?.[1]?.valueOf()]);

  // Chart selection and settings
  const [selectedCharts, setSelectedCharts] = useState<ChartId[]>(['gender', 'age', 'occupation', 'nationality']);
  const [autoEnableWhenData, setAutoEnableWhenData] = useState<boolean>(false);
  const prevSelectionRef = useRef<ChartId[] | null>(null);
  
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

  // Fetch summary callback
  const fetchSummary = useCallback(async () => {
    setLoadingSummary(false);
    setSummary(null);
  }, []);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

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

  // Create stable query key function
  const getChartQueryKey = useCallback((id: ChartId) => [
    'chart',
    id,
    filterDateStart,
    filterDateEnd,
    (chartSettings[id]?.dateRange?.[0]?.valueOf()) || null,
    (chartSettings[id]?.dateRange?.[1]?.valueOf()) || null,
    filters.residentType || null
  ], [filterDateStart, filterDateEnd, chartSettings, filters.residentType]);

  // Create queries for each chart with stable keys
  const chartQueryResults = useQueries({
    queries: chartIds.map((id) => ({
      queryKey: getChartQueryKey(id),
      queryFn: async () => {
        const cs = chartSettings[id] || {};
        const csStart = cs.dateRange?.[0]?.format?.('YYYY-MM-DD');
        const csEnd = cs.dateRange?.[1]?.format?.('YYYY-MM-DD');
        const start = csStart || filterDateStart;
        const end = csEnd || filterDateEnd;
        const res = await axiosInstance.get(CHART_DEFINITIONS[id].endpoint, { 
          params: { startDate: start, endDate: end, residentType: filters.residentType } 
        });
        return res.data?.data || [];
      },
    }))
  });
  
  // Stable data key from query results
  const chartQueryDataKey = useMemo(
    () => chartQueryResults.map(r => JSON.stringify(r?.data || '')).join('|'),
    [chartQueryResults]
  );

  // Build queries map
  const chartQueriesMapMemo = useMemo(() => {
    const m: Record<ChartId, any> = {} as any;
    chartIds.forEach((id, idx) => { m[id] = chartQueryResults[idx]; });
    return m;
  }, [chartQueryResults, chartIds]);

  // Sync query results to state with transition
  useEffect(() => {
    const newData: Record<ChartId, any[]> = {} as any;
    const newLoading: Record<ChartId, boolean> = {} as any;
    
    chartIds.forEach((id) => {
      const q = chartQueriesMapMemo[id];
      
      if (id === 'gender') {
        newData[id] = (q?.data || [])
          .filter((p: any) => {
            const rawType = (p?.name ?? p?.type ?? p?._id ?? '').toString().trim().toLowerCase();
            return rawType && rawType !== 'unknown' && rawType !== 'null' && rawType !== 'undefined' && rawType !== 'none';
          })
          .map((p: any) => {
            const rawType = (p?.name ?? p?.type ?? p?._id ?? '').toString().trim();
            const lower = (rawType || '').toLowerCase();
            let norm = 'Other';
            if (/^m/.test(lower)) norm = 'Male';
            else if (/^f/.test(lower)) norm = 'Female';
            return { type: norm, value: Number(p?.value ?? p?.count ?? 0) };
          })
          .reduce((acc: any[], cur: any) => {
            const found = acc.find(a => a.type === cur.type);
            if (found) found.value += cur.value; else acc.push({ ...cur });
            return acc;
          }, [] as any[])
          .filter((p: any) => p?.value > 0);
      } else {
        newData[id] = (q?.data || [])
          .filter((p: any) => {
            const type = (p?.name ?? p?.type ?? p?._id ?? '').toString().trim().toLowerCase();
            const val = Number(p?.value ?? p?.count ?? 0);
            return type && type !== 'unknown' && type !== 'null' && type !== 'undefined' && type !== 'none' && val > 0;
          })
          .map((p: any) => ({
            ...p,
            type: (p?.name ?? p?.type ?? p?._id ?? '').toString().trim(),
            value: Number(p?.value ?? p?.count ?? 0)
          }));
      }
      
      newLoading[id] = q?.isFetching || q?.isLoading || false;
    });
    
    startTransition(() => {
      setChartData(newData as any);
      setChartLoading(newLoading as any);
    });
  }, [chartQueryDataKey, chartQueriesMapMemo, chartIds]);

  // Compute charts with data
  const chartsWithData = useMemo(() => {
    const keys = Object.keys(chartData || {}).filter(k => 
      Array.isArray(chartData[k as ChartId]) && chartData[k as ChartId].length > 0
    );
    return new Set(keys as ChartId[]);
  }, [chartData]);

  // Auto-enable when data toggle
  useEffect(() => {
    if (autoEnableWhenData) {
      prevSelectionRef.current = selectedCharts;
      const available = Array.from(chartsWithData);
      const newSel = chartIds.filter(id => available.includes(id)).slice(0, 6) as ChartId[];
      if (newSel.length) setSelectedCharts(newSel);
    } else {
      if (prevSelectionRef.current) {
        setSelectedCharts(prevSelectionRef.current);
        prevSelectionRef.current = null;
      }
    }
  }, [autoEnableWhenData, chartsWithData, chartIds]);

  // Memoized computations
  const totalResidents = useMemo(() => summary?.totalResidents ?? 0, [summary]);
  const totalDocuments = useMemo(() => summary?.totalDocumentRequests ?? 0, [summary]);
  
  const ageBarData = useMemo(() => (chartData['age'] as any[]) || [], [chartData]);
  const ageMax = useMemo(() => {
    if (!Array.isArray(ageBarData) || ageBarData.length === 0) return 0;
    return Math.max(...ageBarData.map((d: any) => Number(d.value) || 0));
  }, [ageBarData]);
  const ageAxisMax = useMemo(() => Math.ceil(ageMax / 5) * 5 || 5, [ageMax]);
  
  const monthlyDocData = useMemo(() => (chartData['documents-monthly'] as any[]) || [], [chartData]);

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
  const generateNarrativeReport = (state: { summary?: any; charts?: Record<string, any[]> }) => {
    const s = state.summary || summary || {};
    const charts = state.charts || chartData || {};

    const totalResidents = Number(s.totalResidents ?? 0);
    const gender = (charts['gender'] as any[]) || [];
    const age = (charts['age'] as any[]) || [];
    const cs = (charts['civil-status'] as any[]) || [];
    const ed = (charts['education'] as any[]) || [];
    const monthly = (charts['documents-monthly'] as any[]) || [];

    const maleCount = Number(gender.find((g:any) => (g.type||'').toLowerCase().startsWith('m'))?.value || 0);
    const femaleCount = Number(gender.find((g:any) => (g.type||'').toLowerCase().startsWith('f'))?.value || 0);
    const otherCount = Math.max(0, (gender || []).reduce((sum:number, g:any) => sum + (Number(g.value)||0), 0) - maleCount - femaleCount);

    let topAgeGroup = '';
    if (age.length) {
      const sorted = [...age].sort((a:any,b:any) => (Number(b.value)||0) - (Number(a.value)||0));
      topAgeGroup = sorted[0]?.type || sorted[0]?.group || '';
    }

    const topCivil = cs.length ? cs.slice(0,3).map((c:any) => `${c.type} (${c.value})`).join(', ') : '';
    const topEducation = ed.length ? ed.slice(0,3).map((c:any) => `${c.type} (${c.value})`).join(', ') : '';

    const monthlyTotal = monthly.length ? monthly.reduce((sum:number,m:any) => sum + (Number(m.value)||0), 0) : 0;
    let peakMonth = '';
    let peakVal = 0;
    if (monthly.length) {
      const peak = monthly.reduce((best:any, m:any) => (Number(m.value)||0) > (Number(best.value)||0) ? m : best, monthly[0]);
      peakMonth = peak?.type || '';
      peakVal = Number(peak?.value || 0);
    }

    const parts: string[] = [];

    if (totalResidents > 0) {
      const genderPart = (maleCount || femaleCount || otherCount)
        ? `There are currently ${totalResidents} residents, with ${maleCount} males, ${femaleCount} females${otherCount ? `, and ${otherCount} identifying as other` : ''}.`
        : `There are currently ${totalResidents} residents.`;
      parts.push(genderPart);
    } else {
      parts.push('Resident count is not available.');
    }

    if (topAgeGroup) {
      parts.push(`The most common age group is ${topAgeGroup}.`);
    }

    if (topCivil) {
      parts.push(`Civil status (top): ${topCivil}.`);
    }

    if (topEducation) {
      parts.push(`Educational attainment (top): ${topEducation}.`);
    }

    if (monthly.length) {
      parts.push(`During the selected period there were ${monthlyTotal} document requests. The busiest month was ${peakMonth} with ${peakVal} requests.`);
    }

    return parts.join(' ');
  };

  const openReport = () => {
    const text = generateNarrativeReport({ summary, charts: chartData });
    setReportText(text);
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

  // Memoized ChartCard component
  const ChartCard = useMemo(() => React.memo((props: { 
    id?: ChartId; 
    title: string; 
    chartType: 'pie'|'bar'|'line'|'area'; 
    data?: any[]; 
    loading?: boolean; 
    colors?: string[] 
  }) => {
    const { id, title, chartType, data = [], loading, colors } = props;
    const hasData = Array.isArray(data) && data.length > 0;
    const cs = id ? (chartSettings[id] || {}) : {};
    const effectiveChartType = cs.chartType || chartType;
    const showLabels = cs.showLabels ?? true;
    const showTooltips = cs.showTooltips ?? true;
    const showLegend = cs.showLegend ?? true;

    return (
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChartOutlined style={{ color: '#1890ff', fontSize: 18 }} />
            <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 15 }}>{title}</span>
          </div>
        }
        style={{ 
          borderRadius: 12, 
          boxShadow: '0 2px 12px rgba(15,23,42,0.08)',
          border: '1px solid #e2e8f0',
          height: '100%'
        }}
        styles={{ 
          body: { padding: 16 },
          header: { padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }
        }}
      >
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 220 }}>
            <Spin size="large" />
          </div>
        ) : hasData ? (
          effectiveChartType === 'pie' ? (
            <div ref={(el) => { if (id) chartRefs.current[id] = el; }} style={{ background: '#ffffff' }}>
              {(() => {
                const pieData = (data || []).map((d: any) => ({
                  label: (d?.type ?? d?.name ?? d?.group ?? d?._id ?? 'Unknown').toString().trim(),
                  valueNumber: Number(d?.value ?? d?.count ?? 0)
                }));
                return (
                  <Pie
                    data={pieData}
                    angleField="valueNumber"
                    colorField="label"
                    radius={0.9}
                    label={showLabels ? { formatter: (datum: any) => {
                      const label = datum?.data?.label ?? 'Unknown';
                      const val = Number(datum?.data?.valueNumber ?? 0) || 0;
                      return `${label} (${val})`;
                    }} : false}
                    tooltip={showTooltips ? { formatter: (datum: any) => ({
                      name: datum?.data?.label ?? 'Unknown', 
                      value: Number(datum?.data?.valueNumber ?? 0) || 0 
                    })} : false}
                    color={colors}
                    height={220}
                  />
                );
              })()}
            </div>
          ) : effectiveChartType === 'bar' ? (
            <div ref={(el) => { if (id) chartRefs.current[id] = el; }}>
              <Bar data={data} xField="type" yField="value" color={colors?.[0]} label={showLabels ? undefined : false} legend={showLegend ? undefined : false} tooltip={showTooltips ? undefined : false} yAxis={{ min: 0, max: ageAxisMax, tickInterval: 5 }} height={220} />
            </div>
          ) : effectiveChartType === 'line' ? (
            <div ref={(el) => { if (id) chartRefs.current[id] = el; }}>
              <Line data={data} xField="type" yField="value" legend={showLegend ? undefined : false} tooltip={showTooltips ? undefined : false} height={220} />
            </div>
          ) : (
            <div ref={(el) => { if (id) chartRefs.current[id] = el; }}>
              <Area data={data} xField="type" yField="value" legend={showLegend ? undefined : false} tooltip={showTooltips ? undefined : false} height={220} />
            </div>
          )
        ) : <Empty description="No data available" />}
      </Card>
    );
  }), [chartSettings, ageAxisMax]);

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
              {loadingSummary ? (
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
              {loadingSummary ? (
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
              {loadingSummary ? (
                <Skeleton active paragraph={false} />
              ) : (
                <div>
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', marginBottom: 8 }}>
                    Requests (Period)
                  </Typography.Text>
                  <Typography.Title level={2} style={{ margin: 0, color: '#f59e0b', fontWeight: 700 }}>
                    {monthlyDocData ? monthlyDocData.reduce((s:any,m:any)=>s + (Number(m.value)||0), 0).toLocaleString() : 0}
                  </Typography.Title>
                  {monthlyDocData && monthlyDocData.length ? (
                    <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8, color: '#78909c' }}>
                      Latest: {monthlyDocData[monthlyDocData.length-1].type} ({monthlyDocData[monthlyDocData.length-1].value})
                    </Typography.Text>
                  ) : null}
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
                value={filters.dateRange as any}
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
            const q = chartQueriesMapMemo[id];
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
              {selectedCharts.map((chartId) => (
                <Col key={chartId} xs={24} md={12} lg={12}>
                  <ChartCard 
                    id={chartId} 
                    title={CHART_DEFINITIONS[chartId].title} 
                    chartType={CHART_DEFINITIONS[chartId].chartType} 
                    data={chartData[chartId] as any[]} 
                    loading={chartLoading[chartId]} 
                    colors={CHART_DEFINITIONS[chartId].colors} 
                  />
                </Col>
              ))}
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
