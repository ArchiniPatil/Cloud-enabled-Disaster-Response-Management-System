ALTER TABLE resources ADD COLUMN location geography(Point,4326);
ALTER TABLE resources ADD COLUMN address text NOT NULL DEFAULT '';
ALTER TABLE resources ADD COLUMN publicly_listed boolean NOT NULL DEFAULT false;
ALTER TABLE resources ADD CONSTRAINT published_resource_location CHECK(NOT publicly_listed OR location IS NOT NULL);
CREATE INDEX resources_geo ON resources USING gist(location);
