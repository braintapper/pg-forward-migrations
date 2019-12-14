CREATE TABLE IF NOT EXISTS pg_migrations
(
  id bigserial,
  version_tag character varying(10) not null,
  description character varying(256) not null,
  script_path character varying(1024) not null,
  script_filename character varying(256) not null,
  script_md5 varchar(256) not null,
  executed_by character varying(100) not null,
  executed_at timestamp without time zone NOT NULL DEFAULT now(),
  execution_duration integer not null,
  success smallint not null,
  CONSTRAINT pg_migrations_pkey PRIMARY KEY (id)
);
