PgForwardMigration = require("../index.js")
fs = require("fs-extra")

config = fs.readJsonSync("./config.json")

migration_job = new PgForwardMigration(config)

outstanding = ()->
  result = await migration_job.outstanding_migrations()
  console.log result

outstanding()
