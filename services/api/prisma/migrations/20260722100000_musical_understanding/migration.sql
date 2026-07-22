-- AlterEnum
ALTER TYPE "ArtifactType" ADD VALUE 'AUDIO_UNDERSTANDING';

-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');
CREATE TYPE "WorkflowRunKind" AS ENUM ('AUDIO_UNDERSTANDING');

-- CreateTable
CREATE TABLE "audio_understanding_heads" (
    "input_manifest_id" UUID NOT NULL,
    "active_artifact_id" UUID NOT NULL,
    "interpretation_artifact_id" UUID NOT NULL,
    "interpretation_version" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "audio_understanding_heads_pkey" PRIMARY KEY ("input_manifest_id")
);

-- CreateTable
CREATE TABLE "workflow_runs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" "WorkflowRunKind" NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'RUNNING',
    "stage" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "correlation_id" TEXT,
    "input_manifest_id" UUID,
    "result_artifact_id" UUID,
    "error" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "audio_understanding_heads_active_artifact_id_key" ON "audio_understanding_heads"("active_artifact_id");

-- CreateIndex
CREATE INDEX "workflow_runs_project_id_created_at_idx" ON "workflow_runs"("project_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "audio_understanding_heads" ADD CONSTRAINT "audio_understanding_heads_input_manifest_id_fkey" FOREIGN KEY ("input_manifest_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_understanding_heads" ADD CONSTRAINT "audio_understanding_heads_active_artifact_id_fkey" FOREIGN KEY ("active_artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
