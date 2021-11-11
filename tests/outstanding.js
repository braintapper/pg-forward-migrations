var PgForwardMigration, config, fs, migration_job, outstanding;

PgForwardMigration = require("../index.js");

fs = require("fs-extra");

config = fs.readJsonSync("./config.json");

migration_job = new PgForwardMigration(config);

outstanding = async function() {
  var result;
  result = (await migration_job.outstanding_migrations());
  return console.log(result);
};

outstanding();
