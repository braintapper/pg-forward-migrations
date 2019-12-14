var config, fs, migrate, migrationJob;

migrate = require("../index.js");

fs = require("fs-extra");

console.log("test");

config = fs.readJsonSync("./testconfig.json");

console.log(config);

migrationJob = new migrate(config);

//migrationJob.enumerateScripts()
console.log(migrationJob.migrations);

migrationJob.migrate();
