# reset

migrate = require("../index.js")
fs = require("fs-extra")
pg = require('pg')
chalk = require("chalk")


console.log chalk.yellow("Reset database")



config = fs.readJsonSync("./config.json")
resetSql = fs.readFileSync("../testmigrations/reset.sql").toString()


client = new pg.Client(config.database)
client.connect()

client.query(resetSql)
.then (result) ->
  console.log chalk.green("Database reset")
.catch (err)->
  console.log chalk.red("Error trying to reset database")
  console.log err
.finally ()->
  client.end()
