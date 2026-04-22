import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { PrismaClient } from "../src/generated/prisma";
import { hashPassword } from "better-auth/crypto";

export default async function globalSetup() {
  const prisma = new PrismaClient();
  const now = new Date();
  const regularEmail = "e2e-user@supoclip.test";
  const password = "Password123!";

  await prisma.$executeRawUnsafe(`
    DELETE FROM generated_clips
    WHERE task_id IN (
      SELECT tasks.id
      FROM tasks
      INNER JOIN users ON users.id = tasks.user_id
      WHERE users.email = '${regularEmail}'
    )
  `);
  await prisma.task.deleteMany({
    where: { user: { email: regularEmail } },
  });
  await prisma.source.deleteMany({
    where: { tasks: { some: { user: { email: regularEmail } } } },
  });
  await prisma.account.deleteMany({
    where: { user: { email: regularEmail } },
  });
  await prisma.session.deleteMany({
    where: { user: { email: regularEmail } },
  });
  await prisma.user.deleteMany({
    where: { email: regularEmail },
  });

  const passwordHash = await hashPassword(password);

  const regularUser = await prisma.user.create({
    data: {
      email: regularEmail,
      name: "E2E User",
    },
  });

  await prisma.account.create({
    data: {
      id: randomUUID(),
      accountId: regularUser.id,
      providerId: "credential",
      userId: regularUser.id,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    },
  });

  const completedSource = await prisma.source.create({
    data: {
      type: "youtube",
      title: "Seeded marketing walkthrough",
    },
  });
  const queuedSource = await prisma.source.create({
    data: {
      type: "youtube",
      title: "Queued seed source",
    },
  });

  const completedTask = await prisma.task.create({
    data: {
      user_id: regularUser.id,
      source_id: completedSource.id,
      generated_clips_ids: [],
      status: "completed",
      font_family: "TikTokSans-Regular",
      font_size: 24,
      font_color: "#FFFFFF",
    },
  });
  const queuedTask = await prisma.task.create({
    data: {
      user_id: regularUser.id,
      source_id: queuedSource.id,
      generated_clips_ids: [],
      status: "queued",
      font_family: "TikTokSans-Regular",
      font_size: 24,
      font_color: "#FFFFFF",
    },
  });

  const clipId = randomUUID();
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO generated_clips (
        id, task_id, filename, file_path, start_time, end_time, duration,
        text, relevance_score, reasoning, clip_order, created_at, updated_at
      ) VALUES (
        '${clipId}', '${completedTask.id}', 'seeded-clip.mp4', '/tmp/seeded-clip.mp4',
        '00:00', '00:15', 15, 'This is a seeded clip', 0.99,
        'Seed data for Playwright', 1, NOW(), NOW()
      )
    `,
  );

  await prisma.task.update({
    where: { id: completedTask.id },
    data: {
      generated_clips_ids: [clipId],
    },
  });

  const seedPath = path.join(process.cwd(), "e2e", ".seed.json");
  await mkdir(path.dirname(seedPath), { recursive: true });
  await writeFile(
    seedPath,
    JSON.stringify(
      {
        regular: {
          email: regularEmail,
          password,
        },
        completedTaskId: completedTask.id,
        queuedTaskId: queuedTask.id,
        completedSourceTitle: completedSource.title,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}
