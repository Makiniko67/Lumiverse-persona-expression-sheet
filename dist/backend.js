"use strict";
const MIN_WIDGET_SIZE = 48;
const MAX_WIDGET_SIZE = 200;
const DEFAULT_WIDGET_SIZE = 96;
function clampWidgetSize(size) {
    const n = typeof size === 'number' && Number.isFinite(size) ? size : DEFAULT_WIDGET_SIZE;
    return Math.min(MAX_WIDGET_SIZE, Math.max(MIN_WIDGET_SIZE, Math.round(n)));
}
// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────
const STORE_KEY = 'expressions.json';
const DEFAULT_LABELS = [
    'neutral',
    'happy',
    'sad',
    'angry',
    'surprised',
    'embarrassed',
    'smug',
    'sleepy',
    'confused',
    'scared',
];
// Lightweight keyword heuristic used to auto-detect a mood from the
// persona's own outgoing message. Intentionally simple — no LLM call,
// no extra permission, just a substring scan over a small lexicon.
const MOOD_KEYWORDS = {
    happy: ['happy', 'glad', 'smil', 'laugh', 'grin', 'delight', 'cheerful', 'giggl'],
    sad: ['sad', 'cry', 'cries', 'tear', 'upset', 'heartbroken', 'sorrow', 'sob'],
    angry: ['angry', 'furious', 'mad', 'glare', 'scowl', 'irritat', 'annoyed'],
    surprised: ['surpris', 'shock', 'gasp', 'startl', 'stunned', 'whoa'],
    embarrassed: ['blush', 'embarrass', 'flustered', 'awkward'],
    smug: ['smug', 'smirk', 'satisf'],
    sleepy: ['yawn', 'sleepy', 'tired', 'drowsy'],
    confused: ['confus', 'puzzl', 'huh?', "what?"],
    scared: ['scared', 'afraid', 'terrified', 'frighten', 'fear'],
};
// MESSAGE_SENT doesn't carry a userId (see notes below), so we keep a
// best-effort "who last talked to us" cache, refreshed by every RPC call
// that *does* carry one. Correct for a single-operator instance (the
// common self-host case). On a true multi-user instance this could
// attribute a mood-swap to the wrong user if two people message at the
// same instant — there's currently no way to avoid that from inside an
// operator-scoped extension, since the event payload itself has no
// per-user identity on it.
let lastKnownUserId;
// ──────────────────────────────────────────────────────────────────────────
// Storage helpers (per-user — required so operator-scoped installs don't
// share one expression sheet across every account on the instance)
// ──────────────────────────────────────────────────────────────────────────
async function loadStore(userId) {
    return spindle.userStorage.getJson(STORE_KEY, { fallback: { personas: {} }, userId });
}
async function saveStore(store, userId) {
    await spindle.userStorage.setJson(STORE_KEY, store, { indent: 2, userId });
}
function ensurePersona(store, personaId) {
    if (!store.personas[personaId]) {
        store.personas[personaId] = {
            activeLabel: null,
            labels: [...DEFAULT_LABELS],
            slots: {},
        };
    }
    return store.personas[personaId];
}
// ──────────────────────────────────────────────────────────────────────────
// Active persona resolution (per-request, scoped to whichever user asked —
// no module-level cache, since "the" active persona doesn't mean anything
// shared across users on an operator-scoped install)
// ──────────────────────────────────────────────────────────────────────────
async function getActivePersonaId(userId) {
    if (!spindle.permissions.has('personas'))
        return null;
    try {
        const active = await spindle.personas.getActive(userId);
        return active?.id ?? null;
    }
    catch (err) {
        spindle.log.warn(`[persona_expression_sheet] Could not read active persona: ${err?.message ?? err}`);
        return null;
    }
}
// ──────────────────────────────────────────────────────────────────────────
// Frontend messaging
// ──────────────────────────────────────────────────────────────────────────
async function sendPersonaState(userId) {
    if (!spindle.permissions.has('personas')) {
        spindle.sendToFrontend({ type: 'state', personaId: null, personaName: null, data: null, widgetSize: DEFAULT_WIDGET_SIZE, permissionsMissing: true }, userId);
        return;
    }
    const personaId = await getActivePersonaId(userId);
    let personaName = null;
    if (personaId) {
        try {
            const persona = await spindle.personas.get(personaId, userId);
            personaName = persona?.name ?? null;
        }
        catch {
            // ignore — name is cosmetic only
        }
    }
    const store = await loadStore(userId);
    const data = personaId ? ensurePersona(store, personaId) : null;
    spindle.sendToFrontend({
        type: 'state',
        personaId,
        personaName,
        data,
        widgetSize: clampWidgetSize(store.widgetSize),
        permissionsMissing: false,
    }, userId);
}
// ──────────────────────────────────────────────────────────────────────────
// Mood detection
// ──────────────────────────────────────────────────────────────────────────
function detectLabel(content, availableLabels) {
    const text = content.toLowerCase();
    let best = null;
    for (const label of availableLabels) {
        const keywords = MOOD_KEYWORDS[label];
        if (!keywords)
            continue;
        let score = 0;
        for (const kw of keywords) {
            if (text.includes(kw))
                score++;
        }
        if (score > 0 && (!best || score > best.score)) {
            best = { label, score };
        }
    }
    return best?.label ?? null;
}
// ──────────────────────────────────────────────────────────────────────────
// Macro exposure — pushes the persona's current expression label out as
// {{personaExpression}}, so any preset (including Sovereign Hand-driven
// ones like Lucid Loom) can reference it if the prompt author chooses to.
// This is the only real integration point available: Sovereign Hand is a
// host-level prompt-assembly feature with no extension hook, so the most
// an extension can do is make its data available as a macro for presets
// to opt into — it can't reach into Sovereign Hand's behavior directly.
//
// Caveat: registerMacro/updateMacroValue have no userId concept — it's a
// single cached value used by whichever generation runs next, host-wide.
// Same single-operator assumption as the MESSAGE_SENT handler above.
// ──────────────────────────────────────────────────────────────────────────
async function pushExpressionMacro(userId) {
    if (!userId)
        return;
    try {
        const personaId = await getActivePersonaId(userId);
        if (!personaId) {
            spindle.updateMacroValue('personaExpression', '');
            return;
        }
        const store = await loadStore(userId);
        const persona = ensurePersona(store, personaId);
        spindle.updateMacroValue('personaExpression', persona.activeLabel ?? '');
    }
    catch {
        // best-effort only — never let macro bookkeeping break the main flow
    }
}
// ──────────────────────────────────────────────────────────────────────────
// Host event wiring
// ──────────────────────────────────────────────────────────────────────────
// PERSONA_CHANGED's payload is just `{ persona }` — no userId — so we can't
// resolve which user's data to refresh server-side. Instead, ping every
// connected frontend to re-pull its own state; each frontend's RPC call
// carries its own real userId, so the round trip resolves correctly even
// though this broadcast doesn't know who's who.
spindle.on('PERSONA_CHANGED', async () => {
    spindle.sendToFrontend({ type: 'refetch' });
    await pushExpressionMacro(lastKnownUserId);
});
spindle.permissions.onChanged(async ({ permission, granted }) => {
    if (permission === 'personas' || permission === 'images') {
        if (granted)
            spindle.toast.success('Persona Expression Sheet: permission granted.');
        spindle.sendToFrontend({ type: 'refetch' });
        await pushExpressionMacro(lastKnownUserId);
    }
});
spindle.on('MESSAGE_SENT', async (payload) => {
    const message = payload?.message;
    if (!message || message.role !== 'user' || typeof message.content !== 'string')
        return;
    if (!lastKnownUserId)
        return; // never heard from a frontend yet — nothing to attribute this to
    const userId = lastKnownUserId;
    const personaId = await getActivePersonaId(userId);
    if (!personaId)
        return;
    const store = await loadStore(userId);
    const persona = ensurePersona(store, personaId);
    const availableLabels = Object.keys(persona.slots);
    if (availableLabels.length === 0)
        return;
    const detected = detectLabel(message.content, availableLabels);
    if (detected && detected !== persona.activeLabel) {
        persona.activeLabel = detected;
        await saveStore(store, userId);
        await pushExpressionMacro(userId);
        spindle.sendToFrontend({
            type: 'active_changed',
            personaId,
            label: detected,
            slot: persona.slots[detected],
        }, userId);
    }
});
// ──────────────────────────────────────────────────────────────────────────
// Frontend RPC
// ──────────────────────────────────────────────────────────────────────────
spindle.onFrontendMessage(async (payload, userId) => {
    lastKnownUserId = userId;
    try {
        switch (payload?.type) {
            case 'get_state': {
                await sendPersonaState(userId);
                break;
            }
            case 'add_label': {
                const personaId = await getActivePersonaId(userId);
                if (!personaId)
                    return;
                const label = String(payload.label || '')
                    .trim()
                    .toLowerCase()
                    .slice(0, 32);
                if (!label)
                    return;
                const store = await loadStore(userId);
                const persona = ensurePersona(store, personaId);
                if (!persona.labels.includes(label)) {
                    persona.labels.push(label);
                    await saveStore(store, userId);
                }
                await sendPersonaState(userId);
                break;
            }
            case 'remove_label': {
                const personaId = await getActivePersonaId(userId);
                if (!personaId)
                    return;
                const label = payload.label;
                const store = await loadStore(userId);
                const persona = ensurePersona(store, personaId);
                const slot = persona.slots[label];
                if (slot) {
                    try {
                        await spindle.images.delete(slot.imageId, userId);
                    }
                    catch (err) {
                        spindle.log.warn(`[persona_expression_sheet] Failed to delete image ${slot.imageId}: ${err?.message ?? err}`);
                    }
                    delete persona.slots[label];
                }
                persona.labels = persona.labels.filter((l) => l !== label);
                if (persona.activeLabel === label)
                    persona.activeLabel = null;
                await saveStore(store, userId);
                await sendPersonaState(userId);
                break;
            }
            case 'upload_expression': {
                const personaId = await getActivePersonaId(userId);
                if (!personaId)
                    return;
                if (!spindle.permissions.has('images')) {
                    spindle.toast.warning('Enable the "Images" permission for Persona Expression Sheet in the Extensions panel.');
                    return;
                }
                const { label, filename, mimeType, bytesBase64 } = payload;
                if (!label || !bytesBase64)
                    return;
                const bytes = Buffer.from(bytesBase64, 'base64');
                const uploaded = await spindle.images.upload({
                    data: bytes,
                    filename: filename || `${label}.png`,
                    mime_type: mimeType || 'image/png',
                    userId,
                }, userId);
                const store = await loadStore(userId);
                const persona = ensurePersona(store, personaId);
                // Replace any previous image for this label so we don't leak orphans.
                const previous = persona.slots[label];
                if (previous && previous.imageId !== uploaded.id) {
                    try {
                        await spindle.images.delete(previous.imageId, userId);
                    }
                    catch {
                        // non-fatal
                    }
                }
                persona.slots[label] = { imageId: uploaded.id, url: uploaded.url, label };
                if (!persona.labels.includes(label))
                    persona.labels.push(label);
                if (!persona.activeLabel)
                    persona.activeLabel = label;
                await saveStore(store, userId);
                await pushExpressionMacro(userId);
                await sendPersonaState(userId);
                spindle.toast.success(`Saved "${label}" expression.`);
                break;
            }
            case 'set_active': {
                const personaId = await getActivePersonaId(userId);
                if (!personaId)
                    return;
                const label = payload.label;
                const store = await loadStore(userId);
                const persona = ensurePersona(store, personaId);
                if (persona.slots[label]) {
                    persona.activeLabel = label;
                    await saveStore(store, userId);
                    await pushExpressionMacro(userId);
                    spindle.sendToFrontend({
                        type: 'active_changed',
                        personaId,
                        label,
                        slot: persona.slots[label],
                    }, userId);
                }
                break;
            }
            case 'set_widget_size': {
                const store = await loadStore(userId);
                store.widgetSize = clampWidgetSize(payload.size);
                await saveStore(store, userId);
                await sendPersonaState(userId);
                break;
            }
            default:
                break;
        }
    }
    catch (err) {
        spindle.log.error(`[persona_expression_sheet] ${err?.message ?? err}`);
        spindle.toast.error('Persona Expression Sheet: something went wrong. Check the server log.');
    }
});
// ──────────────────────────────────────────────────────────────────────────
// Boot
// ──────────────────────────────────────────────────────────────────────────
spindle.registerMacro({
    name: 'personaExpression',
    category: 'extension:persona_expression_sheet',
    description: "The active persona's current expression label (e.g. \"happy\"), or empty if none is set.",
    returnType: 'string',
    handler: '', // push model — see pushExpressionMacro()
});
spindle.log.info('[persona_expression_sheet] Backend ready.');
