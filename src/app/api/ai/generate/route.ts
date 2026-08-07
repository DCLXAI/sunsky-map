import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/owner-server";
import { DAY_MS, HOUR_MS, LIMITS, decideAiRateLimit } from "@/lib/limits";

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

    const ownerId = await getOwnerId();
    if (!ownerId) {
        return NextResponse.json({ error: "Missing owner" }, { status: 401 });
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

    // Checked before the model call: prompt length drives token cost directly.
    if (prompt.length > LIMITS.promptMaxChars) {
        return NextResponse.json(
            { error: `Please keep the description under ${LIMITS.promptMaxChars} characters.` },
            { status: 413 }
        );
    }

    const now = Date.now();
    const ownerHourlyLimit = LIMITS.aiPerOwnerHourly;
    const globalDailyLimit = LIMITS.aiGlobalDaily;

    let decision;
    try {
        const [ownerLastHour, globalLastDay] = await Promise.all([
            prisma.aiRequest.count({
                where: { ownerId, createdAt: { gte: new Date(now - HOUR_MS) } },
            }),
            prisma.aiRequest.count({
                where: { createdAt: { gte: new Date(now - DAY_MS) } },
            }),
        ]);
        decision = decideAiRateLimit({
            ownerLastHour,
            globalLastDay,
            ownerHourlyLimit,
            globalDailyLimit,
        });
    } catch (error) {
        // Fail closed: an unavailable database must not become an unmetered
        // path to the paid model.
        console.error("Rate limit check failed:", error);
        return NextResponse.json(
            { error: "Route generation is briefly unavailable. Please try again." },
            { status: 503 }
        );
    }

    if (!decision.allowed) {
        return NextResponse.json(
            {
                error:
                    decision.scope === 'global'
                        ? "The route assistant has hit today's shared limit. Please try again later."
                        : "You've reached the hourly limit for route generation. Please try again shortly.",
            },
            {
                status: decision.scope === 'global' ? 503 : 429,
                headers: { 'Retry-After': String(decision.retryAfterSeconds ?? 900) },
            }
        );
    }

    // Recorded before the call, so a slow or failing generation still consumes
    // budget — otherwise a request that always times out would be free forever.
    try {
        await prisma.aiRequest.create({ data: { ownerId } });
    } catch (error) {
        console.error("Failed to record AI usage:", error);
        return NextResponse.json(
            { error: "Route generation is briefly unavailable. Please try again." },
            { status: 503 }
        );
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
        const data = JSON.parse(text) as { waypoints?: unknown };

        // The schema constrains the shape but not the length, and the client
        // writes whatever comes back straight into the editor.
        if (Array.isArray(data.waypoints) && data.waypoints.length > LIMITS.waypointsPerProject) {
            data.waypoints = data.waypoints.slice(0, LIMITS.waypointsPerProject);
        }

        return NextResponse.json(data);
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
