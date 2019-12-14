PgForwardMigration = require("../index.js")
fs = require("fs-extra")

config = fs.readJsonSync "./testconfig.json"

migrationJob = new PgForwardMigration(config)

migrationJob.migrate()
