CREATE TABLE IF NOT EXISTS `agent_answer` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL REFERENCES `agent_session`(`id`) ON DELETE CASCADE,
  `prompt` text NOT NULL,
  `prompt_version` text NOT NULL,
  `provider` text NOT NULL,
  `model` text NOT NULL,
  `fallback` integer NOT NULL,
  `turns` integer NOT NULL,
  `answer_json` text NOT NULL,
  `final_issues_json` text,
  `created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
CREATE INDEX IF NOT EXISTS `agent_answer_session_idx`
  ON `agent_answer` (`session_id`, `created_at`);

CREATE TABLE IF NOT EXISTS `tool_call` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL REFERENCES `agent_session`(`id`) ON DELETE CASCADE,
  `answer_id` text REFERENCES `agent_answer`(`id`) ON DELETE SET NULL,
  `connection_id` text NOT NULL,
  `patient_id` text NOT NULL,
  `tool` text NOT NULL,
  `tool_version` text NOT NULL,
  `input_json` text NOT NULL,
  `envelope_json` text NOT NULL,
  `ok` integer NOT NULL,
  `reason` text,
  `result_count` integer,
  `truncated` integer,
  `duration_ms` integer NOT NULL,
  `resource_ids_json` text,
  `started_at` text NOT NULL,
  `completed_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `tool_call_session_idx`
  ON `tool_call` (`session_id`, `started_at`);
CREATE INDEX IF NOT EXISTS `tool_call_answer_idx`
  ON `tool_call` (`answer_id`);

CREATE TABLE IF NOT EXISTS `evidence_claim` (
  `id` text PRIMARY KEY NOT NULL,
  `answer_id` text NOT NULL REFERENCES `agent_answer`(`id`) ON DELETE CASCADE,
  `claim_id` text NOT NULL,
  `text` text NOT NULL,
  `evidence_refs_json` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `evidence_claim_answer_idx`
  ON `evidence_claim` (`answer_id`);
