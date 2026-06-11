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
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
}
