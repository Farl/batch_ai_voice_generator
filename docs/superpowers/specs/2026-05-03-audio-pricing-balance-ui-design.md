# Audio Pricing & Balance UI Design

## Goal

Show Pollinations audio model pricing and current balance in the generator UI before users create audio, and surface per-result estimated cost after generation.

## Chosen Approach

Use Pollinations detailed audio model metadata from `/audio/models` to populate the model selector with official pricing labels. Show a compact summary panel beneath the model/voice controls with:

- Current balance from `/account/balance`
- Official price for the selected model
- Estimated total cost based on the current input text and selected output languages

Keep result cards lightweight by showing only the estimated cost for that specific generated clip.

## Data Flow

1. On page load, fetch `/audio/models` and map each model to `{ id, type, description, pricing, priceLabel }`.
2. On page load, attempt `/account/balance` if an API key is configured.
3. When text, input language, output languages, or selected model changes, recompute the estimate.
4. During generation, compute a single-item estimate for each result card and show it above the player.

## Error Handling

- If `/account/balance` is unavailable because no key is configured or the key lacks permission, show `Balance unavailable`.
- If model pricing metadata is missing, show `Pricing unavailable` and suppress estimates.
- Audio playback errors continue to render inline per result card.

## Estimation Rules

- Token-priced audio models use input text length as a lightweight estimate for audio token count.
- Second-priced audio models use a conservative text-length heuristic and are labeled as estimates in the UI.
- All estimates are presented as approximate pollen totals, not exact billing outcomes.

## UI Notes

- Put global pricing/balance information above language selection to support pre-generation decision-making.
- Keep result cards focused: generated text, estimated cost, player or inline error.
