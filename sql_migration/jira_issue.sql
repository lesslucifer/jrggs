CREATE TABLE IF NOT EXISTS `jira_issue` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(32) NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `severity` VARCHAR(32) NOT NULL,
    `completedSprint` INT NULL,
    `completedAt` TIMESTAMP NULL,
    PRIMARY KEY (`id`),
    INDEX `key` (`key`),
    INDEX `completedSprint` (`completedSprint`),
    INDEX `completedAt` (`completedAt`)
);

CREATE TABLE IF NOT EXISTS `jira_issue_metrics` (
    `issueKey` VARCHAR(32) NOT NULL,
    `userId` VARCHAR(255) NOT NULL,
    `storyPoints` INT NOT NULL,
    `nRejections` INT NOT NULL,
    `nCodeReviews` INT NOT NULL,
    `nDefects` INT NOT NULL,
    PRIMARY KEY (`issueKey`, `userId`),
    INDEX `issueKey` (`issueKey`),
    INDEX `userId` (`userId`)
);