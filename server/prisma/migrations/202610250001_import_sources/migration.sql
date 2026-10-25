-- CreateTable
CREATE TABLE "ImportSource" (
    "importJobId" UUID NOT NULL,
    "content" BYTEA NOT NULL,

    CONSTRAINT "ImportSource_pkey" PRIMARY KEY ("importJobId")
);

-- AddForeignKey
ALTER TABLE "ImportSource" ADD CONSTRAINT "ImportSource_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

