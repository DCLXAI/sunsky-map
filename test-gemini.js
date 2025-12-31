
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: '.env.local' });

async function testGemini() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("No GEMINI_API_KEY found env");
        return;
    }

    console.log("Testing API Key:", apiKey.substring(0, 10) + "...");

    const genAI = new GoogleGenerativeAI(apiKey);

    try {
        // Try to get a model and generate simple content to fail fast if API not enabled
        console.log("Attempting to list models...");
        // Note: older versions of SDK might not support listModels directly on genAI instance easily without model manager, 
        // but checking model availability via generateContent is the direct test we need.

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Hello");
        console.log("Success! Response:", result.response.text());
    } catch (error) {
        console.error("Error details:", error.message);
        if (error.message.includes("404")) {
            console.log("\nPossible Causes:");
            console.log("1. 'Generative Language API' is not enabled in Google Cloud Console.");
            console.log("2. The model name 'gemini-1.5-flash' is not available to this API key.");
        }
    }
}

testGemini();
