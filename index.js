var PgForwardMigration, Sugar, chalk, fs, hasha, klawSync, path, pg;

Sugar = require("sugar-and-spice");

Sugar.extend();

path = require("path");

hasha = require("hasha");

fs = require("fs-extra");

chalk = require("chalk");

klawSync = require('klaw-sync');

pg = require('pg');

PgForwardMigration = (function() {
  class PgForwardMigration {
    constructor(config) {
      this.config = config;
      this.client = new pg.Pool(this.config.database);
    }

    async initialize_migrations_table() {
      var migration_sql, result, that;
      that = this;
      migration_sql = "CREATE TABLE IF NOT EXISTS pg_migrations\n(\n  id bigserial,\n  version_tag character varying(10) not null,\n  description character varying(256) not null,\n  script_path character varying(1024) not null,\n  script_filename character varying(256) not null,\n  script_md5 varchar(256) not null,\n  executed_by character varying(100) not null,\n  executed_at timestamp without time zone NOT NULL DEFAULT now(),\n  execution_duration integer not null,\n  success smallint not null,\n  CONSTRAINT pg_migrations_pkey PRIMARY KEY (id)\n);";
      console.log(chalk.gray("Ensuring that pg_migrations table exists."));
      result = (await this.client.query(migration_sql));
      return result;
    }

    async get_executed_migrations() {
      var result, sql;
      sql = "select * from pg_migrations order by id asc";
      result = (await this.client.query(sql));
      return this.executed_migrations = result.rows;
    }

    migration_filter(item) {
      // this is arbitrary
      // TODO: use a regex instead to detect ####__filename.sql
      return item.path.endsWith(".sql") && item.path.includes("__");
    }

    get_migration_files() {
      var migration_paths, scannedFiles, that;
      that = this;
      // backwards compatiblity fix
      if ((this.config.migrationPath != null) && (this.config.migration_path == null)) {
        this.config.migration_path = this.config.migrationPath;
      }
      scannedFiles = klawSync(`${this.config.migration_path}`, {
        nodir: true,
        filter: this.migration_filter
      }).sortBy(function(item) {
        return item.path;
      });
      migration_paths = scannedFiles.map(function(item) {
        return item.path;
      });
      return migration_paths.forEach(function(item) {
        var description, filename, filename_chunks, version_tag;
        filename = path.basename(item, ".sql");
        filename_chunks = filename.split("__");
        version_tag = filename.split("__")[0];
        description = filename.from(version_tag.length + 2).spacify();
        return that.queued_migrations.append({
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
    }

    check_completed_migrations() {
      var that;
      that = this;
      console.log(chalk.gray("Cleaning up executed migrations from queue..."));
      this.executed_migrations.forEach(function(executed_migration) {
        return that.queued_migrations.remove(function(file_migration) {
          if (file_migration.script_filename === executed_migration.script_filename) {
            console.log(chalk.gray(`${executed_migration.script_filename} already executed. Skipping`));
          }
          return file_migration.script_filename === executed_migration.script_filename;
        });
      });
      this.queued_migrations.forEach(function(queued_migration) {
        return console.log(chalk.white(`${queued_migration.script_filename} is new and will be queued.`));
      });
      if (this.queued_migrations.length === 0) {
        return console.log(chalk.yellow("No migrations outstanding"));
      } else {
        return console.log(`${that.queued_migrations.length} migrations outstanding.`);
      }
    }

    async run_migration(current_migration) {
      var err, logSql, migration_sql, result;
      process.stdout.write(chalk.yellow(`Migrating ${current_migration.script_filename}... `));
      try {
        logSql = "insert into pg_migrations (version_tag,description,script_path,script_filename,script_md5, executed_by,executed_at,execution_duration, success) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) ";
        migration_sql = fs.readFileSync(current_migration.script_path).toString();
        current_migration.executed_at = Date.create();
        result = (await this.client.query(migration_sql));
        process.stdout.write(chalk.green("ok!\n"));
        current_migration.execution_duration = current_migration.executed_at.millisecondsAgo();
        current_migration.success = 1;
        this.completed_migrations.push(current_migration);
        return result = (await this.client.query(logSql, Object.values(current_migration)));
      } catch (error) {
        err = error;
        process.stdout.write(chalk.red("failed!\n"));
        console.log("");
        console.log(chalk.red("-".repeat(80)));
        console.log("");
        console.log(`Migration failed: ${current_migration.script_filename}`);
        console.log("");
        console.log(err);
        console.log("");
        console.log(chalk.red("-".repeat(80)));
        console.log("");
        throw "Migration terminated due to errors.";
      }
    }

    async execute_outstanding_migrations() {
      var i, len, migration, ref, results;
      if (this.queued_migrations.length > 0) {
        console.log("Execute outstanding migrations");
        ref = this.queued_migrations;
        results = [];
        for (i = 0, len = ref.length; i < len; i++) {
          migration = ref[i];
          results.push((await this.run_migration(migration)));
        }
        return results;
      }
    }

    async outstanding_migrations() {
      var err;
      console.log(chalk.white("PG Forward Migrations - Outstanding"));
      try {
        await this.initialize_migrations_table();
        await this.get_migration_files();
        await this.get_executed_migrations();
        await this.check_completed_migrations();
        return this.queued_migrations.length - this.completed_migrations.length;
      } catch (error) {
        err = error;
        return console.error(chalk.red(err));
      } finally {
        await this.client.end();
      }
    }

    async migrate() {
      var err, that;
      console.log(chalk.white("PG Forward Migrations"));
      that = this;
      try {
        await this.initialize_migrations_table();
        await this.get_migration_files();
        await this.get_executed_migrations();
        await this.check_completed_migrations();
        return (await this.execute_outstanding_migrations());
      } catch (error) {
        err = error;
        return console.error(chalk.red(err));
      } finally {
        await this.client.end();
        console.log(chalk.white(`Migration ended. ${this.completed_migrations.length} ${"migration".pluralize(this.completed_migrations.length)} were executed.`));
        if (this.completed_migrations.length < this.queued_migrations.length) {
          console.log(chalk.red(`Due to errors, ${this.queued_migrations.length - this.completed_migrations.length} of ${this.queued_migrations.length} queued migrations were not run and remain outstanding.`));
        }
      }
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
