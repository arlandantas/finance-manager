-- CreateTable
CREATE TABLE "SystemInfo" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SystemInfo_pkey" PRIMARY KEY ("key")
);
