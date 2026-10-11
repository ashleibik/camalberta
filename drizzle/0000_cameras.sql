CREATE TABLE "cameras" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"name" text NOT NULL,
	"road" text,
	"direction" text,
	"quadrant" text,
	"area" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"image_url" text NOT NULL,
	"status" text DEFAULT 'live' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cameras_source_source_id_idx" ON "cameras" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "cameras_area_idx" ON "cameras" USING btree ("area");--> statement-breakpoint
CREATE INDEX "cameras_status_idx" ON "cameras" USING btree ("status");