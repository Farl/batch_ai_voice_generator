import {
    estimateAudioCost,
    fetchAccountBalance,
    fetchAudioBlob,
    fetchAudioModels,
    formatPollenAmount,
    getDefaultAudioModelId,
    generateText,
    getVoicesForModel
} from './api.js';

document.addEventListener('DOMContentLoaded', () => {
    const textInput = document.getElementById('text-input');
    const inputLanguageSelect = document.getElementById('input-language');
    const outputLanguagesContainer = document.getElementById('output-languages-container');
    const generateBtn = document.getElementById('generate-btn');
    const loadingDiv = document.getElementById('loading');
    const resultsContainer = document.getElementById('results-container');
    const voiceSelect = document.getElementById('voice-select');
    const audioModelSelect = document.getElementById('audio-model-select');
    const voiceSelectorWrapper = document.getElementById('voice-selector-wrapper');
    const balanceValue = document.getElementById('balance-value');
    const balanceNote = document.getElementById('balance-note');
    const modelPriceValue = document.getElementById('model-price-value');
    const modelPriceNote = document.getElementById('model-price-note');
    const estimateTotalValue = document.getElementById('estimate-total-value');
    const estimateTotalNote = document.getElementById('estimate-total-note');

    const languages = {
        'en': 'English', 'es': 'Spanish', 'fr': 'French',
        'de': 'German', 'it': 'Italian', 'pt': 'Portuguese',
        'hi': 'Hindi', 'ja': 'Japanese', 'zh': 'Chinese', 'ko': 'Korean'
    };
    let audioModels = [];

    function getSelectedOutputLangs() {
        return Array.from(outputLanguagesContainer.querySelectorAll('input:checked'))
            .map(cb => cb.value);
    }

    function getSelectedOutputCount() {
        const inputLang = inputLanguageSelect.value;
        return new Set([inputLang, ...getSelectedOutputLangs()]).size;
    }

    function getSelectedModel() {
        return audioModels.find(model => model.id === audioModelSelect.value) || null;
    }

    function updateEstimateSummary() {
        const model = getSelectedModel();
        const text = textInput.value.trim();

        if (!model?.pricing) {
            estimateTotalValue.textContent = 'Estimate unavailable';
            estimateTotalNote.textContent = 'This model does not expose pricing metadata.';
            return;
        }

        if (!text) {
            estimateTotalValue.textContent = 'Enter text to estimate';
            estimateTotalNote.textContent = 'Estimate updates with selected output languages.';
            return;
        }

        const outputCount = getSelectedOutputCount();
        const estimate = estimateAudioCost(text, model.pricing, outputCount);
        if (!estimate) {
            estimateTotalValue.textContent = 'Estimate unavailable';
            estimateTotalNote.textContent = 'Could not estimate this model cost yet.';
            return;
        }

        estimateTotalValue.textContent = `${formatPollenAmount(estimate.total)} pollen`;
        estimateTotalNote.textContent = `${outputCount} clip(s) × ~${formatPollenAmount(estimate.perItem)} pollen each (${estimate.quantity} ${estimate.unitLabel}${estimate.quantity === 1 ? '' : 's'}).`;
    }

    function updateModelSummary() {
        const model = getSelectedModel();
        if (!model) {
            modelPriceValue.textContent = 'Unavailable';
            modelPriceNote.textContent = 'No model metadata loaded.';
            updateEstimateSummary();
            return;
        }

        modelPriceValue.textContent = model.priceLabel;
        modelPriceNote.textContent = model.description || 'Official pricing for the selected audio model.';
        updateEstimateSummary();
    }

    async function loadBalance() {
        try {
            const balance = await fetchAccountBalance();
            if (balance == null) {
                balanceValue.textContent = 'Balance unavailable';
                balanceNote.textContent = 'Add a Pollinations API key with account:balance access to show it here.';
                return;
            }

            balanceValue.textContent = `${formatPollenAmount(balance)} pollen`;
            balanceNote.textContent = 'Current remaining balance for the configured API key.';
        } catch (err) {
            console.error('[balance] Failed to load balance:', err);
            balanceValue.textContent = 'Balance unavailable';
            balanceNote.textContent = err.message;
        }
    }

    // ── Model + voice loading ──────────────────────────────────────────────────

    function populateVoices(model) {
        const voices = getVoicesForModel(model);
        voiceSelect.innerHTML = '';
        if (voices.length === 0) {
            voiceSelectorWrapper.classList.add('hidden');
        } else {
            voices.forEach(({ id, label }, i) => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = label;
                if (i === 0) opt.selected = true;
                voiceSelect.appendChild(opt);
            });
            voiceSelectorWrapper.classList.remove('hidden');
        }
    }

    async function loadAudioModels() {
        try {
            const models = await fetchAudioModels();
            audioModels = models;
            audioModelSelect.innerHTML = '';
            if (models.length === 0) {
                audioModelSelect.innerHTML = '<option value="">No models available</option>';
                updateModelSummary();
                return;
            }
            models.forEach((m, i) => {
                const opt = document.createElement('option');
                opt.value = m.id;
                const typeLabel = m.type === 'music' ? ' [music]' : '';
                opt.textContent = `${m.id}${typeLabel} — ${m.priceLabel}`;
                audioModelSelect.appendChild(opt);
            });
            audioModelSelect.value = getDefaultAudioModelId(models);
            audioModelSelect.disabled = false;
            populateVoices(getSelectedModel());
            updateModelSummary();
        } catch (err) {
            console.error('[models] Failed to load audio models:', err);
            audioModelSelect.innerHTML = '<option value="qwen-tts">qwen-tts (fallback)</option>';
            audioModels = [{
                id: 'qwen-tts',
                type: 'speech',
                description: 'Fallback model metadata unavailable.',
                pricing: null,
                priceLabel: 'Pricing unavailable'
            }];
            audioModelSelect.disabled = false;
            populateVoices(audioModels[0]);
            updateModelSummary();
        }
    }

    audioModelSelect.addEventListener('change', () => {
        populateVoices(getSelectedModel());
        updateModelSummary();
    });

    function populateLanguages() {
        Object.entries(languages).forEach(([code, name]) => {
            const option = document.createElement('option');
            option.value = code;
            option.textContent = name;
            if (code === 'en') option.selected = true;
            inputLanguageSelect.appendChild(option);

            const item = document.createElement('div');
            item.className = 'checkbox-item';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `lang-${code}`;
            checkbox.value = code;
            if (code === 'en') checkbox.checked = true;
            const label = document.createElement('label');
            label.htmlFor = `lang-${code}`;
            label.textContent = name;
            item.appendChild(checkbox);
            item.appendChild(label);
            outputLanguagesContainer.appendChild(item);
        });
    }

    async function handleGeneration() {
        const text = textInput.value.trim();
        const inputLang = inputLanguageSelect.value;
        const selectedOutputLangs = Array.from(
            outputLanguagesContainer.querySelectorAll('input:checked')
        ).map(cb => cb.value);

        if (!text) {
            alert('Please enter some text to generate audio.');
            return;
        }
        if (selectedOutputLangs.length === 0) {
            alert('Please select at least one output language.');
            return;
        }

        loadingDiv.classList.remove('hidden');
        loadingDiv.classList.add('loading-active');
        resultsContainer.innerHTML = '';
        generateBtn.disabled = true;

        try {
            const langsToTranslate = selectedOutputLangs.filter(l => l !== inputLang);
            const allLangsToOutput = [...new Set([inputLang, ...selectedOutputLangs])];
            const textsToSynthesize = { [inputLang]: text };

            if (langsToTranslate.length > 0) {
                const translations = await generateText([
                    {
                        role: 'system',
                        content: `You are a translation assistant. Translate the provided text into each requested language.
Respond ONLY with a JSON object where keys are BCP-47 language codes and values are the translated text.
The translated text must be pure target-language text without romanization, pronunciation guides, or explanations.
Example input: text="Hello world", from="en", to=["es","fr","ja"]
Example output: {"es":"Hola mundo","fr":"Bonjour le monde","ja":"こんにちは世界"}`
                    },
                    {
                        role: 'user',
                        content: `Translate the following text into the specified languages.
Text: "${text}"
Original Language: ${languages[inputLang]} (${inputLang})
Target Languages: ${langsToTranslate.map(l => `${languages[l]} (${l})`).join(', ')}`
                    }
                ]);
                Object.assign(textsToSynthesize, translations);
            }

            const modelId = audioModelSelect.value;
            const model = getSelectedModel();
            const voice = voiceSelect.value || '';
            for (const lang of allLangsToOutput) {
                const textToSpeak = textsToSynthesize[lang];
                if (textToSpeak) {
                    await displayAudioResult(lang, textToSpeak, voice, modelId, model);
                }
            }

        } catch (error) {
            console.error('Error generating voices:', error);
            resultsContainer.innerHTML = `<p class="error-msg">Error: ${error.message}. Check the console for details.</p>`;
        } finally {
            loadingDiv.classList.add('hidden');
            loadingDiv.classList.remove('loading-active');
            generateBtn.disabled = false;
        }
    }

    async function displayAudioResult(lang, text, voice, modelId, model) {
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';
        resultItem.innerHTML = `
            <h3>${languages[lang]}</h3>
            <p class="result-text">"${text}"</p>
        `;

        if (model?.pricing) {
            const estimate = estimateAudioCost(text, model.pricing, 1);
            if (estimate) {
                const estimateMeta = document.createElement('p');
                estimateMeta.className = 'result-meta';
                estimateMeta.textContent = `Estimated cost: ${formatPollenAmount(estimate.total)} pollen`;
                resultItem.appendChild(estimateMeta);
            }
        }

        try {
            const audioUrl = await fetchAudioBlob(text, voice, modelId);
            const audio = document.createElement('audio');
            audio.controls = true;
            audio.src = audioUrl;
            resultItem.appendChild(audio);
        } catch (error) {
            const errorMessage = document.createElement('p');
            errorMessage.className = 'error-msg';
            errorMessage.textContent = `Audio generation failed: ${error.message}`;
            resultItem.appendChild(errorMessage);
        }

        resultsContainer.appendChild(resultItem);
    }

    generateBtn.addEventListener('click', handleGeneration);
    textInput.addEventListener('input', updateEstimateSummary);
    inputLanguageSelect.addEventListener('change', updateEstimateSummary);
    outputLanguagesContainer.addEventListener('change', updateEstimateSummary);
    populateLanguages();
    loadBalance();
    loadAudioModels();
});
