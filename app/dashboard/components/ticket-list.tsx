'use client';

import { useState } from 'react';
import {
  MessageSquare,
  AlertCircle,
  CheckCircle,
  Clock,
  User,
  Tag,
  ChevronRight,
} from 'lucide-react';

// Priority types
type Priority = 'low' | 'medium' | 'high' | 'urgent';
type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

// Mock ticket data
const mockTickets = [
  {
    id: 'TKT-001',
    subject: 'Order not delivered',
    customer: 'John Smith',
    email: 'john.smith@email.com',
    priority: 'high' as Priority,
    status: 'open' as TicketStatus,
    created: '2024-01-14 10:30',
    messages: 3,
  },
  {
    id: 'TKT-002',
    subject: 'Refund request for damaged item',
    customer: 'Jane Doe',
    email: 'jane.doe@email.com',
    priority: 'urgent' as Priority,
    status: 'in_progress' as TicketStatus,
    created: '2024-01-14 09:15',
    messages: 5,
  },
  {
    id: 'TKT-003',
    subject: 'Product inquiry - availability',
    customer: 'Bob Wilson',
    email: 'bob.wilson@email.com',
    priority: 'low' as Priority,
    status: 'resolved' as TicketStatus,
    created: '2024-01-13 16:45',
    messages: 2,
  },
  {
    id: 'TKT-004',
    subject: 'Payment issue - order #ORD-7890',
    customer: 'Alice Brown',
    email: 'alice.brown@email.com',
    priority: 'high' as Priority,
    status: 'open' as TicketStatus,
    created: '2024-01-13 14:20',
    messages: 4,
  },
  {
    id: 'TKT-005',
    subject: 'Shipping address change',
    customer: 'Charlie Davis',
    email: 'charlie.davis@email.com',
    priority: 'medium' as Priority,
    status: 'closed' as TicketStatus,
    created: '2024-01-12 11:00',
    messages: 6,
  },
];

// Priority badge configuration
const priorityConfig = {
  low: {
    color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
    label: 'Low',
  },
  medium: {
    color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    label: 'Medium',
  },
  high: {
    color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    label: 'High',
  },
  urgent: {
    color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    label: 'Urgent',
  },
};

// Status badge configuration
const statusConfig = {
  open: {
    icon: AlertCircle,
    color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    label: 'Open',
  },
  in_progress: {
    icon: Clock,
    color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    label: 'In Progress',
  },
  resolved: {
    icon: CheckCircle,
    color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    label: 'Resolved',
  },
  closed: {
    icon: CheckCircle,
    color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400',
    label: 'Closed',
  },
};

// Priority icon based on level
function getPriorityIcon(priority: Priority) {
  const level = { low: 1, medium: 2, high: 3, urgent: 4 };
  return level[priority];
}

// Ticket row component
function TicketRow({ ticket }: { ticket: typeof mockTickets[0] }) {
  const priority = priorityConfig[ticket.priority];
  const status = statusConfig[ticket.status];
  const StatusIcon = status.icon;

  return (
    <tr className="border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-white text-sm">
              {ticket.id}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{ticket.customer}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <p className="text-sm text-gray-900 dark:text-white font-medium line-clamp-1 max-w-[200px]">
          {ticket.subject}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {ticket.email}
        </p>
      </td>
      <td className="px-4 py-4">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${priority.color}`}>
          <Tag className="w-3 h-3" />
          {priority.label}
        </span>
      </td>
      <td className="px-4 py-4">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
          <StatusIcon className="w-3 h-3" />
          {status.label}
        </span>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
          <MessageSquare className="w-4 h-4" />
          {ticket.messages}
        </div>
      </td>
      <td className="px-4 py-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {ticket.created}
        </p>
      </td>
      <td className="px-4 py-4">
        <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </button>
      </td>
    </tr>
  );
}

// Stats summary
function TicketSummary() {
  const summary = {
    total: 156,
    open: 23,
    inProgress: 45,
    resolved: 88,
  };

  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.total}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
      </div>
      <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
        <p className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.open}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Open</p>
      </div>
      <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{summary.inProgress}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">In Progress</p>
      </div>
      <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
        <p className="text-2xl font-bold text-green-600 dark:text-green-400">{summary.resolved}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Resolved</p>
      </div>
    </div>
  );
}

export default function RecentTickets() {
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');

  const filteredTickets = mockTickets.filter(
    (ticket) => statusFilter === 'all' || ticket.status === statusFilter
  );

  return (
    <div>
      {/* Summary */}
      <TicketSummary />

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {(['all', 'open', 'in_progress', 'resolved'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition-colors ${
              statusFilter === status
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {status === 'all' ? 'All' : status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Messages</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredTickets.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-4">
        {filteredTickets.map((ticket) => (
          <div
            key={ticket.id}
            className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white text-sm">
                    {ticket.customer}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{ticket.id}</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                priorityConfig[ticket.priority].color
              }`}>
                {priorityConfig[ticket.priority].label}
              </span>
            </div>
            <p className="text-sm text-gray-900 dark:text-white font-medium mb-2">
              {ticket.subject}
            </p>
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1 ${
                  statusConfig[ticket.status].color
                }`}>
                  {statusConfig[ticket.status].label}
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />
                  {ticket.messages}
                </span>
              </div>
              <span>{ticket.created}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
