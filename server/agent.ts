import { GoogleGenAI } from "@google/genai";
import { FormState, Message, ToolExecutionLog } from "../src/types";
import { saveInteraction } from "./db";


// Initialize Gemini client as per guidelines
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Anchor date for relative calculations (e.g. "today", "yesterday")
const CURRENT_DATE_STRING = "2026-07-08";

// Initial empty form state
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

// Unified LLM wrapper supporting both Groq and Gemini fallback
async function callLlm(prompt: string, jsonMode = false): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY || "";
  
  if (groqKey) {
    try {
      console.log("[LLM Router] Fetching completion from Groq API...");
      const payload: any = {
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.1
      };

      if (jsonMode) {
        payload.response_format = { type: "json_object" };
      }

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Groq API status ${res.status}: ${errText}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || "";
    } catch (err: any) {
      console.error("[LLM Router] Groq Error (falling back to Gemini):", err.message);
    }
  }

  // Fallback to Gemini
  try {
    console.log("[LLM Router] Fetching completion from Gemini API...");
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: jsonMode ? { responseMimeType: "application/json" } : undefined
    });
    return response.text || "";
  } catch (err: any) {
    console.error("[LLM Router] Gemini Fallback Error:", err.message);
    throw err;
  }
}

// Utility to clean Markdown formatting blocks often returned by LLaMA models
function cleanAndParseJson(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  cleaned = cleaned.trim();
  return JSON.parse(cleaned);
}

// Validation function for required fields
function validateFormFields(form: FormState): string[] {
  const missing: string[] = [];
  if (!form.hcpName || form.hcpName.trim() === '') {
    missing.push("HCP Name");
  }
  if (!form.interactionType || form.interactionType.trim() === '') {
    missing.push("Interaction Type");
  }
  if (!form.date || form.date.trim() === '') {
    missing.push("Date");
  }
  if (!form.time || form.time.trim() === '') {
    missing.push("Time");
  }
  if (!form.topicsDiscussed || form.topicsDiscussed.trim() === '') {
    missing.push("Topics Discussed");
  }
  if (!form.outcomes || form.outcomes.trim() === '') {
    missing.push("Outcomes");
  }
  if (!form.followUpActions || form.followUpActions.trim() === '') {
    missing.push("Follow-up Actions");
  }
  return missing;
}

// Sanitization function for drug samples to ensure string arrays and prevent UI crash
function sanitizeSamples(samples: any[]): string[] {
  if (!Array.isArray(samples)) return [];
  return samples.map((s: any) => {
    if (typeof s === 'string') return s;
    if (typeof s === 'object' && s !== null) {
      const name = s.name || s.drug || s.product || s.brand || 'Unknown Sample';
      const qty = s.quantity || s.qty || s.count || s.amount || s.num || 1;
      return `${name} x ${qty}`;
    }
    return String(s);
  });
}

// 1. Define Agent State Schema
interface AgentState {
  messages: Message[];
  formState: FormState;
  toolLogs: ToolExecutionLog[];
  nextNode: string;
  error?: string;
}

// 2. State Graph Router
async function routerNode(state: AgentState, userMessage: string): Promise<AgentState> {
  const prompt = `
You are the domain-specific routing engine of an AI-First CRM Assistant for pharmaceutical relationship management.
Your only responsibility is to inspect the user's message and decide which specific CRM tool node to execute next.

CORE RULE:
You are NOT a general AI assistant. If the user asks general-knowledge questions unrelated to pharmaceutical relationship management, doctor visits, clinical starter kits, pamphlets, follow-up actions, medical sales, or clinical product discussions (e.g., coding, general knowledge, movies, weather, math, general science), you MUST route to 'none' with a reason specifying "unrelated_general_query".

Available Tools:
1. 'create_interaction': Use when the user describes an interaction with an HCP (e.g., "Met with Dr. Smith today...", "Today I met Dr. Smith at Apollo Hospital...") and wants to log it for the first time or fill the form initially.
2. 'update_interaction': Use when the form already has data and the user wants to update, modify, correct, or change specific fields (e.g., "Change doctor name to Dr. John", "Change sentiment to Neutral", "Update meeting date", "Delete follow-up").
3. 'delete_interaction': Use when the user explicitly wants to delete, clear, reset, or wipe the current interaction form state (e.g., "wipe form", "clear form", "reset all fields"). Note: If they want to delete a specific material or sample from a list, prefer 'remove_material' or 'remove_drug_sample' or 'update_interaction'.
4. 'add_material': Use when the user wants to add clinical brochures, pamphlets, flyers, clinical trials, or slides to the materials shared list.
5. 'remove_material': Use when the user wants to remove or delete a specific brochure, paper, or clinical material from the shared materials list (e.g., "remove the brochure", "delete the clinical paper").
6. 'add_drug_sample': Use when the user wants to add drug/medication starter kits or product samples (e.g., "add 3 starter packs of OncoBoost", "add drug sample", "Add two sample packs").
7. 'remove_drug_sample': Use when the user wants to remove or delete a specific drug sample from the samples distributed list.
8. 'generate_summary': Use when the user specifically wants to generate a comprehensive summary of meeting outcomes or notes.
9. 'generate_followup': Use when the user wants to generate tailored next steps, follow-ups, or clinical proposals.
10. 'detect_sentiment': Use when the user wants to analyze, update, or set the sentiment of the doctor meeting.
11. 'validate_form': Use when the user asks if the form is complete, what is missing, or wants to validate the current record.
12. 'submit_interaction': Use when the user says "submit interaction", "save meeting", or "finalize the interaction log".
13. 'none': Use if the user is saying hello, asking an unrelated question, or if no specific tool applies.

Current Form State:
${JSON.stringify(state.formState, null, 2)}

User Message: "${userMessage}"

You must respond in JSON format matching this schema:
{
  "tool": "create_interaction" | "update_interaction" | "delete_interaction" | "add_material" | "remove_material" | "add_drug_sample" | "remove_drug_sample" | "generate_summary" | "generate_followup" | "detect_sentiment" | "validate_form" | "submit_interaction" | "none",
  "reason": "Brief reason why this tool was selected or 'unrelated_general_query'"
}
`;

  try {
    const text = await callLlm(prompt, true);
    const decision = cleanAndParseJson(text || '{"tool": "none", "reason": "failed to parse"}');
    return {
      ...state,
      nextNode: decision.tool
    };
  } catch (err: any) {
    console.error("Router Node Error:", err);
    return {
      ...state,
      nextNode: "none",
      error: err.message
    };
  }
}

// 3. Tool Node: Create Interaction
async function createInteractionTool(state: AgentState, userMessage: string): Promise<AgentState> {
  const prompt = `
You are the Create Interaction Tool for an AI-First CRM for Healthcare Professionals (HCPs).
Your primary task is to extract critical insights from the user's message and translate them into a highly professional, contextually rich, and detailed CRM form state.

Today's Date is strictly: ${CURRENT_DATE_STRING}. Resolve relative dates (like "today", "yesterday", "last Friday") relative to this date.

Guidelines for populating each field:
1. "hcpName": Ensure proper formatting with clinical titles and hospital names (e.g., "Dr. Smith (Apollo Hospital)", "Dr. Sarah Patel"). If a doctor name and hospital are mentioned, format as "Dr. [Name] ([Hospital Name])".
2. "interactionType": Standardize to one of: "Meeting", "Call", "Email", "Conference". Default to "Meeting" if unspecified.
3. "date": Format as "YYYY-MM-DD". Use "${CURRENT_DATE_STRING}" if the user says "today" or describes a current event.
4. "time": Provide a logical business hours time (e.g., "10:30", "14:15", "15:00") if unspecified.
5. "attendees": Elaborate a realistic list of attendees who were present. Include the primary HCP and the Pharmaceutical Sales Representative (e.g., "Dr. [HCP Name], Alex Mercer (MSL / Senior Representative)").
6. "topicsDiscussed": Write a detailed, professional, clinically-focused summary of topics, disease states, brand names, and generic medicines discussed (e.g., "Discussion on Prodo-X efficacy and diabetes treatment guidelines").
7. "materialsShared": Intelligently list realistic brochures/papers mentioned. E.g., if user mentions two brochures and a clinical paper, format as: ["Product Brochure", "Product Brochure", "Clinical Paper"] or list them cleanly.
8. "samplesDistributed": List product/drug samples with quantities and dosages cleanly. E.g., ["Prodo-X Sample Pack x 5", "OncoBoost Starter Kit x 2"].
9. "sentiment": Detect or infer the sentiment from the tone of the message. Must be exactly: "Positive", "Neutral", "Negative". (If user says Very Positive, Concerned, etc. map them cleanly).
10. "outcomes": Generate highly professional outcomes/milestones indicating clinical interest, prescription intent, or next scientific discussions.
11. "followUpActions": Generate concrete next steps and tasks.

Special Golden Standard Example:
User Message: "Today I met Dr. Smith at Apollo Hospital. We discussed Prodo-X for diabetic patients. He liked the efficacy results. I shared two brochures and one clinical paper. I also provided five Prodo-X sample packs. Schedule a follow-up in two weeks."
Expected Extraction:
{
  "hcpName": "Dr. Smith (Apollo Hospital)",
  "interactionType": "Meeting",
  "date": "${CURRENT_DATE_STRING}",
  "time": "14:00",
  "attendees": "Dr. Smith, Alex Mercer (Senior Representative)",
  "topicsDiscussed": "Prodo-X efficacy for diabetic patients and clinical trial outcomes.",
  "materialsShared": ["Product Brochure", "Product Brochure", "Clinical Paper"],
  "samplesDistributed": ["Prodo-X Sample Packs x 5"],
  "sentiment": "Positive",
  "outcomes": "HCP is highly interested in prescribing Prodo-X for diabetes cases.",
  "followUpActions": "Schedule a check-up follow-up session in two weeks."
}

User's actual input:
"${userMessage}"

You must respond in JSON format matching this schema exactly:
{
  "hcpName": "string",
  "interactionType": "Meeting" | "Call" | "Email" | "Conference",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "attendees": "string",
  "topicsDiscussed": "string",
  "materialsShared": ["string"],
  "samplesDistributed": ["string"],
  "sentiment": "Positive" | "Neutral" | "Negative",
  "outcomes": "string",
  "followUpActions": "string"
}
`;

  const log: ToolExecutionLog = {
    toolName: "create_interaction",
    status: "running",
    message: "Extracting HCP interaction details and populating CRM registry fields..."
  };

  try {
    const text = await callLlm(prompt, true);
    const extracted = cleanAndParseJson(text || '{}');
    
    // Auto-generate suggestions based on extracted values
    const aiSuggestedFollowUps = [
      `Schedule next session with ${extracted.hcpName || 'HCP'} in two weeks`,
      `Deliver clinical evidence dossier regarding ${extracted.topicsDiscussed ? extracted.topicsDiscussed.substring(0, 30) + '...' : 'topics discussed'}`,
      `Check inventory of clinical starter kits distributed`
    ];

    if (extracted.samplesDistributed) {
      extracted.samplesDistributed = sanitizeSamples(extracted.samplesDistributed);
    }

    const updatedForm: FormState = {
      ...state.formState,
      ...extracted,
      aiSuggestedFollowUps
    };

    log.status = "success";
    log.message = `Successfully logged interaction with ${extracted.hcpName || "the HCP"}. Populated clinical records.`;
    log.extractedData = extracted;

    return {
      ...state,
      formState: updatedForm,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder"
    };
  } catch (err: any) {
    log.status = "failed";
    log.message = "Failed to create interaction: " + err.message;
    return {
      ...state,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder",
      error: err.message
    };
  }
}

// 4. Tool Node: Update Interaction
async function updateInteractionTool(state: AgentState, userMessage: string): Promise<AgentState> {
  const prompt = `
You are the Update Interaction Tool. The user wants to correct, modify, or update specific fields in the existing form.

Current Form State:
${JSON.stringify(state.formState, null, 2)}

Today's Date is strictly: ${CURRENT_DATE_STRING}.

User edit request: "${userMessage}"

CRITICAL INSTRUCTIONS:
1. ONLY update the requested fields. Keep all other fields unchanged.
2. If the user wants to change doctor name, attendees, date, time, topics, sentiment, outcomes, or follow-ups, update them cleanly.
3. If the user mentions removing a specific item or resetting a field (e.g., "Delete follow-up" or "Remove the brochure" or "delete meeting date"), update that field to empty string, default, or empty array as requested.
4. If the user says "Add two sample packs" or similar, append or update the relevant list.
5. Output your response as a valid JSON object matching this schema exactly:
{
  "updatedFields": {
    "hcpName": "string (optional)",
    "interactionType": "Meeting" | "Call" | "Email" | "Conference" | "(optional)",
    "date": "YYYY-MM-DD (optional)",
    "time": "HH:MM (optional)",
    "attendees": "string (optional)",
    "topicsDiscussed": "string (optional)",
    "sentiment": "Positive" | "Neutral" | "Negative" | "(optional)",
    "outcomes": "string (optional)",
    "followUpActions": "string (optional)",
    "materialsShared": ["string"] (optional),
    "samplesDistributed": ["string"] (optional),
    "aiSuggestedFollowUps": ["string"] (optional)
  },
  "explanation": "Concise explanation of what was changed and why."
}
`;

  const log: ToolExecutionLog = {
    toolName: "update_interaction",
    status: "running",
    message: "Updating specified fields inside CRM registry..."
  };

  try {
    const text = await callLlm(prompt, true);
    const { updatedFields, explanation } = cleanAndParseJson(text || '{"updatedFields": {}}');
    
    if (updatedFields && updatedFields.samplesDistributed) {
      updatedFields.samplesDistributed = sanitizeSamples(updatedFields.samplesDistributed);
    }

    const updatedForm = {
      ...state.formState,
      ...updatedFields
    };

    log.status = "success";
    log.message = explanation || `Updated fields: ${Object.keys(updatedFields).join(", ")}.`;
    log.extractedData = updatedFields;

    return {
      ...state,
      formState: updatedForm,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder"
    };
  } catch (err: any) {
    log.status = "failed";
    log.message = "Failed to update fields: " + err.message;
    return {
      ...state,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder",
      error: err.message
    };
  }
}

// 5. Tool Node: Delete Interaction
async function deleteInteractionTool(state: AgentState, userMessage: string): Promise<AgentState> {
  const log: ToolExecutionLog = {
    toolName: "delete_interaction",
    status: "success",
    message: "Wiped and reset all HCP interaction form state completely."
  };

  return {
    ...state,
    formState: { ...initialFormState },
    toolLogs: [...state.toolLogs, log],
    nextNode: "agent_responder"
  };
}

// 6. Tool Node: Add Material
async function addMaterialTool(state: AgentState, userMessage: string): Promise<AgentState> {
  const prompt = `
The user wants to add one or more shared materials, brochures, or clinical documents.
Current Materials:
${JSON.stringify(state.formState.materialsShared, null, 2)}

User request: "${userMessage}"

Identify and list the materials to add. Respond in JSON format:
{
  "materialsToAdd": ["string"]
}
`;

  const log: ToolExecutionLog = {
    toolName: "add_material",
    status: "running",
    message: "Appending newly distributed pamphlets to registry..."
  };

  try {
    const text = await callLlm(prompt, true);
    const { materialsToAdd } = cleanAndParseJson(text || '{"materialsToAdd": []}');
    const combined = Array.from(new Set([...state.formState.materialsShared, ...materialsToAdd]));

    const updatedForm = {
      ...state.formState,
      materialsShared: combined
    };

    log.status = "success";
    log.message = `Added materials: ${materialsToAdd.join(", ")}`;
    log.extractedData = { added: materialsToAdd };

    return {
      ...state,
      formState: updatedForm,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder"
    };
  } catch (err: any) {
    log.status = "failed";
    log.message = "Failed to add materials: " + err.message;
    return {
      ...state,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder",
      error: err.message
    };
  }
}

// 7. Tool Node: Remove Material
async function removeMaterialTool(state: AgentState, userMessage: string): Promise<AgentState> {
  const prompt = `
The user wants to remove a specific clinical material or brochure.
Current Materials:
${JSON.stringify(state.formState.materialsShared, null, 2)}

User request: "${userMessage}"

Identify which material best matches the user's removal request. Respond in JSON:
{
  "materialToRemove": "exact string match to remove"
}
`;

  const log: ToolExecutionLog = {
    toolName: "remove_material",
    status: "running",
    message: "Locating and removing specified brochures..."
  };

  try {
    const text = await callLlm(prompt, true);
    const { materialToRemove } = cleanAndParseJson(text || '{"materialToRemove": ""}');
    
    const filtered = state.formState.materialsShared.filter(
      item => item.toLowerCase() !== materialToRemove.toLowerCase() && !item.toLowerCase().includes(materialToRemove.toLowerCase())
    );

    const updatedForm = {
      ...state.formState,
      materialsShared: filtered
    };

    log.status = "success";
    log.message = `Removed material: ${materialToRemove}`;
    log.extractedData = { removed: materialToRemove };

    return {
      ...state,
      formState: updatedForm,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder"
    };
  } catch (err: any) {
    log.status = "failed";
    log.message = "Failed to remove material: " + err.message;
    return {
      ...state,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder",
      error: err.message
    };
  }
}

// 8. Tool Node: Add Drug Sample
async function addDrugSampleTool(state: AgentState, userMessage: string): Promise<AgentState> {
  const prompt = `
The user wants to record drug or pharmaceutical starter pack samples distributed.
Current Samples:
${JSON.stringify(state.formState.samplesDistributed, null, 2)}

User request: "${userMessage}"

Identify drug samples and quantities to add. Respond in JSON format:
{
  "samplesToAdd": ["string"]
}
`;

  const log: ToolExecutionLog = {
    toolName: "add_drug_sample",
    status: "running",
    message: "Logging distributed clinical samples..."
  };

  try {
    const text = await callLlm(prompt, true);
    const { samplesToAdd } = cleanAndParseJson(text || '{"samplesToAdd": []}');
    const sanitizedToAdd = sanitizeSamples(samplesToAdd);
    const combined = Array.from(new Set([...sanitizeSamples(state.formState.samplesDistributed), ...sanitizedToAdd]));

    const updatedForm = {
      ...state.formState,
      samplesDistributed: combined
    };

    log.status = "success";
    log.message = `Recorded samples: ${samplesToAdd.join(", ")}`;
    log.extractedData = { added: samplesToAdd };

    return {
      ...state,
      formState: updatedForm,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder"
    };
  } catch (err: any) {
    log.status = "failed";
    log.message = "Failed to add samples: " + err.message;
    return {
      ...state,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder",
      error: err.message
    };
  }
}

// 9. Tool Node: Remove Drug Sample
async function removeDrugSampleTool(state: AgentState, userMessage: string): Promise<AgentState> {
  const prompt = `
The user wants to remove a specific clinical sample.
Current Samples:
${JSON.stringify(state.formState.samplesDistributed, null, 2)}

User request: "${userMessage}"

Identify which sample best matches the user's removal request. Respond in JSON:
{
  "sampleToRemove": "exact string match to remove"
}
`;

  const log: ToolExecutionLog = {
    toolName: "remove_drug_sample",
    status: "running",
    message: "Locating and removing specified clinical samples..."
  };

  try {
    const text = await callLlm(prompt, true);
    const { sampleToRemove } = cleanAndParseJson(text || '{"sampleToRemove": ""}');
    
    const filtered = state.formState.samplesDistributed.filter(
      item => item.toLowerCase() !== sampleToRemove.toLowerCase() && !item.toLowerCase().includes(sampleToRemove.toLowerCase())
    );

    const updatedForm = {
      ...state.formState,
      samplesDistributed: filtered
    };

    log.status = "success";
    log.message = `Removed sample: ${sampleToRemove}`;
    log.extractedData = { removed: sampleToRemove };

    return {
      ...state,
      formState: updatedForm,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder"
    };
  } catch (err: any) {
    log.status = "failed";
    log.message = "Failed to remove sample: " + err.message;
    return {
      ...state,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder",
      error: err.message
    };
  }
}

// 10. Tool Node: Generate Summary
async function generateSummaryTool(state: AgentState, userMessage: string): Promise<AgentState> {
  const prompt = `
Based on the current form details, generate a highly professional and complete meeting summary outcome.
HCP: ${state.formState.hcpName}
Topics: ${state.formState.topicsDiscussed}
Sentiment: ${state.formState.sentiment}

User instruction: "${userMessage}"

Generate a coherent clinical outcome summary. Respond in JSON format:
{
  "outcomes": "string"
}
`;

  const log: ToolExecutionLog = {
    toolName: "generate_summary",
    status: "running",
    message: "Analyzing meeting logs to synthesize clinical summary outcome..."
  };

  try {
    const text = await callLlm(prompt, true);
    const { outcomes } = cleanAndParseJson(text || '{}');

    const updatedForm = {
      ...state.formState,
      outcomes
    };

    log.status = "success";
    log.message = "Generated interaction outcomes summary successfully.";
    log.extractedData = { outcomes };

    return {
      ...state,
      formState: updatedForm,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder"
    };
  } catch (err: any) {
    log.status = "failed";
    log.message = "Failed to generate outcomes summary: " + err.message;
    return {
      ...state,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder",
      error: err.message
    };
  }
}

// 11. Tool Node: Generate Follow-up
async function generateFollowupTool(state: AgentState, userMessage: string): Promise<AgentState> {
  const prompt = `
Generate custom clinical follow-up proposals.
HCP: ${state.formState.hcpName}
Topics Discussed: ${state.formState.topicsDiscussed}
Current Sentiment: ${state.formState.sentiment}

User instruction: "${userMessage}"

Generate:
1. "followUpActions": A paragraph describing the immediate next steps professionally.
2. "suggestions": Exactly 3 highly actionable, discrete follow-up items.

Respond in JSON format:
{
  "followUpActions": "string",
  "suggestions": ["string", "string", "string"]
}
`;

  const log: ToolExecutionLog = {
    toolName: "generate_followup",
    status: "running",
    message: "Proposing strategic follow-up timeline..."
  };

  try {
    const text = await callLlm(prompt, true);
    const { followUpActions, suggestions } = cleanAndParseJson(text || '{"suggestions": []}');

    const updatedForm = {
      ...state.formState,
      followUpActions,
      aiSuggestedFollowUps: suggestions
    };

    log.status = "success";
    log.message = "Synthesized and registered 3 scientific follow-up plans.";
    log.extractedData = { followUpActions, suggestions };

    return {
      ...state,
      formState: updatedForm,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder"
    };
  } catch (err: any) {
    log.status = "failed";
    log.message = "Failed to generate follow-ups: " + err.message;
    return {
      ...state,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder",
      error: err.message
    };
  }
}

// 12. Tool Node: Detect Sentiment
async function detectSentimentTool(state: AgentState, userMessage: string): Promise<AgentState> {
  const prompt = `
Analyze the conversation tone to classify doctor sentiment.
Classifications: "Positive", "Neutral", "Negative", "Very Positive", "Concerned", "Needs Follow-up"

User Message: "${userMessage}"
Current Topics: "${state.formState.topicsDiscussed}"

Respond in JSON:
{
  "internalReasoning": "Brief explanation of tone analysis",
  "classification": "Positive" | "Neutral" | "Negative" | "Very Positive" | "Concerned" | "Needs Follow-up"
}
`;

  const log: ToolExecutionLog = {
    toolName: "detect_sentiment",
    status: "running",
    message: "Evaluating HCP reception tone and sentiment metrics..."
  };

  try {
    const text = await callLlm(prompt, true);
    const { internalReasoning, classification } = cleanAndParseJson(text || '{}');

    // Map expanded sentiments to CRM Form supported fields: Positive, Neutral, Negative
    let mappedSentiment: 'Positive' | 'Neutral' | 'Negative' = 'Neutral';
    if (classification === 'Positive' || classification === 'Very Positive') {
      mappedSentiment = 'Positive';
    } else if (classification === 'Negative' || classification === 'Concerned') {
      mappedSentiment = 'Negative';
    } else {
      mappedSentiment = 'Neutral';
    }

    const updatedForm = {
      ...state.formState,
      sentiment: mappedSentiment
    };

    log.status = "success";
    log.message = `Detected sentiment as ${classification} (${internalReasoning}). Mapped to ${mappedSentiment}.`;
    log.extractedData = { classification, mappedSentiment, reasoning: internalReasoning };

    return {
      ...state,
      formState: updatedForm,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder"
    };
  } catch (err: any) {
    log.status = "failed";
    log.message = "Failed to detect sentiment: " + err.message;
    return {
      ...state,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder",
      error: err.message
    };
  }
}

// 13. Tool Node: Validate Form
async function validateFormTool(state: AgentState, userMessage: string): Promise<AgentState> {
  const missing = validateFormFields(state.formState);
  const log: ToolExecutionLog = {
    toolName: "validate_form",
    status: missing.length === 0 ? "success" : "failed",
    message: missing.length === 0
      ? "Validation Passed: All required fields are present and valid."
      : `Validation Failed: Missing required fields: ${missing.join(", ")}.`
  };

  return {
    ...state,
    toolLogs: [...state.toolLogs, log],
    nextNode: "agent_responder"
  };
}

// 14. Tool Node: Submit Interaction
async function submitInteractionTool(state: AgentState, userMessage: string): Promise<AgentState> {
  const missing = validateFormFields(state.formState);
  
  if (missing.length > 0) {
    const log: ToolExecutionLog = {
      toolName: "submit_interaction",
      status: "failed",
      message: `Submission blocked. Please satisfy the missing required fields first: ${missing.join(", ")}.`
    };
    return {
      ...state,
      toolLogs: [...state.toolLogs, log],
      nextNode: "agent_responder"
    };
  }

  const log: ToolExecutionLog = {
    toolName: "submit_interaction",
    status: "running",
    message: "Saving HCP interaction details permanently to MySQL database..."
  };

  try {
    await saveInteraction(state.formState);
    log.status = "success";
    log.message = `Successfully submitted the HCP interaction log for ${state.formState.hcpName} on ${state.formState.date} to the MySQL database.`;
  } catch (err: any) {
    console.error("[submitInteractionTool] MySQL Save Error:", err);
    log.status = "failed";
    log.message = `Database Error: Failed to save interaction log to MySQL: ${err.message}.`;
  }

  return {
    ...state,
    toolLogs: [...state.toolLogs, log],
    nextNode: "agent_responder"
  };
}

// 15. General Node: Chat Node (No Tool Invocation or Unrelated queries)
async function chatNode(state: AgentState, userMessage: string): Promise<AgentState> {
  // Hardcoded check for common non-CRM topics to make it absolute bulletproof
  const lowercaseMsg = userMessage.toLowerCase();
  const nonCrmKeywords = [
    "movie", "sports", "weather", "coding", "code", "programming", "mathematics", "math", 
    "history", "game", "song", "joke", "capital of", "who is", "what is the weight of",
    "tell me a story", "write a poem", "calculator", "convert", "translate", "how do I"
  ];
  
  const isClearlyUnrelated = nonCrmKeywords.some(keyword => {
    // Ensure we don't accidentally refuse legitimate medical terms or CRM words
    if (keyword === "code" && (lowercaseMsg.includes("hcp") || lowercaseMsg.includes("meeting") || lowercaseMsg.includes("crm"))) return false;
    return lowercaseMsg.includes(keyword);
  });

  if (isClearlyUnrelated) {
    const refusalMsg: Message = {
      id: 'agent-refusal-' + Date.now(),
      sender: 'assistant',
      text: "I am a CRM Assistant designed only for HCP interaction management. Please ask me about meeting logs, HCP interactions, clinical samples, brochures, follow-ups, or CRM-related tasks.",
      timestamp: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      toolExecutionLogs: []
    };
    return {
      ...state,
      messages: [...state.messages, refusalMsg],
      nextNode: "end"
    };
  }

  const prompt = `
You are the AI-First CRM Assistant.

CORE RULE:
You are NOT a general AI assistant. Do not answer questions unrelated to CRM interaction logging.
If the user's request is unrelated to pharmaceutical relationship management, doctor visits, clinical starter kits, pamphlets, follow-up actions, medical sales, or clinical product discussions (e.g. general knowledge, programming, history, sports, mathematics, movies, weather), you MUST reply EXACTLY with this refusal:
"I am a CRM Assistant designed only for HCP interaction management. Please ask me about meeting logs, HCP interactions, clinical samples, brochures, follow-ups, or CRM-related tasks."

Otherwise, if the request is CRM-related (e.g. greeting, asking how to use the app, or talking about clinical tasks), provide a highly professional, brief response explaining how the representative can command you to log meetings, update fields, validate forms, or submit records.

User message: "${userMessage}"
Current Form State:
${JSON.stringify(state.formState, null, 2)}
`;

  try {
    const text = await callLlm(prompt);

    const responseMsg: Message = {
      id: 'agent-' + Date.now(),
      sender: 'assistant',
      text: text || "I am here to assist with your HCP interaction details.",
      timestamp: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      toolExecutionLogs: state.toolLogs
    };

    return {
      ...state,
      messages: [...state.messages, responseMsg],
      nextNode: "end"
    };
  } catch (err: any) {
    return {
      ...state,
      nextNode: "end",
      error: err.message
    };
  }
}

// 16. Agent Responder Node
async function agentResponderNode(state: AgentState, userMessage: string): Promise<AgentState> {
  const lastLog = state.toolLogs[state.toolLogs.length - 1];
  const logsSummary = state.toolLogs.map(l => `- [Tool: ${l.toolName}] status: ${l.status}. ${l.message}`).join("\n");
  
  const prompt = `
You are the AI-First CRM Assistant. Formulate a brief, professional, workflow-focused summary explaining the action executed and the resulting form details.

Tools executed:
${logsSummary}

Current Form Data:
HCP Name: ${state.formState.hcpName}
Interaction Type: ${state.formState.interactionType}
Date: ${state.formState.date}
Sentiment: ${state.formState.sentiment}
Materials Shared: ${state.formState.materialsShared.join(", ")}
Samples Distributed: ${state.formState.samplesDistributed.join(", ")}

Write a professional, concise bulleted markdown message explaining the updates. Do not repeat long tool names. Keep it brief and focused on helping the Science Field Representative log and validate this HCP meeting.
If a validation or submission failed, highlight what is missing politely.
`;

  try {
    const text = await callLlm(prompt);

    const responseMsg: Message = {
      id: 'agent-' + Date.now(),
      sender: 'assistant',
      text: text || "I have updated the interaction details according to your instructions.",
      timestamp: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      toolExecutionLogs: state.toolLogs
    };

    return {
      ...state,
      messages: [...state.messages, responseMsg],
      nextNode: "end"
    };
  } catch (err: any) {
    const responseMsg: Message = {
      id: 'agent-' + Date.now(),
      sender: 'assistant',
      text: "Form updated successfully. Let me know if you want to make any corrections.",
      timestamp: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      toolExecutionLogs: state.toolLogs
    };
    return {
      ...state,
      messages: [...state.messages, responseMsg],
      nextNode: "end"
    };
  }
}

// 17. Core Orchestrator: Runs the State Graph
export async function runAgentStateGraph(
  currentForm: FormState,
  chatHistory: Message[],
  newUserMessage: string
): Promise<AgentState> {
  // Initialize Graph State
  let state: AgentState = {
    messages: chatHistory,
    formState: currentForm,
    toolLogs: [],
    nextNode: "router"
  };

  // Add the User Message to history first
  const userMsgObj: Message = {
    id: 'user-' + Date.now(),
    sender: 'user',
    text: newUserMessage,
    timestamp: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  };
  state.messages = [...state.messages, userMsgObj];

  console.log(`[LangGraph Orchestrator] Starting session. User Message: "${newUserMessage}"`);

  // Node execution loop (Max 5 transitions to prevent infinite loops)
  let iterations = 0;
  while (state.nextNode !== "end" && iterations < 5) {
    console.log(`[LangGraph Node] Running node: ${state.nextNode}`);
    const currentNode = state.nextNode;

    if (currentNode === "router") {
      state = await routerNode(state, newUserMessage);
    } else if (currentNode === "create_interaction") {
      state = await createInteractionTool(state, newUserMessage);
    } else if (currentNode === "update_interaction") {
      state = await updateInteractionTool(state, newUserMessage);
    } else if (currentNode === "delete_interaction") {
      state = await deleteInteractionTool(state, newUserMessage);
    } else if (currentNode === "add_material") {
      state = await addMaterialTool(state, newUserMessage);
    } else if (currentNode === "remove_material") {
      state = await removeMaterialTool(state, newUserMessage);
    } else if (currentNode === "add_drug_sample") {
      state = await addDrugSampleTool(state, newUserMessage);
    } else if (currentNode === "remove_drug_sample") {
      state = await removeDrugSampleTool(state, newUserMessage);
    } else if (currentNode === "generate_summary") {
      state = await generateSummaryTool(state, newUserMessage);
    } else if (currentNode === "generate_followup") {
      state = await generateFollowupTool(state, newUserMessage);
    } else if (currentNode === "detect_sentiment") {
      state = await detectSentimentTool(state, newUserMessage);
    } else if (currentNode === "validate_form") {
      state = await validateFormTool(state, newUserMessage);
    } else if (currentNode === "submit_interaction") {
      state = await submitInteractionTool(state, newUserMessage);
    } else if (currentNode === "agent_responder") {
      state = await agentResponderNode(state, newUserMessage);
    } else if (currentNode === "none") {
      state = await chatNode(state, newUserMessage);
    } else {
      state.nextNode = "end";
    }

    iterations++;
  }

  console.log("[LangGraph Orchestrator] Completed session successfully.");
  return state;
}
