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

Sections required:
- **Core Problem & Gap**: What is missing in current literature?
- **Technical Methodology**: The specific approach/math/architecture used.
- **Primary Findings**: The data-driven results.
- **Research Implications**: Future work or industry impact.

Return JSON format: { "summary": "markdown string" }`,

  ANALYZE_PAPER_HIGHLIGHTS: `Act as an expert academic researcher. Perform a thorough "Deep Reading" of the PDF.

**CONTEXT:**
Existing Knowledge Tags: {{globalTags}}

**TASK:**
1. Identify the logical sections (Introduction, Methods, Results, Discussion).
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

const getClient = () => {
  if (!process.env.API_KEY) {
    throw new Error("API Key not found");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

async function generateText(prompt: string, settings?: AppSettings, jsonMode = false): Promise<string> {
  const ai = getClient();
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

export const analyzePaperSummary = async (fileData: ArrayBuffer, settings?: AppSettings): Promise<string> => {
  const ai = getClient();
  const base64Data = arrayBufferToBase64(fileData);

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: {
      parts: [
        { inlineData: { mimeType: 'application/pdf', data: base64Data } },
        { text: DEFAULT_PROMPTS.ANALYZE_PAPER_SUMMARY }
      ]
    },
    config: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: {
         type: Type.OBJECT,
         properties: { summary: { type: Type.STRING } }
      }
    }
  });

  try {
    const json = JSON.parse(response.text?.trim() || "{}");
    return json.summary || "";
  } catch (e) {
    console.error("Summary Parse Error", e);
    return response.text || "";
  }
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
  const ai = getClient();
  const base64Data = arrayBufferToBase64(fileData);

  let promptTemplate = DEFAULT_PROMPTS.ANALYZE_PAPER_HIGHLIGHTS;
  if (settings?.promptAnalyzePaper) {
      promptTemplate = settings.promptAnalyzePaper;
  }
  const promptText = promptTemplate.replace('{{globalTags}}', JSON.stringify(globalTags));

  // We intentionally do NOT use JSON schema here to avoid "Unterminated string" syntax errors.
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
};