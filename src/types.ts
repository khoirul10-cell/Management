export interface UserConfig {
  monthlyBudget: number;
  categoryBudgets?: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description?: string;
  timestamp: Date;
  isLateEntry?: boolean;
  walletSource?: string;
  needsWalletAssignment?: boolean;
  editCount?: number;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
}

export interface PriceAlert {
  id: string;
  userId: string;
  assetType: 'crypto' | 'stock';
  symbol: string;
  targetPriceUSD?: number;
  condition: 'above' | 'below';
  isTriggered: boolean;
  createdAt: Date;
}

export interface DebtInstallment {
  id: string;
  amount: number;
  date: Date;
}

export interface Debt {
  id: string;
  userId: string;
  type: 'payable' | 'receivable'; // payable = utang, receivable = piutang
  amount: number;
  remainingAmount: number;
  personName: string;
  description?: string;
  status: 'pending' | 'installment' | 'paid';
  dueDate?: Date;
  interestRate?: number; // percentage
  interestPeriod?: 'day' | 'week' | 'month' | 'year';
  installments?: DebtInstallment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Investment {
  id: string;
  userId: string;
  type: 'crypto' | 'stock';
  symbol: string; // e.g., BTC, AAPL
  name: string; // e.g., Bitcoin, Apple
  quantity: number;
  buyPriceIDR: number; // The average price bought per unit in IDR
  createdAt: Date;
  updatedAt: Date;
}

export interface RecurringTransaction {
  id: string;
  userId: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description?: string;
  interval: 'daily' | 'weekly' | 'monthly' | 'yearly';
  walletSource?: string;
  startDate: Date;
  lastTriggeredDate?: Date;
  nextTriggeredDate: Date;
  status: 'active' | 'paused';
  createdAt: Date;
  updatedAt: Date;
}
