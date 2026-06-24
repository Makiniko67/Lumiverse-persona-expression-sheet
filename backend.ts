declare const spindle: import('lumiverse-spindle-types').SpindleAPI

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

interface ExpressionSlot {
  imageId: string
  url: string
  label: string
}

interface PersonaExpressionData {
  activeLabel: string | null
  labels: string[] // ordered; includes labels that don't have an image yet
  slots: Record<string, ExpressionSlot>
}

interface StoreShape {
  personas: Record<string, PersonaExpressionData>
}

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

const STORE_KEY = 'expressions.json'

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
]

// Lightweight keyword heuristic used to auto-detect a mood from the
// persona's own outgoing message. Intentionally simple — no LLM call,
// no extra permission, just a substring scan over a small lexicon.
const MOOD_KEYWORDS: Record<string, string[]> = {
  happy: ['happy', 'glad', 'smil', 'laugh', 'grin', 'delight', 'cheerful', 'giggl'],
  sad: ['sad', 'cry', 'cries', 'tear', 'upset', 'heartbroken', 'sorrow', 'sob'],
  angry: ['angry', 'furious', 'mad', 'glare', 'scowl', 'irritat', 'annoyed'],
  surprised: ['surpris', 'shock', 'gasp', 'startl', 'stunned', 'whoa'],
  embarrassed: ['blush', 'embarrass', 'flustered', 'awkward'],
  smug: ['smug', 'smirk', 'satisf'],
  sleepy: ['yawn', 'sleepy', 'tired', 'drowsy'],
  confused: ['confus', 'puzzl', 'huh?', "what?"],
  scared: ['scared', 'afraid', 'terrified', 'frighten', 'fear'],
}

// ──────────────────────────────────────────────────────────────────────────
// Storage helpers
// ──────────────────────────────────────────────────────────────────────────

async function loadStore(): Promise<StoreShape> {
  return spindle.storage.getJson<StoreShape>(STORE_KEY, { fallback: { personas: {} } })
}

async function saveStore(store: StoreShape): Promise<void> {
  await spindle.storage.setJson(STORE_KEY, store, { indent: 2 })
}

function ensurePersona(store: StoreShape, personaId: string): PersonaExpressionData {
  if (!store.personas[personaId]) {
    store.personas[personaId] = {
      activeLabel: null,
      labels: [...DEFAULT_LABELS],
      slots: {},
    }
  }
  return store.personas[personaId]
}

// ──────────────────────────────────────────────────────────────────────────
// Active persona tracking
// ──────────────────────────────────────────────────────────────────────────

let activePersonaId: string | null = null
let permissionsOk = false

async function refreshActivePersona(): Promise<void> {
  if (!spindle.permissions.has('personas')) {
    activePersonaId = null
    permissionsOk = false
    return
  }
  permissionsOk = true
  try {
    const active = await spindle.personas.getActive()
    activePersonaId = active?.id ?? null
  } catch (err: any) {
    spindle.log.warn(`[persona_expression_sheet] Could not read active persona: ${err?.message ?? err}`)
    activePersonaId = null
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Frontend messaging
// ──────────────────────────────────────────────────────────────────────────

async function sendPersonaState(userId?: string): Promise<void> {
  if (!permissionsOk) {
    spindle.sendToFrontend({ type: 'state', personaId: null, personaName: null, data: null, permissionsMissing: true }, userId)
    return
  }

  let personaName: string | null = null
  if (activePersonaId) {
    try {
      const persona = await spindle.personas.get(activePersonaId)
      personaName = persona?.name ?? null
    } catch {
      // ignore — name is cosmetic only
    }
  }

  const store = await loadStore()
  const data = activePersonaId ? ensurePersona(store, activePersonaId) : null

  spindle.sendToFrontend(
    {
      type: 'state',
      personaId: activePersonaId,
      personaName,
      data,
      permissionsMissing: false,
    },
    userId,
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Mood detection
// ──────────────────────────────────────────────────────────────────────────

function detectLabel(content: string, availableLabels: string[]): string | null {
  const text = content.toLowerCase()
  let best: { label: string; score: number } | null = null

  for (const label of availableLabels) {
    const keywords = MOOD_KEYWORDS[label]
    if (!keywords) continue

    let score = 0
    for (const kw of keywords) {
      if (text.includes(kw)) score++
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { label, score }
    }
  }

  return best?.label ?? null
}

// ──────────────────────────────────────────────────────────────────────────
// Host event wiring
// ──────────────────────────────────────────────────────────────────────────

spindle.on('PERSONA_CHANGED', async () => {
  await refreshActivePersona()
  await sendPersonaState()
})

spindle.permissions.onChanged(async ({ permission, granted }) => {
  if (permission === 'personas' || permission === 'images') {
    await refreshActivePersona()
    await sendPersonaState()
    if (granted) {
      spindle.toast.success('Persona Expression Sheet: permission granted.')
    }
  }
})

spindle.on('MESSAGE_SENT', async (payload: any) => {
  if (!permissionsOk || !activePersonaId) return

  const message = payload?.message
  if (!message || message.role !== 'user' || typeof message.content !== 'string') return

  const store = await loadStore()
  const persona = ensurePersona(store, activePersonaId)
  const availableLabels = Object.keys(persona.slots)
  if (availableLabels.length === 0) return

  const detected = detectLabel(message.content, availableLabels)
  if (detected && detected !== persona.activeLabel) {
    persona.activeLabel = detected
    await saveStore(store)
    spindle.sendToFrontend({
      type: 'active_changed',
      personaId: activePersonaId,
      label: detected,
      slot: persona.slots[detected],
    })
  }
})

// ──────────────────────────────────────────────────────────────────────────
// Frontend RPC
// ──────────────────────────────────────────────────────────────────────────

spindle.onFrontendMessage(async (payload: any, userId) => {
  try {
    switch (payload?.type) {
      case 'get_state': {
        await refreshActivePersona()
        await sendPersonaState(userId)
        break
      }

      case 'add_label': {
        if (!activePersonaId) return
        const label = String(payload.label || '')
          .trim()
          .toLowerCase()
          .slice(0, 32)
        if (!label) return

        const store = await loadStore()
        const persona = ensurePersona(store, activePersonaId)
        if (!persona.labels.includes(label)) {
          persona.labels.push(label)
          await saveStore(store)
        }
        await sendPersonaState(userId)
        break
      }

      case 'remove_label': {
        if (!activePersonaId) return
        const label = payload.label as string
        const store = await loadStore()
        const persona = ensurePersona(store, activePersonaId)

        const slot = persona.slots[label]
        if (slot) {
          try {
            await spindle.images.delete(slot.imageId)
          } catch (err: any) {
            spindle.log.warn(`[persona_expression_sheet] Failed to delete image ${slot.imageId}: ${err?.message ?? err}`)
          }
          delete persona.slots[label]
        }

        persona.labels = persona.labels.filter((l) => l !== label)
        if (persona.activeLabel === label) persona.activeLabel = null

        await saveStore(store)
        await sendPersonaState(userId)
        break
      }

      case 'upload_expression': {
        if (!activePersonaId) return
        if (!spindle.permissions.has('images')) {
          spindle.toast.warning('Enable the "Images" permission for Persona Expression Sheet in the Extensions panel.')
          return
        }

        const { label, filename, mimeType, bytesBase64 } = payload as {
          label: string
          filename?: string
          mimeType?: string
          bytesBase64: string
        }
        if (!label || !bytesBase64) return

        const bytes = Buffer.from(bytesBase64, 'base64')
        const uploaded = await spindle.images.upload({
          data: bytes,
          filename: filename || `${label}.png`,
          mime_type: mimeType || 'image/png',
        })

        const store = await loadStore()
        const persona = ensurePersona(store, activePersonaId)

        // Replace any previous image for this label so we don't leak orphans.
        const previous = persona.slots[label]
        if (previous && previous.imageId !== uploaded.id) {
          try {
            await spindle.images.delete(previous.imageId)
          } catch {
            // non-fatal
          }
        }

        persona.slots[label] = { imageId: uploaded.id, url: uploaded.url, label }
        if (!persona.labels.includes(label)) persona.labels.push(label)
        if (!persona.activeLabel) persona.activeLabel = label

        await saveStore(store)
        await sendPersonaState(userId)
        spindle.toast.success(`Saved "${label}" expression.`)
        break
      }

      case 'set_active': {
        if (!activePersonaId) return
        const label = payload.label as string
        const store = await loadStore()
        const persona = ensurePersona(store, activePersonaId)

        if (persona.slots[label]) {
          persona.activeLabel = label
          await saveStore(store)
          spindle.sendToFrontend(
            {
              type: 'active_changed',
              personaId: activePersonaId,
              label,
              slot: persona.slots[label],
            },
            userId,
          )
        }
        break
      }

      default:
        break
    }
  } catch (err: any) {
    spindle.log.error(`[persona_expression_sheet] ${err?.message ?? err}`)
    spindle.toast.error('Persona Expression Sheet: something went wrong. Check the server log.')
  }
})

// ──────────────────────────────────────────────────────────────────────────
// Boot
// ──────────────────────────────────────────────────────────────────────────

void (async () => {
  await refreshActivePersona()
  spindle.log.info('[persona_expression_sheet] Backend ready.')
})()
