import React, { useState } from 'react';
import { Provider } from 'react-redux';
import { store } from './store';
import InteractionDetails from './components/InteractionDetails';
import AiAssistant from './components/AiAssistant';
import { ShieldCheck, Cpu, ArrowUpRight, Github, Sparkles } from 'lucide-react';

export default function App() {
  const [voiceNoteTranscript, setVoiceNoteTranscript] = useState('');

  // Simulates loading a voice-note dictation transcription from the server
  const handleSimulateVoiceNote = async () => {
    try {
      const response = await fetch('/api/agent/voice-note', {
        method: 'POST'
      });
      const data = await response.json();
      if (data.transcript) {
        setVoiceNoteTranscript(data.transcript);
      }
    } catch (err) {
      console.error("Failed to load voice note transcript:", err);
    }
  };

  return (
    <Provider store={store}>
      <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-slate-50 flex flex-col font-sans text-slate-800 antialiased selection:bg-indigo-500/25">
        
        {/* Navigation Bar */}
        <header className="bg-white border-b border-slate-200 shrink-0 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
            
            {/* Logo and Context */}
            <div className="flex items-center gap-2.5">
              <div className="bg-indigo-600 text-white p-2 rounded-xl shadow-md shadow-indigo-600/10">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-900 leading-none">CRM: HCP MODULE</h1>
                <p className="text-[10px] text-slate-500 font-medium mt-0.5">AI-First Log Interaction Suite</p>
              </div>
            </div>

            {/* Central system status indicators */}
            <div className="hidden md:flex items-center gap-4 text-xs font-medium text-slate-600">
              <span className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full text-slate-600">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Durable CRM Sandbox
              </span>
              <span className="flex items-center gap-1 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full text-indigo-700">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                Gemini 3.5 Active
              </span>
            </div>

            {/* Technical Challenge Badges */}
            <div className="flex items-center gap-2">
              <a 
                href="https://ai.studio/build" 
                target="_blank" 
                rel="noreferrer"
                className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100/70 border border-indigo-200/50 rounded-lg px-3 py-1.5 transition flex items-center gap-1 cursor-pointer"
              >
                AI Studio Build
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>

          </div>
        </header>

        {/* Workspace Container */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col min-h-0 overflow-y-auto lg:overflow-hidden scrollbar-custom">
          
          {/* Welcome Intro Section */}
          <section className="mb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-4 shrink-0">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">Log HCP Interaction</h2>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                An executive technical replica showcasing full-stack form automation via LangGraph-style agent logic. Dictate meeting records, resolve sentiments, record drug samples, and schedule clinical tasks hands-free.
              </p>
            </div>
            
            {/* Legend / Status Pill */}
            <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
              <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200">Redux State Engine</span>
              <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200">Express Node CJS</span>
              <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200">Gemini-3.5-Flash</span>
            </div>
          </section>

          {/* Core Split-Screen Workspace */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0 overflow-y-auto lg:overflow-hidden">
            
            {/* Left Panel: Form (55% space) */}
            <div className="lg:col-span-7 h-[calc(100vh-210px)] lg:h-full lg:min-h-0 min-h-[450px]">
              <InteractionDetails onSimulateVoiceNote={handleSimulateVoiceNote} />
            </div>

            {/* Right Panel: AI Assistant (45% space) */}
            <div className="lg:col-span-5 h-[calc(100vh-210px)] lg:h-full lg:min-h-0 min-h-[450px]">
              <AiAssistant 
                externalInput={voiceNoteTranscript} 
                clearExternalInput={() => setVoiceNoteTranscript('')} 
              />
            </div>

          </div>

        </main>
      </div>
    </Provider>
  );
}
