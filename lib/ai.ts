import { GoogleGenAI, Type } from "@google/genai";
import { AppSettings } from "../types";

const MODEL_NAME = 'gemini-3-flash-preview';

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

Rules for Tags:
1. Prioritize using tags from "Existing Knowledge Tags" if they are relevant.
2. Use identical spelling and casing as provided in the list.
3. Only create new tags if the paper covers a concept not adequately represented in the existing list.
4. Tags should be concise (1-3 words) and technical.

Return JSON format: { "summary": "markdown string", "tags": ["tag1", "tag2"] }`,

  ANALYZE_PAPER_HIGHLIGHTS: `Act as an expert academic researcher. Perform a thorough "Deep Reading" of the PDF.

**CONTEXT:**
Existing Knowledge Tags: {{globalTags}}

**TASK:**
1. Identify the sections defined in the paper.
2. For EACH section, extract exactly 3-4 critical Anchor Points.
   - Do NOT extract more than 4 per section.
   - Do NOT extract fewer than 3 per section (unless the section is very short).
3. Total highlights should be between 12 and 20.
4. Double check the number of critical anchor points satisfy the requirements
**OUTPUT FORMAT:**
Do NOT output JSON. Use the following strict text block format for each highlight:

[[HIGHLIGHT]]
START_SNIPPET: {Exact first 8-15 words of the sentence}
END_SNIPPET: {Exact last 8-15 words of the sentence}
PAGE: {Page number integer}
TOPIC: {Short Category, Max 3 words. PREFER using a relevant tag from "Existing Knowledge Tags" if possible.}
EXPLANATION: {Concise interpretation, max 2 sentences}
IMPORTANCE: {Critical | High | Standard}
[[END]]

**RULES:**
- TOPIC must be a single concept (e.g. "Loss Function"). NO SENTENCES.
- SNIPPETS must be exact string matches from the PDF. 
- COPY TEXT EXACTLY. Do NOT correct typos, do NOT expand abbreviations, do NOT remove citation numbers (e.g. [12]).
- Do NOT include quotation marks around the snippet.
- SNIPPETS must be at least 8 words long to ensure uniqueness.
- Do NOT use "..." or ellipsis inside the snippets themselves.
`
};

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
 * Supports rotation if multiple keys are available.
 */
const getClient = async (forceNext = false): Promise<GoogleGenAI> => {
  // @ts-ignore - Check if window.aistudio exists before calling
  const aiStudio = typeof window !== 'undefined' ? (window as any).aistudio : null;
  
  if (aiStudio && typeof aiStudio.hasSelectedApiKey === 'function') {
    const hasKey = await aiStudio.hasSelectedApiKey();
    if (!hasKey && typeof aiStudio.openSelectKey === 'function') {
      await aiStudio.openSelectKey();
    }
  }
  
  const keys = getAvailableKeys();
  if (keys.length === 0) {
    throw new Error("API Key selection is required to use AI features. Please check your .env.local file.");
  }
  
  if (forceNext) {
    currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  }
  
  const apiKey = keys[currentKeyIndex];
  return new GoogleGenAI({ apiKey });
};

/**
 * Wrapper to handle errors and implement key rotation/retry logic.
 * If an error occur, tries with other API keys if provided in process.env.API_KEY.
 */
async function callAi<T>(operation: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
  const keys = getAvailableKeys();
  const maxRetries = Math.max(1, keys.length);
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Create client with current (or next if retrying) key
      const ai = await getClient(attempt > 0);
      return await operation(ai);
    } catch (error: any) {
      lastError = error;
      const isNotFoundError = error.message?.includes("Requested entity was not found.");
      const isRateLimit = error.message?.includes("429") || error.message?.toLowerCase().includes("rate limit");
      
      console.warn(`AI attempt ${attempt + 1} failed with key index ${currentKeyIndex}:`, error.message);

      // If we have more keys in the environment to try, rotate and continue the loop
      if (attempt < maxRetries - 1 && (isNotFoundError || isRateLimit)) {
        continue;
      }

      // If it was a "not found" error and we've exhausted env keys, try prompting user if available
      if (isNotFoundError) {
        // @ts-ignore
        const aiStudio = typeof window !== 'undefined' ? (window as any).aistudio : null;
        if (aiStudio && typeof aiStudio.openSelectKey === 'function') {
           await aiStudio.openSelectKey();
           // One final try after user interaction
           const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
           return await operation(ai);
        }
      }
      
      break;
    }
  }
  
  throw lastError;
}

async function generateText(prompt: string, settings?: AppSettings, jsonMode = false): Promise<string> {
  return callAi(async (ai) => {
    const config: any = {
      temperature: 0.7,
    };
    if (jsonMode) {
      config.responseMimeType = "application/json";
    }
    
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
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export const suggestTagsAI = async (text: string, globalTags: string[], currentTags: string[], settings?: AppSettings): Promise<string[]> => {
  const template = settings?.promptSuggestTags || DEFAULT_PROMPTS.SUGGEST_TAGS;
  const prompt = template
    .replace('{{globalTags}}', JSON.stringify(globalTags))
    .replace('{{currentTags}}', JSON.stringify(currentTags))
    .replace('{{text}}', text);
  
  try {
    const textResult = await generateText(prompt, settings, true);
    return JSON.parse(textResult.replace(/```json/g, '').replace(/```/g, '').trim());
  } catch (e) {
    console.error("AI Tagging Error", e);
    return [];
  }
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
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64Data } },
          { text: promptText }
        ]
      },
      config: {
        temperature: 0.1,
        maxOutputTokens: 8192,
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

    try {
      const json = JSON.parse(response.text?.trim() || "{}");
      return {
        summary: json.summary || "",
        tags: Array.isArray(json.tags) ? json.tags : []
      };
    } catch (e) {
      console.error("Summary Parse Error", e);
      return { summary: response.text || "", tags: [] };
    }
  });
};

// Robust Text Block Parser
function parseHighlightBlocks(text: string): any[] {
  const highlights: any[] = [];
  const blocks = text.split('[[HIGHLIGHT]]');

  for (const block of blocks) {
    if (!block.includes('[[END]]')) continue;

    const extract = (key: string) => {
      const match = block.match(new RegExp(`${key}:\\s*(.*?)(?=\\n|$)`, 'i'));
      return match ? match[1].trim() : '';
    };

    let anchorStart = extract('START_SNIPPET');
    let anchorEnd = extract('END_SNIPPET');
    const pageNumberStr = extract('PAGE');
    const topic = extract('TOPIC');
    const explanation = extract('EXPLANATION');
    const importance = extract('IMPORTANCE');

    // Clean up quotes if the model added them despite instructions
    anchorStart = anchorStart.replace(/^["']|["']$/g, '');
    anchorEnd = anchorEnd.replace(/^["']|["']$/g, '');

    if (anchorStart && anchorEnd) {
      highlights.push({
        anchorStart,
        anchorEnd,
        pageNumber: parseInt(pageNumberStr) || 1,
        topic: topic.replace(/[\[\]]/g, ''), 
        explanation,
        importance
      });
    }
  }
  return highlights;
}

export const analyzePaperHighlights = async (fileData: ArrayBuffer, globalTags: string[], settings?: AppSettings): Promise<any[]> => {
  return callAi(async (ai) => {
    const base64Data = arrayBufferToBase64(fileData);

    let promptTemplate = DEFAULT_PROMPTS.ANALYZE_PAPER_HIGHLIGHTS;
    if (settings?.promptAnalyzePaper) {
        promptTemplate = settings.promptAnalyzePaper;
    }
    const promptText = promptTemplate.replace('{{globalTags}}', JSON.stringify(globalTags));

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64Data } },
          { text: promptText }
        ]
      },
      config: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      }
    });

    try {
      const text = response.text || "";
      return parseHighlightBlocks(text);
    } catch (e) {
      console.error("Highlights Parse Error", e);
      return [];
    }
  });
};