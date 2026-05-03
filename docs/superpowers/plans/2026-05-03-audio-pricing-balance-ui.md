# Audio Pricing & Balance UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add official Pollinations audio pricing, current balance, and estimated generation cost to the UI.

**Architecture:** Fetch detailed model metadata from `/audio/models`, map pricing into a small normalized shape in `api.js`, and let `script.js` render a compact summary panel plus per-result estimates. Keep balance fetching optional so the page still works without an account-enabled key.

**Tech Stack:** Vanilla JS, Fetch API, Node test runner

---

### Task 1: Extend API helpers for pricing and balance

**Files:**
- Modify: `api.js`
- Test: `tests/api.test.js`

- [ ] **Step 1: Write failing tests**

```js
test('fetchAudioModels returns detailed pricing metadata from /audio/models', async () => {});
test('fetchAccountBalance returns numeric balance when authorized', async () => {});
test('estimateAudioCost uses text length for audio token priced models', () => {});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because new exports do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
export async function fetchAccountBalance() {}
export function estimateAudioCost(text, pricing, itemCount = 1) {}
export function formatPriceLabel(pricing) {}
export function formatPollenAmount(value) {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS for new API helper coverage.

### Task 2: Add pricing summary UI

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `script.js`

- [ ] **Step 1: Add summary markup**

```html
<section class="cost-summary" id="cost-summary">
  <div class="summary-card">...</div>
</section>
```

- [ ] **Step 2: Render model price, balance, and estimated total**

```js
function updateEstimateSummary() {}
function updateModelSummary() {}
async function loadBalance() {}
```

- [ ] **Step 3: Wire summary updates to user input**

```js
textInput.addEventListener('input', updateEstimateSummary);
inputLanguageSelect.addEventListener('change', updateEstimateSummary);
outputLanguagesContainer.addEventListener('change', updateEstimateSummary);
audioModelSelect.addEventListener('change', () => {
  populateVoices(audioModelSelect.value);
  updateModelSummary();
});
```

- [ ] **Step 4: Show per-result estimate**

```js
const estimate = estimateAudioCost(text, model.pricing, 1);
estimateMeta.textContent = `Estimated cost: ${formatPollenAmount(estimate.total)} pollen`;
```

- [ ] **Step 5: Run verification**

Run: `node --check script.js && node --check api.js && npm test`
Expected: no syntax errors, tests pass.
