// =============================================
// Movie Dost AI Chatbot - Express Server
// Powered by Groq API (Free, No Daily Limits)
// =============================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const Groq = require("groq-sdk");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── Groq AI Setup ─────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Load Movie Database ───────────────────────
const movies = JSON.parse(fs.readFileSync(path.join(__dirname, "movies.json"), "utf-8"));

// ── System Prompt for Movie Dost ─────────────
const SYSTEM_PROMPT = `You are "Movie Dost" — a friendly, enthusiastic, and knowledgeable AI movie companion.
You speak like a passionate film buff who genuinely loves cinema from Bollywood, Hollywood, and world cinema.

Your personality traits:
- Warm, conversational, and relatable — like a best friend who loves movies
- Use casual language, occasionally mix in Hindi/Urdu words like "yaar", "bhai", "ekdum", "zabardast"
- Show genuine excitement about great films
- Give honest opinions while being respectful
- Recommend movies with context and reasons why the user will love them

Movie database available to you (use this as reference, but you know ALL movies):
${JSON.stringify(movies.map(m => ({ title: m.title, genre: m.genre, rating: m.rating, mood: m.mood, language: m.language })), null, 2)}

When recommending movies:
- Always explain WHY you are recommending a specific movie
- Mention genres, mood, language when relevant
- Give ratings if asked
- Suggest streaming platforms when you know them
- Keep responses concise but warm (2-4 sentences per recommendation)
- Format movie titles in **bold**

IMPORTANT: Return ONLY plain text. No markdown headers, no bullet lists with hyphens.
When you recommend movies, end your message with this tag (ONLY when recommending specific movies):
[MOVIES: title1|title2|title3]

Keep responses human, warm, and conversational. Never sound robotic.`;

// ── Chat Endpoint ─────────────────────────────
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    // Build conversation history for Groq
    const chatHistory = (history || []).map((msg) => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    }));

    // Build full messages array with system prompt
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...chatHistory,
      { role: "user", content: message },
    ];

    // Call Groq API — llama-3.3-70b is best free model
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: messages,
      max_tokens: 1024,
      temperature: 0.85,
      top_p: 0.9,
    });

    const responseText = completion.choices[0]?.message?.content || "Sorry yaar, kuch problem ho gayi!";

    // Parse movie titles from response if present
    let recommendedMovies = [];
    const movieMatch = responseText.match(/\[MOVIES:\s*([^\]]+)\]/);
    if (movieMatch) {
      const titles = movieMatch[1].split("|").map((t) => t.trim());
      recommendedMovies = titles
        .map((title) =>
          movies.find((m) => m.title.toLowerCase().includes(title.toLowerCase()))
        )
        .filter(Boolean);
    }

    // Clean the response text (remove the movie tag)
    const cleanResponse = responseText.replace(/\[MOVIES:[^\]]*\]/g, "").trim();

    res.json({
      message: cleanResponse,
      movies: recommendedMovies,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("Groq API Error:", error.message);

    if (error.message.includes("API_KEY") || error.message.includes("auth")) {
      return res.status(401).json({ error: "Invalid Groq API key. Please check your .env file." });
    }
    if (error.message.includes("rate") || error.message.includes("429")) {
      return res.status(429).json({ error: "Rate limit reached. Please try again in a moment." });
    }

    res.status(500).json({ error: "Something went wrong. Please try again!" });
  }
});

// ── Movies Endpoint ───────────────────────────
app.get("/api/movies", (req, res) => {
  const { genre, language, search } = req.query;
  let filtered = [...movies];

  if (genre) filtered = filtered.filter((m) => m.genre.some((g) => g.toLowerCase() === genre.toLowerCase()));
  if (language) filtered = filtered.filter((m) => m.language.toLowerCase().includes(language.toLowerCase()));
  if (search) filtered = filtered.filter((m) => m.title.toLowerCase().includes(search.toLowerCase()));

  res.json(filtered);
});

// ── Health Check ──────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Movie Dost is alive!", timestamp: new Date().toISOString() });
});

// ── Serve Frontend ────────────────────────────
app.get("*", (req, res) => {
res.sendFile(path.join(__dirname, "index.html"));
});

// ── Start Server ──────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎬 Movie Dost AI Chatbot running!`);
  console.log(`🌐 Open: http://localhost:${PORT}`);
  console.log(`🤖 AI model: llama-3.3-70b (Groq - Free)`);
  console.log(`📽️  Movies loaded: ${movies.length}\n`);
});
