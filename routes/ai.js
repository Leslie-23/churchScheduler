const router = require("express").Router();
const { Member, Service, Assignment, Unavailability, getUnitPositionTypes } = require("../database");
const { requireRole } = require("../middleware");
const Groq = require("groq-sdk");

function getGroqClient() {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  return new Groq({ apiKey: key });
}

router.get("/status", (_req, res) => {
  res.json({ enabled: !!process.env.GROQ_API_KEY });
});

router.post("/report", requireRole("owner", "admin"), async (req, res) => {
  const groq = getGroqClient();
  if (!groq) return res.status(400).json({ error: "GROQ_API_KEY not set" });

  const { question } = req.body;
  if (!question) return res.status(400).json({ error: "Question is required" });

  const unitId = req.unit._id;

  const [members, services, unavails] = await Promise.all([
    Member.find({ unit: unitId }).lean(),
    Service.find({ unit: unitId }).sort({ date: -1 }).limit(20).lean(),
    Unavailability.find({ unit: unitId }).populate("member").lean(),
  ]);

  const unitAssignments = await Assignment.find({ service: { $in: services.map((s) => s._id) } })
    .populate("member")
    .populate("service")
    .lean();

  const memberSummary = members.map((m) => ({
    name: m.name, gender: m.gender, has_suit: m.has_suit, active: m.active,
    skills: m.skills.map((s) => `${s.position_type}:${s.rating}`).join(", "),
  }));

  const assignmentsByMember = {};
  for (const a of unitAssignments) {
    if (!a.member) continue;
    const name = a.member.name;
    if (!assignmentsByMember[name]) assignmentsByMember[name] = [];
    assignmentsByMember[name].push({ date: a.service.date, position: a.position_type, type: a.service.service_type });
  }

  const serviceSummary = services.map((s) => ({
    date: s.date, type: s.service_type, name: s.name, status: s.status,
  }));

  const unavailSummary = unavails.filter((u) => u.member).map((u) => ({
    member: u.member.name, date: u.date, reason: u.reason,
  }));

  const positionTypes = getUnitPositionTypes(req.unit);
  const context = `You are an AI assistant for a church service unit scheduling tool called Stewardly.
Your role is to analyze scheduling data and provide useful reports.

POSITION TYPES: ${Object.entries(positionTypes).map(([k, v]) => `${k} (${v.label} — ${v.description}, requires suit: ${v.requiresSuit}, requires male: ${v.requiresMale})`).join("; ")}

MEMBERS (${members.length} total):
${JSON.stringify(memberSummary, null, 1)}

ASSIGNMENT HISTORY BY MEMBER:
${JSON.stringify(assignmentsByMember, null, 1)}

RECENT SERVICES:
${JSON.stringify(serviceSummary, null, 1)}

UNAVAILABILITIES:
${JSON.stringify(unavailSummary, null, 1)}

Guidelines:
- Be concise and direct. Use short paragraphs.
- When listing people, use bullet points.
- Reference actual data — don't guess.
- If asked about workload, count assignments per member.
- If asked for recommendations, factor in skills, rotation fairness, and suit availability.
- Format numbers and dates clearly.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: context },
        { role: "user", content: question },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    });

    res.json({ answer: completion.choices[0]?.message?.content || "No response." });
  } catch (e) {
    console.error("Groq error:", e.message);
    res.status(500).json({ error: "AI request failed: " + e.message });
  }
});

module.exports = router;
