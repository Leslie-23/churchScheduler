const router = require("express").Router();
const { Member, Service, Assignment } = require("../database");
const { requireRole } = require("../middleware");

const ARKESEL_API_KEY = process.env.ARKESEL_API_KEY;
const ARKESEL_SENDER = process.env.ARKESEL_SENDER_ID || "ChurchSch";

async function sendSMS(recipients, message) {
  if (!ARKESEL_API_KEY) throw new Error("ARKESEL_API_KEY not configured");

  const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": ARKESEL_API_KEY,
    },
    body: JSON.stringify({
      sender: ARKESEL_SENDER,
      message,
      recipients,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "SMS send failed");
  return data;
}

router.get("/status", (req, res) => {
  res.json({ enabled: !!ARKESEL_API_KEY });
});

router.post("/notify-service", requireRole("owner", "admin"), async (req, res) => {
  const { service_id } = req.body;
  if (!service_id) return res.status(400).json({ error: "service_id is required" });

  const service = await Service.findOne({ _id: service_id, unit: req.unit._id });
  if (!service) return res.status(404).json({ error: "Service not found" });

  const assignments = await Assignment.find({ service: service_id }).populate("member").lean();
  if (assignments.length === 0) return res.status(400).json({ error: "No assignments to notify" });

  const results = { sent: 0, skipped: 0, failed: 0, details: [] };

  const positionLabels = {
    DOOR: "Door", STANDING: "Standing", USHER: "Usher",
    OVERFLOW: "Overflow / Parking", ESCORT: "Preacher Escort", CHAIRS: "Chair Arrangement",
  };

  const d = new Date(service.date + "T00:00:00");
  const dateStr = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  for (const a of assignments) {
    const member = a.member;
    if (!member) continue;

    const phone = (member.phone || "").replace(/\s+/g, "").replace(/^0/, "233");
    if (!phone || phone.length < 9) {
      results.skipped++;
      results.details.push({ name: member.name, status: "skipped", reason: "No valid phone" });
      continue;
    }

    const position = positionLabels[a.position_type] || a.position_type;
    const message = `Hi ${member.name.split(" ")[0]}, you will be serving at ${position} on ${dateStr}. Ensure to be on time for our unit prayers. God bless!`;

    try {
      await sendSMS([phone], message);
      results.sent++;
      results.details.push({ name: member.name, status: "sent", phone });
    } catch (e) {
      results.failed++;
      results.details.push({ name: member.name, status: "failed", reason: e.message });
    }
  }

  res.json(results);
});

router.post("/broadcast", requireRole("owner", "admin"), async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: "Message is required" });

  const members = await Member.find({ unit: req.unit._id, active: true }).lean();
  if (members.length === 0) return res.status(400).json({ error: "No active members" });

  const recipients = [];
  const skipped = [];

  for (const m of members) {
    const phone = (m.phone || "").replace(/\s+/g, "").replace(/^0/, "233");
    if (phone && phone.length >= 9) {
      recipients.push(phone);
    } else {
      skipped.push(m.name);
    }
  }

  if (recipients.length === 0) return res.status(400).json({ error: "No members have valid phone numbers" });

  try {
    await sendSMS(recipients, message.trim());
    res.json({ sent: recipients.length, skipped: skipped.length, skipped_names: skipped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
