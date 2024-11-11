let query_result = {
	query: `/* Timescale edition */
WITH fk_info_timescale AS (
    SELECT array_to_string(array_agg(CONCAT('{"schema":"', replace(schema_name, '"', ''), '"',
                                            ',"table":"', replace(table_name::text, '"', ''), '"',
                                            ',"column":"', replace(fk_column::text, '"', ''), '"',
                                            ',"foreign_key_name":"', foreign_key_name, '"',
                                            ',"reference_schema":"', COALESCE(reference_schema, 'public'), '"',
                                            ',"reference_table":"', reference_table, '"',
                                            ',"reference_column":"', reference_column, '"',
                                            ',"fk_def":"', replace(fk_def, '"', ''),
                                            '"}')), ',') as fk_metadata
    FROM (
            SELECT c.conname AS foreign_key_name,
                    n.nspname AS schema_name,
                    CASE
                        WHEN position('.' in conrelid::regclass::text) > 0
                        THEN split_part(conrelid::regclass::text, '.', 2)
                        ELSE conrelid::regclass::text
                    END AS table_name,
                    a.attname AS fk_column,
                    nr.nspname AS reference_schema,
                    CASE
                        WHEN position('.' in confrelid::regclass::text) > 0
                        THEN split_part(confrelid::regclass::text, '.', 2)
                        ELSE confrelid::regclass::text
                    END AS reference_table,
                    af.attname AS reference_column,
                    pg_get_constraintdef(c.oid) as fk_def
                FROM
                    pg_constraint AS c
                JOIN
                    pg_attribute AS a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
                JOIN
                    pg_class AS cl ON cl.oid = c.conrelid
                JOIN
                    pg_namespace AS n ON n.oid = cl.relnamespace
                JOIN
                    pg_attribute AS af ON af.attnum = ANY(c.confkey) AND af.attrelid = c.confrelid
                JOIN
                    pg_class AS clf ON clf.oid = c.confrelid
                JOIN
                    pg_namespace AS nr ON nr.oid = clf.relnamespace
                WHERE
                    c.contype = 'f'
                    AND connamespace::regnamespace::text NOT IN ('information_schema', 'pg_catalog')
                AND connamespace::regnamespace::text !~ '^(timescaledb_|_timescaledb_)'
    
    ) AS x
), pk_info AS (
    SELECT array_to_string(array_agg(CONCAT('{"schema":"', replace(schema_name, '"', ''), '"',
                                            ',"table":"', replace(pk_table, '"', ''), '"',
                                            ',"column":"', replace(pk_column, '"', ''), '"',
                                            ',"pk_def":"', replace(pk_def, '"', ''),
                                            '"}')), ',') AS pk_metadata
    FROM (
            SELECT connamespace::regnamespace::text AS schema_name,
                CASE
                    WHEN strpos(conrelid::regclass::text, '.') > 0
                    THEN split_part(conrelid::regclass::text, '.', 2)
                    ELSE conrelid::regclass::text
                END AS pk_table,
                unnest(string_to_array(substring(pg_get_constraintdef(oid) FROM '\((.*?)\)'), ',')) AS pk_column,
                pg_get_constraintdef(oid) as pk_def
            FROM
              pg_constraint
            WHERE
              contype = 'p'
              AND connamespace::regnamespace::text NOT IN ('information_schema', 'pg_catalog')
                AND connamespace::regnamespace::text !~ '^(timescaledb_|_timescaledb_)'
    
    ) AS y
),
indexes_cols AS (
    SELECT  tnsp.nspname                                                                AS schema_name,
        trel.relname                                                                    AS table_name,
            pg_relation_size('"' || tnsp.nspname || '".' || '"' || irel.relname || '"') AS index_size,
            irel.relname                                                                AS index_name,
            am.amname                                                                   AS index_type,
            a.attname                                                                   AS col_name,
            (CASE WHEN i.indisunique = TRUE THEN 'true' ELSE 'false' END)               AS is_unique,
            irel.reltuples                                                              AS cardinality,
            1 + Array_position(i.indkey, a.attnum)                                      AS column_position,
            CASE o.OPTION & 1 WHEN 1 THEN 'DESC' ELSE 'ASC' END                         AS direction,
            CASE WHEN indpred IS NOT NULL THEN 'true' ELSE 'false' END                  AS is_partial_index
    FROM pg_index AS i
        JOIN pg_class AS trel ON trel.oid = i.indrelid
        JOIN pg_namespace AS tnsp ON trel.relnamespace = tnsp.oid
        JOIN pg_class AS irel ON irel.oid = i.indexrelid
        JOIN pg_am AS am ON irel.relam = am.oid
        CROSS JOIN LATERAL unnest (i.indkey)
        WITH ORDINALITY AS c (colnum, ordinality) LEFT JOIN LATERAL unnest (i.indoption)
        WITH ORDINALITY AS o (option, ordinality)
        ON c.ordinality = o.ordinality JOIN pg_attribute AS a ON trel.oid = a.attrelid AND a.attnum = c.colnum
    WHERE tnsp.nspname NOT LIKE 'pg_%'
    GROUP BY tnsp.nspname, trel.relname, irel.relname, am.amname, i.indisunique, i.indexrelid, irel.reltuples, a.attname, Array_position(i.indkey, a.attnum), o.OPTION, i.indpred
),
cols AS (
    SELECT array_to_string(array_agg(CONCAT('{"schema":"', cols.table_schema,
                                            '","table":"', cols.table_name,
                                            '","name":"', cols.column_name,
                                            '","ordinal_position":"', cols.ordinal_position,
                                            '","type":"', LOWER(replace(cols.data_type, '"', '')),
                                            '","character_maximum_length":"', COALESCE(cols.character_maximum_length::text, 'null'),
                                            '","precision":',
                                                CASE
                                                    WHEN cols.data_type = 'numeric' OR cols.data_type = 'decimal'
                                                    THEN CONCAT('{"precision":', COALESCE(cols.numeric_precision::text, 'null'),
                                                                ',"scale":', COALESCE(cols.numeric_scale::text, 'null'), '}')
                                                    ELSE 'null'
                                                END,
                                            ',"nullable":', CASE WHEN (cols.IS_NULLABLE = 'YES') THEN 'true' ELSE 'false' END,
                                            ',"default":"', COALESCE(replace(replace(cols.column_default, '"', '\"'), '\\x', '\\x'), ''),
                                            '","collation":"', COALESCE(cols.COLLATION_NAME, ''),
                                            '","comment":"', COALESCE(replace(replace(dsc.description, '"', '\"'), '\\x', '\\x'), ''),
                                            '"}')), ',') AS cols_metadata
    FROM information_schema.columns cols
    LEFT JOIN pg_catalog.pg_class c
        ON c.relname = cols.table_name
    JOIN pg_catalog.pg_namespace n
        ON n.oid = c.relnamespace AND n.nspname = cols.table_schema
    LEFT JOIN pg_catalog.pg_description dsc ON dsc.objoid = c.oid
                                        AND dsc.objsubid = cols.ordinal_position
    WHERE cols.table_schema NOT IN ('information_schema', 'pg_catalog')
                AND cols.table_schema !~ '^(timescaledb_|_timescaledb_)'
                AND cols.table_name !~ '^(pg_stat_)'
    
), indexes_metadata AS (
    SELECT array_to_string(array_agg(CONCAT('{"schema":"', schema_name,
                                            '","table":"', table_name,
                                            '","name":"', index_name,
                                            '","column":"', replace(col_name :: TEXT, '"', E'"'),
                                            '","index_type":"', index_type,
                                            '","cardinality":', cardinality,
                                            ',"size":', index_size,
                                            ',"unique":', is_unique,
                                            ',"is_partial_index":', is_partial_index,
                                            ',"column_position":', column_position,
                                            ',"direction":"', LOWER(direction),
                                            '"}')), ',') AS indexes_metadata
    FROM indexes_cols x 
                WHERE schema_name !~ '^(timescaledb_|_timescaledb_)'
    
), tbls AS (
    SELECT array_to_string(array_agg(CONCAT('{',
                        '"schema":"', tbls.TABLE_SCHEMA, '",',
                        '"table":"', tbls.TABLE_NAME, '",',
                        '"rows":', COALESCE((SELECT s.n_live_tup
                                                FROM pg_stat_user_tables s
                                                WHERE tbls.TABLE_SCHEMA = s.schemaname AND tbls.TABLE_NAME = s.relname),
                                                0), ', "type":"', tbls.TABLE_TYPE, '",', '"engine":"",', '"collation":"",',
                        '"comment":"', COALESCE(replace(replace(dsc.description, '"', '\"'), '\\x', '\\x'), ''),
                        '"}'
                )),
                ',') AS tbls_metadata
        FROM information_schema.tables tbls
        LEFT JOIN pg_catalog.pg_class c ON c.relname = tbls.TABLE_NAME
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                                            AND n.nspname = tbls.TABLE_SCHEMA
        LEFT JOIN pg_catalog.pg_description dsc ON dsc.objoid = c.oid
                                                AND dsc.objsubid = 0
        WHERE tbls.TABLE_SCHEMA NOT IN ('information_schema', 'pg_catalog') 
                AND tbls.table_schema !~ '^(timescaledb_|_timescaledb_)'
                AND tbls.table_name !~ '^(pg_stat_)'
    
), config AS (
    SELECT array_to_string(
                      array_agg(CONCAT('{"name":"', conf.name, '","value":"', replace(conf.setting, '"', E'"'), '"}')),
                      ',') AS config_metadata
    FROM pg_settings conf
), views AS (
    SELECT array_to_string(array_agg(CONCAT('{"schema":"', views.schemaname,
                      '","view_name":"', viewname,
                      '","view_definition":"', encode(convert_to(REPLACE(definition, '"', '\"'), 'UTF8'), 'base64'),
                    '"}')),
                      ',') AS views_metadata
    FROM pg_views views
    WHERE views.schemaname NOT IN ('information_schema', 'pg_catalog') 
                AND views.schemaname !~ '^(timescaledb_|_timescaledb_)'
    
)
SELECT CONCAT('{    "fk_info": [', COALESCE(fk_metadata, ''),
                    '], "pk_info": [', COALESCE(pk_metadata, ''),
                    '], "columns": [', COALESCE(cols_metadata, ''),
                    '], "indexes": [', COALESCE(indexes_metadata, ''),
                    '], "tables":[', COALESCE(tbls_metadata, ''),
                    '], "views":[', COALESCE(views_metadata, ''),
                    '], "database_name": "', CURRENT_DATABASE(), '', '", "version": "', '',
              '"}') AS metadata_json_to_import
FROM fk_info_timescale, pk_info, cols, indexes_metadata, tbls, config, views;
;`,
	result:{
	"metadata_json_to_import":{
	    "fk_info": [{
	"schema":"ai",
	"table":"vectorizer_errors",
	"column":"id",
	"foreign_key_name":"vectorizer_errors_id_fkey",
	"reference_schema":"ai",
	"reference_table":"vectorizer",
	"reference_column":"id",
	"fk_def":"FOREIGN KEY (id) REFERENCES ai.vectorizer(id) ON DELETE CASCADE"
}], "pk_info": [{
	"schema":"ai",
	"table":"migration",
	"column":"name",
	"pk_def":"PRIMARY KEY (name)"
},{
	"schema":"ai",
	"table":"vectorizer",
	"column":"id",
	"pk_def":"PRIMARY KEY (id)"
},{
	"schema":"ai",
	"table":"_secret_permissions",
	"column":"name",
	"pk_def":"PRIMARY KEY (name, role)"
},{
	"schema":"ai",
	"table":"_secret_permissions",
	"column":" role",
	"pk_def":"PRIMARY KEY (name, role)"
},{
	"schema":"public",
	"table":"my_table",
	"column":"id",
	"pk_def":"PRIMARY KEY (id)"
}], "columns": [{
	"schema":"public",
	"table":"my_table",
	"name":"id",
	"ordinal_position":"1",
	"type":"integer",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"nextval('my_table_id_seq'::regclass)",
	"collation":"",
	"comment":""
},{
	"schema":"public",
	"table":"my_table",
	"name":"fulltext",
	"ordinal_position":"2",
	"type":"text",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"public",
	"table":"my_table",
	"name":"Column",
	"ordinal_position":"3",
	"type":"character varying",
	"character_maximum_length":"255",
	"precision":null,"nullable":true,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"public",
	"table":"my_table",
	"name":"created_at",
	"ordinal_position":"4",
	"type":"timestamp without time zone",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"CURRENT_TIMESTAMP",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"_secret_permissions",
	"name":"name",
	"ordinal_position":"1",
	"type":"text",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"_secret_permissions",
	"name":"role",
	"ordinal_position":"2",
	"type":"text",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"migration",
	"name":"name",
	"ordinal_position":"1",
	"type":"text",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"migration",
	"name":"applied_at_version",
	"ordinal_position":"2",
	"type":"text",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"migration",
	"name":"applied_at",
	"ordinal_position":"3",
	"type":"timestamp with time zone",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"clock_timestamp()",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"migration",
	"name":"body",
	"ordinal_position":"4",
	"type":"text",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"secret_permissions",
	"name":"name",
	"ordinal_position":"1",
	"type":"text",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"secret_permissions",
	"name":"role",
	"ordinal_position":"2",
	"type":"text",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer",
	"name":"id",
	"ordinal_position":"1",
	"type":"integer",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer",
	"name":"source_schema",
	"ordinal_position":"2",
	"type":"name",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"",
	"collation":"C",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer",
	"name":"source_table",
	"ordinal_position":"3",
	"type":"name",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"",
	"collation":"C",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer",
	"name":"source_pk",
	"ordinal_position":"4",
	"type":"jsonb",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer",
	"name":"target_schema",
	"ordinal_position":"5",
	"type":"name",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"",
	"collation":"C",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer",
	"name":"target_table",
	"ordinal_position":"6",
	"type":"name",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"",
	"collation":"C",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer",
	"name":"view_schema",
	"ordinal_position":"7",
	"type":"name",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"",
	"collation":"C",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer",
	"name":"view_name",
	"ordinal_position":"8",
	"type":"name",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"",
	"collation":"C",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer",
	"name":"trigger_name",
	"ordinal_position":"9",
	"type":"name",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"",
	"collation":"C",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer",
	"name":"queue_schema",
	"ordinal_position":"10",
	"type":"name",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"C",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer",
	"name":"queue_table",
	"ordinal_position":"11",
	"type":"name",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"C",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer",
	"name":"config",
	"ordinal_position":"12",
	"type":"jsonb",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer_errors",
	"name":"id",
	"ordinal_position":"1",
	"type":"integer",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer_errors",
	"name":"message",
	"ordinal_position":"2",
	"type":"text",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer_errors",
	"name":"details",
	"ordinal_position":"3",
	"type":"jsonb",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer_errors",
	"name":"recorded",
	"ordinal_position":"4",
	"type":"timestamp with time zone",
	"character_maximum_length":"null",
	"precision":null,"nullable":false,"default":"now()",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer_status",
	"name":"id",
	"ordinal_position":"1",
	"type":"integer",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer_status",
	"name":"source_table",
	"ordinal_position":"2",
	"type":"text",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"C",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer_status",
	"name":"target_table",
	"ordinal_position":"3",
	"type":"text",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"C",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer_status",
	"name":"view",
	"ordinal_position":"4",
	"type":"text",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"C",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer_status",
	"name":"pending_items",
	"ordinal_position":"5",
	"type":"bigint",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"public",
	"table":"pg_buffercache",
	"name":"bufferid",
	"ordinal_position":"1",
	"type":"integer",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"public",
	"table":"pg_buffercache",
	"name":"relfilenode",
	"ordinal_position":"2",
	"type":"oid",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"public",
	"table":"pg_buffercache",
	"name":"reltablespace",
	"ordinal_position":"3",
	"type":"oid",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"public",
	"table":"pg_buffercache",
	"name":"reldatabase",
	"ordinal_position":"4",
	"type":"oid",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"public",
	"table":"pg_buffercache",
	"name":"relforknumber",
	"ordinal_position":"5",
	"type":"smallint",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"public",
	"table":"pg_buffercache",
	"name":"relblocknumber",
	"ordinal_position":"6",
	"type":"bigint",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"public",
	"table":"pg_buffercache",
	"name":"isdirty",
	"ordinal_position":"7",
	"type":"boolean",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"public",
	"table":"pg_buffercache",
	"name":"usagecount",
	"ordinal_position":"8",
	"type":"smallint",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"",
	"comment":""
},{
	"schema":"public",
	"table":"pg_buffercache",
	"name":"pinning_backends",
	"ordinal_position":"9",
	"type":"integer",
	"character_maximum_length":"null",
	"precision":null,"nullable":true,"default":"",
	"collation":"",
	"comment":""
}], "indexes": [{
	"schema":"ai",
	"table":"_secret_permissions",
	"name":"_secret_permissions_pkey",
	"column":"name",
	"index_type":"btree",
	"cardinality":0,"size":16384,"unique":true,"is_partial_index":false,"column_position":1,"direction":"asc"
},{
	"schema":"ai",
	"table":"migration",
	"name":"migration_pkey",
	"column":"name",
	"index_type":"btree",
	"cardinality":0,"size":16384,"unique":true,"is_partial_index":false,"column_position":1,"direction":"asc"
},{
	"schema":"ai",
	"table":"_secret_permissions",
	"name":"_secret_permissions_pkey",
	"column":"role",
	"index_type":"btree",
	"cardinality":0,"size":16384,"unique":true,"is_partial_index":false,"column_position":2,"direction":"asc"
},{
	"schema":"public",
	"table":"my_table",
	"name":"idx_my_table_column",
	"column":"Column",
	"index_type":"btree",
	"cardinality":0,"size":8192,"unique":false,"is_partial_index":false,"column_position":1,"direction":"asc"
},{
	"schema":"ai",
	"table":"vectorizer_errors",
	"name":"vectorizer_errors_id_recorded_idx",
	"column":"id",
	"index_type":"btree",
	"cardinality":0,"size":8192,"unique":false,"is_partial_index":false,"column_position":1,"direction":"asc"
},{
	"schema":"public",
	"table":"my_table",
	"name":"my_table_pkey",
	"column":"id",
	"index_type":"btree",
	"cardinality":0,"size":8192,"unique":true,"is_partial_index":false,"column_position":1,"direction":"asc"
},{
	"schema":"ai",
	"table":"vectorizer",
	"name":"vectorizer_target_schema_target_table_key",
	"column":"target_table",
	"index_type":"btree",
	"cardinality":0,"size":8192,"unique":true,"is_partial_index":false,"column_position":2,"direction":"asc"
},{
	"schema":"ai",
	"table":"vectorizer_errors",
	"name":"vectorizer_errors_id_recorded_idx",
	"column":"recorded",
	"index_type":"btree",
	"cardinality":0,"size":8192,"unique":false,"is_partial_index":false,"column_position":2,"direction":"asc"
},{
	"schema":"ai",
	"table":"vectorizer",
	"name":"vectorizer_target_schema_target_table_key",
	"column":"target_schema",
	"index_type":"btree",
	"cardinality":0,"size":8192,"unique":true,"is_partial_index":false,"column_position":1,"direction":"asc"
},{
	"schema":"ai",
	"table":"vectorizer",
	"name":"vectorizer_pkey",
	"column":"id",
	"index_type":"btree",
	"cardinality":0,"size":8192,"unique":true,"is_partial_index":false,"column_position":1,"direction":"asc"
}], "tables":[{
	"schema":"public",
	"table":"my_table",
	"rows":0, "type":"BASE TABLE",
	"engine":"",
	"collation":"",
	"comment":""
},{
	"schema":"public",
	"table":"pg_buffercache",
	"rows":0, "type":"VIEW",
	"engine":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"_secret_permissions",
	"rows":2, "type":"BASE TABLE",
	"engine":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"migration",
	"rows":2, "type":"BASE TABLE",
	"engine":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"secret_permissions",
	"rows":0, "type":"VIEW",
	"engine":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer",
	"rows":0, "type":"BASE TABLE",
	"engine":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer_errors",
	"rows":0, "type":"BASE TABLE",
	"engine":"",
	"collation":"",
	"comment":""
},{
	"schema":"ai",
	"table":"vectorizer_status",
	"rows":0, "type":"VIEW",
	"engine":"",
	"collation":"",
	"comment":""
}], "views":[{
	"schema":"public",
	"view_name":"pg_stat_statements_info",
	"view_definition":"IFNFTEVDVCBkZWFsbG9jLAogICAgc3RhdHNfcmVzZXQKICAgRlJPTSBwZ19zdGF0X3N0YXRlbWVundHNfaW5mbygpIHBnX3N0YXRfc3RhdGVtZW50c19pbmZvKGRlYWxsb2MsIHN0YXRzX3Jlc2V0KTs="
},{
	"schema":"public",
	"view_name":"pg_stat_statements",
	"view_definition":"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"
},{
	"schema":"ai",
	"view_name":"secret_permissions",
	"view_definition":"IFNFTEVDVCBuYW1lLAogICAgcm9sZQogICBGUk9NIGFpLl9zZWNyZXRfcGVybWlzc2lvbnMKICBXnSEVSRSAoKHRvX3JlZ3JvbGUocm9sZSkgSVMgTk9UIE5VTEwpIEFORCBwZ19oYXNfcm9sZShDVVJSnRU5UX1VTRVIsIChyb2xlKTo6bmFtZSwgJ21lbWJlcic6OnRleHQpKTs="
},{
	"schema":"ai",
	"view_name":"vectorizer_status",
	"view_definition":"IFNFTEVDVCBpZCwKICAgIGZvcm1hdCgnJUkuJUknOjp0ZXh0LCBzb3VyY2Vfc2NoZW1hLCBzb3VynY2VfdGFibGUpIEFTIHNvdXJjZV90YWJsZSwKICAgIGZvcm1hdCgnJUkuJUknOjp0ZXh0LCB0YXJnnZXRfc2NoZW1hLCB0YXJnZXRfdGFibGUpIEFTIHRhcmdldF90YWJsZSwKICAgIGZvcm1hdCgnJUkunJUknOjp0ZXh0LCB2aWV3X3NjaGVtYSwgdmlld19uYW1lKSBBUyB2aWV3LAogICAgICAgIENBU0UKnICAgICAgICAgICAgV0hFTiAocXVldWVfdGFibGUgSVMgTk9UIE5VTEwpIFRIRU4gYWkudmVjdG9ynaXplcl9xdWV1ZV9wZW5kaW5nKGlkKQogICAgICAgICAgICBFTFNFICgwKTo6YmlnaW50CiAgICAgnICAgRU5EIEFTIHBlbmRpbmdfaXRlbXMKICAgRlJPTSBhaS52ZWN0b3JpemVyIHY7"
},{
	"schema":"public",
	"view_name":"pg_buffercache",
	"view_definition":"IFNFTEVDVCBidWZmZXJpZCwKICAgIHJlbGZpbGVub2RlLAogICAgcmVsdGFibGVzcGFjZSwKICAgnIHJlbGRhdGFiYXNlLAogICAgcmVsZm9ya251bWJlciwKICAgIHJlbGJsb2NrbnVtYmVyLAogICAgnaXNkaXJ0eSwKICAgIHVzYWdlY291bnQsCiAgICBwaW5uaW5nX2JhY2tlbmRzCiAgIEZST00gcGdfnYnVmZmVyY2FjaGVfcGFnZXMoKSBwKGJ1ZmZlcmlkIGludGVnZXIsIHJlbGZpbGVub2RlIG9pZCwgncmVsdGFibGVzcGFjZSBvaWQsIHJlbGRhdGFiYXNlIG9pZCwgcmVsZm9ya251bWJlciBzbWFsbGlundCwgcmVsYmxvY2tudW1iZXIgYmlnaW50LCBpc2RpcnR5IGJvb2xlYW4sIHVzYWdlY291bnQgc21hnbGxpbnQsIHBpbm5pbmdfYmFja2VuZHMgaW50ZWdlcik7"
}], "database_name": "tsdb",
	 "version": ""
}
}
}