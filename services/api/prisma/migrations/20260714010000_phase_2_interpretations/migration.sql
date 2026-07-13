CREATE TABLE "input_interpretation_heads" (
    "input_manifest_id" UUID NOT NULL,
    "active_artifact_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "input_interpretation_heads_pkey" PRIMARY KEY ("input_manifest_id")
);

CREATE UNIQUE INDEX "input_interpretation_heads_active_artifact_id_key"
ON "input_interpretation_heads"("active_artifact_id");

ALTER TABLE "input_interpretation_heads"
ADD CONSTRAINT "input_interpretation_heads_input_manifest_id_fkey"
FOREIGN KEY ("input_manifest_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "input_interpretation_heads"
ADD CONSTRAINT "input_interpretation_heads_active_artifact_id_fkey"
FOREIGN KEY ("active_artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
