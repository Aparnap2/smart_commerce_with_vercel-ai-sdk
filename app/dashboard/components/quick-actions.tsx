'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw,
  Search,
  MessageSquare,
  FileText,
  Truck,
  CreditCard,
  Settings,
  HelpCircle,
  ChevronRight,
} from 'lucide-react';

// Quick action types
interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  action: () => void;
}

// Quick actions configuration
const quickActions: QuickAction[] = [
  {
    id: 'refund',
    title: 'Process Refund',
    description: 'Initiate refund for order',
    icon: RefreshCw,
    color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    action: () => console.log('Navigate to refund'),
  },
  {
    id: 'search',
    title: 'Search Orders',
    description: 'Find customer orders',
    icon: Search,
    color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    action: () => console.log('Navigate to search'),
  },
  {
    id: 'ticket',
    title: 'New Ticket',
    description: 'Create support ticket',
    icon: FileText,
    color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    action: () => console.log('Create ticket'),
  },
  {
    id: 'track',
    title: 'Track Shipment',
    description: 'Check delivery status',
    icon: Truck,
    color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    action: () => console.log('Track shipment'),
  },
  {
    id: 'payment',
    title: 'Payment Issue',
    description: 'Resolve payment problems',
    icon: CreditCard,
    color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    action: () => console.log('Payment issue'),
  },
  {
    id: 'chat',
    title: 'Live Chat',
    description: 'Start customer chat',
    icon: MessageSquare,
    color: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
    action: () => console.log('Start chat'),
  },
];

// Action card component
function ActionCard({ action, index }: { action: QuickAction; index: number }) {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = action.icon;

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      onClick={action.action}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="w-full text-left p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${action.color}`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 dark:text-white text-sm">
            {action.title}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {action.description}
          </p>
        </div>
        <ChevronRight
          className={`w-5 h-5 text-gray-400 transition-transform ${
            isHovered ? 'translate-x-1' : ''
          }`}
        />
      </div>
    </motion.button>
  );
}

// Recent activity item
interface Activity {
  id: string;
  action: string;
  customer: string;
  time: string;
  type: 'refund' | 'order' | 'ticket' | 'chat';
}

const recentActivities: Activity[] = [
  { id: '1', action: 'Refund processed', customer: 'John Smith', time: '2m ago', type: 'refund' },
  { id: '2', action: 'Order #ORD-7890 created', customer: 'Jane Doe', time: '5m ago', type: 'order' },
  { id: '3', action: 'Ticket resolved', customer: 'Bob Wilson', time: '12m ago', type: 'ticket' },
  { id: '4', action: 'Chat completed', customer: 'Alice Brown', time: '18m ago', type: 'chat' },
  { id: '5', action: 'Refund requested', customer: 'Charlie Davis', time: '25m ago', type: 'refund' },
];

// Activity icon based on type
function getActivityIcon(type: Activity['type']) {
  switch (type) {
    case 'refund':
      return <RefreshCw className="w-4 h-4 text-red-500" />;
    case 'order':
      return <Search className="w-4 h-4 text-blue-500" />;
    case 'ticket':
      return <FileText className="w-4 h-4 text-purple-500" />;
    case 'chat':
      return <MessageSquare className="w-4 h-4 text-green-500" />;
    default:
      return <HelpCircle className="w-4 h-4 text-gray-500" />;
  }
}

export default function QuickActions() {
  return (
    <div className="space-y-6">
      {/* Quick Actions Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Quick Actions
          </h3>
          <button className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            Customize
          </button>
        </div>
        <div className="space-y-2">
          {quickActions.map((action, index) => (
            <ActionCard key={action.id} action={action} index={index} />
          ))}
        </div>
      </div>

      {/* Recent Activity Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Recent Activity
          </h3>
          <button className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            View All
          </button>
        </div>
        <div className="space-y-3">
          {recentActivities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
            >
              <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                {getActivityIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-white font-medium truncate">
                  {activity.action}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {activity.customer}
                </p>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                {activity.time}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Help Section */}
      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-6 text-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold">Need Help?</p>
            <p className="text-sm text-white/80">Check our support guide</p>
          </div>
        </div>
        <button className="w-full py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors">
          View Documentation
        </button>
      </div>
    </div>
  );
}
