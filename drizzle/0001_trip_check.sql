CREATE TABLE "push_subscriptions" (
	"endpoint" text NOT NULL,
	"trip" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"baseline" text,
	"last_notified_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_trip_pk" PRIMARY KEY("endpoint","trip")
);
--> statement-breakpoint
CREATE TABLE "road_conditions" (
	"id" integer PRIMARY KEY NOT NULL,
	"roadway" text NOT NULL,
	"location" text,
	"area_name" text,
	"primary_condition" text NOT NULL,
	"secondary_conditions" jsonb NOT NULL,
	"visibility" text,
	"path" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "road_events" (
	"id" integer PRIMARY KEY NOT NULL,
	"roadway" text,
	"description" text NOT NULL,
	"event_type" text NOT NULL,
	"event_sub_type" text NOT NULL,
	"severity" text NOT NULL,
	"full_closure" boolean NOT NULL,
	"lanes_affected" text,
	"direction" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"lat2" double precision,
	"lng2" double precision,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weather_stations" (
	"id" integer PRIMARY KEY NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"air_temp_c" double precision,
	"pavement_temp_c" double precision,
	"wind_kmh" double precision,
	"wind_dir_deg" double precision,
	"humidity_pct" double precision,
	"observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "push_subscriptions_trip_idx" ON "push_subscriptions" USING btree ("trip");