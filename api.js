// api.js - AI provider abstraction layer.
// Handles text generation (GitHub Models → Pollinations fallback)
// and text-to-speech (Pollinations audio API).

const API_TIMEOUT_MS = 90_000;

const DEFAULT_CONFIG = {
    TEXT_PROVIDER: 'github',
    POLLINATIONS_API_BASE_URL: 'https://gen.pollinations.ai',
    POLLINATIONS_TEXT_MODEL: 'openai',
    POLLINATIONS_API_KEY: '',
    GITHUB_MODELS_BASE_URL: 'https://models.github.ai',
    GITHUB_TOKEN: '',
    GITHUB_MODEL: 'openai/gpt-4.1-mini',
    GITHUB_API_VERSION: '2026-03-10'
};

function _d(s) { try { return s ? atob(s) : ''; } catch { return ''; } }

function getConfig() {
    const raw = window['_avgc'] || {};
    // Obfuscated config: decode base64 tokens, map short keys to canonical names
    const decoded = Object.keys(raw).length ? {
        TEXT_PROVIDER:             raw._tp  || DEFAULT_CONFIG.TEXT_PROVIDER,
        POLLINATIONS_API_BASE_URL: raw._pb  || DEFAULT_CONFIG.POLLINATIONS_API_BASE_URL,
        POLLINATIONS_TEXT_MODEL:   raw._ptm || DEFAULT_CONFIG.POLLINATIONS_TEXT_MODEL,
        POLLINATIONS_API_KEY:      _d(raw._pk),
        GITHUB_MODELS_BASE_URL:    raw._gb  || DEFAULT_CONFIG.GITHUB_MODELS_BASE_URL,
        GITHUB_TOKEN:              _d(raw._gk),
        GITHUB_MODEL:              raw._gm  || DEFAULT_CONFIG.GITHUB_MODEL,
        GITHUB_API_VERSION:        raw._gv  || DEFAULT_CONFIG.GITHUB_API_VERSION,
    } : {};
    // Also accept window.AI_VOICE_GEN_CONFIG (plain, for config.local.js)
    return { ...DEFAULT_CONFIG, ...(window.AI_VOICE_GEN_CONFIG || {}), ...decoded };
}

function normalizeBaseUrl(url) {
    return url.replace(/\/$/, '');
}

async function postJson(url, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) {
            let errorMsg;
            try {
                const data = await response.json();
                errorMsg = data?.error?.message || data?.message || `${response.status} ${response.statusText}`;
            } catch {
                errorMsg = `${response.status} ${response.statusText}`;
            }
            throw new Error(errorMsg);
        }
        return await response.json();
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error('Request timed out. Check your connection and try again.');
        }
        throw err;
    }
}

function extractContent(result) {
    return result?.choices?.[0]?.message?.content || '';
}

function parseModelJson(raw) {
    const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    try {
        return JSON.parse(stripped);
    } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
            try { return JSON.parse(match[0]); } catch { /* fall through */ }
        }
        console.error('[api] Raw model response that failed to parse:', raw.slice(0, 500));
        throw new Error('Could not parse JSON from model response.');
    }
}

// ─── Text: GitHub Models ─────────────────────────────────────────────────────

async function requestGitHubText(messages, config) {
    if (!config.GITHUB_TOKEN) {
        throw new Error('No GITHUB_TOKEN configured.');
    }
    const baseUrl = normalizeBaseUrl(config.GITHUB_MODELS_BASE_URL);
    const payload = {
        model: config.GITHUB_MODEL,
        messages,
        response_format: { type: 'json_object' }
    };
    const result = await postJson(`${baseUrl}/inference/chat/completions`, {
        method: 'POST',
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${config.GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': config.GITHUB_API_VERSION
        },
        body: JSON.stringify(payload)
    });
    return parseModelJson(extractContent(result));
}

// ─── Text: Pollinations ───────────────────────────────────────────────────────

async function requestPollinationsText(messages, config) {
    const baseUrl = normalizeBaseUrl(config.POLLINATIONS_API_BASE_URL);
    const headers = { 'Content-Type': 'application/json' };
    if (config.POLLINATIONS_API_KEY) {
        headers.Authorization = `Bearer ${config.POLLINATIONS_API_KEY}`;
    }
    const payload = {
        model: config.POLLINATIONS_TEXT_MODEL,
        messages,
        jsonMode: true
    };
    const result = await postJson(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
    });
    return parseModelJson(extractContent(result));
}

// ─── Public: Text generation with fallback ────────────────────────────────────

/**
 * Generate text using the configured provider, with automatic fallback.
 * @param {Array<{role: string, content: string}>} messages - Chat messages array.
 * @returns {Promise<object>} Parsed JSON object from the model.
 */
export async function generateText(messages) {
    const config = getConfig();
    const provider = config.TEXT_PROVIDER;

    if (provider === 'github' && config.GITHUB_TOKEN) {
        try {
            console.log('[api] Using GitHub Models for text generation.');
            return await requestGitHubText(messages, config);
        } catch (err) {
            console.warn('[api] GitHub Models failed, falling back to Pollinations.', err.message);
        }
    } else if (provider === 'github' && !config.GITHUB_TOKEN) {
        console.log('[api] No GITHUB_TOKEN, using Pollinations for text generation.');
    }

    return await requestPollinationsText(messages, config);
}

// ─── Public: Text-to-Speech URL ──────────────────────────────────────────────

/**
 * Build a Pollinations TTS audio URL for the given text and voice.
 * The returned URL points to an MP3 audio file and can be used directly
 * as an <audio> src — no additional fetch is required.
 *
 * Supported voices: alloy, echo, fable, onyx, nova, shimmer
 * (alloy/echo/fable/onyx = male-leaning, nova/shimmer = female)
 *
 * @param {string} text  - The text to synthesize.
 * @param {string} voice - TTS voice name (default: 'nova').
 * @returns {string} Audio URL.
 */
export function buildSpeechUrl(text, voice = 'nova') {
    const config = getConfig();
    const baseUrl = normalizeBaseUrl(config.POLLINATIONS_API_BASE_URL);
    const url = new URL(`${baseUrl}/audio/${encodeURIComponent(text)}`);
    url.searchParams.set('voice', voice);
    url.searchParams.set('model', 'openai-audio');
    if (config.POLLINATIONS_API_KEY) {
        url.searchParams.set('key', config.POLLINATIONS_API_KEY);
    }
    console.log('[api] Building TTS URL for voice:', voice);
    return url.toString();
}
