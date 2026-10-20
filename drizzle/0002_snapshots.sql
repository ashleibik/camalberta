CREATE TABLE "snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"camera_id" text NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"photo_at" timestamp with time zone,
	"image_key" text NOT NULL,
	"content_hash" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"brightness" double precision NOT NULL,
	"condition_id" integer,
	"condition_roadway" text,
	"condition_primary" text,
	"condition_secondary" jsonb,
	"condition_visibility" text,
	"condition_updated_at" timestamp with time zone,
	"condition_distance_m" double precision,
	"station_id" integer,
	"station_distance_m" double precision,
	"air_temp_c" double precision,
	"pavement_temp_c" double precision,
	"wind_kmh" double precision,
	"humidity_pct" double precision,
	"station_observed_at" timestamp with time zone,
	"auto_label" text,
	"auto_label_reason" text NOT NULL,
	"human_label" text,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "snapshots_image_key_unique" UNIQUE("image_key")
);
--> statement-breakpoint
CREATE INDEX "snapshots_camera_taken_idx" ON "snapshots" USING btree ("camera_id","taken_at");--> statement-breakpoint
CREATE INDEX "snapshots_taken_idx" ON "snapshots" USING btree ("taken_at");--> statement-breakpoint
CREATE INDEX "snapshots_reviewed_idx" ON "snapshots" USING btree ("reviewed_at");