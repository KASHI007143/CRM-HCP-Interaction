import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { setSubmittedInteractions } from '../store/formSlice';
import { 
  Search, 
  Calendar, 
  Clock, 
  Users, 
  BookOpen, 
  FileText, 
  Smile, 
  Meh, 
  Frown, 
  Mic, 
  Plus, 
  Trash2, 
  Lock, 
  AlertCircle,
  Sparkles,
  Award,
  Database
} from 'lucide-react';

interface InteractionDetailsProps {
  onSimulateVoiceNote: () => void;
}

export default function InteractionDetails({ onSimulateVoiceNote }: InteractionDetailsProps) {
  const dispatch = useDispatch();
  const formState = useSelector((state: RootState) => state.app?.form || {} as any);
  const messages = useSelector((state: RootState) => state.app?.messages || []);
  const submittedInteractions = useSelector((state: RootState) => state.app?.submittedInteractions || []);
  
  const materialsShared = formState.materialsShared || [];
  const samplesDistributed = formState.samplesDistributed || [];
  const aiSuggestedFollowUps = formState.aiSuggestedFollowUps || [];
  const sentimentVal = typeof formState.sentiment === 'string' ? formState.sentiment.trim().toLowerCase() : '';
  const [showWarning, setShowWarning] = useState(false);

  // Debug logger to trace state changes
  useEffect(() => {
    console.log("[UI FormState Logger] formState updated:", formState);
  }, [formState]);

  const fetchSubmittedInteractions = async () => {
    try {
      console.log("[UI DB Fetcher] Fetching interactions from MySQL...");
      const response = await fetch('/api/agent/interactions');
      if (!response.ok) throw new Error("HTTP status " + response.status);
      const data = await response.json();
      console.log("[UI DB Fetcher] Loaded submissions:", data);
      dispatch(setSubmittedInteractions(data));
    } catch (err) {
      console.error("[UI DB Fetcher] Failed to load submitted interactions:", err);
    }
  };

  // Load interactions on mount
  useEffect(() => {
    fetchSubmittedInteractions();
  }, []);

  // Monitor messages to re-fetch when tool log submit_interaction is success
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    const hasSuccessfulSubmit = lastMsg.toolExecutionLogs?.some(
      log => log.toolName === 'submit_interaction' && log.status === 'success'
    );
    if (hasSuccessfulSubmit) {
      console.log("[UI DB Fetcher] Successful submission detected! Re-fetching logs from MySQL...");
      fetchSubmittedInteractions();
    }
  }, [messages]);

  // Triggered when user attempts to interact with disabled inputs
  const handleAttemptManualEntry = (e: React.MouseEvent | React.FocusEvent) => {
    e.preventDefault();
    setShowWarning(true);
    setTimeout(() => setShowWarning(false), 3500);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 p-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            Interaction Details
          </h2>
          <p className="text-xs text-slate-500">Log HCP consultation metrics</p>
        </div>
        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 text-[11px] font-medium text-amber-800">
          <Lock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
          Hands-Off Policy Active
        </div>
      </div>

      {/* Warning Toast */}
      {showWarning && (
        <div className="bg-amber-600 text-white px-4 py-3 text-xs flex items-center gap-2.5 transition-all duration-300 animate-slide-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            <strong>Manual input disabled:</strong> As a secure, AI-first CRM module, editing is restricted to voice transcription or typing instructions to the AI assistant.
          </span>
        </div>
      )}

      {/* Main Form Fields Container */}
      <div className="p-5 flex-1 overflow-y-auto space-y-5 scrollbar-custom">
        
        {/* Banner Explaining Policy */}
        <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 flex gap-3 text-xs text-slate-600">
          <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-slate-800">Hands-Off UI Enforcement:</span> Every field is programmatically bound and locked. Dictate or type commands to the AI panel on the right to fill this out.
          </div>
        </div>

        {/* 1. HCP Name & Interaction Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              HCP Name <span className="text-red-500">*</span>
            </label>
            <div className="relative" onClick={handleAttemptManualEntry}>
              <input
                type="text"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg focus:outline-none cursor-not-allowed"
                placeholder="Search or select HCP..."
                value={formState.hcpName}
                readOnly
              />
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Interaction Type
            </label>
            <div onClick={handleAttemptManualEntry}>
              <select
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg focus:outline-none cursor-not-allowed"
                value={formState.interactionType}
                disabled
              >
                <option value="Meeting">Meeting</option>
                <option value="Call">Call</option>
                <option value="Email">Email</option>
                <option value="Conference">Conference</option>
              </select>
            </div>
          </div>
        </div>

        {/* 2. Date & Time */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Date
            </label>
            <div onClick={handleAttemptManualEntry}>
              <input
                type="text"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg focus:outline-none cursor-not-allowed"
                placeholder="DD-MM-YYYY"
                value={formState.date}
                readOnly
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Time
            </label>
            <div onClick={handleAttemptManualEntry}>
              <input
                type="text"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg focus:outline-none cursor-not-allowed"
                placeholder="HH:MM"
                value={formState.time}
                readOnly
              />
            </div>
          </div>
        </div>

        {/* 3. Attendees */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            Attendees
          </label>
          <div onClick={handleAttemptManualEntry}>
            <input
              type="text"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg focus:outline-none cursor-not-allowed"
              placeholder="Enter names or search..."
              value={formState.attendees}
              readOnly
            />
          </div>
        </div>

        {/* 4. Topics Discussed */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Topics Discussed
          </label>
          <div onClick={handleAttemptManualEntry}>
            <textarea
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg focus:outline-none cursor-not-allowed min-h-[80px]"
              placeholder="Enter discussion points..."
              value={formState.topicsDiscussed}
              readOnly
            />
          </div>
        </div>

        {/* Voice Note Simulation Helper */}
        <div>
          <button
            type="button"
            onClick={onSimulateVoiceNote}
            className="w-full flex items-center justify-center gap-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100/70 text-indigo-700 font-medium py-2.5 px-4 rounded-lg text-xs transition duration-150 cursor-pointer"
          >
            <Mic className="w-4 h-4 text-indigo-600 animate-pulse" />
            Summarize from Voice Note (Requires Consent)
          </button>
          <p className="text-[10px] text-slate-400 mt-1 text-center">
            Simulate a dictated voice transcript for rapid evaluation of the log interaction tool
          </p>
        </div>

        {/* 5. Materials Shared / Samples Distributed */}
        <div className="space-y-4 border-t border-b border-slate-100 py-4">
          
          {/* Materials Shared */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                Materials Shared / Pamphlets Distributed
              </label>
              <button 
                type="button" 
                onClick={handleAttemptManualEntry}
                className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Search/Add
              </button>
            </div>
            {materialsShared.length === 0 ? (
              <div className="text-xs text-slate-400 italic bg-slate-50 rounded-lg p-2.5 border border-dashed border-slate-200">
                No materials logged as shared yet. Ask the assistant to add brochures or papers.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {materialsShared.map((material, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs px-2.5 py-1 rounded-full">
                    {material}
                    <Trash2 className="w-3 h-3 text-indigo-400 hover:text-indigo-600 cursor-pointer" onClick={handleAttemptManualEntry} />
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Samples Distributed */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-teal-500" />
                Samples Distributed
              </label>
              <button 
                type="button" 
                onClick={handleAttemptManualEntry}
                className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Sample
              </button>
            </div>
            {samplesDistributed.length === 0 ? (
              <div className="text-xs text-slate-400 italic bg-slate-50 rounded-lg p-2.5 border border-dashed border-slate-200">
                No medication samples listed. Instruct the assistant to log specific clinical samples.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {samplesDistributed.map((sample: any, idx) => {
                  const displayStr = typeof sample === 'object' && sample !== null
                    ? `${sample.name || sample.drug || 'Unknown'} x ${sample.quantity || sample.qty || 1}`
                    : String(sample);
                  return (
                    <span key={idx} className="inline-flex items-center gap-1 bg-teal-50 border border-teal-100 text-teal-800 text-xs px-2.5 py-1 rounded-full">
                      {displayStr}
                      <Trash2 className="w-3 h-3 text-teal-400 hover:text-teal-600 cursor-pointer" onClick={handleAttemptManualEntry} />
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 6. Observed/Inferred Sentiment */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-2">
            Observed/Inferred HCP Sentiment
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            <div 
              onClick={handleAttemptManualEntry}
              className={`flex items-center justify-center gap-1.5 border rounded-lg py-2 text-xs font-medium transition cursor-not-allowed ${
                sentimentVal === 'positive'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}
            >
              <Smile className={`w-4 h-4 ${sentimentVal === 'positive' ? 'text-emerald-600' : 'text-slate-400'}`} />
              Positive
            </div>

            <div 
              onClick={handleAttemptManualEntry}
              className={`flex items-center justify-center gap-1.5 border rounded-lg py-2 text-xs font-medium transition cursor-not-allowed ${
                sentimentVal === 'neutral'
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}
            >
              <Meh className={`w-4 h-4 ${sentimentVal === 'neutral' ? 'text-amber-500' : 'text-slate-400'}`} />
              Neutral
            </div>

            <div 
              onClick={handleAttemptManualEntry}
              className={`flex items-center justify-center gap-1.5 border rounded-lg py-2 text-xs font-medium transition cursor-not-allowed ${
                sentimentVal === 'negative'
                  ? 'bg-rose-50 border-rose-300 text-rose-800'
                  : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}
            >
              <Frown className={`w-4 h-4 ${sentimentVal === 'negative' ? 'text-rose-600' : 'text-slate-400'}`} />
              Negative
            </div>
          </div>
        </div>

        {/* 7. Outcomes */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Outcomes
          </label>
          <div onClick={handleAttemptManualEntry}>
            <textarea
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg focus:outline-none cursor-not-allowed min-h-[70px]"
              placeholder="Key outcomes or agreements..."
              value={formState.outcomes}
              readOnly
            />
          </div>
        </div>

        {/* 8. Follow-up Actions */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Follow-up Actions
          </label>
          <div onClick={handleAttemptManualEntry}>
            <textarea
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg focus:outline-none cursor-not-allowed min-h-[70px]"
              placeholder="Enter next steps or tasks..."
              value={formState.followUpActions}
              readOnly
            />
          </div>
        </div>

        {/* 9. AI Suggested Follow-ups */}
        <div className="bg-gradient-to-tr from-indigo-50/50 to-violet-50/30 rounded-xl p-4 border border-indigo-100">
          <h3 className="text-xs font-semibold text-indigo-900 mb-2.5 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
            AI Suggested Follow-ups
          </h3>
          {aiSuggestedFollowUps.length === 0 ? (
            <p className="text-xs text-slate-400 italic">
              Awaiting logged discussion to generate custom follow-up procedures.
            </p>
          ) : (
            <ul className="space-y-2">
              {aiSuggestedFollowUps.map((suggestion, idx) => (
                <li key={idx} className="text-xs text-indigo-950 flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 10. MySQL Database Submitted Logs History */}
        <div className="border-t border-slate-200 pt-5 mt-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-3.5 flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-600" />
            Submitted Interactions (MySQL Database)
            <span className="text-[10px] font-normal bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100">
              {submittedInteractions.length} saved
            </span>
          </h3>

          {submittedInteractions.length === 0 ? (
            <div className="text-xs text-slate-400 italic bg-slate-50 rounded-lg p-4 text-center border border-slate-200">
              No historical interaction logs found in the MySQL database. Log details above and trigger "submit_interaction" to persist.
            </div>
          ) : (
            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 scrollbar-custom">
              {submittedInteractions.map((log: any) => (
                <div key={log.id} className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 hover:border-emerald-300 transition duration-150 relative">
                  {/* Card Header */}
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">{log.hcpName}</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">{log.date} {log.time ? `• ${log.time}` : ''}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <span className="text-[9px] bg-slate-200/80 border border-slate-300 text-slate-700 px-1.5 py-0.5 rounded font-medium">
                        {log.interactionType}
                      </span>
                      {log.sentiment && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium border ${
                          log.sentiment === 'Positive' 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : log.sentiment === 'Neutral'
                            ? 'bg-amber-50 border-amber-200 text-amber-700'
                            : 'bg-rose-50 border-rose-200 text-rose-700'
                        }`}>
                          {log.sentiment}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="text-[10.5px] text-slate-600 space-y-1.5 border-t border-slate-200/60 pt-2">
                    {log.topicsDiscussed && (
                      <p className="leading-relaxed">
                        <strong className="text-slate-700 font-semibold">Topics:</strong> {log.topicsDiscussed}
                      </p>
                    )}
                    {log.outcomes && (
                      <p className="leading-relaxed">
                        <strong className="text-slate-700 font-semibold">Outcomes:</strong> {log.outcomes}
                      </p>
                    )}
                    {log.materialsShared && log.materialsShared.length > 0 && (
                      <div className="flex flex-wrap gap-1 items-center pt-0.5">
                        <span className="font-semibold text-slate-700">Materials:</span>
                        {log.materialsShared.map((m: string, i: number) => (
                          <span key={i} className="bg-indigo-50 border border-indigo-100 text-indigo-700 text-[9px] px-1.5 py-0.2 rounded-full">
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                    {log.samplesDistributed && log.samplesDistributed.length > 0 && (
                      <div className="flex flex-wrap gap-1 items-center pt-0.5">
                        <span className="font-semibold text-slate-700">Samples:</span>
                        {log.samplesDistributed.map((s: any, i: number) => {
                          const displayStr = typeof s === 'object' && s !== null
                            ? `${s.name || s.drug || 'Unknown'} x ${s.quantity || s.qty || 1}`
                            : String(s);
                          return (
                            <span key={i} className="bg-teal-50 border border-teal-100 text-teal-800 text-[9px] px-1.5 py-0.2 rounded-full">
                              {displayStr}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
