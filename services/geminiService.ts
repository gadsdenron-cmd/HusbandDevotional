import { GoogleGenAI } from "@google/genai";

export const isGeminiConfigured = () => {
  return !!process.env.API_KEY;
};

export const callGemini = async (prompt: string, systemInstruction: string = "") => {
  if (!process.env.API_KEY) {
     console.warn("API Key not found. Please provide an API key in the environment variables.");
     return "AI Coaching is unavailable because the API Key is missing. Please check your configuration.";
  }
  
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
      },
    });

    return response.text || "I couldn't generate a response. Please try again.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Connection error. Please check your internet or try again later.";
  }
};