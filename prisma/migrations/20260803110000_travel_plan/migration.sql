-- Add structured travel planning output to trips.
ALTER TABLE "Trip" ADD COLUMN "travelPlanJson" TEXT;
