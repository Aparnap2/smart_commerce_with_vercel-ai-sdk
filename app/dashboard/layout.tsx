'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  ShoppingCart,
  MessageSquare,
  FileText,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  User,
  TrendingUp,
  CreditCard
} from 'lucide-react';
import { useState } from 'react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Orders', href: '/dashboard/orders', icon: ShoppingCart },
  { name: 'Support', href: '/dashboard/support', icon: MessageSquare },
  { name: 'Tickets', href: '/dashboard/tickets', icon: FileText },
  { name: 'Analytics', href: '/dashboard/analytics', icon: TrendingUp },
  { name: 'Refunds', href: '/dashboard/refunds', icon: CreditCard },
];

const bottomNavigation = [
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notifications] = useState(3);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 h-screen transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        } bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700`}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700">
            {!sidebarCollapsed && (
              <Link href="/dashboard" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-lg text-gray-900 dark:text-white">
                  TechTrend
                </span>
              </Link>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {sidebarCollapsed ? (
                <ChevronRight className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronLeft className="w-5 h-5 text-gray-500" />
              )}
            </button>
          </div>

          {/* Main Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}`} />
                  {!sidebarCollapsed && (
                    <span className="font-medium">{item.name}</span>
                  )}
                  {!sidebarCollapsed && item.name === 'Tickets' && notifications > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                      {notifications}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Bottom Navigation */}
          <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-4 space-y-1">
            {bottomNavigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}`} />
                  {!sidebarCollapsed && (
                    <span className="font-medium">{item.name}</span>
                  )}
                </Link>
              );
            })}
            <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-all duration-200">
              <LogOut className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && <span className="font-medium">Logout</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div
        className={`transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? 'ml-20' : 'ml-64'
        }`}
      >
        {/* Top Header */}
        <header className="sticky top-0 z-30 h-16 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700">
          <div className="flex h-full items-center justify-between px-6">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                Support Dashboard
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Manage orders, tickets, and customer inquiries
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Notifications */}
              <button className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              </button>

              {/* User Menu */}
              <button className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                {!sidebarCollapsed && (
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Agent Smith</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Support Lead</p>
                  </div>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6">
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
