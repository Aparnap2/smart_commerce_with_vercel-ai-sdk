'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { useState, useMemo } from 'react';

// Mock data for order trends
const dailyData = [
  { date: 'Mon', orders: 124, revenue: 12400 },
  { date: 'Tue', orders: 156, revenue: 15600 },
  { date: 'Wed', orders: 189, revenue: 18900 },
  { date: 'Thu', orders: 201, revenue: 20100 },
  { date: 'Fri', orders: 245, revenue: 24500 },
  { date: 'Sat', orders: 312, revenue: 31200 },
  { date: 'Sun', orders: 278, revenue: 27800 },
];

const weeklyData = [
  { date: 'Week 1', orders: 856, revenue: 85600 },
  { date: 'Week 2', orders: 1024, revenue: 102400 },
  { date: 'Week 3', orders: 978, revenue: 97800 },
  { date: 'Week 4', orders: 1145, revenue: 114500 },
];

const monthlyData = [
  { date: 'Jan', orders: 3245, revenue: 324500 },
  { date: 'Feb', orders: 2896, revenue: 289600 },
  { date: 'Mar', orders: 3567, revenue: 356700 },
  { date: 'Apr', orders: 4123, revenue: 412300 },
  { date: 'May', orders: 3876, revenue: 387600 },
  { date: 'Jun', orders: 4532, revenue: 453200 },
];

// Custom tooltip component
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload) return null;

  return (
    <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
      <p className="font-medium text-gray-900 dark:text-white mb-2">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-gray-600 dark:text-gray-400">
            {entry.name}:
          </span>
          <span className="font-medium text-gray-900 dark:text-white">
            {entry.name === 'orders' ? entry.value.toLocaleString() : `$${entry.value.toLocaleString()}`}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function OrderChart() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [chartType, setChartType] = useState<'area' | 'bar'>('area');

  const data = useMemo(() => {
    switch (period) {
      case 'daily':
        return dailyData;
      case 'weekly':
        return weeklyData;
      case 'monthly':
        return monthlyData;
      default:
        return dailyData;
    }
  }, [period]);

  const chartColor = {
    primary: '#3b82f6',
    secondary: '#8b5cf6',
    grid: '#e5e7eb',
  };

  return (
    <div className="space-y-4">
      {/* Chart Type Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setChartType('area')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            chartType === 'area'
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          Area
        </button>
        <button
          onClick={() => setChartType('bar')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            chartType === 'bar'
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          Bar
        </button>
      </div>

      {/* Chart */}
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'area' ? (
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor.primary} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={chartColor.primary} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor.secondary} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={chartColor.secondary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColor.grid} vertical={false} />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
                tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="orders"
                name="orders"
                stroke={chartColor.primary}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorOrders)"
              />
              <Area
                type="monotone"
                dataKey="revenue"
                name="revenue"
                stroke={chartColor.secondary}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRevenue)"
              />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColor.grid} vertical={false} />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
                tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ paddingTop: 20 }}
                formatter={(value) => (
                  <span className="text-gray-600 dark:text-gray-400 text-sm">{value}</span>
                )}
              />
              <Bar
                dataKey="orders"
                name="orders"
                fill={chartColor.primary}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="revenue"
                name="revenue"
                fill={chartColor.secondary}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Period Selector */}
      <div className="flex justify-center gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setPeriod('daily')}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            period === 'daily'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          Daily
        </button>
        <button
          onClick={() => setPeriod('weekly')}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            period === 'weekly'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          Weekly
        </button>
        <button
          onClick={() => setPeriod('monthly')}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            period === 'monthly'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          Monthly
        </button>
      </div>
    </div>
  );
}
