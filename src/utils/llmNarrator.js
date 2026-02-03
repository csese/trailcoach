const LLM_ENDPOINT = import.meta.env.VITE_LLM_ENDPOINT
const LLM_API_KEY = import.meta.env.VITE_LLM_API_KEY
const LLM_MODEL = import.meta.env.VITE_LLM_MODEL
const LLM_PROVIDER = import.meta.env.VITE_LLM_PROVIDER || 'openrouter'

function extractJson(content) {
  if (!content) return null
  let cleaned = content.trim()
  cleaned = cleaned.replace(/^```json/i, '').replace(/^```/i, '')
  cleaned = cleaned.replace(/```$/i, '').trim()

  const match = cleaned.match(/\{[\s\S]*\}/)
  if (match) {
    cleaned = match[0]
  }

  try {
    return JSON.parse(cleaned)
  } catch (error) {
    console.warn('Failed to parse LLM JSON response:', error)
    return null
  }
}

function buildOpenRouterPayload(payload) {
  const systemPrompt = `You are an expert trail running coach.\n\nRewrite the adaptation summary and each change reason in clear, concise language.\nReturn ONLY valid JSON with this shape:\n{\n  "summary": "string",\n  "changes": [\n    {"id": "string", "workoutId": "string", "reasonText": "string"}\n  ]\n}\n\nRules:\n- Do not add or remove changes.\n- Keep the same id/workoutId pairs.\n- Keep explanations under 20 words per change.\n- Preserve safety intent (recovery, pain, load spikes, missed key workouts).`

  const userPrompt = {
    summary: payload.summary,
    signals: payload.signals,
    changes: payload.changes.map(change => ({
      id: change.id,
      workoutId: change.workoutId,
      reasonText: change.reasonText,
      from: change.from,
      to: change.to
    }))
  }

  return {
    model: LLM_MODEL,
    temperature: 0.2,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(userPrompt) }
    ]
  }
}

export async function enhanceAdaptationNarrative(payload) {
  if (!LLM_ENDPOINT || !LLM_API_KEY || !LLM_MODEL) return payload
  if (LLM_PROVIDER !== 'openrouter') return payload

  try {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_API_KEY}`,
      'X-Title': 'TrailCoach'
    }

    if (typeof window !== 'undefined') {
      headers['HTTP-Referer'] = window.location.origin
    }

    const response = await fetch(LLM_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildOpenRouterPayload(payload))
    })

    if (!response.ok) {
      throw new Error('LLM request failed')
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content
    const parsed = extractJson(content)

    if (!parsed?.summary || !Array.isArray(parsed?.changes)) {
      return payload
    }

    return {
      summary: parsed.summary,
      changes: parsed.changes,
      signals: payload.signals
    }
  } catch (error) {
    console.warn('LLM narrative enhancement failed:', error)
    return payload
  }
}
