import { ref } from 'vue'
import { buildCoachContext } from '@/utils/coachContext'
import { useWorkoutsStore } from '@/stores/workouts'
import { useLogsStore } from '@/stores/logs'
import { useAdaptationsStore } from '@/stores/adaptations'

const COACH_MODEL = import.meta.env.VITE_COACH_MODEL || 'anthropic/claude-opus-4-6'
const LLM_ENDPOINT = import.meta.env.VITE_LLM_ENDPOINT
const LLM_API_KEY = import.meta.env.VITE_LLM_API_KEY
const STORAGE_KEY = 'trailcoach-coach-messages'
const MAX_HISTORY = 20

export function useCoach() {
  const messages = ref([])
  const isStreaming = ref(false)
  const streamingContent = ref('')
  const error = ref(null)

  function loadMessages() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        messages.value = JSON.parse(stored)
      }
    } catch (e) {
      console.error('Failed to load coach messages:', e)
    }
  }

  function saveMessages() {
    try {
      const toSave = messages.value.slice(-100)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    } catch (e) {
      console.error('Failed to save coach messages:', e)
    }
  }

  function clearConversation() {
    messages.value = []
    saveMessages()
  }

  function buildSystemPrompt(context) {
    return `You are Coach, an elite trail running coach specializing in ultra-distance mountain races. You are coaching ${context.athlete.name}, who is preparing for ${context.athlete.goalRace.name} (${context.athlete.goalRace.date}, target: ${context.athlete.goalRace.target}).

COACHING PHILOSOPHY:
- Periodization-first: Base → Build → Specific → Taper. Every session serves the macro goal.
- Specificity wins ultras: train the exact demands — sustained climbing at Z2, technical downhill under fatigue, back-to-back long days, night running in final prep.
- HR zone discipline: easy days EASY (Z1-Z2), hard days HARD. Polarized ~80/20.
- Vertical is king: 1000m D+ matters more than 10km flat for mountain ultras.
- Back-to-back long runs are the #1 ultra-specific session: Saturday long + Sunday long teaches the body to perform on pre-fatigued legs.
- Downhill repeats are non-negotiable from Build phase: eccentric loading prevents quad destruction on race day.
- Strength training is mandatory: Bulgarian split squats, step-ups, single-leg work directly prevents late-race breakdown.
- TSB management: don't let Training Stress Balance stay below -20 for more than 2 weeks.
- Taper: 2-3 weeks, reduce volume 40-60%, maintain intensity.

RACE CALENDAR:
${JSON.stringify(context.races)}

CURRENT ATHLETE STATUS:
- Week ${context.athlete.currentWeek} of ${context.athlete.planTotalWeeks} | Phase: ${context.athlete.currentPhase}
- Weeks to goal race: ${context.athlete.weeksToGoalRace}
- Recent 4-week completion rate: ${Math.round(context.recentHistory.completionRate * 100)}%
- Avg RPE last 4 weeks: ${context.recentHistory.avgRpe?.toFixed(1) ?? 'N/A'}
- Leg feel trend: ${context.recentHistory.legFeelTrend}
- Load: ATL=${context.loadMetrics?.atl?.toFixed(0) ?? 'N/A'}, CTL=${context.loadMetrics?.ctl?.toFixed(0) ?? 'N/A'}, TSB=${context.loadMetrics?.tsb?.toFixed(0) ?? 'N/A'} (${context.loadMetrics?.trend ?? 'N/A'})

THIS WEEK'S SESSIONS:
${JSON.stringify(context.currentWeekSessions)}

UPCOMING 8 WEEKS:
${JSON.stringify(context.upcomingPlan)}

FULL PLAN STRUCTURE:
${JSON.stringify(context.planPhaseSummary)}

COMPLETED WORKOUTS (last 4 weeks):
${JSON.stringify(context.completedSummary)}

YOUR RESPONSE STYLE:
- Direct, specific, data-driven. Reference the athlete's actual numbers.
- Concise by default. Go deep only when asked.
- Encouraging but honest. Call out overtraining or under-recovery.
- Never give generic advice when you have specific data.

PLAN MODIFICATIONS:
When proposing changes to the training plan, include a structured block:
<plan_changes>
{"summary": "...", "changes": [{"workoutId": "workout-N", "field": "PlannedDuration|SessionType|TargetHRZone|Details|Focus|WorkoutDescription", "from": "...", "to": "...", "reason": "..."}]}
</plan_changes>
Rules: only future workouts, max 5 changes per response, always explain in plain text first.`
  }

  function parsePlanChanges(content) {
    const match = content.match(/<plan_changes>([\s\S]*?)<\/plan_changes>/)
    if (!match) return null
    try { return JSON.parse(match[1].trim()) } catch { return null }
  }

  function stripPlanChanges(content) {
    return content.replace(/<plan_changes>[\s\S]*?<\/plan_changes>/g, '').trim()
  }

  async function sendMessage(userText) {
    if (!userText.trim()) return
    error.value = null

    const userMsg = {
      role: 'user',
      content: userText.trim(),
      id: `msg-${Date.now()}`,
      timestamp: new Date().toISOString()
    }
    messages.value.push(userMsg)

    isStreaming.value = true
    streamingContent.value = ''

    try {
      const workoutsStore = useWorkoutsStore()
      const logsStore = useLogsStore()
      const adaptationsStore = useAdaptationsStore()

      const stravaTokens = localStorage.getItem('trailcoach-strava-tokens')
      const context = buildCoachContext({ workoutsStore, logsStore, adaptationsStore, stravaTokens })
      const systemPrompt = buildSystemPrompt(context)

      // Build API messages with history limit
      const historyMessages = messages.value.slice(-MAX_HISTORY * 2).map(m => ({
        role: m.role,
        content: m.content
      }))

      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...historyMessages
      ]

      const response = await fetch(LLM_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LLM_API_KEY}`,
          'X-Title': 'TrailCoach'
        },
        body: JSON.stringify({
          model: COACH_MODEL,
          stream: true,
          temperature: 0.7,
          max_tokens: 2048,
          messages: apiMessages
        })
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          const data = line.slice(6)
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            const token = parsed.choices?.[0]?.delta?.content || ''
            fullContent += token
            streamingContent.value = fullContent
          } catch {}
        }
      }

      const planChanges = parsePlanChanges(fullContent)
      const displayContent = stripPlanChanges(fullContent)

      const assistantMsg = {
        role: 'assistant',
        content: displayContent,
        id: `msg-${Date.now()}`,
        timestamp: new Date().toISOString(),
        planChanges: planChanges || undefined
      }
      messages.value.push(assistantMsg)
      saveMessages()
    } catch (e) {
      error.value = e.message || 'Failed to get response'
      console.error('Coach error:', e)
    } finally {
      isStreaming.value = false
      streamingContent.value = ''
    }
  }

  return { messages, isStreaming, streamingContent, error, sendMessage, clearConversation, loadMessages }
}
