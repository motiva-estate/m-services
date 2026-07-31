/**
 * seed-demo.ts
 *
 * Populates the database with a complete set of demo data:
 *   - One user per role (SUPER_ADMIN, ADMINISTRATOR, CONTENT_EDITOR, VIEWER)
 *   - Two SUBSCRIBER users, each linked to a Client record
 *   - Two Clients with realistic profile data
 *   - Three Subscriptions (2 for Elena, 1 for Adaeze) with full installment schedules
 *   - Several Payments against those subscriptions
 *   - A handful of Enquiries at different pipeline stages
 *   - Two Project Updates (text only — no Cloudinary needed for demo)
 *
 * Safe to run repeatedly — existing records are skipped by email/unique key.
 *
 * Usage:
 *   npm run seed:demo
 *   (or)  ts-node scripts/seed-demo.ts
 */

import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { AppModule } from '../src/app.module';
import { User, UserDocument } from '../src/common/schemas/user.schema';
import { Client, ClientDocument } from '../src/common/schemas/client.schema';
import { Subscription, SubscriptionDocument } from '../src/common/schemas/subscription.schema';
import { Payment, PaymentDocument } from '../src/common/schemas/payment.schema';
import { Enquiry, EnquiryDocument } from '../src/common/schemas/enquiry.schema';
import { ProjectUpdate, ProjectUpdateDocument } from '../src/common/schemas/project-update.schema';

// ── Helpers ──────────────────────────────────────────────────────────────────

const hash = (pw: string) => bcrypt.hash(pw, 12);

function isoDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Upsert-by-email helper — skips creation if the email already exists. */
async function upsertUser(
  model: Model<UserDocument>,
  data: Partial<User> & { email: string; password: string },
): Promise<UserDocument | null> {
  const exists = await model.findOne({ email: data.email.toLowerCase() });
  if (exists) {
    console.log(`  ⏭  User already exists: ${data.email}`);
    return exists;
  }
  const user = await model.create({
    ...data,
    email: data.email.toLowerCase(),
    password: await hash(data.password),
    isActive: true,
    twoFAEnabled: false,
  });
  console.log(`  ✅ User created: ${data.email}  [${data.role}]`);
  return user;
}

async function upsertClient(
  model: Model<ClientDocument>,
  data: Partial<Client> & { email: string },
): Promise<ClientDocument | null> {
  const exists = await model.findOne({ email: data.email.toLowerCase() });
  if (exists) {
    console.log(`  ⏭  Client already exists: ${data.email}`);
    return exists;
  }
  const client = await model.create({
    ...data,
    email: data.email.toLowerCase(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log(`  ✅ Client created: ${data.email}`);
  return client;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
  const clientModel = app.get<Model<ClientDocument>>(getModelToken(Client.name));
  const subModel = app.get<Model<SubscriptionDocument>>(getModelToken(Subscription.name));
  const paymentModel = app.get<Model<PaymentDocument>>(getModelToken(Payment.name));
  const enquiryModel = app.get<Model<EnquiryDocument>>(getModelToken(Enquiry.name));
  const updateModel = app.get<Model<ProjectUpdateDocument>>(getModelToken(ProjectUpdate.name));

  // ── 1. Admin / staff users ─────────────────────────────────────────────────
  console.log('\n── Staff users ──────────────────────────────────────────────');

  await upsertUser(userModel, {
    fullName: 'Ayobami Oladele',
    email: 'superadmin@motivaestate.com',
    password: 'SuperAdmin123!',
    role: 'SUPER_ADMIN',
  });

  await upsertUser(userModel, {
    fullName: 'Tolu Adesanya',
    email: 'admin@motivaestate.com',
    password: 'Admin1234!',
    role: 'ADMINISTRATOR',
  });

  await upsertUser(userModel, {
    fullName: 'Emeka Nwosu',
    email: 'editor@motivaestate.com',
    password: 'Editor123!',
    role: 'CONTENT_EDITOR',
  });

  await upsertUser(userModel, {
    fullName: 'Chisom Eze',
    email: 'viewer@motivaestate.com',
    password: 'Viewer123!',
    role: 'VIEWER',
  });

  // ── 2. Clients ─────────────────────────────────────────────────────────────
  console.log('\n── Clients ──────────────────────────────────────────────────');

  const elena = await upsertClient(clientModel, {
    fullName: 'Elena Vasquez',
    firstName: 'Elena',
    lastName: 'Vasquez',
    email: 'elena.vasquez@example.com',
    phone: '+234 801 234 5678',
    contactAddress: '14 Banana Island Road, Ikoyi, Lagos',
    source: 'MANUAL',
    status: 'ACTIVE',
    termsAccepted: true,
    signatureName: 'Elena Vasquez',
    signatureDate: isoDate(-60).slice(0, 10),
    subscribedProjectIds: [],
    notificationPrefs: { email: true, whatsapp: true },
    contactConfirmedAt: new Date(Date.now() - 55 * 86400_000),
    nextOfKin: {
      firstName: 'Carlos',
      lastName: 'Vasquez',
      phone: '+234 802 345 6789',
      address: '14 Banana Island Road, Ikoyi, Lagos',
    },
  });

  const adaeze = await upsertClient(clientModel, {
    fullName: 'Adaeze Okafor',
    firstName: 'Adaeze',
    lastName: 'Okafor',
    email: 'adaeze.okafor@example.com',
    phone: '+234 803 456 7890',
    contactAddress: '7 Wuse Zone 5, Abuja',
    source: 'REFERRAL',
    status: 'ACTIVE',
    termsAccepted: true,
    signatureName: 'Adaeze Okafor',
    signatureDate: isoDate(-30).slice(0, 10),
    subscribedProjectIds: [],
    notificationPrefs: { email: true, whatsapp: false },
    // contactConfirmedAt not set — will see first-login prompt
    nextOfKin: {
      firstName: 'Chukwuemeka',
      lastName: 'Okafor',
      phone: '+234 804 567 8901',
      address: '7 Wuse Zone 5, Abuja',
    },
  });

  // ── 3. Subscriber portal users (linked to the clients above) ───────────────
  console.log('\n── Subscriber portal users ──────────────────────────────────');

  await upsertUser(userModel, {
    fullName: elena!.fullName,
    email: 'elena.portal@motivaestate.com',
    password: 'Portal123!',
    role: 'SUBSCRIBER',
    clientId: elena!._id.toString(),
  });

  await upsertUser(userModel, {
    fullName: adaeze!.fullName,
    email: 'adaeze.portal@motivaestate.com',
    password: 'Portal123!',
    role: 'SUBSCRIBER',
    clientId: adaeze!._id.toString(),
  });

  // ── 4. Subscriptions ───────────────────────────────────────────────────────
  console.log('\n── Subscriptions ────────────────────────────────────────────');

  // Helper: skip if a subscription already exists for this client + plan combo
  async function upsertSub(
    data: Partial<Subscription> & { clientId: string; plan: string },
  ): Promise<SubscriptionDocument | null> {
    const exists = await subModel.findOne({ clientId: data.clientId, plan: data.plan });
    if (exists) {
      console.log(`  ⏭  Subscription already exists: "${data.plan}" for ${data.clientId}`);
      return exists;
    }
    const sub = await subModel.create({ ...data, amountPaid: data.amountPaid ?? 0 });
    console.log(`  ✅ Subscription: "${data.plan}"`);
    return sub;
  }

  // Elena — Casa Solano (project ref from Sanity or demo slug)
  const elenaSub1 = await upsertSub({
    clientId: elena!._id.toString(),
    plan: 'Casa Solano — 3-Bed Residence',
    status: 'ACTIVE',
    projectRef: 'project-casa-solano',
    projectRefType: 'project',
    startDate: isoDate(-180),
    endDate: isoDate(185),
    amount: 45_000_000,
    totalPrice: 45_000_000,
    amountPaid: 15_000_000,
    currency: 'NGN',
    paymentPlan: '12mo',
    nextDueDate: isoDate(15),
    autoRenew: false,
    installments: [
      { index: 1, label: 'Initial deposit',    dueDate: isoDate(-180), amount: 5_000_000 },
      { index: 2, label: 'Installment 2',      dueDate: isoDate(-150), amount: 5_000_000 },
      { index: 3, label: 'Installment 3',      dueDate: isoDate(-120), amount: 5_000_000 },
      { index: 4, label: 'Installment 4',      dueDate: isoDate(-90),  amount: 5_000_000 },
      { index: 5, label: 'Installment 5',      dueDate: isoDate(15),   amount: 3_750_000 },
      { index: 6, label: 'Installment 6',      dueDate: isoDate(45),   amount: 3_750_000 },
      { index: 7, label: 'Installment 7',      dueDate: isoDate(75),   amount: 3_750_000 },
      { index: 8, label: 'Installment 8',      dueDate: isoDate(105),  amount: 3_750_000 },
      { index: 9, label: 'Installment 9',      dueDate: isoDate(135),  amount: 3_750_000 },
      { index: 10, label: 'Final installment', dueDate: isoDate(165),  amount: 3_750_000 },
    ],
  });

  // Elena — Lanzarote land parcel
  const elenaSub2 = await upsertSub({
    clientId: elena!._id.toString(),
    plan: 'Lanzarote Estate — Parcel A12 (450 sqm)',
    status: 'ACTIVE',
    projectRef: 'land-lanzarote-a12',
    projectRefType: 'land',
    startDate: isoDate(-90),
    endDate: isoDate(270),
    amount: 12_000_000,
    totalPrice: 12_000_000,
    amountPaid: 6_000_000,
    currency: 'NGN',
    paymentPlan: '4mo',
    nextDueDate: isoDate(30),
    autoRenew: false,
    installments: [
      { index: 1, label: 'Initial deposit', dueDate: isoDate(-90), amount: 3_000_000 },
      { index: 2, label: 'Installment 2',   dueDate: isoDate(-60), amount: 3_000_000 },
      { index: 3, label: 'Installment 3',   dueDate: isoDate(30),  amount: 3_000_000 },
      { index: 4, label: 'Final payment',   dueDate: isoDate(90),  amount: 3_000_000 },
    ],
  });

  // Adaeze — Kaura Heights
  const adaezeSub = await upsertSub({
    clientId: adaeze!._id.toString(),
    plan: 'Kaura Heights — Unit 04B (2-Bed)',
    status: 'ACTIVE',
    projectRef: 'project-kaura-heights',
    projectRefType: 'project',
    startDate: isoDate(-30),
    endDate: isoDate(335),
    amount: 28_500_000,
    totalPrice: 28_500_000,
    amountPaid: 9_500_000,
    currency: 'NGN',
    paymentPlan: '3-4mo',
    nextDueDate: isoDate(60),
    autoRenew: false,
    installments: [
      { index: 1, label: 'Initial deposit', dueDate: isoDate(-30),  amount: 9_500_000 },
      { index: 2, label: 'Installment 2',   dueDate: isoDate(60),   amount: 9_500_000 },
      { index: 3, label: 'Final payment',   dueDate: isoDate(150),  amount: 9_500_000 },
    ],
  });

  // ── 5. Payments ────────────────────────────────────────────────────────────
  console.log('\n── Payments ─────────────────────────────────────────────────');

  const paymentsToSeed = [
    // Elena — Casa Solano (4 installments paid)
    { clientId: elena!._id.toString(), subscriptionId: elenaSub1!._id.toString(), label: 'Initial deposit',    amount: 5_000_000, date: isoDate(-180) },
    { clientId: elena!._id.toString(), subscriptionId: elenaSub1!._id.toString(), label: 'Installment 2',      amount: 5_000_000, date: isoDate(-150) },
    { clientId: elena!._id.toString(), subscriptionId: elenaSub1!._id.toString(), label: 'Installment 3',      amount: 5_000_000, date: isoDate(-120) },
    // Elena — Lanzarote (2 installments paid)
    { clientId: elena!._id.toString(), subscriptionId: elenaSub2!._id.toString(), label: 'Initial deposit',    amount: 3_000_000, date: isoDate(-90) },
    { clientId: elena!._id.toString(), subscriptionId: elenaSub2!._id.toString(), label: 'Installment 2',      amount: 3_000_000, date: isoDate(-60) },
    // Adaeze — Kaura Heights (1 installment paid)
    { clientId: adaeze!._id.toString(), subscriptionId: adaezeSub!._id.toString(), label: 'Initial deposit',   amount: 9_500_000, date: isoDate(-30) },
  ];

  for (const p of paymentsToSeed) {
    // Skip if exact match already exists (same client + sub + label + amount)
    const exists = await paymentModel.findOne({
      clientId: p.clientId, subscriptionId: p.subscriptionId, label: p.label, amount: p.amount,
    });
    if (exists) {
      console.log(`  ⏭  Payment already exists: "${p.label}" — ${(p.amount / 1_000_000).toFixed(1)}M`);
      continue;
    }
    await paymentModel.create({ ...p, currency: 'NGN', reversed: false });
    console.log(`  ✅ Payment: "${p.label}" — ₦${(p.amount / 1_000_000).toFixed(1)}M`);
  }

  // ── 6. Enquiries ──────────────────────────────────────────────────────────
  console.log('\n── Enquiries ────────────────────────────────────────────────');

  const enquiriesToSeed = [
    {
      name: 'Bola Adeyemi', email: 'bola@example.com', phone: '+234 810 111 2222',
      message: 'I am interested in a 3-bedroom unit at Casa Solano. Please send pricing details.',
      status: 'NEW',
    },
    {
      name: 'Funmi Okonkwo', email: 'funmi@example.com', phone: '+234 811 222 3333',
      message: 'My family is looking for a residence with good schools nearby. Do you have options in Ikoyi or Lekki?',
      status: 'CONTACTED',
    },
    {
      name: 'Rotimi Bello', email: 'rotimi@example.com', phone: '+234 812 333 4444',
      message: 'Interested in land investment at Lanzarote Estate. What are the available parcel sizes and pricing?',
      status: 'QUALIFIED',
    },
    {
      name: 'Ngozi Dike', email: 'ngozi@example.com',
      message: 'I attended your open day last month and would like to follow up on the Kaura Heights penthouse unit.',
      status: 'CONVERTED',
    },
    {
      name: 'Seun Lawal', email: 'seun@example.com', phone: '+234 813 444 5555',
      message: 'Reaching out to inquire about any off-plan units available under ₦20M.',
      status: 'NEW',
    },
  ];

  for (const e of enquiriesToSeed) {
    const exists = await enquiryModel.findOne({ email: e.email.toLowerCase() });
    if (exists) {
      console.log(`  ⏭  Enquiry already exists: ${e.email}`);
      continue;
    }
    await enquiryModel.create({ ...e, email: e.email.toLowerCase() });
    console.log(`  ✅ Enquiry from: ${e.name} [${e.status}]`);
  }

  // ── 7. Project updates ─────────────────────────────────────────────────────
  console.log('\n── Project updates ──────────────────────────────────────────');

  const updatesToSeed = [
    {
      projectRef: 'project-casa-solano', projectRefType: 'project' as const,
      text: 'Structural work on floors 4–6 is now complete. The façade team moves in next week. Expected handover for early units remains on schedule for Q3.',
      postedAt: isoDate(-10),
    },
    {
      projectRef: 'project-casa-solano', projectRefType: 'project' as const,
      text: 'Interior finishing has begun in the show unit on floor 2. Subscribers will be invited to a private viewing in the coming weeks.',
      postedAt: isoDate(-3),
    },
    {
      projectRef: 'land-lanzarote-a12', projectRefType: 'land' as const,
      text: 'The perimeter survey for Lanzarote Estate Phase 1 has been completed and filed. Individual parcel beacons are being planted this week.',
      postedAt: isoDate(-7),
    },
    {
      projectRef: 'project-kaura-heights', projectRefType: 'project' as const,
      text: 'Kaura Heights has reached practical completion on Block A. Punch-list items are being addressed. Certificate of Occupancy application is in progress.',
      postedAt: isoDate(-5),
    },
  ];

  for (const u of updatesToSeed) {
    // Skip if an update with the same projectRef and postedAt already exists
    const exists = await updateModel.findOne({ projectRef: u.projectRef, postedAt: u.postedAt });
    if (exists) {
      console.log(`  ⏭  Update already exists for: ${u.projectRef}`);
      continue;
    }
    await updateModel.create({ ...u, photos: [] });
    console.log(`  ✅ Update for: ${u.projectRef}`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n────────────────────────────────────────────────────────────');
  console.log('✅ Seeding complete.\n');
  console.log('Staff logins (admin panel → /admin/login)');
  console.log('  superadmin@motivaestate.com  /  SuperAdmin123!  [SUPER_ADMIN]');
  console.log('  admin@motivaestate.com       /  Admin1234!      [ADMINISTRATOR]');
  console.log('  editor@motivaestate.com      /  Editor123!      [CONTENT_EDITOR]');
  console.log('  viewer@motivaestate.com      /  Viewer123!      [VIEWER]');
  console.log('\nPortal logins (subscriber portal → /portal/login)');
  console.log('  elena.portal@motivaestate.com   /  Portal123!  (2 subscriptions)');
  console.log('  adaeze.portal@motivaestate.com  /  Portal123!  (1 subscription)');
  console.log('────────────────────────────────────────────────────────────\n');

  await app.close();
}

seed().catch((err) => {
  console.error('\n❌ Seed failed:', err);
  process.exit(1);
});
