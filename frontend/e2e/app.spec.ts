import fs from "fs";
import path from "path";

import { expect, test } from "@playwright/test";

const seed = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "e2e", ".seed.json"), "utf8"),
);

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/");
}

test("regular user can browse seeded tasks and save preferences", async ({ page }) => {
  await signIn(page, seed.regular.email, seed.regular.password);

  await page.goto("/list");
  await expect(page.getByText(seed.completedSourceTitle)).toBeVisible();

  await page.goto(`/tasks/${seed.completedTaskId}`);
  await expect(page.getByText("This is a seeded clip")).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("button", { name: /enregistrer/i }).click();
  await expect(page.getByText(/enregistr/i)).toBeVisible();
});
