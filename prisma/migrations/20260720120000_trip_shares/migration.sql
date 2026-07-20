CREATE TABLE "TripShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TripShare_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TripShare_tripId_key" ON "TripShare"("tripId");
CREATE UNIQUE INDEX "TripShare_token_key" ON "TripShare"("token");
CREATE INDEX "TripShare_revokedAt_idx" ON "TripShare"("revokedAt");
