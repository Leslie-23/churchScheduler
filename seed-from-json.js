require("dotenv").config();
const fs = require("fs");
const { connectDb, User, Unit, UnitMembership, Member, Service, Unavailability, PositionCount, seedPositionCounts } = require("./database");
const { hashPassword } = require("./auth");

const file = process.argv[2];
if (!file) {
  console.error("Usage: node seed-from-json.js <data-file.json>");
  console.error("  Generate the JSON file using data-collection-form.html");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));

async function seed() {
  await connectDb();

  if (!data.admin?.email || !data.admin?.password) {
    console.error("Admin email and password are required.");
    process.exit(1);
  }
  if (!data.unit?.name) {
    console.error("Unit name is required.");
    process.exit(1);
  }

  console.log(`\nSeeding data for unit: ${data.unit.name}`);
  console.log(`Admin: ${data.admin.email}\n`);

  let user = await User.findOne({ email: data.admin.email.toLowerCase() });
  if (user) {
    console.log(`User ${data.admin.email} already exists — reusing.`);
  } else {
    const password_hash = await hashPassword(data.admin.password);
    user = await User.create({
      name: data.admin.name,
      email: data.admin.email.toLowerCase(),
      password_hash,
      phone: data.admin.phone || "",
    });
    console.log(`Created user: ${user.email}`);
  }

  const unit = await Unit.create({
    name: data.unit.name,
    description: data.unit.description || "",
    created_by: user._id,
  });
  console.log(`Created unit: ${unit.name} (invite code: ${unit.invite_code})`);

  await UnitMembership.create({
    user: user._id,
    unit: unit._id,
    role: "owner",
  });

  if (data.position_counts && data.position_counts.length) {
    for (const pc of data.position_counts) {
      await PositionCount.findOneAndUpdate(
        { unit: unit._id, service_type: pc.service_type, position_type: pc.position_type },
        { count: pc.count },
        { upsert: true }
      );
    }
    console.log(`Set ${data.position_counts.length} position counts`);
  } else {
    await seedPositionCounts(unit._id);
    console.log("Seeded default position counts");
  }

  const memberMap = {};
  if (data.members && data.members.length) {
    for (const m of data.members) {
      const doc = await Member.create({
        unit: unit._id,
        name: m.name,
        gender: m.gender,
        has_suit: m.has_suit || false,
        phone: m.phone || "",
        skills: m.skills || [],
      });
      memberMap[m.name.toLowerCase()] = doc._id;
    }
    console.log(`Created ${data.members.length} members`);
  }

  if (data.services && data.services.length) {
    for (const s of data.services) {
      await Service.create({
        unit: unit._id,
        date: s.date,
        service_type: s.service_type,
        name: s.name || "",
      });
    }
    console.log(`Created ${data.services.length} services`);
  }

  if (data.unavailability && data.unavailability.length) {
    let count = 0;
    for (const u of data.unavailability) {
      const memberId = memberMap[u.member_name.toLowerCase()];
      if (!memberId) {
        console.warn(`  Skipping unavailability — member "${u.member_name}" not found`);
        continue;
      }
      await Unavailability.create({
        unit: unit._id,
        member: memberId,
        date: u.date,
        reason: u.reason || "",
      });
      count++;
    }
    console.log(`Created ${count} unavailability entries`);
  }

  console.log("\nDone! Summary:");
  console.log(`  Unit: ${unit.name}`);
  console.log(`  Invite code: ${unit.invite_code}`);
  console.log(`  Admin login: ${data.admin.email} / ${data.admin.password}`);
  console.log(`  Members: ${Object.keys(memberMap).length}`);
  console.log(`  Services: ${data.services?.length || 0}`);
  console.log(`\nShare the invite code with members so they can join.`);

  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
