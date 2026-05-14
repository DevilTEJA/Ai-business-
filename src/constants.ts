import { Agent } from './types';

export const AGENTS: Agent[] = [
  {
    id: 'EXECUTIVE',
    name: 'Executive AI',
    description: 'Central strategy and coordination engine.',
    expertise: ['Decision making', 'Planning', 'Coordination'],
    status: 'IDLE',
  },
  {
    id: 'MARKETING',
    name: 'Marketing Strategist AI',
    description: 'Campaign planning and branding specialist.',
    expertise: ['Funnels', 'Branding', 'Campaigns'],
    status: 'IDLE',
  },
  {
    id: 'CONTENT',
    name: 'Content Creator AI',
    description: 'Synthesizer of ads, blogs, and scripts.',
    expertise: ['Copywriting', 'Ad Creation', 'Blogging'],
    status: 'IDLE',
  },
  {
    id: 'SOCIAL',
    name: 'Social Media Manager AI',
    description: 'Growth and community engagement engine.',
    expertise: ['Scheduling', 'Growth', 'Engagement'],
    status: 'IDLE',
  },
  {
    id: 'LEAD_GEN',
    name: 'Lead Generation AI',
    description: 'Prospect identification and data collection.',
    expertise: ['Sourcing', 'Data Verification', 'Prospecting'],
    status: 'IDLE',
  },
  {
    id: 'SALES',
    name: 'Sales Agent AI',
    description: 'Persuasive interaction and negotiation.',
    expertise: ['Negotiation', 'Pitching', 'Direct Sales'],
    status: 'IDLE',
  },
  {
    id: 'SALES_MGR',
    name: 'Sales Manager AI',
    description: 'Conversion optimization and performance tracking.',
    expertise: ['Pipeline Management', 'Conversion Rates'],
    status: 'IDLE',
  },
  {
    id: 'SUPPORT',
    name: 'Customer Support AI',
    description: 'Retention and query resolution expert.',
    expertise: ['Retention', 'Ticketing', 'Customer Success'],
    status: 'IDLE',
  },
  {
    id: 'ANALYTICS',
    name: 'Analytics AI',
    description: 'KPI intelligence and market insights.',
    expertise: ['Data Analysis', 'Forecasting', 'Reporting'],
    status: 'IDLE',
  },
  {
    id: 'OPERATIONS',
    name: 'Operations Manager AI',
    description: 'Workflow efficiency and process automation.',
    expertise: ['Optimization', 'Workflow', 'Execution'],
    status: 'IDLE',
  },
];
