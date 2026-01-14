import ChatWidget from './chat';
import OrderChart from './components/order-chart';
import RefundStatus from './components/refund-status';
import RecentTickets from './components/ticket-list';
import QuickActions from './components/quick-actions';
import { StatsCard } from './components/stats-card';

// Mock data for stats
const statsData = [
  {
    title: 'Total Orders',
    value: '2,847',
    change: '+12.5%',
    trend: 'up' as const,
    icon: 'orders' as const,
  },
  {
    title: 'Active Tickets',
    value: '156',
    change: '-8.2%',
    trend: 'down' as const,
    icon: 'tickets' as const,
  },
  {
    title: 'Avg Response Time',
    value: '2.4m',
    change: '-15.3%',
    trend: 'down' as const,
    icon: 'time' as const,
  },
  {
    title: 'Customer Satisfaction',
    value: '94.8%',
    change: '+2.1%',
    trend: 'up' as const,
    icon: 'satisfaction' as const,
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsData.map((stat, index) => (
          <StatsCard key={stat.title} stat={stat} index={index} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat Widget - Takes 2 columns */}
        <div className="lg:col-span-2">
          <ChatWidget />
        </div>

        {/* Right Column - Quick Actions */}
        <div>
          <QuickActions />
        </div>
      </div>

      {/* Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Order Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Order Trends
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Daily order volume and revenue
              </p>
            </div>
            <select className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </div>
          <OrderChart />
        </div>

        {/* Refund Status */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Recent Refunds
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Track refund processing status
              </p>
            </div>
            <button className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              View All
            </button>
          </div>
          <RefundStatus />
        </div>
      </div>

      {/* Recent Tickets Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Recent Support Tickets
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Latest customer inquiries and issues
            </p>
          </div>
          <button className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            View All
          </button>
        </div>
        <RecentTickets />
      </div>
    </div>
  );
}
