require("dotenv").config();
const { connectDb, User, Unit, UnitMembership, Member, Service, Assignment, Unavailability, PositionCount, seedPositionCounts } = require("./database");
const { hashPassword } = require("./auth");
const { generateSchedule } = require("./scheduler");

const memberData = [
  { name: "Tunde Adeyemi", gender: "M", has_suit: true, phone: "08031234567", notes: "Unit leader", skills: [
    { position_type: "ESCORT", rating: 5 }, { position_type: "STANDING", rating: 5 }, { position_type: "DOOR", rating: 4 },
    { position_type: "USHER", rating: 3 }, { position_type: "OVERFLOW", rating: 3 }, { position_type: "CHAIRS", rating: 4 },
  ]},
  { name: "Chidi Okafor", gender: "M", has_suit: true, phone: "08029876543", notes: "Assistant leader", skills: [
    { position_type: "ESCORT", rating: 5 }, { position_type: "STANDING", rating: 5 }, { position_type: "DOOR", rating: 3 },
    { position_type: "USHER", rating: 4 }, { position_type: "OVERFLOW", rating: 2 }, { position_type: "CHAIRS", rating: 3 },
  ]},
  { name: "Femi Bakare", gender: "M", has_suit: true, phone: "08051239876", notes: "", skills: [
    { position_type: "ESCORT", rating: 4 }, { position_type: "STANDING", rating: 5 }, { position_type: "DOOR", rating: 4 },
    { position_type: "USHER", rating: 3 }, { position_type: "OVERFLOW", rating: 3 }, { position_type: "CHAIRS", rating: 5 },
  ]},
  { name: "Emeka Nwosu", gender: "M", has_suit: true, phone: "08067891234", notes: "Very reliable", skills: [
    { position_type: "ESCORT", rating: 4 }, { position_type: "STANDING", rating: 4 }, { position_type: "DOOR", rating: 5 },
    { position_type: "USHER", rating: 4 }, { position_type: "OVERFLOW", rating: 3 }, { position_type: "CHAIRS", rating: 4 },
  ]},
  { name: "Kunle Afolabi", gender: "M", has_suit: true, phone: "08098761234", notes: "", skills: [
    { position_type: "ESCORT", rating: 3 }, { position_type: "STANDING", rating: 4 }, { position_type: "DOOR", rating: 5 },
    { position_type: "USHER", rating: 5 }, { position_type: "OVERFLOW", rating: 4 }, { position_type: "CHAIRS", rating: 3 },
  ]},
  { name: "Yusuf Ibrahim", gender: "M", has_suit: true, phone: "08045671234", notes: "Calm under pressure", skills: [
    { position_type: "ESCORT", rating: 5 }, { position_type: "STANDING", rating: 4 }, { position_type: "DOOR", rating: 3 },
    { position_type: "USHER", rating: 3 }, { position_type: "OVERFLOW", rating: 4 }, { position_type: "CHAIRS", rating: 4 },
  ]},
  { name: "Daniel Eze", gender: "M", has_suit: false, phone: "08078901234", notes: "New member", skills: [
    { position_type: "ESCORT", rating: 2 }, { position_type: "STANDING", rating: 2 }, { position_type: "DOOR", rating: 4 },
    { position_type: "USHER", rating: 3 }, { position_type: "OVERFLOW", rating: 5 }, { position_type: "CHAIRS", rating: 5 },
  ]},
  { name: "Samuel Osei", gender: "M", has_suit: false, phone: "08034561234", notes: "Strong, good with chairs", skills: [
    { position_type: "ESCORT", rating: 2 }, { position_type: "STANDING", rating: 2 }, { position_type: "DOOR", rating: 4 },
    { position_type: "USHER", rating: 4 }, { position_type: "OVERFLOW", rating: 4 }, { position_type: "CHAIRS", rating: 5 },
  ]},
  { name: "Joseph Mensah", gender: "M", has_suit: false, phone: "08056781234", notes: "", skills: [
    { position_type: "ESCORT", rating: 2 }, { position_type: "STANDING", rating: 2 }, { position_type: "DOOR", rating: 5 },
    { position_type: "USHER", rating: 4 }, { position_type: "OVERFLOW", rating: 5 }, { position_type: "CHAIRS", rating: 4 },
  ]},
  { name: "Peter Adamu", gender: "M", has_suit: true, phone: "08023451234", notes: "", skills: [
    { position_type: "ESCORT", rating: 3 }, { position_type: "STANDING", rating: 4 }, { position_type: "DOOR", rating: 4 },
    { position_type: "USHER", rating: 5 }, { position_type: "OVERFLOW", rating: 3 }, { position_type: "CHAIRS", rating: 3 },
  ]},
  { name: "Michael Balogun", gender: "M", has_suit: true, phone: "08087651234", notes: "Experienced", skills: [
    { position_type: "ESCORT", rating: 4 }, { position_type: "STANDING", rating: 5 }, { position_type: "DOOR", rating: 3 },
    { position_type: "USHER", rating: 4 }, { position_type: "OVERFLOW", rating: 2 }, { position_type: "CHAIRS", rating: 3 },
  ]},
  { name: "Grace Adeyemi", gender: "F", has_suit: false, phone: "08041239876", notes: "Great with guests", skills: [
    { position_type: "ESCORT", rating: 2 }, { position_type: "STANDING", rating: 3 }, { position_type: "DOOR", rating: 5 },
    { position_type: "USHER", rating: 5 }, { position_type: "OVERFLOW", rating: 4 }, { position_type: "CHAIRS", rating: 1 },
  ]},
  { name: "Blessing Okonkwo", gender: "F", has_suit: false, phone: "08065439876", notes: "", skills: [
    { position_type: "ESCORT", rating: 2 }, { position_type: "STANDING", rating: 3 }, { position_type: "DOOR", rating: 4 },
    { position_type: "USHER", rating: 5 }, { position_type: "OVERFLOW", rating: 3 }, { position_type: "CHAIRS", rating: 1 },
  ]},
  { name: "Ruth Amadi", gender: "F", has_suit: false, phone: "08076541234", notes: "Punctual", skills: [
    { position_type: "ESCORT", rating: 2 }, { position_type: "STANDING", rating: 4 }, { position_type: "DOOR", rating: 5 },
    { position_type: "USHER", rating: 4 }, { position_type: "OVERFLOW", rating: 5 }, { position_type: "CHAIRS", rating: 1 },
  ]},
  { name: "Esther Nnamdi", gender: "F", has_suit: false, phone: "08054327654", notes: "", skills: [
    { position_type: "ESCORT", rating: 2 }, { position_type: "STANDING", rating: 3 }, { position_type: "DOOR", rating: 4 },
    { position_type: "USHER", rating: 4 }, { position_type: "OVERFLOW", rating: 4 }, { position_type: "CHAIRS", rating: 1 },
  ]},
  { name: "David Kolawole", gender: "M", has_suit: false, phone: "08032167654", notes: "Eager to learn", skills: [
    { position_type: "ESCORT", rating: 2 }, { position_type: "STANDING", rating: 2 }, { position_type: "DOOR", rating: 3 },
    { position_type: "USHER", rating: 3 }, { position_type: "OVERFLOW", rating: 4 }, { position_type: "CHAIRS", rating: 5 },
  ]},
  { name: "John Obiora", gender: "M", has_suit: true, phone: "08098127654", notes: "", skills: [
    { position_type: "ESCORT", rating: 4 }, { position_type: "STANDING", rating: 4 }, { position_type: "DOOR", rating: 3 },
    { position_type: "USHER", rating: 3 }, { position_type: "OVERFLOW", rating: 3 }, { position_type: "CHAIRS", rating: 4 },
  ]},
  { name: "Hannah Lawal", gender: "F", has_suit: false, phone: "08043219876", notes: "Friendly", skills: [
    { position_type: "ESCORT", rating: 2 }, { position_type: "STANDING", rating: 3 }, { position_type: "DOOR", rating: 5 },
    { position_type: "USHER", rating: 5 }, { position_type: "OVERFLOW", rating: 3 }, { position_type: "CHAIRS", rating: 1 },
  ]},
];

const serviceData = [
  { date: "2026-05-17", service_type: "sunday", name: "" },
  { date: "2026-05-20", service_type: "wednesday", name: "" },
  { date: "2026-05-24", service_type: "sunday", name: "" },
  { date: "2026-05-27", service_type: "wednesday", name: "" },
  { date: "2026-05-31", service_type: "sunday", name: "Thanksgiving Sunday" },
  { date: "2026-06-03", service_type: "wednesday", name: "" },
  { date: "2026-06-07", service_type: "sunday", name: "" },
  { date: "2026-06-10", service_type: "special", name: "Youth Convention" },
];

async function seed() {
  await connectDb();

  await User.deleteMany({});
  await Unit.deleteMany({});
  await UnitMembership.deleteMany({});
  await Member.deleteMany({});
  await Service.deleteMany({});
  await Assignment.deleteMany({});
  await Unavailability.deleteMany({});
  await PositionCount.deleteMany({});

  console.log("Creating demo user...");
  const password_hash = await hashPassword("password123");
  const user = await User.create({
    name: "Admin User",
    email: "admin@test.com",
    password_hash,
  });

  console.log("Creating demo unit...");
  const unit = await Unit.create({
    name: "Main Church CCU",
    description: "Crowd control unit for Sunday and Wednesday services",
    created_by: user._id,
  });

  await UnitMembership.create({
    user: user._id,
    unit: unit._id,
    role: "owner",
  });

  console.log("Seeding position counts...");
  await seedPositionCounts(unit._id);

  console.log("Inserting 18 members...");
  const membersWithUnit = memberData.map((m) => ({ ...m, unit: unit._id }));
  await Member.insertMany(membersWithUnit);

  console.log("Inserting 8 services...");
  const created = [];
  for (const s of serviceData) {
    const doc = await Service.create({ ...s, unit: unit._id });
    created.push(doc);
  }

  for (const svc of created) {
    console.log(`Generating schedule for ${svc.date}...`);
    const result = await generateSchedule(svc._id);
    if (result.warnings && result.warnings.length) {
      console.log(`  Warnings: ${result.warnings.join("; ")}`);
    } else {
      console.log(`  ${result.assignments.length} assignments`);
    }
    if (svc.date < "2026-05-19") {
      await Service.findByIdAndUpdate(svc._id, { status: "published" });
    }
  }

  console.log("\nDone. Seeded:");
  console.log(`  1 user (admin@test.com / password123)`);
  console.log(`  1 unit (${unit.name}) — invite code: ${unit.invite_code}`);
  console.log(`  ${await Member.countDocuments()} members`);
  console.log(`  ${await Service.countDocuments()} services`);
  console.log(`  ${await Assignment.countDocuments()} assignments`);

  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
