// reset
var chalk, client, config, fs, migrate, pg, resetSql;

migrate = require("../index.js");

fs = require("fs-extra");

pg = require('pg');

chalk = require("chalk");

console.log(chalk.yellow("Reset database"));

config = fs.readJsonSync("./config.json");

resetSql = fs.readFileSync("../testmigrations/reset.sql").toString();

client = new pg.Client(config.database);

client.connect();

client.query(resetSql).then(function(result) {
  return console.log(chalk.green("Database reset"));
}).catch(function(err) {
  console.log(chalk.red("Error trying to reset database"));
  return console.log(err);
}).finally(function() {
  return client.end();
});
