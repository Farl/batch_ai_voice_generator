import { generateText, buildSpeechUrl } from './api.js';

document.addEventListener('DOMContentLoaded', () => {
    const textInput = document.getElementById('text-input');
    const inputLanguageSelect = document.getElementById('input-language');
    const outputLanguagesContainer = document.getElementById('output-languages-container');
    const generateBtn = document.getElementById('generate-btn');
    const loadingDiv = document.getElementById('loading');
    const resultsContainer = document.getElementById('results-container');

    const languages = {
        'en': 'English', 'es': 'Spanish', 'fr': 'French',
        'de': 'German', 'it': 'Italian', 'pt': 'Portuguese',
        'hi': 'Hindi', 'ja': 'Japanese', 'zh': 'Chinese', 'ko': 'Korean'
    };

    // Gender → Pollinations TTS voice mapping
    // Male: onyx (deep), Female: nova (warm female)
    const VOICE_MAP = { male: 'onyx', female: 'nova' };

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
        const selectedGender = document.querySelector('input[name="gender"]:checked').value;
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

            const voice = VOICE_MAP[selectedGender] || 'nova';
            for (const lang of allLangsToOutput) {
                const textToSpeak = textsToSynthesize[lang];
                if (textToSpeak) {
                    displayAudioResult(lang, textToSpeak, voice);
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

    function displayAudioResult(lang, text, voice) {
        const audioUrl = buildSpeechUrl(text, voice);
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';
        resultItem.innerHTML = `
            <h3>${languages[lang]}</h3>
            <p class="result-text">"${text}"</p>
            <audio controls src="${audioUrl}"></audio>
        `;
        resultsContainer.appendChild(resultItem);
    }

    generateBtn.addEventListener('click', handleGeneration);
    populateLanguages();
});