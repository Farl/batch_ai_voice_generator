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

function buildAuthHeaders(apiKey) {
    return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

function getAudioPriceUnit(pricing = {}) {
    if (pricing.completionAudioTokens != null) return 'completionAudioTokens';
    if (pricing.completionAudioSeconds != null) return 'completionAudioSeconds';
    if (pricing.promptAudioSeconds != null) return 'promptAudioSeconds';
    return null;
}

function getModelSearchText(model) {
    return [
        model.name,
        model.id,
        model.description,
        ...(model.aliases || [])
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

export function inferAudioModelType(model) {
    const haystack = getModelSearchText(model);
    return haystack.includes('music') ? 'music' : 'speech';
}

export function getDefaultAudioModelId(models) {
    if (!Array.isArray(models) || models.length === 0) return '';
    return models.find(model => model.type === 'speech')?.id || models[0].id;
}

function normalizeAudioModel(model) {
    const unit = getAudioPriceUnit(model.pricing);
    const rawRate = unit ? model.pricing?.[unit] : null;
    const rate = rawRate == null ? null : Number(rawRate);

    return {
        id: model.name,
        type: inferAudioModelType(model),
        description: model.description || '',
        pricing: unit && Number.isFinite(rate) ? {
            currency: model.pricing?.currency || 'pollen',
            unit,
            rate
        } : null,
        priceLabel: unit && Number.isFinite(rate)
            ? formatPriceLabel({ unit, rate })
            : 'Pricing unavailable'
    };
}

async function extractErrorMessage(response) {
    try {
        const data = await response.json();
        return data?.error?.message || data?.message || `${response.status} ${response.statusText}`;
    } catch {
        return `${response.status} ${response.statusText}`;
    }
}

async function postJson(url, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(await extractErrorMessage(response));
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

// ─── Audio model metadata ─────────────────────────────────────────────────────

// Standard OpenAI TTS voices accepted by Pollinations audio endpoint.
// No voices endpoint exists on Pollinations; this is the canonical OpenAI list.
// prettier-ignore
const OPENAI_TTS_VOICES = [
    { id: 'nova',    label: 'nova — warm & natural (F)'       },
    { id: 'shimmer', label: 'shimmer — soft & clear (F)'      },
    { id: 'onyx',    label: 'onyx — deep & authoritative (M)' },
    { id: 'echo',    label: 'echo — smooth & balanced (M)'    },
    { id: 'fable',   label: 'fable — expressive & narrative (M)' },
    { id: 'alloy',   label: 'alloy — versatile & neutral'     },
];

const AUDIO_PRICE_UNIT_LABELS = {
    completionAudioTokens: 'audio token',
    completionAudioSeconds: 'audio second',
    promptAudioSeconds: 'audio second'
};

export function formatPollenAmount(value) {
    if (!Number.isFinite(value)) return '—';
    return value.toFixed(7).replace(/\.?0+$/, '');
}

export function formatPriceLabel(pricing) {
    if (!pricing?.unit || !Number.isFinite(pricing.rate)) {
        return 'Pricing unavailable';
    }

    const unitLabel = AUDIO_PRICE_UNIT_LABELS[pricing.unit] || pricing.unit;
    return `${formatPollenAmount(pricing.rate)} pollen / ${unitLabel}`;
}

/**
 * Fetch available TTS/audio models from Pollinations /audio/models.
 * Returns richer pricing metadata than /v1/models.
 *
 * @returns {Promise<Array<{id: string, type: 'speech'|'music', description: string, pricing: object|null, priceLabel: string}>>}
 */
export async function fetchAudioModels() {
    const config = getConfig();
    const baseUrl = normalizeBaseUrl(config.POLLINATIONS_API_BASE_URL);
    const res = await fetch(`${baseUrl}/audio/models`, {
        headers: buildAuthHeaders(config.POLLINATIONS_API_KEY),
        signal: AbortSignal.timeout(15_000)
    });
    if (!res.ok) throw new Error(`Models endpoint error: ${res.status}`);
    const data = await res.json();
    return data
        .filter(m =>
            m.input_modalities?.includes('text') &&
            m.output_modalities?.includes('audio')
        )
        .map(normalizeAudioModel);
}

export async function fetchAccountBalance() {
    const config = getConfig();
    if (!config.POLLINATIONS_API_KEY) {
        return null;
    }

    const baseUrl = normalizeBaseUrl(config.POLLINATIONS_API_BASE_URL);
    const res = await fetch(`${baseUrl}/account/balance`, {
        headers: buildAuthHeaders(config.POLLINATIONS_API_KEY),
        signal: AbortSignal.timeout(15_000)
    });

    if (res.status === 401 || res.status === 403) {
        return null;
    }
    if (!res.ok) {
        throw new Error(await extractErrorMessage(res));
    }

    const data = await res.json();
    return Number.isFinite(Number(data.balance)) ? Number(data.balance) : null;
}

/**
 * Return voice options for a given model.
 * Music generation models (acestep, elevenmusic) don't use a voice parameter.
 * All speech models on Pollinations accept the standard OpenAI TTS voice set.
 *
 * @param {string|{type?: string}} modelId
 * @returns {Array<{id: string, label: string}>} Empty array means voice N/A.
 */
export function getVoicesForModel(modelId) {
    if (typeof modelId === 'object' && modelId?.type === 'music') return [];
    return OPENAI_TTS_VOICES;
}

export function estimateAudioCost(text, pricing, itemCount = 1) {
    if (!pricing?.unit || !Number.isFinite(pricing.rate)) {
        return null;
    }

    const safeCount = Math.max(itemCount, 1);
    const normalizedText = (text || '').trim();
    let quantity;

    if (pricing.unit === 'completionAudioTokens') {
        quantity = Math.max(normalizedText.length, 1);
    } else {
        quantity = Math.max(Math.ceil(normalizedText.length * 0.06), 1);
    }

    const perItem = quantity * pricing.rate;
    return {
        perItem,
        total: perItem * safeCount,
        quantity,
        unitLabel: AUDIO_PRICE_UNIT_LABELS[pricing.unit] || pricing.unit
    };
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
 * Build a Pollinations /audio/{text} URL.
 * Returns an MP3 URL usable directly as an <audio> src.
 *
 * @param {string} text    - The text (or music prompt) to synthesize.
 * @param {string} voice   - TTS voice name (ignored for music models).
 * @param {string} modelId - Pollinations audio model id (e.g. 'qwen-tts').
 * @returns {string} Audio URL.
 */
export function buildSpeechUrl(text, voice, modelId) {
    const config = getConfig();
    const baseUrl = normalizeBaseUrl(config.POLLINATIONS_API_BASE_URL);
    const url = new URL(`${baseUrl}/audio/${encodeURIComponent(text)}`);
    url.searchParams.set('model', modelId);
    if (voice) {
        url.searchParams.set('voice', voice);
    }
    if (config.POLLINATIONS_API_KEY) {
        url.searchParams.set('key', config.POLLINATIONS_API_KEY);
    }
    console.log('[api] TTS URL:', url.toString());
    return url.toString();
}

/**
 * Fetch the synthesized audio and return a browser-safe blob URL.
 * This lets the UI surface API JSON errors instead of handing them to <audio>.
 *
 * @param {string} text
 * @param {string} voice
 * @param {string} modelId
 * @returns {Promise<string>}
 */
export async function fetchAudioBlob(text, voice, modelId) {
    const audioUrl = buildSpeechUrl(text, voice, modelId);
    const response = await fetch(audioUrl);

    if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
    }

    const contentType = response.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().startsWith('audio/')) {
        throw new Error(await extractErrorMessage(response));
    }

    const audioBlob = await response.blob();
    return URL.createObjectURL(audioBlob);
}
