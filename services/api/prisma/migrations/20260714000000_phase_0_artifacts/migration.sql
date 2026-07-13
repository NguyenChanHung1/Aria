CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETE', 'FAILED', 'ARCHIVED');
CREATE TYPE "ArtifactType" AS ENUM ('INPUT_MANIFEST', 'REQUIREMENTS', 'CREATIVE_BRIEF', 'SONG_BLUEPRINT', 'LYRICS', 'SYMBOLIC_SCORE', 'ARRANGEMENT', 'PERFORMANCE', 'STEM', 'MIX', 'MASTER', 'REVIEW', 'EXPORT', 'SOURCE_MEDIA', 'NORMALIZED_AUDIO', 'ANALYSIS', 'PREVIEW');
CREATE TYPE "ArtifactNamespace" AS ENUM ('ORIGINALS', 'NORMALIZED_AUDIO', 'ANALYSIS', 'REQUIREMENTS', 'CREATIVE_DIRECTION', 'BLUEPRINTS', 'LYRICS', 'SCORES', 'ARRANGEMENTS', 'PERFORMANCES', 'STEMS', 'MIXES', 'MASTERS', 'REVIEWS', 'PREVIEWS', 'EXPORTS');
CREATE TYPE "ArtifactStatus" AS ENUM ('PENDING', 'PROCESSING', 'AVAILABLE', 'FAILED', 'SUPERSEDED', 'DELETED');
CREATE TYPE "DependencyKind" AS ENUM ('DERIVED_FROM', 'REQUIRES', 'COMPOSES', 'REFERENCES');
CREATE TYPE "RetentionClass" AS ENUM ('ORIGINAL', 'INTERMEDIATE', 'PREVIEW', 'FINAL');
CREATE TYPE "ReviewDecision" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

CREATE TABLE "projects" (
  "id" UUID NOT NULL, "schema_version" TEXT NOT NULL DEFAULT '1.0.0',
  "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT', "title" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}', "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "artifacts" (
  "id" UUID NOT NULL, "project_id" UUID NOT NULL, "type" "ArtifactType" NOT NULL,
  "namespace" "ArtifactNamespace" NOT NULL, "logical_name" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "schema_version" TEXT NOT NULL, "status" "ArtifactStatus" NOT NULL DEFAULT 'PENDING',
  "object_key" TEXT NOT NULL, "mime_type" TEXT NOT NULL, "file_size" BIGINT,
  "checksum_sha256" CHAR(64), "duration_ms" INTEGER, "sample_rate" INTEGER, "channels" INTEGER,
  "pipeline_phase" TEXT, "quality_score" DECIMAL(5,4), "model_version" TEXT, "prompt_version" TEXT,
  "provenance" JSONB NOT NULL DEFAULT '{}', "payload" JSONB NOT NULL DEFAULT '{}',
  "retention_class" "RetentionClass" NOT NULL, "expires_at" TIMESTAMPTZ(6),
  "parent_artifact_id" UUID, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "artifact_dependencies" (
  "artifact_id" UUID NOT NULL, "depends_on_id" UUID NOT NULL,
  "kind" "DependencyKind" NOT NULL DEFAULT 'REQUIRES',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "artifact_dependencies_pkey" PRIMARY KEY ("artifact_id", "depends_on_id", "kind"),
  CONSTRAINT "artifact_dependencies_no_self_reference" CHECK ("artifact_id" <> "depends_on_id")
);

CREATE TABLE "human_edits" (
  "id" UUID NOT NULL, "artifact_id" UUID NOT NULL, "editor_id" TEXT, "base_checksum" CHAR(64),
  "patch" JSONB NOT NULL, "summary" TEXT, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "human_edits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reviews" (
  "id" UUID NOT NULL, "project_id" UUID NOT NULL, "artifact_id" UUID, "schema_version" TEXT NOT NULL,
  "decision" "ReviewDecision" NOT NULL DEFAULT 'PENDING', "quality_score" DECIMAL(5,4),
  "reviewer_id" TEXT, "notes" TEXT, "payload" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "artifacts_object_key_key" ON "artifacts"("object_key");
CREATE INDEX "artifacts_project_id_namespace_status_idx" ON "artifacts"("project_id", "namespace", "status");
CREATE INDEX "artifacts_parent_artifact_id_idx" ON "artifacts"("parent_artifact_id");
CREATE UNIQUE INDEX "artifacts_project_id_type_logical_name_version_key" ON "artifacts"("project_id", "type", "logical_name", "version");
CREATE INDEX "artifact_dependencies_depends_on_id_idx" ON "artifact_dependencies"("depends_on_id");
CREATE INDEX "human_edits_artifact_id_created_at_idx" ON "human_edits"("artifact_id", "created_at");
CREATE INDEX "reviews_project_id_artifact_id_created_at_idx" ON "reviews"("project_id", "artifact_id", "created_at");

ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_parent_artifact_id_fkey" FOREIGN KEY ("parent_artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artifact_dependencies" ADD CONSTRAINT "artifact_dependencies_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artifact_dependencies" ADD CONSTRAINT "artifact_dependencies_depends_on_id_fkey" FOREIGN KEY ("depends_on_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "human_edits" ADD CONSTRAINT "human_edits_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_quality_score_range" CHECK ("quality_score" IS NULL OR ("quality_score" >= 0 AND "quality_score" <= 1));
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_quality_score_range" CHECK ("quality_score" IS NULL OR ("quality_score" >= 0 AND "quality_score" <= 1));
