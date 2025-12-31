
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { prompt } = await req.json();

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: "Gemini API Key is missing" }, { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const systemPrompt = `
        You are a smart travel assistant. Your goal is to extract a sequence of travel waypoints from the user's natural language description.
        
        Return ONLY a raw JSON object (no markdown formatting) with a "waypoints" array.
        Each waypoint must have:
        - name: City name (string)
        - lat: Latitude (number)
        - lng: Longitude (number)
        - transport: "plane" | "car" | "train" | "walk" (infer based on distance/context. Default to plane for long distance)
        - emoji: A relevant emoji for the city/country (string)

        Example Input: "I want to go to Seoul, then Tokyo, then Paris"
        Example Output:
        {
            "waypoints": [
                { "name": "Seoul", "lat": 37.5665, "lng": 126.9780, "transport": "plane", "emoji": "🇰🇷" },
                { "name": "Tokyo", "lat": 35.6762, "lng": 139.6503, "transport": "plane", "emoji": "🇯🇵" },
                { "name": "Paris", "lat": 48.8566, "lng": 2.3522, "transport": "plane", "emoji": "🇫🇷" }
            ]
        }
        `;

        const result = await model.generateContent([systemPrompt, prompt]);
        const response = await result.response;
        const text = response.text();

        // Clean up markdown code blocks if present
        const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const data = JSON.parse(jsonStr);

        return NextResponse.json(data);

    } catch (error: any) {
        console.error("AI Generation Error:", error);

        // Check for common API errors
        if (error.message?.includes("404") || error.message?.includes("not found")) {
            return NextResponse.json({
                error: "Gemini API Error: Model not found. Please ensure 'Generative Language API' is ENABLED in your Google Cloud Console for this API key."
            }, { status: 404 });
        }

        if (error.message?.includes("403") || error.message?.includes("permission")) {
            return NextResponse.json({
                error: "Gemini API Permission Error: Your API key invalid or does not have access to this model."
            }, { status: 403 });
        }

        return NextResponse.json({ error: "Failed to generate route. Please check your API key and network." }, { status: 500 });
    }
}
