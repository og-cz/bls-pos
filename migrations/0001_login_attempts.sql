CREATE TABLE `login_attempts` (
	`key` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`key`, `window_start`)
);
