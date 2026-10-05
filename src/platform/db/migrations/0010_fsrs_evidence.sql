CREATE TABLE `fsrs_scheduler_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fsrs_scheduler_profiles_json_unique` ON `fsrs_scheduler_profiles` (`profile_json`);--> statement-breakpoint
CREATE TABLE `practice_review_evidence` (
	`review_attempt_id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`application_sequence` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`sequence_source` text NOT NULL,
	`scheduling_evidence_kind` text NOT NULL,
	`scheduler_profile_id` text,
	`pre_card_json` text,
	`assessment_evidence_json` text,
	FOREIGN KEY (`review_attempt_id`) REFERENCES `review_attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `fsrs_cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scheduler_profile_id`) REFERENCES `fsrs_scheduler_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `practice_review_evidence_card_sequence_unique` ON `practice_review_evidence` (`card_id`,`application_sequence`);--> statement-breakpoint
CREATE TABLE `practice_generations` (
	`scope_id` text PRIMARY KEY NOT NULL,
	`problem_slug` text,
	`generation_token` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`problem_slug`) REFERENCES `problems`(`slug`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `practice_generations_problem_slug_unique` ON `practice_generations` (`problem_slug`);--> statement-breakpoint
CREATE TABLE `practice_command_receipts` (
	`generation_key` text NOT NULL,
	`command_id` text NOT NULL,
	`payload_fingerprint` text NOT NULL,
	`operation` text NOT NULL,
	`problem_slug` text NOT NULL,
	`card_id` text NOT NULL,
	`review_attempt_id` text NOT NULL,
	`application_sequence` integer NOT NULL,
	`revision` integer NOT NULL,
	`accepted_at` integer NOT NULL,
	`command_summary_json` text NOT NULL,
	`result_json` text NOT NULL,
	PRIMARY KEY(`generation_key`, `command_id`),
	FOREIGN KEY (`problem_slug`) REFERENCES `problems`(`slug`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `fsrs_cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_attempt_id`) REFERENCES `review_attempts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `practice_command_receipts_problem_idx` ON `practice_command_receipts` (`problem_slug`);