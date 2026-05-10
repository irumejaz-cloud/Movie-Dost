/* =============================================
   Movie Dost AI Chatbot — Frontend Script
   ============================================= */

// ── Constants ─────────────────────────────────
const API_BASE = ""; // empty = same origin (Express serves frontend)
const STORAGE_KEY = "movieDost_chatHistory";
const MAX_HISTORY = 30; // max messages to keep in localStorage

// ── State ──────────────────────────────────────
let chatHistory = []; // { role: 'user'|'assistant', content: string }
let isLoading = false;

// ── DOM References ────────────────────────────
const messageInput    = document.getElementById("messageInput");
const sendBtn         = document.getElementById("sendBtn");
const messagesArea    = document.getElementById("messagesArea");
const welcomeScreen   = document.getElementById("welcomeScreen");
const chatContainer   = document.getElementById("chatContainer");
const statusDot       = document.getElementById("statusDot");
const statusText      = document.getElementById("statusText");
const hamburgerBtn    = document.getElementById("hamburgerBtn");
const sidebar         = document.getElementById("sidebar");
const sidebarOverlay  = document.getElementById("sidebarOverlay");
const clearChatBtn    = document.getElementById("clearChatBtn");
const moviesStrip     = document.getElementById("moviesStrip");
const moviesGrid      = document.getElementById("moviesGrid");
const stripTitle      = document.getElementById("stripTitle");
const stripClose      = document.getElementById("stripClose");
const movieSearch     = document.getElementById("movieSearch");
const navItems        = document.querySelectorAll(".nav-item");

// =============================================
// INITIALISATION
// =============================================
function init() {
  loadHistory();
  bindEvents();
  autoResizeTextarea();
  scrollToBottom(false);
}

// =============================================
// EVENT BINDINGS
// =============================================
function bindEvents() {
  // Send on button click
  sendBtn.addEventListener("click", handleSend);

  // Send on Enter (Shift+Enter = newline)
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Auto-resize textarea as user types
  messageInput.addEventListener("input", autoResizeTextarea);

  // Quick prompt buttons
  document.querySelectorAll(".quick-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      messageInput.value = btn.dataset.prompt;
      handleSend();
    });
  });

  // Hamburger (mobile sidebar toggle)
  hamburgerBtn.addEventListener("click", toggleSidebar);
  sidebarOverlay.addEventListener("click", closeSidebar);

  // Clear chat
  clearChatBtn.addEventListener("click", clearChat);

  // Movies strip close
  stripClose.addEventListener("click", () => {
    moviesStrip.classList.remove("visible");
  });

  // Sidebar navigation (genre/language filter)
  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      navItems.forEach((n) => n.classList.remove("active"));
      item.classList.add("active");

      const genre    = item.dataset.genre;
      const language = item.dataset.language;

      if (genre === "all") {
        loadMovieStrip(null, null, "Featured Movies");
      } else if (genre) {
        loadMovieStrip(genre, null, `${genre} Movies`);
      } else if (language) {
        loadMovieStrip(null, language, `${language} Cinema`);
      }
    });
  });

  // Movie search in sidebar
  let searchTimeout;
  movieSearch.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const query = movieSearch.value.trim();
      if (query.length > 1) {
        loadMovieStrip(null, null, `Results for "${query}"`, query);
      } else if (!query) {
        moviesStrip.classList.remove("visible");
      }
    }, 400);
  });
}

// =============================================
// CHAT — SEND MESSAGE
// =============================================
async function handleSend() {
  const text = messageInput.value.trim();
  if (!text || isLoading) return;

  // Clear input and reset height
  messageInput.value = "";
  autoResizeTextarea();

  // Hide welcome screen
  welcomeScreen.style.display = "none";

  // Append user message to UI
  appendMessage("user", text);

  // Add to history
  chatHistory.push({ role: "user", content: text });

  // Show typing indicator
  setLoading(true);

  try {
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        // Send last N messages as context (trim to avoid token overflow)
        history: chatHistory.slice(-20).slice(0, -1), // exclude current message
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server error: ${response.status}`);
    }

    const data = await response.json();

    // Append assistant message
    appendMessage("assistant", data.message, data.movies || []);

    // Add to history
    chatHistory.push({ role: "assistant", content: data.message });

    // Trim history
    if (chatHistory.length > MAX_HISTORY) {
      chatHistory = chatHistory.slice(-MAX_HISTORY);
    }

    // Persist
    saveHistory();

  } catch (error) {
    appendError(error.message || "Something went wrong. Please try again.");
    // Remove the last user message from history on error
    chatHistory.pop();
  } finally {
    setLoading(false);
  }
}

// =============================================
// UI — APPEND MESSAGES
// =============================================
function appendMessage(role, content, movies = []) {
  const msgEl = document.createElement("div");
  msgEl.classList.add("message", role);

  const avatar     = role === "user" ? "👤" : "🎬";
  const senderName = role === "user" ? "You" : "Movie Dost";
  const time       = formatTime(new Date());

  // Parse **bold** markdown in content
  const formattedContent = parseBold(escapeHtml(content));

  // Build movie cards HTML if any recommendations
  let moviesHtml = "";
  if (movies && movies.length > 0) {
    moviesHtml = `<div class="message-movies">
      ${movies.map((m) => buildMiniCard(m)).join("")}
    </div>`;
  }

  msgEl.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-body">
      <div class="message-sender">${senderName}</div>
      <div class="message-bubble">
        ${formattedContent}
        ${moviesHtml}
      </div>
      <div class="message-time">${time}</div>
    </div>
  `;

  messagesArea.appendChild(msgEl);
  scrollToBottom();
}

function appendError(message) {
  const errEl = document.createElement("div");
  errEl.style.cssText = "padding: 0 24px 8px;";
  errEl.innerHTML = `
    <div class="error-toast">
      <span>⚠️</span>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
  messagesArea.appendChild(errEl);
  scrollToBottom();
}

// Build a small movie card for inline chat recommendations
function buildMiniCard(movie) {
  const poster = movie.poster
    ? `<img class="card-poster" src="${movie.poster}" alt="${escapeHtml(movie.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : "";

  return `
    <div class="movie-card" onclick="askAboutMovie('${escapeHtml(movie.title)}')">
      ${poster}
      <div class="card-poster-fallback" style="${movie.poster ? 'display:none' : ''}">🎬
        <span style="font-size:10px;text-align:center;padding:0 4px">${escapeHtml(movie.title)}</span>
      </div>
      <div class="card-info">
        <div class="card-title">${escapeHtml(movie.title)}</div>
        <div class="card-rating">⭐ ${movie.rating || "N/A"}</div>
        <div class="card-genre">${Array.isArray(movie.genre) ? movie.genre[0] : (movie.genre || "")}</div>
      </div>
    </div>
  `;
}

// Allow clicking a movie card to ask about it
window.askAboutMovie = function (title) {
  messageInput.value = `Tell me more about the movie "${title}"`;
  handleSend();
};

// =============================================
// UI — LOADING STATE
// =============================================
function setLoading(loading) {
  isLoading = loading;
  sendBtn.disabled = loading;

  if (loading) {
    statusDot.classList.add("thinking");
    statusText.textContent = "Thinking...";
    showTypingIndicator();
  } else {
    statusDot.classList.remove("thinking");
    statusText.textContent = "Ready";
    removeTypingIndicator();
  }
}

function showTypingIndicator() {
  const el = document.createElement("div");
  el.id = "typingIndicator";
  el.className = "typing-indicator";
  el.innerHTML = `
    <div class="typing-avatar">🎬</div>
    <div class="typing-bubble">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  messagesArea.appendChild(el);
  scrollToBottom();
}

function removeTypingIndicator() {
  const el = document.getElementById("typingIndicator");
  if (el) el.remove();
}

// =============================================
// MOVIES STRIP — BROWSE
// =============================================
async function loadMovieStrip(genre, language, title, search) {
  stripTitle.textContent = title || "Movies";
  moviesGrid.innerHTML = `<div class="shimmer" style="height:180px;border-radius:12px;grid-column:1/-1"></div>`;
  moviesStrip.classList.add("visible");

  try {
    const params = new URLSearchParams();
    if (genre)    params.set("genre", genre);
    if (language) params.set("language", language);
    if (search)   params.set("search", search);

    const res  = await fetch(`/api/movies?${params.toString()}`);
    const data = await res.json();

    if (!data.length) {
      moviesGrid.innerHTML = `<p style="color:var(--text-muted);font-size:13px;grid-column:1/-1">No movies found.</p>`;
      return;
    }

    moviesGrid.innerHTML = data.map((movie) => `
      <div class="movie-card" onclick="askAboutMovie('${escapeHtml(movie.title)}')">
        <img class="card-poster" src="${movie.poster || ''}" alt="${escapeHtml(movie.title)}" loading="lazy"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="card-poster-fallback" style="${movie.poster ? 'display:none' : ''}">🎬
          <span style="font-size:10px;text-align:center;padding:0 6px">${escapeHtml(movie.title)}</span>
        </div>
        <div class="card-info">
          <div class="card-title">${escapeHtml(movie.title)}</div>
          <div class="card-rating">⭐ ${movie.rating}</div>
          <div class="card-genre">${Array.isArray(movie.genre) ? movie.genre.slice(0,2).join(", ") : movie.genre}</div>
        </div>
      </div>
    `).join("");

  } catch {
    moviesGrid.innerHTML = `<p style="color:var(--neon-red);font-size:13px;grid-column:1/-1">Failed to load movies.</p>`;
  }
}

// =============================================
// HISTORY — LOCALSTORAGE
// =============================================
function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chatHistory));
  } catch { /* quota exceeded — silently skip */ }
}

function loadHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    chatHistory = JSON.parse(saved);

    if (chatHistory.length > 0) {
      welcomeScreen.style.display = "none";
      // Re-render all messages
      chatHistory.forEach((msg) => {
        appendMessage(msg.role, msg.content);
      });
    }
  } catch {
    chatHistory = [];
  }
}

function clearChat() {
  chatHistory = [];
  localStorage.removeItem(STORAGE_KEY);
  messagesArea.innerHTML = "";
  welcomeScreen.style.display = "flex";
  moviesStrip.classList.remove("visible");
  // Reset nav
  navItems.forEach((n) => n.classList.remove("active"));
  navItems[0].classList.add("active");
}

// =============================================
// SIDEBAR TOGGLE (MOBILE)
// =============================================
function toggleSidebar() {
  sidebar.classList.toggle("open");
  sidebarOverlay.classList.toggle("visible");
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("visible");
}

// Close sidebar on nav item click on mobile
navItems.forEach((item) => {
  item.addEventListener("click", () => {
    if (window.innerWidth <= 768) closeSidebar();
  });
});

// =============================================
// UTILITIES
// =============================================

// Auto-resize textarea height as user types
function autoResizeTextarea() {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
}

// Scroll chat to bottom
function scrollToBottom(smooth = true) {
  requestAnimationFrame(() => {
    chatContainer.scrollTo({
      top: chatContainer.scrollHeight,
      behavior: smooth ? "smooth" : "instant",
    });
  });
}

// Format time as HH:MM
function formatTime(date) {
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// Escape HTML to prevent XSS
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Parse **bold** markdown
function parseBold(str) {
  return str.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

// =============================================
// BOOT
// =============================================
document.addEventListener("DOMContentLoaded", init);