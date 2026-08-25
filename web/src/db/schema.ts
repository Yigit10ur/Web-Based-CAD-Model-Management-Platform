/**
 * Database schema.
 *
 * Mirrors ARCHITECTURE.md section 4. The shape to keep in mind: a `model` is
 * the thing people talk about, a `model_version` is the thing that actually
 * gets converted and viewed. Every version keeps its own derived files
 * permanently so past revisions stay openable.
 */

import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const visibilityEnum = pgEnum('visibility', ['private', 'public']);
export const memberRoleEnum = pgEnum('member_role', ['owner', 'editor', 'viewer']);
export const conversionStatusEnum = pgEnum('conversion_status', [
  // A version exists before its file does: the row is created first so the
  // upload has a key to write to. Only once the browser reports the upload
  // finished does it become 'queued' and visible to the worker, so a
  // half-uploaded file is never handed to the converter.
  'uploading',
  'queued',
  'processing',
  'ready',
  'failed',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    visibility: visibilityEnum('visibility').notNull().default('private'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('projects_owner_slug_idx').on(table.ownerId, table.slug)],
);

export const models = pgTable(
  'models',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    // Deliberately not a foreign key to model_versions: the two tables would
    // reference each other and neither row could be inserted first.
    currentVersionId: uuid('current_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('models_project_idx').on(table.projectId)],
);

export const modelVersions = pgTable(
  'model_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    modelId: uuid('model_id')
      .notNull()
      .references(() => models.id, { onDelete: 'cascade' }),
    versionNo: bigint('version_no', { mode: 'number' }).notNull(),

    sourceKey: text('source_key').notNull(),
    sourceFormat: text('source_format').notNull(),
    sourceSizeBytes: bigint('source_size_bytes', { mode: 'number' }).notNull(),

    glbKey: text('glb_key'),
    metadataKey: text('metadata_key'),
    thumbnailKey: text('thumbnail_key'),

    status: conversionStatusEnum('status').notNull().default('uploading'),
    errorMessage: text('error_message'),
    /** Triangle count, deflection, part count -- filled in by the converter. */
    stats: jsonb('stats'),

    /**
     * Set when a worker claims the row and cleared when it finishes. A row
     * left `processing` with an old timestamp is a crashed job, not a running
     * one, which is what lets the queue recover without a scheduler.
     */
    claimedAt: timestamp('claimed_at', { withTimezone: true }),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('model_versions_model_no_idx').on(table.modelId, table.versionNo),
    index('model_versions_queue_idx')
      .on(table.status, table.createdAt)
      .where(sql`${table.status} in ('queued', 'processing')`),
  ],
);

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').notNull().default('viewer'),
  },
  (table) => [uniqueIndex('project_members_pk').on(table.projectId, table.userId)],
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  models: many(models),
}));

export const modelsRelations = relations(models, ({ one, many }) => ({
  project: one(projects, { fields: [models.projectId], references: [projects.id] }),
  versions: many(modelVersions),
}));

export const modelVersionsRelations = relations(modelVersions, ({ one }) => ({
  model: one(models, { fields: [modelVersions.modelId], references: [models.id] }),
}));

export type Model = typeof models.$inferSelect;
export type ModelVersion = typeof modelVersions.$inferSelect;
export type Project = typeof projects.$inferSelect;
