import { GoogleGenerativeAI } from "@google/generative-ai"

function toSentenceCase(text) {
  const value = String(text || "").trim()
  if (!value) return ""
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function fallbackBulletsFromDescription(description) {
  const source = String(description || "").replace(/\s+/g, " ").trim()
  if (!source) {
    return ["Contributed to day-to-day responsibilities and delivered assigned tasks on time."]
  }

  const chunks = source
    .split(/[.!?;]+/)
    .map((part) => toSentenceCase(part))
    .map((part) => part.trim())
    .filter(Boolean)

  if (chunks.length === 0) {
    return [toSentenceCase(source)]
  }

  return chunks.slice(0, 4).map((chunk) => (chunk.endsWith(".") ? chunk : `${chunk}.`))
}

function buildFallbackCvData({ basic_info, work_experience }) {
  const work_experience_enhanced = (Array.isArray(work_experience) ? work_experience : []).map((job, index) => ({
    job_index: index,
    bullets: fallbackBulletsFromDescription(job?.description_original ?? job?.description),
  }))

  const roleSummarySeed = (Array.isArray(work_experience) ? work_experience : [])
    .map((job) => String(job?.role || "").trim())
    .filter(Boolean)
    .slice(0, 2)

  return {
    professional_summary:
      roleSummarySeed.length > 0
        ? `${String(basic_info?.full_name || "Candidate").trim()} is a results-focused professional with experience in ${roleSummarySeed.join(" and ")}.`
        : `${String(basic_info?.full_name || "Candidate").trim()} is a results-focused professional with hands-on project experience.`,
    work_experience_enhanced,
    technical_skills: [],
    soft_skills: [],
  }
}

export async function generateCVWithAI({ basic_info, work_experience, education }) {
  const fallbackData = buildFallbackCvData({ basic_info, work_experience })
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) {
      return { success: true, data: fallbackData, fallback: true, warning: "Missing GOOGLE_AI_API_KEY" }
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

    const prompt = `
You are a professional CV writer.
Rewrite and enhance the provided candidate data into clean, ATS-friendly CV content.

Return VALID JSON ONLY.
Do not return markdown.
Do not include code fences.
Do not include any keys other than those requested.

Required JSON shape:
{
  "professional_summary": "string",
  "work_experience_enhanced": [
    {
      "job_index": 0,
      "bullets": ["string"]
    }
  ],
  "technical_skills": ["string"],
  "soft_skills": ["string"]
}

Candidate data:
${JSON.stringify({ basic_info, work_experience, education }, null, 2)}
`.trim()

    const result = await model.generateContent(prompt)
    const text = result.response.text()

    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim()

    let data
    try {
      data = JSON.parse(cleaned)
    } catch {
      return {
        success: true,
        data: fallbackData,
        fallback: true,
        warning: "Malformed AI JSON response, using fallback bullets.",
      }
    }

    if (!data || typeof data !== "object" || !Array.isArray(data.work_experience_enhanced)) {
      return {
        success: true,
        data: fallbackData,
        fallback: true,
        warning: "Incomplete AI response, using fallback bullets.",
      }
    }

    return { success: true, data }
  } catch (error) {
    return {
      success: true,
      data: fallbackData,
      fallback: true,
      warning: error instanceof Error ? error.message : "Failed to generate CV with AI",
    }
  }
}

