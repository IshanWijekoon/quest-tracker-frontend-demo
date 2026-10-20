import { getAppMode, loadPlannerData, loadPlannerMeta } from "./planner-store";
import { runMigration } from "./migration";

async function boot(): Promise<void> {
  const meta = loadPlannerMeta();
  const mode = meta?.mode ?? "legacy";

  // If user previously migrated and is in planner mode, ensure data exists
  if (mode === "planner") {
    if (!loadPlannerData()) {
      runMigration();
    }
    await import("./planner-page");
    return;
  }

  await import("./habits-page");
}

void boot();

export { getAppMode };
