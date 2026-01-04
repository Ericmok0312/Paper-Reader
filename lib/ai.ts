import { GoogleGenAI, Type } from "@google/genai";
import { AppSettings } from "../types";

const MODEL_NAME = 'gemini-3-flash-preview';

/**
 * Parses the API_KEY environment variable. 
 * Supports a single key or a comma-separated list of keys for rotation.
 */
const getAvailableKeys = (): string[] => {
  const raw = process.env.API_KEY || "";
  return raw.split(",").map(k => k.trim()).filter(Boolean);
};

let currentKeyIndex = 0;

/**
 * Ensures a valid API key is selected and returns a fresh GoogleGenAI instance.
 * Supports rotation if multiple keys are available in .env.local.
 */
const getClient = async (forceNext = false): Promise<GoogleGenAI> => {
  const keys = getAvailableKeys();
  
  // If we have keys in env, we use them first
  if (keys.length > 0) {
    if (forceNext) {
      currentKeyIndex = (currentKeyIndex + 1) % keys.length;
    }
    const apiKey = keys[currentKeyIndex];
    return new GoogleGenAI({ apiKey });
  }

  // Fallback to AI Studio Bridge if no environment keys are provided
  // @ts-ignore
  const aiStudio = typeof window !== 'undefined' ? (window as any).aistudio : null;
  if (aiStudio && typeof aiStudio.hasSelectedApiKey === 'function') {
    const hasKey = await aiStudio.hasSelectedApiKey();
    if (!hasKey && typeof aiStudio.openSelectKey === 'function') {
      await aiStudio.openSelectKey();
    }
  }
  
  // Final check: if no keys anywhere, throw descriptive error
  const finalKey = process.env.API_KEY || "";
  if (!finalKey) {
    throw new Error("API Key is missing. Please provide it in .env.local or select one via the UI.");
  }
  
  return new GoogleGenAI({ apiKey: finalKey.split(',')[0].trim() });
};

/**
 * Wrapper to handle errors and implement key rotation/retry logic.
 */
async function callAi<T>(operation: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
  const keys = getAvailableKeys();
  const maxRetries = Math.max(1, keys.length);
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // attempt > 0 means we are retrying, so force rotation to the next key
      const ai = await getClient(attempt > 0);
      return await operation(ai);
    } catch (error: any) {
      lastError = error;
      const isNotFoundError = error.message?.includes("Requested entity was not found.");
      const isRateLimit = error.message?.includes("429") || error.message?.toLowerCase().includes("rate limit");
      
      console.warn(`AI attempt ${attempt + 1} failed:`, error.message);

      // If we have more keys in the environment to try, rotate and continue the loop
      if (attempt < maxRetries - 1 && (isNotFoundError || isRateLimit)) {
        console.info(`Switching to next API key (Index: ${(currentKeyIndex + 1) % keys.length})...`);
        continue;
      }

      // If it was a "not found" error and we've exhausted env keys, try prompting user if bridge exists
      if (isNotFoundError) {
        // @ts-ignore
        const aiStudio = typeof window !== 'undefined' ? (window as any).aistudio : null;
        if (aiStudio && typeof aiStudio.openSelectKey === 'function') {
           await aiStudio.openSelectKey();
           const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
           return await operation(ai);
        }
      }
      
      break;
    }
  }
  
  throw lastError;
}

const DEFAULT_PROMPTS = {
  SUGGEST_TAGS: `Analyze the following academic note and suggest up to 5 relevant tags for a knowledge graph.
    
Global Knowledge Tags: {{globalTags}}
Already Added Tags: {{currentTags}}
Note Content: "{{text}}"

Return a JSON array of strings. Example: ["tag1", "tag2"].`,

  REORGANIZE_NOTE: `Rewrite and reorganize the following academic note for clarity, flow, and professionalism. 
Fix any grammar issues. Keep the tone scholarly.

Note: "{{text}}"`,

  ORGANIZE_SUMMARY: `Reorganize this academic summary with standard headings: "{{text}}"`,

  ANALYZE_PAPER_SUMMARY: `Act as an expert academic researcher. Deeply read the provided PDF and generate a structured Executive Summary in Markdown.

**TASK 1: SUMMARY**
Sections required:
- **Core Problem & Gap**: What is missing in current literature?
- **Technical Methodology**: The specific approach/math/architecture used.
- **Primary Findings**: The data-driven results.
- **Research Implications**: Future work or industry impact.

**TASK 2: TAGGING**
Suggest up to 5 high-level relevant tags for this entire paper.
Existing Knowledge Tags: {{globalTags}}

Return JSON format: { "summary": "markdown string", "tags": ["tag1", "tag2"] }`,

  ANALYZE_PAPER_HIGHLIGHTS: `Act as an expert academic researcher. Extract exactly 3-4 critical Anchor Points per section.
Total highlights should be between 12 and 20.

**OUTPUT FORMAT:**
Do NOT output JSON. Use the following strict text block format:

[[HIGHLIGHT]]
START_SNIPPET: {Exact first 8-15 words}
END_SNIPPET: {Exact last 8-15 words}
PAGE: {Page number}
TOPIC: {Short Category}
EXPLANATION: {Concise interpretation}
IMPORTANCE: {Critical | High | Standard}
[[END]]
`
};

async function generateText(prompt: string, settings?: AppSettings, jsonMode = false): Promise<string> {
  return callAi(async (ai) => {
    const config: any = { temperature: 0.7 };
    if (jsonMode) config.responseMimeType = "application/json";
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config
    });
    return response.text || "";
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export const suggestTagsAI = async (text: string, globalTags: string[], currentTags: string[], settings?: AppSettings): Promise<string[]> => {
  const template = settings?.promptSuggestTags || DEFAULT_PROMPTS.SUGGEST_TAGS;
  const prompt = template.replace('{{globalTags}}', JSON.stringify(globalTags)).replace('{{currentTags}}', JSON.stringify(currentTags)).replace('{{text}}', text);
  try {
    const textResult = await generateText(prompt, settings, true);
    return JSON.parse(textResult.replace(/```json/g, '').replace(/```/g, '').trim());
  } catch (e) { return []; }
};

export const reorganizeNoteAI = async (text: string, settings?: AppSettings): Promise<string> => {
  const template = settings?.promptReorganizeNote || DEFAULT_PROMPTS.REORGANIZE_NOTE;
  return generateText(template.replace('{{text}}', text), settings);
};

export const organizeSummaryAI = async (text: string, settings?: AppSettings): Promise<string> => {
  const template = settings?.promptOrganizeSummary || DEFAULT_PROMPTS.ORGANIZE_SUMMARY;
  return generateText(template.replace('{{text}}', text), settings);
};

export const analyzePaperSummary = async (fileData: ArrayBuffer, globalTags: string[], settings?: AppSettings): Promise<{ summary: string, tags: string[] }> => {
  return callAi(async (ai) => {
    const base64Data = arrayBufferToBase64(fileData);
    const promptText = DEFAULT_PROMPTS.ANALYZE_PAPER_SUMMARY.replace('{{globalTags}}', JSON.stringify(globalTags));
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [{ inlineData: { mimeType: 'application/pdf', data: base64Data } }, { text: promptText }]
      },
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
           type: Type.OBJECT,
           properties: { 
             summary: { type: Type.STRING },
             tags: { type: Type.ARRAY, items: { type: Type.STRING } }
           },
           required: ["summary", "tags"]
        }
      }
    });
    return JSON.parse(response.text?.trim() || "{}");
  });
};

export const analyzePaperHighlights = async (fileData: ArrayBuffer, globalTags: string[], settings?: AppSettings): Promise<any[]> => {
  return callAi(async (ai) => {
    const base64Data = arrayBufferToBase64(fileData);
    const promptText = (settings?.promptAnalyzePaper || DEFAULT_PROMPTS.ANALYZE_PAPER_HIGHLIGHTS).replace('{{globalTags}}', JSON.stringify(globalTags));
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [{ inlineData: { mimeType: 'application/pdf', data: base64Data } }, { text: promptText }]
      },
      config: { temperature: 0.1 }
    });
    return parseHighlightBlocks(response.text || "");
  });
};

function parseHighlightBlocks(text: string): any[] {
  const highlights: any[] = [];
  const blocks = text.split('[[HIGHLIGHT]]');
  for (const block of blocks) {
    if (!block.includes('[[END]]')) continue;
    const extract = (key: string) => {
      const match = block.match(new RegExp(`${key}:\\s*(.*?)(?=\\n|$)`, 'i'));
      return match ? match[1].trim() : '';
    };
    highlights.push({
      anchorStart: extract('START_SNIPPET').replace(/^["']|["']$/g, ''),
      anchorEnd: extract('END_SNIPPET').replace(/^["']|["']$/g, ''),
      pageNumber: parseInt(extract('PAGE')) || 1,
      topic: extract('TOPIC').replace(/[\[\]]/g, ''), 
      explanation: extract('EXPLANATION'),
      importance: extract('IMPORTANCE')
    });
  }
  return highlights;
}