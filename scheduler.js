const { Member, Service, Assignment, Unavailability, PositionCount, Unit, getUnitPositionTypes } = require("./database");

async function getEligibleMembers(date, positionType, unitId, positionTypes, serviceSlot) {
  const pos = positionTypes[positionType] || {};

  const unavailableIds = (await Unavailability.find({ date, unit: unitId })).map((u) => u.member);

  const filter = { active: true, unit: unitId, _id: { $nin: unavailableIds } };
  if (pos.requiresSuit) filter.has_suit = true;
  if (pos.requiresMale) filter.gender = "M";

  if (serviceSlot === 1) {
    filter.service_availability = { $in: ["both", "first_only"] };
  } else if (serviceSlot === 2) {
    filter.service_availability = { $in: ["both", "second_only"] };
  }

  const members = await Member.find(filter).lean();

  return members.map((m) => {
    const skill = m.skills.find((s) => s.position_type === positionType);
    return { ...m, skill_rating: skill ? skill.rating : 3 };
  });
}

async function getMemberStats(members, date, unitId) {
  const memberIds = members.map((m) => m._id);
  const stats = new Map(memberIds.map((id) => [id.toString(), {
    daysSinceAny: 999,
    daysSinceByPosition: {},
    attendanceRate: 1,
  }]));
  if (memberIds.length === 0) return stats;

  const history = await Assignment.find({ member: { $in: memberIds } })
    .populate("service")
    .sort({ _id: -1 })
    .lean();

  const targetDate = new Date(date + "T00:00:00Z");
  const recentAttendance = new Map();

  for (const a of history) {
    if (!a.service || a.service.unit.toString() !== unitId.toString()) continue;
    const memberId = a.member.toString();
    const stat = stats.get(memberId);
    if (!stat) continue;

    if (a.attendance && a.attendance !== "pending") {
      const recent = recentAttendance.get(memberId) || [];
      if (recent.length < 10) {
        recent.push(a.attendance);
        recentAttendance.set(memberId, recent);
      }
    }

    const serviceDate = new Date(a.service.date + "T00:00:00Z");
    if (serviceDate >= targetDate) continue;
    const days = (targetDate - serviceDate) / (1000 * 60 * 60 * 24);
    if (days < stat.daysSinceAny) stat.daysSinceAny = days;
    if (days < (stat.daysSinceByPosition[a.position_type] ?? 999)) {
      stat.daysSinceByPosition[a.position_type] = days;
    }
  }

  for (const [memberId, recent] of recentAttendance.entries()) {
    const attended = recent.filter((status) => status === "present" || status === "excused").length;
    stats.get(memberId).attendanceRate = attended / recent.length;
  }

  return stats;
}

function scoreMember(member, positionType, memberStats) {
  const skillScore = member.skill_rating * 2;
  const stats = memberStats.get(member._id.toString()) || {
    daysSinceAny: 999,
    daysSinceByPosition: {},
    attendanceRate: 1,
  };

  const rotationScore = Math.min(stats.daysSinceAny, 30) / 3;

  const daysSinceThis = stats.daysSinceByPosition[positionType] ?? 999;
  const varietyScore = Math.min(daysSinceThis, 60) / 6;

  const reliabilityScore = stats.attendanceRate * 5;

  return skillScore + rotationScore + varietyScore + reliabilityScore;
}

async function generateSchedule(serviceId) {
  const service = await Service.findById(serviceId);
  if (!service) return { error: "Service not found" };

  const unitId = service.unit;
  const unit = await Unit.findById(unitId).lean();
  const positionTypes = getUnitPositionTypes(unit);

  await Assignment.deleteMany({ service: serviceId });

  const counts = await PositionCount.find({ unit: unitId, service_type: service.service_type }).lean();

  const assignedIds = new Set();
  const assignments = [];
  const warnings = [];

  const positionOrder = Object.keys(positionTypes);

  for (const positionType of positionOrder) {
    const countRow = counts.find((c) => c.position_type === positionType);
    const needed = countRow ? countRow.count : 0;
    if (needed === 0) continue;

    const eligible = (await getEligibleMembers(service.date, positionType, unitId, positionTypes, service.service_slot)).filter(
      (m) => !assignedIds.has(m._id.toString())
    );

    const memberStats = await getMemberStats(eligible, service.date, unitId);
    const scored = eligible.map((m) => ({ member: m, score: scoreMember(m, positionType, memberStats) }));
    scored.sort((a, b) => b.score - a.score);

    let filled = 0;
    for (const { member } of scored) {
      if (filled >= needed) break;
      await Assignment.create({ service: serviceId, member: member._id, position_type: positionType });
      assignedIds.add(member._id.toString());
      assignments.push({ member: member.name, position: positionType });
      filled++;
    }

    if (filled < needed) {
      warnings.push(`${positionTypes[positionType]?.label || positionType}: filled ${filled}/${needed}`);
    }
  }

  return { assignments, warnings };
}

async function suggestReplacements(serviceId, positionType, removeMemberId) {
  const service = await Service.findById(serviceId);
  if (!service) return { error: "Service not found" };

  const unitId = service.unit;
  const unit = await Unit.findById(unitId).lean();
  const positionTypes = getUnitPositionTypes(unit);

  const currentAssignments = await Assignment.find({ service: serviceId }).lean();
  const alreadyAssignedIds = new Set(
    currentAssignments.map((a) => a.member.toString())
  );
  alreadyAssignedIds.delete(removeMemberId.toString());

  const eligible = (await getEligibleMembers(service.date, positionType, unitId, positionTypes, service.service_slot)).filter(
    (m) => !alreadyAssignedIds.has(m._id.toString())
  );

  const memberStats = await getMemberStats(eligible, service.date, unitId);
  const suggestions = [];
  for (const m of eligible) {
    const score = scoreMember(m, positionType, memberStats);
    const stats = memberStats.get(m._id.toString()) || { daysSinceAny: 999, daysSinceByPosition: {} };
    const daysSinceAny = stats.daysSinceAny;
    const daysSinceThis = stats.daysSinceByPosition[positionType] ?? 999;

    const pos = positionTypes[positionType] || {};
    const reasons = [];
    if (m.skill_rating >= 4) reasons.push(`High ${(pos.label || positionType).toLowerCase()} skill (${m.skill_rating}/5)`);
    else if (m.skill_rating >= 3) reasons.push(`Decent ${(pos.label || positionType).toLowerCase()} skill (${m.skill_rating}/5)`);

    if (daysSinceAny >= 14) reasons.push("Has been resting - due for rotation");
    else if (daysSinceAny >= 7) reasons.push("Served last week - fair rotation");

    if (daysSinceThis >= 30) reasons.push("Fresh to this position");
    if (m.has_suit && pos.requiresSuit) reasons.push("Has suit");

    suggestions.push({
      member: { _id: m._id, name: m.name, gender: m.gender, has_suit: m.has_suit },
      score: Math.round(score * 10) / 10,
      reasons,
    });
  }

  suggestions.sort((a, b) => b.score - a.score);
  return { suggestions: suggestions.slice(0, 5) };
}

module.exports = { generateSchedule, suggestReplacements };
