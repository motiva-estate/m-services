// scripts/seed-admin.ts
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { User, UserDocument } from '../src/common/schemas/user.schema'; // adjust path to match your actual file

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));

  const email = 'admin@motivaestate.com';
  const plainPassword = 'TempPassword123!';

  const existing = await userModel.findOne({ email });
  if (existing) {
    console.log('Admin already exists:', email);
    await app.close();
    return;
  }

  const hashedPassword = await bcrypt.hash(plainPassword, 12);

  await userModel.create({
    fullName: 'Ayobami Admin',
    email,
    password: hashedPassword,
    role: 'SUPER_ADMIN',
    isActive: true,
    twoFAEnabled: false,
  });

  console.log('✅ Admin created');
  console.log('   Email:', email);
  console.log('   Password:', plainPassword);

  await app.close();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});