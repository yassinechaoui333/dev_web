import { db } from "../db.js";
import { ApiError } from "./errors.js";
export async function requireDatasetAccess(datasetId: string, userId: string) {
  const dataset = await db.dataset.findFirst({
    where: { id: datasetId, ownerId: userId },
  });
  if (!dataset) throw new ApiError(404, "NOT_FOUND", "Dataset not found");
  return dataset;
}
export async function requireDashboardAccess(
  dashboardId: string,
  userId: string,
  write = false,
) {
  const dashboard = await db.dashboard.findFirst({
    where: {
      id: dashboardId,
      ...(write
        ? { ownerId: userId }
        : { OR: [{ ownerId: userId }, { shares: { some: { userId } } }] }),
    },
  });
  if (!dashboard) throw new ApiError(404, "NOT_FOUND", "Dashboard not found");
  return dashboard;
}
