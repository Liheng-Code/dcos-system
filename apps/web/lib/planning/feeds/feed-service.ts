// Doc 35 I3–I7: data access for the outbound feeds (browser client). Preview needs Schedule view, publishing needs
// Programme approve (checked in plan_publish_feed); the receiving module reads plan_latest_feed with its own permission.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnyFeedRow, FeedKey, FeedSettings } from "./feed-model";

type Db = SupabaseClient;

export interface FeedPreview { feed: FeedKey; schema_version: string; as_at: string; settings: FeedSettings; rows: AnyFeedRow[] }

export interface FeedPublication {
  id: string; feed: FeedKey; version: number; schema_version: string; as_at: string; row_count: number;
  content_hash: string; note: string | null; published_by: string | null; published_at: string;
}

const msg = (e: { message: string }) => new Error(e.message);

export async function previewFeed(db: Db, projectId: string, feed: FeedKey): Promise<FeedPreview> {
  const { data, error } = await db.rpc("plan_feed_preview", { p_project_id: projectId, p_feed: feed });
  if (error) throw msg(error);
  return data as FeedPreview;
}

export async function publishFeed(db: Db, projectId: string, feed: FeedKey, note: string | null): Promise<FeedPublication & { unchanged: boolean | null }> {
  const { data, error } = await db.rpc("plan_publish_feed", { p_project_id: projectId, p_feed: feed, p_note: note });
  if (error) throw msg(error);
  return data as FeedPublication & { unchanged: boolean | null };
}

export async function listPublications(db: Db, projectId: string): Promise<FeedPublication[]> {
  const { data, error } = await db.from("plan_feed_publications")
    .select("id, feed, version, schema_version, as_at, row_count, content_hash, note, published_by, published_at")
    .eq("project_id", projectId).order("published_at", { ascending: false }).limit(200);
  if (error) throw msg(error);
  return (data ?? []) as FeedPublication[];
}

export async function publicationRows(db: Db, id: string): Promise<AnyFeedRow[]> {
  const { data, error } = await db.from("plan_feed_publications").select("rows").eq("id", id).single();
  if (error) throw msg(error);
  return (data?.rows ?? []) as AnyFeedRow[];
}

/** The contract for receiving modules: the latest published version of a feed, or null. */
export async function latestFeed(db: Db, projectId: string, feed: FeedKey): Promise<(FeedPublication & { rows: AnyFeedRow[] }) | null> {
  const { data, error } = await db.rpc("plan_latest_feed", { p_project_id: projectId, p_feed: feed });
  if (error) throw msg(error);
  return (data ?? null) as (FeedPublication & { rows: AnyFeedRow[] }) | null;
}

export async function saveFeedSettings(db: Db, projectId: string, s: FeedSettings): Promise<void> {
  const { error } = await db.from("plan_schedule_settings").upsert({
    project_id: projectId,
    feed_material_lead_days: s.material_lead_days,
    feed_site_buffer_days: s.site_buffer_days,
    feed_submission_review_days: s.submission_review_days,
    feed_submission_buffer_days: s.submission_buffer_days,
    feed_inspection_notice_days: s.inspection_notice_days,
    updated_at: new Date().toISOString(),
  }, { onConflict: "project_id" });
  if (error) throw msg(error);
}

