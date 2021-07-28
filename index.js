var PgForwardMigration, Sugar, chalk, fs, hasha, path;

Sugar = require("sugar");

Sugar.extend();

path = require("path");

hasha = require("hasha");

fs = require("fs-extra");

chalk = require("chalk");

PgForwardMigration = (function() {
  class PgForwardMigration {
    constructor(config) {
      var pg;
      pg = require('pg');
      this.client = new pg.Pool(config.database);
      this.config = config;
    }

    // build the queue
    async enqueue() {
      var err, klawSync, migrationFilter, migrationPaths, result, scannedFiles, sql, that;
      that = this;
      // populate file_migrations array
      klawSync = require('klaw-sync');
      migrationFilter = function(item) {
        return item.path.endsWith(".sql") && item.path.includes("__");
      };
      scannedFiles = klawSync(`${this.config.migrationPath}`, {
        nodir: true,
        filter: migrationFilter
      }).sortBy(function(item) {
        return item.path;
      });
      migrationPaths = scannedFiles.map(function(item) {
        return item.path;
      });
      migrationPaths.forEach(function(item) {
        var description, filename, filename_chunks, version_tag;
        filename = path.basename(item, ".sql");
        filename_chunks = filename.split("__");
        version_tag = filename.split("__")[0];
        description = filename.from(version_tag.length + 2).spacify();
        return that.queued_migrations.push({
          version_tag: version_tag,
          description: description,
          script_path: item,
          script_filename: path.basename(item),
          script_md5: hasha.fromFileSync(item, {
            algorithm: 'md5'
          }),
          executed_by: that.config.database.user,
          executed_at: null,
          execution_duration: null,
          success: 0
        });
      });
      // populate executed_migrations array from db
      console.log(chalk.gray("Checking for completed migrations"));
      sql = "select * from pg_migrations order by id asc";
      try {
        result = (await this.client.query(sql));
        that.executed_migrations = result.rows;
        console.log(chalk.gray("Cleaning up executed migrations from queue..."));
        that.executed_migrations.forEach(function(executed_migration) {
          return that.queued_migrations.remove(function(file_migration) {
            if (file_migration.script_filename === executed_migration.script_filename) {
              console.log(chalk.gray(`${executed_migration.script_filename} already executed. Skipping`));
            }
            return file_migration.script_filename === executed_migration.script_filename;
          });
        });
        that.queued_migrations.forEach(function(queued_migration) {
          return console.log(chalk.white(`${queued_migration.script_filename} is new and will be queued.`));
        });
        console.log(`${that.queued_migrations.length} migrations outstanding.`);
        return that.nextInQueue();
      } catch (error) {
        err = error;
        console.log(chalk.red("Error while retrieving executed migrations"));
        console.log(err);
        return that.finish();
      }
    }

    async nextInQueue(rootScope) {
      var currentMigration, err, innerErr, logSql, migrationSql, result, that;
      that = this;
      logSql = "insert into pg_migrations (version_tag,description,script_path,script_filename,script_md5, executed_by,executed_at,execution_duration, success) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) ";
      if (this.queued_migrations.length > 0) {
        currentMigration = this.queued_migrations.shift();
        migrationSql = fs.readFileSync(currentMigration.script_path).toString();
        currentMigration.executed_at = Date.create();
        try {
          result = (await this.client.query(migrationSql));
          currentMigration.execution_duration = currentMigration.executed_at.millisecondsAgo();
          currentMigration.success = 1;
          that.completed_migrations.push(currentMigration);
          console.info(chalk.green(`Migrating: ${currentMigration.script_filename}`));
          try {
            // log migration
            result = (await this.client.query(logSql, Object.values(currentMigration)));
            return that.nextInQueue();
          } catch (error) {
            innerErr = error;
            console.error(chalk.red("Error trying to record migration into pg_migrations"));
            console.error(innerErr);
            return that.finish();
          }
        } catch (error) {
          err = error;
          console.error(chalk.red(`Error trying to migrate ${currentMigration.script_filename}`));
          console.log("-".repeat(120));
          console.error("Trace:");
          console.error(err);
          console.log("-".repeat(120));
          console.log("");
          return that.finish();
        }
      } else {
        return that.finish();
      }
    }

    // Check the migrations table, create if it doesn't exist, then enqueue migrations
    async start() {
      var err, migrationSql, result, that;
      that = this;
      
      console.log(chalk.gray("Check Migrations Table"));
      migrationSql = "CREATE TABLE IF NOT EXISTS pg_migrations\n(\n  id bigserial,\n  version_tag character varying(10) not null,\n  description character varying(256) not null,\n  script_path character varying(1024) not null,\n  script_filename character varying(256) not null,\n  script_md5 varchar(256) not null,\n  executed_by character varying(100) not null,\n  executed_at timestamp without time zone NOT NULL DEFAULT now(),\n  execution_duration integer not null,\n  success smallint not null,\n  CONSTRAINT pg_migrations_pkey PRIMARY KEY (id)\n);\n";
      console.log(chalk.gray("Ensuring that pg_migrations table exists."));
      try {
        result = (await (result = (await this.client.query(migrationSql))));
        return that.enqueue();
      } catch (error) {
        err = error;
        console.log(chalk.red("Error trying to check the pg_migrations table exists"));
        console.log(err);
        return that.finish();
      }
    }

    migrate() {
      console.log(chalk.white("PG Forward Migrations"));
      return this.start();
    }

    finish() {
      this.client.end();
      return console.log(chalk.white(`Task finished. ${this.completed_migrations.length} migrations were executed.`));
    }

  };

  PgForwardMigration.prototype.client = {};

  PgForwardMigration.prototype.config = {};

  PgForwardMigration.prototype.executed_migrations = [];

  PgForwardMigration.prototype.queued_migrations = [];

  PgForwardMigration.prototype.completed_migrations = [];

  return PgForwardMigration;

}).call(this);

module.exports = PgForwardMigration;
