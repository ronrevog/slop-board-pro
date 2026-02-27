import { GoogleGenAI, ThinkingLevel } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: 'x' });
ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: "x",
    config: {
        responseModalities: ["IMAGE"],
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        tools: [{ googleSearch: {} }],
        imageConfig: {
            aspectRatio: "16:9",
            imageSize: "2K"
        }
    }
});