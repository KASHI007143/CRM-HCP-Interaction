import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { FormState, Message } from '../types';

interface AppState {
  form: FormState;
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  submittedInteractions: any[];
}

const initialFormState: FormState = {
  hcpName: '',
  interactionType: 'Meeting',
  date: '',
  time: '',
  attendees: '',
  topicsDiscussed: '',
  materialsShared: [],
  samplesDistributed: [],
  sentiment: '',
  outcomes: '',
  followUpActions: '',
  aiSuggestedFollowUps: [],
};

const initialState: AppState = {
  form: initialFormState,
  messages: [
    {
      id: 'welcome',
      sender: 'assistant',
      text: "Hello! I am your AI-First CRM Assistant. I am here to help you log and manage HCP interactions completely hands-free.\n\nType your interaction details (e.g., *'Met Dr. Smith today to discuss Prodo-X. Sentiment was positive and we shared the brochures'*) to automatically populate the form on the left.",
      timestamp: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    },
  ],
  isLoading: false,
  error: null,
  submittedInteractions: [],
};

export const formSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setForm: (state, action: PayloadAction<FormState>) => {
      state.form = action.payload;
    },
    updateFormFields: (state, action: PayloadAction<Partial<FormState>>) => {
      state.form = { ...state.form, ...action.payload };
    },
    addMessage: (state, action: PayloadAction<Message>) => {
      state.messages.push(action.payload);
    },
    setMessages: (state, action: PayloadAction<Message[]>) => {
      state.messages = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    resetAll: (state) => {
      state.form = initialFormState;
      state.messages = [
        {
          id: 'welcome-' + Date.now(),
          sender: 'assistant',
          text: "All cleared! I am ready to start fresh. What interaction would you like to log?",
          timestamp: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        }
      ];
      state.error = null;
    },
    setSubmittedInteractions: (state, action: PayloadAction<any[]>) => {
      state.submittedInteractions = action.payload;
    }
  },
});

export const {
  setForm,
  updateFormFields,
  addMessage,
  setMessages,
  setLoading,
  setError,
  resetAll,
  setSubmittedInteractions,
} = formSlice.actions;

export default formSlice.reducer;
