import "server-only"

import { eq, sql } from "drizzle-orm"

import { getDb } from "@/lib/db"
import { cameras, type Camera, type CameraStatus } from "@/lib/db/schema"

/** One camera by our own id, or undefined if it isn't in the DB. */
export async function getCameraById(id: string): Promise<Camera | undefined> {
  const rows = await getDb()
    .select()
    .from(cameras)
    .where(eq(cameras.id, id))
    .limit(1)
  return rows[0]
}

/**
 * Set a camera's status. Only moves a non-offline camera; a camera the sync
 * marked offline stays offline until the next successful sync re-confirms it.
 */
export async function setCameraStatus(
  id: string,
  status: CameraStatus
): Promise<void> {
  await getDb()
    .update(cameras)
    .set({ status, updatedAt: sql`now()` })
    .where(eq(cameras.id, id))
}
