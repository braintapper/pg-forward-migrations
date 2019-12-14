PgForwardMigrations = require("../index.js")
fs = require("fs-extra")

config = fs.readJsonSync "./testconfig.json"

migrationJob = new PgForwardMigrations(config)

migrationJob.migrate()
