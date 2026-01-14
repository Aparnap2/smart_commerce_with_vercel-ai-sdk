'use client';

import { useState } from 'react';
import {
  CheckCircle,
  Clock,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  DollarSign,
  Calendar,
} from 'lucide-react';

// Refund status types
type RefundStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

// Mock refund data
const mockRefunds = [
  {
    id: 'REF-001',
    orderId: 'ORD-7829',
    customer: 'John Smith',
    amount: 149.99,
    status: 'succeeded' as RefundStatus,
    date: '2024-01-14',
    reason: 'Product defective',
  },
  {
    id: 'REF-002',
    orderId: 'ORD-7830',
    customer: 'Jane Doe',
    amount: 299.99,
    status: 'processing' as RefundStatus,
    date: '2024-01-14',
    reason: 'Wrong item shipped',
  },
  {
    id: 'REF-003',
    orderId: 'ORD-7831',
    customer: 'Bob Wilson',
    amount: 79.99,
    status: 'pending' as RefundStatus,
    date: '2024-01-13',
    reason: 'Changed mind',
  },
  {
    id: 'REF-004',
    orderId: 'ORD-7832',
    customer: 'Alice Brown',
    amount: 549.99,
    status: 'succeeded' as RefundStatus,
    date: '2024-01-13',
    reason: 'Duplicate order',
  },
  {
    id: 'REF-005',
    orderId: 'ORD-7833',
    customer: 'Charlie Davis',
    amount: 189.99,
    status: 'failed' as RefundStatus,
    date: '2024-01-12',
    reason: 'Payment expired',
  },
];

// Status badge component
function StatusBadge({ status }: { status: RefundStatus }) {
  const config = {
    succeeded: {
      icon: CheckCircle,
      color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
      label: 'Completed',
    },
    processing: {
      icon: RefreshCw,
      color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
      label: 'Processing',
    },
    pending: {
      icon: Clock,
      color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
      label: 'Pending',
    },
    failed: {
      icon: AlertCircle,
      color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
      label: 'Failed',
    },
  };

  const { icon: Icon, color, label } = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

// Refund item component
function RefundItem({ refund }: { refund: typeof mockRefunds[0] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border-b border-gray-100 dark:border-gray-700 last:border-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                {refund.customer}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {refund.orderId} - {refund.id}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-semibold text-gray-900 dark:text-white">
                ${refund.amount.toFixed(2)}
              </p>
              <StatusBadge status={refund.status} />
            </div>
            <ArrowRight
              className={`w-5 h-5 text-gray-400 transition-transform ${
                isExpanded ? 'rotate-90' : ''
              }`}
            />
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 ml-14 space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Reason</p>
              <p className="text-gray-900 dark:text-white">{refund.reason}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Date Submitted</p>
              <p className="text-gray-900 dark:text-white flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {refund.date}
              </p>
            </div>
          </div>
          {refund.status === 'succeeded' && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle className="w-4 h-4" />
              Refund processed successfully
            </div>
          )}
          {refund.status === 'failed' && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4" />
              Refund failed - please contact customer
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Summary stats component
function RefundSummary() {
  const stats = {
    pending: 12,
    processing: 8,
    succeeded: 145,
    failed: 3,
    totalAmount: 24580.50,
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
        <p className="text-sm text-amber-600 dark:text-amber-400">Pending</p>
        <p className="text-xl font-bold text-amber-700 dark:text-amber-300">
          {stats.pending}
        </p>
      </div>
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
        <p className="text-sm text-blue-600 dark:text-blue-400">Processing</p>
        <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
          {stats.processing}
        </p>
      </div>
      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
        <p className="text-sm text-green-600 dark:text-green-400">Completed</p>
        <p className="text-xl font-bold text-green-700 dark:text-green-300">
          {stats.succeeded}
        </p>
      </div>
      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
        <p className="text-sm text-red-600 dark:text-red-400">Failed</p>
        <p className="text-xl font-bold text-red-700 dark:text-red-300">
          {stats.failed}
        </p>
      </div>
    </div>
  );
}

export default function RefundStatus() {
  const [filter, setFilter] = useState<RefundStatus | 'all'>('all');

  const filteredRefunds = mockRefunds.filter(
    (refund) => filter === 'all' || refund.status === filter
  );

  return (
    <div>
      {/* Summary */}
      <RefundSummary />

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {(['all', 'pending', 'processing', 'succeeded', 'failed'] as const).map(
          (status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition-colors ${
                filter === status
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          )
        )}
      </div>

      {/* Refund List */}
      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg overflow-hidden">
        {filteredRefunds.length > 0 ? (
          filteredRefunds.map((refund) => (
            <RefundItem key={refund.id} refund={refund} />
          ))
        ) : (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No refunds found with this status
          </div>
        )}
      </div>
    </div>
  );
}
