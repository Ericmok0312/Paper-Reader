import { GoogleGenAI, Type } from "@google/genai";
import { AppSettings } from "../types";

const GEMINI_MODEL = 'gemini-3-flash-preview';

const DEFAULT_PROMPTS = {
  SUGGEST_TAGS: `Analyze the following academic note and suggest up to 5 relevant tags for a knowledge graph.
    
Global Knowledge Tags: {{globalTags}}
Already Added Tags: {{currentTags}}
Note Content: "{{text}}"

Return a JSON array of strings. Example: ["tag1", "tag2"].`,

  REORGANIZE_NOTE: `Rewrite and reorganize the following academic note for clarity, flow, and professionalism. 
Fix any grammar issues. Keep the tone scholarly.

Note: "{{text}}"`,

  ORGANIZE_SUMMARY: `Reorganize this academic summary with standard headings: "{{text}}"`
};

const getClient = (settings?: AppSettings) => {
  if (settings?.apiBaseUrl) {
    return { type: 'openai', baseUrl: settings.apiBaseUrl, model: settings.aiModel || 'gpt-3.5-turbo' };
  }
  if (!process.env.API_KEY) {
    throw new Error("API Key not found");
  }
  return { type: 'gemini', client: new GoogleGenAI({ apiKey: process.env.API_KEY }) };
};

// Generic completion handler
async function generateText(prompt: string, settings?: AppSettings, jsonMode = false): Promise<string> {
  const client = getClient(settings);

  if (client.type === 'openai') {
    try {
      const response = await fetch(`${client.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 'Authorization': `Bearer ...` // We assume proxy handles auth or local doesn't need it as per strict no-ui-key rule
        },
        body: JSON.stringify({
          model: client.model,
          messages: [{ role: 'user', content: prompt }],
          response_format: jsonMode ? { type: "json_object" } : undefined
        })
      });
      const data = await response.json();
      return data.choices?.[0]?.message?.content || "";
    } catch (e) {
      console.error("OpenAI API Error", e);
      return "";
    }
  } else {
    // Gemini
    const gemini = (client as any).client as GoogleGenAI;
    const config: any = {};
    if (jsonMode) {
      config.responseMimeType = "application/json";
    }
    const response = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config
    });
    return response.text || "";
  }
}

export const suggestTagsAI = async (text: string, globalTags: string[], currentTags: string[], settings?: AppSettings): Promise<string[]> => {
  const template = settings?.promptSuggestTags || DEFAULT_PROMPTS.SUGGEST_TAGS;
  
  const prompt = template
    .replace('{{globalTags}}', JSON.stringify(globalTags))
    .replace('{{currentTags}}', JSON.stringify(currentTags))
    .replace('{{text}}', text);
  
  try {
    const textResult = await generateText(prompt, settings, true);
    // Robust parsing: remove markdown code blocks if present
    const cleanJson = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error("AI Tagging Parse Error", e);
    return [];
  }
};

export const reorganizeNoteAI = async (text: string, settings?: AppSettings): Promise<string> => {
  const template = settings?.promptReorganizeNote || DEFAULT_PROMPTS.REORGANIZE_NOTE;
  const prompt = template.replace('{{text}}', text);
  return generateText(prompt, settings);
};

export const organizeSummaryAI = async (text: string, settings?: AppSettings): Promise<string> => {
  const template = settings?.promptOrganizeSummary || DEFAULT_PROMPTS.ORGANIZE_SUMMARY;
  const prompt = template.replace('{{text}}', text);
  return generateText(prompt, settings);
};