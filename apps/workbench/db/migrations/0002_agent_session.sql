CREATE TABLE IF NOT EXISTS `agent_session` (
  `id` text PRIMARY KEY NOT NULL,
  `connection_id` text NOT NULL REFERENCES `data_connection`(`id`) ON DELETE CASCADE,
  `patient_id` text NOT NULL,
  `created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  `updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
CREATE INDEX IF NOT EXISTS `agent_session_connection_idx`
  ON `agent_session` (`connection_id`);
