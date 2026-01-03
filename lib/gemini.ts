import { GoogleGenAI, Type } from "@google/genai";

const getAIClient = () => {
  if (!process.env.API_KEY) {
    throw new Error("API Key not found");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

const MODEL = 'gemini-3-flash-preview';

// 1. Suggest Tags
export const suggestTags = async (text: string, globalTags: string[], currentTags: string[]): Promise<string[]> => {
  try {
    const ai = getAIClient();
    const prompt = `
      Analyze the following academic note and suggest up to 5 relevant tags for a knowledge graph.
      
      Rules:
      1. Review the "Global Knowledge Tags" list below. If any of these are relevant, prioritize using them exactly as written.
      2. Review "Already Added Tags" to avoid suggesting exact duplicates.
      3. Only create new tags if the note covers a distinct concept not captured by global tags.
      4. New tags should be concise (1-3 words), lowercase, and technical/academic.
      5. Return ONLY a JSON array of strings.
      
      Global Knowledge Tags: ${JSON.stringify(globalTags)}
      Already Added Tags: ${JSON.stringify(currentTags)}
      Note Content: "${text}"
    `;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("AI Tagging Error:", error);
    return [];
  }
};

// 2. Proofread Note
export const proofreadText = async (text: string): Promise<string> => {
  try {
    const ai = getAIClient();
    const prompt = `
      Proofread and reorganize the following academic note. 
      Fix grammar and spelling. 
      Improve flow while maintaining the original meaning.
      Use professional, scholarly language.
      
      Note: "${text}"
    `;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
    });

    return response.text || text;
  } catch (error) {
    console.error("AI Proofread Error:", error);
    return text;
  }
};

// 3. Rewrite Selection with Instruction
export const rewriteSelection = async (selection: string, instruction: string, fullContext: string): Promise<string> => {
  try {
    const ai = getAIClient();
    const prompt = `
      Rewrite the following specific text selection from a note based on the user's instructions.
      
      Context: "${fullContext}"
      Selection to rewrite: "${selection}"
      User Instruction: "${instruction}"
      
      Return only the rewritten text for that specific selection.
    `;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
    });

    return response.text || selection;
  } catch (error) {
    console.error("AI Rewrite Error:", error);
    return selection;
  }
};

// 4. Organize Summary
export const organizeSummary = async (currentSummary: string): Promise<string> => {
  try {
    const ai = getAIClient();
    const prompt = `
      Reorganize the following academic summary for clarity and professional structure.
      Use standard academic headings (e.g., Key Argument, Methodology, Significant Findings).
      Keep the tone objective and concise.
      
      Current Draft: "${currentSummary}"
    `;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
    });

    return response.text || currentSummary;
  } catch (error) {
    console.error("AI Summary Error:", error);
    return currentSummary;
  }
};