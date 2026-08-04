import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are a smart travel assistant. Extract a sequence of travel waypoints from the user's natural language description.

For each waypoint:
- name: city name
- lat / lng: its real coordinates
- transport: how the traveller reaches this stop from the previous one — "plane" | "car" | "train" | "walk". Infer from distance and context; default to "plane" for long distances.
- emoji: a relevant emoji for the city or country`;

const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        waypoints: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    lat: { type: Type.NUMBER },
                    lng: { type: Type.NUMBER },
                    transport: {
                        type: Type.STRING,
                        enum: ["plane", "car", "train", "walk"],
                    },
                    emoji: { type: Type.STRING },
                },
                required: ["name", "lat", "lng", "transport", "emoji"],
            },
        },
    },
    required: ["waypoints"],
};

export async function POST(req: Request) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return NextResponse.json(
            { error: "GEMINI_API_KEY is not configured on the server." },
            { status: 500 }
        );
    }

    let prompt: unknown;
    try {
        ({ prompt } = await req.json());
    } catch {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (typeof prompt !== "string" || !prompt.trim()) {
        return NextResponse.json({ error: "A non-empty 'prompt' is required." }, { status: 400 });
    }

    try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_PROMPT,
                responseMimeType: "application/json",
                responseSchema: RESPONSE_SCHEMA,
            },
        });

        const text = response.text;
        if (!text) {
            return NextResponse.json(
                { error: "The model returned an empty response. Please rephrase and try again." },
                { status: 502 }
            );
        }

        // responseSchema guarantees well-formed JSON, so no markdown stripping needed.
        return NextResponse.json(JSON.parse(text));
    } catch (error) {
        console.error("AI Generation Error:", error);
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes("404") || message.includes("not found")) {
            return NextResponse.json(
                {
                    error: "Gemini API Error: model not found. Make sure the 'Generative Language API' is enabled for this API key.",
                },
                { status: 404 }
            );
        }

        if (message.includes("403") || message.includes("permission") || message.includes("API key")) {
            return NextResponse.json(
                { error: "Gemini API Error: the API key is invalid or lacks access to this model." },
                { status: 403 }
            );
        }

        return NextResponse.json(
            { error: "Failed to generate route. Please check your API key and network." },
            { status: 500 }
        );
    }
}
