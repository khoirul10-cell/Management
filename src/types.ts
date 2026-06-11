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
