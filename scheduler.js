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

async function getDaysSinceLastAssignment(memberId, date, positionType) {
  const filter = { member: memberId };
  if (positionType) filter.position_type = positionType;

  const assignments = await Assignment.find(filter).populate("service").lean();

  let minDays = 999;
  const targetDate = new Date(date + "T00:00:00Z");

  for (const a of assignments) {
    if (!a.service) continue;
    const serviceDate = new Date(a.service.date + "T00:00:00Z");
    if (serviceDate >= targetDate) continue;
    const days = (targetDate - serviceDate) / (1000 * 60 * 60 * 24);
    if (days < minDays) minDays = days;
  }

  return minDays;
}

async function getAttendanceRate(memberId) {
  const recent = await Assignment.find({ member: memberId, attendance: { $ne: "pending" } })
    .sort({ _id: -1 })
    .limit(10)
    .lean();

  if (recent.length === 0) return 1;
  const attended = recent.filter((a) => a.attendance === "present" || a.attendance === "excused").length;
  return attended / recent.length;
}

async function scoreMember(member, date, positionType) {
  const skillScore = member.skill_rating * 2;

  const daysSinceAny = await getDaysSinceLastAssignment(member._id, date);
  const rotationScore = Math.min(daysSinceAny, 30) / 3;

  const daysSinceThis = await getDaysSinceLastAssignment(member._id, date, positionType);
  const varietyScore = Math.min(daysSinceThis, 60) / 6;

  const attendanceRate = await getAttendanceRate(member._id);
  const reliabilityScore = attendanceRate * 5;

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

    const scored = [];
    for (const m of eligible) {
      const score = await scoreMember(m, service.date, positionType);
      scored.push({ member: m, score });
    }
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

  const suggestions = [];
  for (const m of eligible) {
    const score = await scoreMember(m, service.date, positionType);
    const daysSinceAny = await getDaysSinceLastAssignment(m._id, service.date);
    const daysSinceThis = await getDaysSinceLastAssignment(m._id, service.date, positionType);

    const pos = positionTypes[positionType] || {};
    const reasons = [];
    if (m.skill_rating >= 4) reasons.push(`High ${(pos.label || positionType).toLowerCase()} skill (${m.skill_rating}/5)`);
    else if (m.skill_rating >= 3) reasons.push(`Decent ${(pos.label || positionType).toLowerCase()} skill (${m.skill_rating}/5)`);

    if (daysSinceAny >= 14) reasons.push("Has been resting — due for rotation");
    else if (daysSinceAny >= 7) reasons.push("Served last week — fair rotation");

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
