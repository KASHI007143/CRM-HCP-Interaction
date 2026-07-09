import React, { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { 
  addMessage, 
  setForm, 
  setLoading, 
  setError, 
  resetAll 
} from '../store/formSlice';
import { 
  Send, 
  Sparkles, 
  RefreshCw, 
  Cpu, 
  CheckCircle, 
  AlertCircle, 
  HelpCircle,
  Play,
  ArrowRight,
  Mic,
  MicOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Message, ToolExecutionLog } from '../types';

interface AiAssistantProps {
  externalInput: string;
  clearExternalInput: () => void;
}

export default function AiAssistant({ externalInput, clearExternalInput }: AiAssistantProps) {
  const dispatch = useDispatch();
  const messages = useSelector((state: RootState) => state.app.messages);
  const formState = useSelector((state: RootState) => state.app.form);
  const isLoading = useSelector((state: RootState) => state.app.isLoading);
  const [inputText, setInputText] = useState('');
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [micStatusMessage, setMicStatusMessage] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const simulationIntervalRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
    }
    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
      }
    };
  }, []);

  const runSpeechSimulation = (phrase: string) => {
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
    }
    setIsListening(true);
    setMicStatusMessage("Simulation active: transcribing speech stream...");
    
    let currentWordIndex = 0;
    const words = phrase.split(" ");
    setInputText("");
    
    simulationIntervalRef.current = setInterval(() => {
      if (currentWordIndex < words.length) {
        setInputText((prev) => (prev ? prev + " " : "") + words[currentWordIndex]);
        currentWordIndex++;
      } else {
        clearInterval(simulationIntervalRef.current);
        setIsListening(false);
        setTimeout(() => setMicStatusMessage(null), 4000);
      }
    }, 80);
  };

  const toggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    const drWilsonPhrase = "Today I met with Dr. Wilson at City Hospital, discussed AntiBio-X for bacterial infections, the sentiment was positive, and I provided dosing charts and educational brochures.";
    
    if (isListening) {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.warn("Stop speech failed:", e);
        }
      }
      setIsListening(false);
      return;
    }

    if (!SpeechRecognition) {
      runSpeechSimulation(drWilsonPhrase);
      return;
    }

    setMicStatusMessage(null);
    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsListening(true);
        setMicStatusMessage("Microphone capture live. Please speak...");
      };

      rec.onresult = (event: any) => {
        let fullTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          fullTranscript += event.results[i][0].transcript;
        }
        setInputText(fullTranscript);
      };

      rec.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
        
        // If iframe sandbox blocks microphone, trigger a graceful simulation fallback automatically so it works perfectly in AI Studio!
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'security') {
          setMicStatusMessage("Iframe sandbox blocked microphone access. Gracefully running voice dictation simulation...");
          runSpeechSimulation(drWilsonPhrase);
        } else {
          setMicStatusMessage(`Speech capture error: ${event.error}. Fell back to text typing.`);
        }
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (e) {
      console.error("Speech recognition start failed:", e);
      setMicStatusMessage("Failed to start mic. Running speech simulation...");
      runSpeechSimulation(drWilsonPhrase);
    }
  };

  // Autoscroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query) return;

    setInputText('');

    dispatch(setLoading(true));

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formState,
          messages,
          text: query
        })
      });

      if (!response.ok) {
        throw new Error('API server returned error status ' + response.status);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      // Update Form State in Redux
      if (data.formState) {
        dispatch(setForm(data.formState));
      }

      // Update Messages in Redux (which now contains the user message + agent reply + tool logs)
      if (data.messages) {
        // Find the last agent reply to append
        const lastMsg = data.messages[data.messages.length - 1];
        const userMsg: Message = {
          id: 'user-' + Date.now(),
          sender: 'user',
          text: query,
          timestamp: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        };
        dispatch(addMessage(userMsg));
        dispatch(addMessage(lastMsg));
      }

    } catch (err: any) {
      console.error("Chat message error:", err);
      dispatch(setError(err.message));
      
      // Fallback local error message
      const errorMsg: Message = {
        id: 'err-' + Date.now(),
        sender: 'system',
        text: `⚠️ Engine Error: ${err.message}. Please verify your server connection and Gemini API Key configuration inside Settings > Secrets.`,
        timestamp: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      };
      dispatch(addMessage(errorMsg));
    } finally {
      dispatch(setLoading(false));
    }
  };

  // Monitor external dictated transcript inputs and automatically log them
  useEffect(() => {
    if (externalInput) {
      setInputText(externalInput);
      handleSendMessage(externalInput);
      clearExternalInput();
    }
  }, [externalInput, clearExternalInput]);

  const handleReset = () => {
    dispatch(resetAll());
    setShowConfirmReset(false);
  };

  // Sample prompt helpers for rapid testing
  const samplePrompts = [
    { label: "Log: Smith Meeting", text: "Today I met with Dr. Smith and discussed product X efficiency. The sentiment was positive and I shared the brochures." },
    { label: "Edit: Change to Dr. John", text: "Sorry, the name was actually Dr. John and the sentiment was negative." },
    { label: "Tool 3: Add Oncology Flyer", text: "Please add the clinical paper 'OncoBoost Flyer' and 'Trial Slides' to my shared materials list." },
    { label: "Tool 4: Add Drug Samples", text: "I also distributed 3 boxes of OncoBoost 50mg and 1 sample of Prodo-X." },
    { label: "Tool 5: Suggest Follow-ups", text: "Analyze this clinical conversation and generate 3 custom medical follow-up proposals." }
  ];

  return (
    <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-800 flex flex-col h-full text-slate-100 overflow-hidden">
      
      {/* Header */}
      <div className="bg-slate-950 border-b border-slate-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500/25 p-1.5 rounded-lg border border-indigo-500/30">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wide">AI CRM Assistant</h2>
            <p className="text-[10px] text-indigo-300">Active LangGraph Orchestrator</p>
          </div>
        </div>
        
        {/* Soft reset confirmation */}
        {showConfirmReset ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-amber-400 font-medium animate-pulse">Clear draft?</span>
            <button
              onClick={handleReset}
              className="px-2 py-1 text-[10px] bg-rose-600 hover:bg-rose-500 text-white rounded font-semibold transition cursor-pointer"
            >
              Clear
            </button>
            <button
              onClick={() => setShowConfirmReset(false)}
              className="px-2 py-1 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button 
            onClick={() => setShowConfirmReset(true)}
            title="Reset CRM Form"
            className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Quick Prompt Helper chips */}
      <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 overflow-x-auto whitespace-nowrap flex gap-2 scrollbar-none">
        <span className="text-[10px] font-bold text-slate-500 self-center uppercase tracking-wider mr-1">Demo Scripts:</span>
        {samplePrompts.map((p, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(p.text)}
            disabled={isLoading}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium px-2.5 py-1 rounded-full border border-slate-700 hover:border-slate-600 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Chat scroll workspace */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 scrollbar-custom">
        
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              {/* Sender Tag */}
              <span className="text-[10px] font-semibold text-slate-500 mb-1 px-1 capitalize">
                {msg.sender === 'system' ? 'CRM Engine' : msg.sender} • {msg.timestamp}
              </span>

              {/* Message Bubble */}
              <div className={`max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-none border border-indigo-500/30'
                  : msg.sender === 'system'
                  ? 'bg-amber-950/40 border border-amber-900/60 text-amber-200 rounded-tl-none'
                  : 'bg-slate-800/80 text-slate-200 border border-slate-700/60 rounded-tl-none'
              }`}>
                {/* Text render (supports simple markdown list/bold rendering) */}
                <div className="whitespace-pre-wrap space-y-1">
                  {msg.text.split('\n').map((line, lIdx) => {
                    if (line.startsWith('* ') || line.startsWith('- ')) {
                      return <li key={lIdx} className="ml-3 list-disc my-1">{line.substring(2)}</li>;
                    }
                    // Handle bold markdown e.g. **Text**
                    const boldRegex = /\*\*(.*?)\*\*/g;
                    if (boldRegex.test(line)) {
                      const parts = line.split(boldRegex);
                      return (
                        <p key={lIdx} className="my-0.5">
                          {parts.map((p, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} className="text-white font-semibold">{p}</strong> : p)}
                        </p>
                      );
                    }
                    return <p key={lIdx} className="my-0.5">{line}</p>;
                  })}
                </div>

                {/* Render LangGraph agent node progress if available */}
                {msg.toolExecutionLogs && msg.toolExecutionLogs.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                      <Cpu className="w-3.5 h-3.5" />
                      LangGraph Agents & Tools Executed:
                    </div>
                    
                    <div className="space-y-1.5">
                      {/* Represent Router node */}
                      <div className="flex items-center justify-between text-[11px] bg-slate-900/60 border border-slate-800 rounded px-2 py-1 text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                          Node: router_evaluator
                        </span>
                        <span className="text-[9px] bg-indigo-950 text-indigo-300 border border-indigo-900 px-1 py-0.2 rounded font-mono uppercase">Decided</span>
                      </div>

                      {/* Display the tools logs */}
                      {msg.toolExecutionLogs.map((log: ToolExecutionLog, logIdx: number) => (
                        <div 
                          key={logIdx} 
                          className={`flex flex-col gap-1 text-[11px] bg-slate-900/80 border rounded p-2 transition duration-150 ${
                            log.status === 'success' 
                              ? 'border-emerald-900/60 bg-emerald-950/10' 
                              : log.status === 'failed'
                              ? 'border-rose-950 bg-rose-950/10'
                              : 'border-amber-900/50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                log.status === 'success' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                              }`} />
                              Tool: {log.toolName}
                            </span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              log.status === 'success' 
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' 
                                : 'bg-amber-950 text-amber-400 border border-amber-900'
                            }`}>
                              {log.status}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-tight">
                            {log.message}
                          </p>
                          {log.extractedData && Object.keys(log.extractedData).length > 0 && (
                            <div className="mt-1 bg-slate-950 rounded p-1.5 font-mono text-[9px] text-slate-400 border border-slate-800/80 max-h-[100px] overflow-y-auto scrollbar-custom">
                              <span className="text-slate-500">Params:</span> {JSON.stringify(log.extractedData, null, 1)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Loading Indicator with Step transitions */}
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-start"
          >
            <span className="text-[10px] font-semibold text-indigo-400 mb-1 flex items-center gap-1 animate-pulse">
              <Cpu className="w-3.5 h-3.5 spin-slow" />
              LangGraph Engine Activating Node...
            </span>
            <div className="bg-slate-800/50 border border-indigo-900/40 rounded-xl px-4 py-3 text-xs text-slate-300 flex items-center gap-3 w-3/4">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />
              <div>
                <p className="font-medium text-slate-200">Executing agent State Graph</p>
                <p className="text-[10px] text-indigo-400">Querying Gemini API server-side...</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Real-time voice listening animation equalizer panel */}
        {isListening && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-start space-y-2 mt-2 w-full"
          >
            <div className="w-full bg-gradient-to-r from-indigo-950/40 via-slate-900/90 to-indigo-950/40 border border-indigo-500/30 rounded-xl p-3.5 shadow-xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center h-9 w-9 rounded-full bg-indigo-500/20 border border-indigo-500/40">
                  <span className="animate-ping absolute inline-flex h-7 w-7 rounded-full bg-indigo-500/30 opacity-75"></span>
                  <Mic className="w-4.5 h-4.5 text-indigo-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[11px] text-slate-100 tracking-wide uppercase">Voice Dictation Active</p>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {speechSupported 
                      ? "Listening to speech in real-time..." 
                      : "Simulating speech-to-text input..."}
                  </p>
                </div>
              </div>
              
              {/* Voice equalizer waveform animation */}
              <div className="flex items-end gap-[3px] h-5 px-1 shrink-0">
                <div className="w-[3px] bg-indigo-400 rounded-full animate-bounce h-4" style={{ animationDuration: '0.8s', animationDelay: '0.1s' }} />
                <div className="w-[3px] bg-indigo-500 rounded-full animate-bounce h-2.5" style={{ animationDuration: '0.5s', animationDelay: '0.3s' }} />
                <div className="w-[3px] bg-indigo-300 rounded-full animate-bounce h-5" style={{ animationDuration: '0.7s', animationDelay: '0.2s' }} />
                <div className="w-[3px] bg-indigo-400 rounded-full animate-bounce h-3.5" style={{ animationDuration: '0.9s', animationDelay: '0.4s' }} />
                <div className="w-[3px] bg-indigo-500 rounded-full animate-bounce h-2" style={{ animationDuration: '0.6s', animationDelay: '0.15s' }} />
                <div className="w-[3px] bg-indigo-300 rounded-full animate-bounce h-4" style={{ animationDuration: '0.75s', animationDelay: '0.35s' }} />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Tray */}
      <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-2">
        {isListening && (
          <div className="flex items-center gap-2 text-[11px] text-indigo-400 bg-indigo-950/40 border border-indigo-900/40 rounded-lg px-3 py-1.5 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping shrink-0" />
            <span className="font-semibold text-xs">
              {micStatusMessage || (speechSupported ? "Listening to voice input..." : "Speech simulated transcript typing...")}
            </span>
          </div>
        )}

        {/* Quick Speech Sandbox Presets */}
        <div className="flex flex-col gap-1.5 pb-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Simulate Speech Logs (Sandbox Friendly)</span>
            {micStatusMessage && <span className="text-[9px] text-indigo-400 font-medium animate-pulse">{micStatusMessage}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-[72px] overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => runSpeechSimulation("Today I met with Dr. Wilson at City Hospital, discussed AntiBio-X for bacterial infections, the sentiment was positive, and I provided dosing charts and educational brochures.")}
              disabled={isListening || isLoading}
              className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 text-slate-300 hover:text-slate-100 px-2.5 py-1 rounded-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🎤 Dr. Wilson (AntiBio-X)
            </button>
            <button
              type="button"
              onClick={() => runSpeechSimulation("Today I met Dr. Smith at Apollo Hospital. We discussed Prodo-X for diabetic patients. He liked the efficacy results. I shared two brochures and one clinical paper. I also provided five Prodo-X sample packs. Schedule a follow-up in two weeks.")}
              disabled={isListening || isLoading}
              className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 text-slate-300 hover:text-slate-100 px-2.5 py-1 rounded-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🎤 Dr. Smith (Prodo-X)
            </button>
            <button
              type="button"
              onClick={() => runSpeechSimulation("Change doctor name to Dr. John.")}
              disabled={isListening || isLoading}
              className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 text-slate-300 hover:text-slate-100 px-2.5 py-1 rounded-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🎤 Change to Dr. John
            </button>
            <button
              type="button"
              onClick={() => runSpeechSimulation("Remove the brochure.")}
              disabled={isListening || isLoading}
              className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 text-slate-300 hover:text-slate-100 px-2.5 py-1 rounded-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🎤 Remove brochure
            </button>
          </div>
        </div>
        
        <div className="flex gap-2 relative">
          {/* Microphone Dictation Button */}
          <button
            type="button"
            onClick={toggleListening}
            disabled={isLoading}
            className={`p-2.5 rounded-lg border transition flex items-center justify-center shrink-0 h-11 w-11 cursor-pointer ${
              isListening 
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.6)] animate-pulse' 
                : 'bg-slate-900 border-slate-800 hover:bg-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title={isListening ? "Stop listening" : "Start speaking (Speech-to-Text)"}
          >
            {isListening ? <MicOff className="w-4 h-4 text-indigo-100" /> : <Mic className="w-4 h-4" />}
          </button>

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={isListening ? "Listening / Dictating..." : "Instruct the AI: e.g., 'Met Dr. Smith, sentiment positive...'"}
            disabled={isLoading}
            className="flex-1 bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500/80 resize-none min-h-[44px] h-11 disabled:opacity-50"
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputText.trim() || isLoading}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white disabled:text-slate-600 p-2.5 rounded-lg border border-indigo-500/20 hover:border-indigo-400/30 transition flex items-center justify-center shrink-0 disabled:border-transparent cursor-pointer h-11 w-11"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="flex justify-between items-center text-[10px] text-slate-500 px-1">
          <span>💡 Speak or type to run structured LangGraph tools.</span>
          <span>Engine version: 1.2.0</span>
        </div>
      </div>

    </div>
  );
}
