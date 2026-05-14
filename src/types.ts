
export type AgentRole = 
  | 'EXECUTIVE'
  | 'MARKETING'
  | 'CONTENT'
  | 'SOCIAL'
  | 'LEAD_GEN'
  | 'SALES'
  | 'SALES_MGR'
  | 'SUPPORT'
  | 'ANALYTICS'
  | 'OPERATIONS';

export interface AgentMetrics {
  completionRate: number;
  avgDuration: number; // in milliseconds
  errorRate: number;
  totalTasks: number;
}

export interface Agent {
  id: AgentRole;
  name: string;
  description: string;
  expertise: string[];
  status: 'IDLE' | 'THINKING' | 'WORKING' | 'COMPLETED' | 'ERROR';
  metrics?: AgentMetrics;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedTo: AgentRole;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  output?: string;
  createdAt: number;
  completedAt?: number;
  dependencies: string[]; // IDs of other tasks
}

export interface BusinessGoal {
  id: string;
  description: string;
  status: 'ACTIVE' | 'ACHIEVED' | 'FAILED';
  tasks: Task[];
  kpis: {
    label: string;
    value: string | number;
    trend: 'up' | 'down' | 'neutral';
  }[];
}

export interface OperationLog {
  id: string;
  timestamp: number;
  sender: AgentRole;
  message: string;
  type: 'COMMUNICATION' | 'ACTION' | 'INSIGHT' | 'SYSTEM';
}
