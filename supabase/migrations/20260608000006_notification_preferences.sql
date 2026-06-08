-- SOP-TSK-001 §21: Notification channel preferences per user
-- Stored as JSONB on profiles to avoid a separate table for simple toggles.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb
  DEFAULT '{"email": true, "telegram": false, "telegram_chat_id": null}'::jsonb;
