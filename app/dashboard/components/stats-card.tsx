'use client';

import { motion } from 'framer-motion';
import {
  ShoppingCart,
  MessageSquare,
  Clock,
  ThumbsUp,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

interface StatsCardProps {
  stat: {
    title: string;
    value: string;
    change: string;
    trend: 'up' | 'down';
    icon: 'orders' | 'tickets' | 'time' | 'satisfaction';
  };
  index: number;
}

// Icon mapping
const iconMap = {
  orders: ShoppingCart,
  tickets: MessageSquare,
  time: Clock,
  satisfaction: ThumbsUp,
};

const colorMap = {
  orders: 'from-blue-500 to-blue-600',
  tickets: 'from-purple-500 to-purple-600',
  time: 'from-amber-500 to-amber-600',
  satisfaction: 'from-green-500 to-green-600',
};

export function StatsCard({ stat, index }: StatsCardProps) {
  const Icon = iconMap[stat.icon];
  const colorClass = colorMap[stat.icon];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {stat.title}
          </p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
            {stat.value}
          </p>
        </div>
        <div
          className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorClass} flex items-center justify-center`}
        >
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
      <div className="mt-4 flex items-center">
        {stat.trend === 'up' ? (
          <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
        ) : (
          <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
        )}
        <span
          className={`text-sm font-medium ${
            stat.trend === 'up' ? 'text-green-500' : 'text-red-500'
          }`}
        >
          {stat.change}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
          vs last period
        </span>
      </div>
    </motion.div>
  );
}

export default StatsCard;
