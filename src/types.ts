export interface FormState {
  hcpName: string;
  interactionType: string;
  date: string;
  time: string;
  attendees: string;
  topicsDiscussed: string;
  materialsShared: string[];
  samplesDistributed: string[];
  sentiment: 'Positive' | 'Neutral' | 'Negative' | '';
  outcomes: string;
  followUpActions: string;
  aiSuggestedFollowUps: string[];
}

export interface Message {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  toolExecutionLogs?: ToolExecutionLog[];
}

export interface ToolExecutionLog {
  toolName: string;
  status: 'running' | 'success' | 'failed';
  message: string;
  extractedData?: any;
}

export interface AgentResponse {
  messages: Message[];
  formState: FormState;
}
