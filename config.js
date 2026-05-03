// config.js - Public runtime configuration.
// This file is committed to the repository with safe public defaults.
// Do NOT put secrets or tokens here.
// For local testing with GitHub Models, copy config.local.example.js to config.local.js.
window.AI_VOICE_GEN_CONFIG = {
    // Text generation provider: 'github' or 'pollinations'
    // 'github' requires GITHUB_TOKEN; falls back to pollinations on failure.
    TEXT_PROVIDER: 'github',

    // Pollinations settings (no API key needed for basic usage)
    POLLINATIONS_API_BASE_URL: 'https://gen.pollinations.ai',
    POLLINATIONS_TEXT_MODEL: 'openai',
    POLLINATIONS_API_KEY: '',

    // GitHub Models settings
    GITHUB_MODELS_BASE_URL: 'https://models.github.ai',
    GITHUB_TOKEN: '',
    GITHUB_MODEL: 'openai/gpt-4.1-mini',
    GITHUB_API_VERSION: '2026-03-10'
};
