import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildSpeechUrl,
    estimateAudioCost,
    fetchAccountBalance,
    fetchAudioBlob,
    fetchAudioModels,
    formatPriceLabel,
    formatPollenAmount,
    getDefaultAudioModelId,
    getVoicesForModel,
    inferAudioModelType
} from '../api.js';

test('buildSpeechUrl includes model and voice for speech models', () => {
    global.window = {
        AI_VOICE_GEN_CONFIG: {
            POLLINATIONS_API_BASE_URL: 'https://gen.pollinations.ai'
        }
    };

    const url = buildSpeechUrl('hello world', 'alloy', 'qwen-tts');
    const parsed = new URL(url);

    assert.equal(parsed.pathname, '/audio/hello%20world');
    assert.equal(parsed.searchParams.get('model'), 'qwen-tts');
    assert.equal(parsed.searchParams.get('voice'), 'alloy');
});

test('fetchAudioBlob surfaces JSON API errors instead of returning a broken audio url', async () => {
    global.window = {
        AI_VOICE_GEN_CONFIG: {
            POLLINATIONS_API_BASE_URL: 'https://gen.pollinations.ai'
        }
    };

    global.fetch = async () => new Response(
        JSON.stringify({
            success: false,
            error: {
                message: 'Insufficient balance.',
                code: 'PAYMENT_REQUIRED'
            }
        }),
        {
            status: 402,
            headers: {
                'Content-Type': 'application/json'
            }
        }
    );

    await assert.rejects(
        () => fetchAudioBlob('hello world', 'alloy', 'qwen-tts'),
        /Insufficient balance\./
    );
});

test('fetchAudioBlob also rejects 200 JSON responses that are not audio', async () => {
    global.window = {
        AI_VOICE_GEN_CONFIG: {
            POLLINATIONS_API_BASE_URL: 'https://gen.pollinations.ai'
        }
    };

    global.fetch = async () => new Response(
        JSON.stringify({
            success: false,
            error: {
                message: 'Audio URL expired.',
                code: 'BAD_AUDIO_URL'
            }
        }),
        {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        }
    );

    await assert.rejects(
        () => fetchAudioBlob('hello world', 'alloy', 'qwen-tts'),
        /Audio URL expired\./
    );
});

test('fetchAudioModels returns detailed pricing metadata from /audio/models', async () => {
    global.window = {
        AI_VOICE_GEN_CONFIG: {
            POLLINATIONS_API_BASE_URL: 'https://gen.pollinations.ai',
            POLLINATIONS_API_KEY: 'pk_demo'
        }
    };

    global.fetch = async (url, options = {}) => {
        assert.equal(url, 'https://gen.pollinations.ai/audio/models');
        assert.equal(options.headers.Authorization, 'Bearer pk_demo');

        return new Response(JSON.stringify([
            {
                name: 'qwen-tts',
                pricing: {
                    currency: 'pollen',
                    completionAudioTokens: '0.0000195'
                },
                description: 'Qwen TTS',
                input_modalities: ['text'],
                output_modalities: ['audio']
            }
        ]), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    };

    const models = await fetchAudioModels();

    assert.deepEqual(models, [
        {
            id: 'qwen-tts',
            type: 'speech',
            description: 'Qwen TTS',
            pricing: {
                currency: 'pollen',
                unit: 'completionAudioTokens',
                rate: 0.0000195
            },
            priceLabel: '0.0000195 pollen / audio token'
        }
    ]);
});

test('fetchAccountBalance returns numeric balance when authorized', async () => {
    global.window = {
        AI_VOICE_GEN_CONFIG: {
            POLLINATIONS_API_BASE_URL: 'https://gen.pollinations.ai',
            POLLINATIONS_API_KEY: 'pk_demo'
        }
    };

    global.fetch = async (url, options = {}) => {
        assert.equal(url, 'https://gen.pollinations.ai/account/balance');
        assert.equal(options.headers.Authorization, 'Bearer pk_demo');

        return new Response(JSON.stringify({ balance: 1.2345 }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    };

    assert.equal(await fetchAccountBalance(), 1.2345);
});

test('fetchAccountBalance returns null when no api key is configured', async () => {
    global.window = {
        AI_VOICE_GEN_CONFIG: {
            POLLINATIONS_API_BASE_URL: 'https://gen.pollinations.ai',
            POLLINATIONS_API_KEY: ''
        }
    };

    global.fetch = async () => {
        throw new Error('fetch should not be called without a key');
    };

    assert.equal(await fetchAccountBalance(), null);
});

test('estimateAudioCost uses text length for audio token priced models', () => {
    const estimate = estimateAudioCost(
        'hello world',
        {
            unit: 'completionAudioTokens',
            rate: 0.0000195
        },
        3
    );

    assert.deepEqual(estimate, {
        perItem: 0.0002145,
        total: 0.0006435,
        quantity: 11,
        unitLabel: 'audio token'
    });
});

test('format helpers produce concise pricing labels', () => {
    assert.equal(
        formatPriceLabel({ unit: 'completionAudioSeconds', rate: 0.0075 }),
        '0.0075 pollen / audio second'
    );
    assert.equal(formatPollenAmount(1.234567), '1.234567');
});

test('inferAudioModelType derives music from model metadata instead of hardcoded ids', () => {
    assert.equal(inferAudioModelType({
        name: 'acestep',
        description: 'Generate studio-grade music from text prompts',
        aliases: ['music']
    }), 'music');

    assert.equal(inferAudioModelType({
        name: 'qwen-tts',
        description: 'Multilingual text-to-speech',
        aliases: ['tts']
    }), 'speech');
});

test('getDefaultAudioModelId prefers a speech model over music models', () => {
    const modelId = getDefaultAudioModelId([
        { id: 'acestep', type: 'music' },
        { id: 'qwen-tts', type: 'speech' }
    ]);

    assert.equal(modelId, 'qwen-tts');
});

test('getVoicesForModel hides voice selection for inferred music models', () => {
    assert.deepEqual(
        getVoicesForModel({
            id: 'acestep',
            type: 'music'
        }),
        []
    );

    assert.ok(
        getVoicesForModel({
            id: 'qwen-tts',
            type: 'speech'
        }).length > 0
    );
});
