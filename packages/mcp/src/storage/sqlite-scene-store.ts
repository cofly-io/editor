import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { SceneGraph } from '@pascal-app/core/clone-scene-graph'
import { z } from 'zod'
import { generateSlug, isValidSlug, sanitizeSlug } from './slug'
import { openSqliteDatabase, type SqliteDatabase } from './sqlite-driver'
import {
  type ProjectCreateOptions,
  type ProjectStatus,
  type SceneEvent,
  type SceneEventAppendOptions,
  type SceneEventCompactionOptions,
  type SceneEventCompactionResult,
  type SceneEventCursorRange,
  type SceneEventListOptions,
  type SceneGraphPatch,
  SceneInvalidError,
  type SceneListOptions,
  type SceneMeta,
  type SceneMutateOptions,
  SceneNotFoundError,
  type SceneSaveOptions,
  type SceneStore,
  SceneTooLargeError,
  SceneVersionConflictError,
  type SceneWithGraph,
} from './types'

const DEFAULT_MAX_SCENE_BYTES = 10 * 1024 * 1024
const DEFAULT_LIST_LIMIT = 100
const MAX_NAME_LENGTH = 200
const MIN_NAME_LENGTH = 1

export interface SqliteSceneStoreOptions {
  /** Exact SQLite database file path. If omitted, resolved from env. */
  databasePath?: string
  /** Optional env override for default path and size-limit resolution. */
  env?: NodeJS.ProcessEnv
  /** Maximum UTF-8 byte length of graph JSON. Defaults to 10 MB. */
  maxSceneBytes?: number
}

interface SceneRow {
  id: string
  name: string
  project_id: string | null
  owner_id: string | null
  thumbnail_url: string | null
  version: number
  created_at: string
  updated_at: string
  size_bytes: number
  node_count: number
  graph_json: string
}

interface SceneEventRow {
  event_id: number
  scene_id: string
  base_version: number | null
  version: number
  kind: string
  created_at: string
  graph_json: string
  patch_json: string | null
}

interface SceneSnapshotRow {
  event_id: number | null
  version: number | null
}

interface CountRow {
  count: number
}

interface ProjectPlaceholder {
  id: string
  name: string
  ownerId: string | null
  thumbnailUrl: string | null
  createdAt: string
  updatedAt: string
}

const GraphSchema = z.object({
  nodes: z.record(z.string(), z.unknown()),
  rootNodeIds: z.array(z.string()),
  collections: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Resolves Pascal's local SQLite database path.
 *
 * Precedence:
 * 1. `PASCAL_DB_PATH`
 * 2. `PASCAL_DATA_DIR/pascal.db`
 * 3. On Windows: `%APPDATA%/Pascal/data/pascal.db`
 * 4. `$XDG_DATA_HOME/pascal/data/pascal.db`
 * 5. `$HOME/.pascal/data/pascal.db`
 */
export function resolveDefaultDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.PASCAL_DB_PATH && env.PASCAL_DB_PATH.length > 0) {
    return env.PASCAL_DB_PATH
  }
  if (env.PASCAL_DATA_DIR && env.PASCAL_DATA_DIR.length > 0) {
    return path.join(env.PASCAL_DATA_DIR, 'pascal.db')
  }
  if (process.platform === 'win32') {
    const appData = env.APPDATA
    if (appData && appData.length > 0) {
      return path.join(appData, 'Pascal', 'data', 'pascal.db')
    }
    return path.join(os.homedir(), '.pascal', 'data', 'pascal.db')
  }
  const xdg = env.XDG_DATA_HOME
  if (xdg && xdg.length > 0) {
    return path.join(xdg, 'pascal', 'data', 'pascal.db')
  }
  return path.join(os.homedir(), '.pascal', 'data', 'pascal.db')
}

function resolveMaxSceneBytes(
  env: NodeJS.ProcessEnv | undefined,
  explicit: number | undefined,
): number {
  if (explicit !== undefined) {
    if (!Number.isInteger(explicit) || explicit <= 0) {
      throw new SceneInvalidError('maxSceneBytes must be a positive integer')
    }
    return explicit
  }

  const raw = env?.PASCAL_MAX_SCENE_BYTES
  if (raw === undefined || raw === '') return DEFAULT_MAX_SCENE_BYTES
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new SceneInvalidError('PASCAL_MAX_SCENE_BYTES must be a positive integer')
  }
  return parsed
}

function rowToMeta(row: SceneRow): SceneMeta {
  const editorUrl = editorUrlForScene(row.id)
  return {
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    ownerId: row.owner_id,
    thumbnailUrl: row.thumbnail_url,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sizeBytes: row.size_bytes,
    nodeCount: row.node_count,
    editorUrl,
    url: editorUrl,
    published: true,
    graphHash: hashGraphJson(row.graph_json),
  }
}

function editorUrlForScene(id: string): string {
  return `/editor/${id}`
}

function hashGraphJson(graphJson: string): string {
  return createHash('sha256').update(graphJson).digest('hex')
}

function rowToProjectStatus(row: SceneRow): ProjectStatus {
  const editorUrl = editorUrlForScene(row.id)
  return {
    id: row.id,
    projectId: row.project_id ?? row.id,
    name: row.name,
    editorUrl,
    url: editorUrl,
    ownerId: row.owner_id,
    thumbnailUrl: row.thumbnail_url,
    publishedVersion: row.version,
    latestVersion: row.version,
    draftVersion: null,
    browserVisibleVersion: row.version,
    version: row.version,
    isEmpty: row.node_count === 0,
    sizeBytes: row.size_bytes,
    nodeCount: row.node_count,
    graphHash: hashGraphJson(row.graph_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function placeholderToProjectStatus(project: ProjectPlaceholder): ProjectStatus {
  const editorUrl = editorUrlForScene(project.id)
  return {
    id: project.id,
    projectId: project.id,
    name: project.name,
    editorUrl,
    url: editorUrl,
    ownerId: project.ownerId,
    thumbnailUrl: project.thumbnailUrl,
    publishedVersion: null,
    latestVersion: null,
    draftVersion: null,
    browserVisibleVersion: null,
    version: 0,
    isEmpty: true,
    sizeBytes: 0,
    nodeCount: 0,
    graphHash: null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

function assertValidName(name: string): void {
  if (typeof name !== 'string') {
    throw new SceneInvalidError('Scene name must be a string')
  }
  const trimmed = name.trim()
  if (trimmed.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
    throw new SceneInvalidError(
      `Scene name must be ${MIN_NAME_LENGTH}-${MAX_NAME_LENGTH} characters (got ${name.length})`,
    )
  }
}

function serializeGraph(graph: SceneGraph): string {
  return JSON.stringify(graph)
}

function parseGraph(raw: string, context: string): SceneGraph {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new SceneInvalidError(
      `Failed to parse scene graph for ${context}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const result = GraphSchema.safeParse(parsed)
  if (!result.success) {
    throw new SceneInvalidError(`Scene graph for ${context} has invalid shape: ${result.error}`)
  }

  const graph = result.data
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      throw new SceneInvalidError(`Scene graph for ${context} has non-object node at "${nodeId}"`)
    }
    const typeField = (node as { type?: unknown }).type
    if (typeof typeField !== 'string' || typeField.length === 0) {
      throw new SceneInvalidError(
        `Scene graph for ${context} has node "${nodeId}" missing a string "type"`,
      )
    }
  }

  return graph as SceneGraph
}

function parsePatch(raw: string, context: string): SceneGraphPatch {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new SceneInvalidError(
      `Failed to parse scene patch for ${context}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SceneInvalidError(`Scene patch for ${context} has invalid shape`)
  }
  const patch = parsed as SceneGraphPatch
  if (
    !patch.nodes ||
    typeof patch.nodes !== 'object' ||
    Array.isArray(patch.nodes) ||
    !patch.nodes.upsert ||
    typeof patch.nodes.upsert !== 'object' ||
    Array.isArray(patch.nodes.upsert) ||
    !Array.isArray(patch.nodes.remove)
  ) {
    throw new SceneInvalidError(`Scene patch for ${context} has invalid shape`)
  }
  return patch
}

function asSceneRow(value: unknown): SceneRow | null {
  if (!value || typeof value !== 'object') return null
  return value as SceneRow
}

function rowToSceneEvent(row: SceneEventRow): SceneEvent {
  const patch = row.patch_json
    ? parsePatch(row.patch_json, `${row.scene_id}#${row.event_id}`)
    : undefined
  return {
    eventId: Number(row.event_id),
    sceneId: row.scene_id,
    baseVersion: row.base_version === null ? null : Number(row.base_version),
    version: Number(row.version),
    kind: row.kind,
    createdAt: row.created_at,
    ...(patch
      ? { patch }
      : { graph: parseGraph(row.graph_json, `${row.scene_id}@${row.version}`) }),
  }
}

/**
 * SQLite-backed implementation of `SceneStore`.
 *
 * Uses one local database file, WAL mode, and transaction-scoped version checks
 * so a local editor and MCP process can safely share scenes on one machine.
 */
export class SqliteSceneStore implements SceneStore {
  readonly backend = 'sqlite' as const

  readonly databasePath: string

  private readonly maxSceneBytes: number
  private readonly projectPlaceholders = new Map<string, ProjectPlaceholder>()
  private db: SqliteDatabase | null = null
  private dbPromise: Promise<SqliteDatabase> | null = null

  constructor(opts: SqliteSceneStoreOptions = {}) {
    const env = opts.env ?? process.env
    this.databasePath = path.resolve(opts.databasePath ?? resolveDefaultDatabasePath(env))
    this.maxSceneBytes = resolveMaxSceneBytes(env, opts.maxSceneBytes)
  }

  async createProject(opts: ProjectCreateOptions): Promise<ProjectStatus> {
    const db = await this.database()
    assertValidName(opts.name)
    const id = opts.id ? sanitizeSlug(opts.id) : this.generateUniqueId(db)
    if (!isValidSlug(id)) {
      throw new SceneInvalidError(`Invalid project id after sanitization: "${id}"`)
    }
    if (this.getRow(db, id)) {
      throw new SceneInvalidError(`Project with id "${id}" already exists`)
    }
    const now = new Date().toISOString()
    const project: ProjectPlaceholder = {
      id,
      name: opts.name,
      ownerId: opts.ownerId ?? null,
      thumbnailUrl: null,
      createdAt: now,
      updatedAt: now,
    }
    this.projectPlaceholders.set(id, project)
    return placeholderToProjectStatus(project)
  }

  async getProjectStatus(id: string): Promise<ProjectStatus | null> {
    const db = await this.database()
    const safeId = sanitizeSlug(id)
    const row = this.getRow(db, safeId)
    if (row) return rowToProjectStatus(row)
    const placeholder = this.projectPlaceholders.get(safeId)
    return placeholder ? placeholderToProjectStatus(placeholder) : null
  }

  async save(opts: SceneSaveOptions): Promise<SceneMeta> {
    return this.withWriteTransaction((db) => {
      assertValidName(opts.name)
      if (!opts.graph || typeof opts.graph !== 'object') {
        throw new SceneInvalidError('graph is required')
      }

      const providedId = opts.id
      const id = providedId ? sanitizeSlug(providedId) : this.generateUniqueId(db)
      if (!isValidSlug(id)) {
        throw new SceneInvalidError(`Invalid scene id after sanitization: "${id}"`)
      }

      const existing = this.getRow(db, id)
      const placeholder = this.projectPlaceholders.get(id)

      if (existing && providedId !== undefined && opts.expectedVersion === undefined) {
        throw new SceneInvalidError(
          `Scene with id "${id}" already exists. Pass a different id or provide expectedVersion to overwrite.`,
        )
      }

      if (opts.expectedVersion !== undefined) {
        const currentVersion = existing?.version ?? 0
        if (currentVersion !== opts.expectedVersion) {
          throw new SceneVersionConflictError(
            `Scene "${id}" version mismatch: expected ${opts.expectedVersion}, got ${currentVersion}`,
          )
        }
      }

      const graphJson = serializeGraph(opts.graph)
      const sizeBytes = Buffer.byteLength(graphJson, 'utf8')
      if (sizeBytes > this.maxSceneBytes) {
        throw new SceneTooLargeError(
          `Scene "${id}" is ${sizeBytes} bytes, exceeds cap of ${this.maxSceneBytes} bytes`,
        )
      }

      const now = new Date().toISOString()
      const version = (existing?.version ?? 0) + 1
      const createdAt = existing?.created_at ?? placeholder?.createdAt ?? now
      const nodeCount = Object.keys(opts.graph.nodes ?? {}).length
      const projectId = opts.projectId ?? existing?.project_id ?? (placeholder ? id : null)
      const ownerId = opts.ownerId ?? existing?.owner_id ?? placeholder?.ownerId ?? null
      const thumbnailUrl =
        opts.thumbnailUrl ?? existing?.thumbnail_url ?? placeholder?.thumbnailUrl ?? null

      if (existing) {
        db.query(
          `UPDATE scenes
             SET name = ?,
                 project_id = ?,
                 owner_id = ?,
                 thumbnail_url = ?,
                 version = ?,
                 updated_at = ?,
                 size_bytes = ?,
                 node_count = ?,
                 graph_json = ?
           WHERE id = ?`,
        ).run(
          opts.name,
          projectId,
          ownerId,
          thumbnailUrl,
          version,
          now,
          sizeBytes,
          nodeCount,
          graphJson,
          id,
        )
      } else {
        db.query(
          `INSERT INTO scenes (
             id, name, project_id, owner_id, thumbnail_url, version,
             created_at, updated_at, size_bytes, node_count, graph_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          opts.name,
          projectId,
          ownerId,
          thumbnailUrl,
          version,
          createdAt,
          now,
          sizeBytes,
          nodeCount,
          graphJson,
        )
      }

      db.query(
        `INSERT INTO scene_revisions (
           scene_id, version, graph_json, author_kind, author_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, version, graphJson, 'mcp', ownerId, now)

      if (opts.event) {
        this.insertSceneEvent(db, graphJson, {
          sceneId: id,
          baseVersion: opts.event.baseVersion ?? null,
          version,
          kind: opts.event.kind,
          ...(opts.event.patch ? { patch: opts.event.patch } : { graph: opts.graph }),
        })
      }

      this.projectPlaceholders.delete(id)

      return {
        id,
        name: opts.name,
        projectId,
        ownerId,
        thumbnailUrl,
        version,
        createdAt,
        updatedAt: now,
        sizeBytes,
        nodeCount,
        editorUrl: editorUrlForScene(id),
        url: editorUrlForScene(id),
        published: true,
        graphHash: hashGraphJson(graphJson),
      }
    })
  }

  async load(id: string): Promise<SceneWithGraph | null> {
    const db = await this.database()
    const row = this.getRow(db, sanitizeSlug(id))
    if (!row) return null
    return {
      ...rowToMeta(row),
      graph: parseGraph(row.graph_json, row.id),
    }
  }

  async list(opts: SceneListOptions = {}): Promise<SceneMeta[]> {
    const clauses: string[] = []
    const bindings: Array<string | number> = []

    if (opts.projectId !== undefined) {
      clauses.push('project_id = ?')
      bindings.push(opts.projectId)
    }
    if (opts.ownerId !== undefined) {
      clauses.push('owner_id = ?')
      bindings.push(opts.ownerId)
    }

    const requestedLimit = opts.limit ?? DEFAULT_LIST_LIMIT
    const limit = Number.isInteger(requestedLimit) && requestedLimit >= 0 ? requestedLimit : 0
    bindings.push(limit)

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    const db = await this.database()
    const rows = db
      .query(
        `SELECT id, name, project_id, owner_id, thumbnail_url, version,
                created_at, updated_at, size_bytes, node_count, graph_json
           FROM scenes
           ${where}
          ORDER BY updated_at DESC, id ASC
          LIMIT ?`,
      )
      .all(...bindings)

    return rows.map((row) => rowToMeta(row as SceneRow))
  }

  async delete(id: string, opts: SceneMutateOptions = {}): Promise<boolean> {
    return this.withWriteTransaction((db) => {
      const safeId = sanitizeSlug(id)
      const existing = this.getRow(db, safeId)
      if (!existing) return false
      if (opts.expectedVersion !== undefined && existing.version !== opts.expectedVersion) {
        throw new SceneVersionConflictError(
          `Scene "${safeId}" version mismatch: expected ${opts.expectedVersion}, got ${existing.version}`,
        )
      }
      db.query('DELETE FROM scenes WHERE id = ?').run(safeId)
      return true
    })
  }

  async rename(id: string, newName: string, opts: SceneMutateOptions = {}): Promise<SceneMeta> {
    return this.withWriteTransaction((db) => {
      assertValidName(newName)
      const safeId = sanitizeSlug(id)
      const existing = this.getRow(db, safeId)
      if (!existing) {
        throw new SceneNotFoundError(`Scene "${safeId}" not found`)
      }
      if (opts.expectedVersion !== undefined && existing.version !== opts.expectedVersion) {
        throw new SceneVersionConflictError(
          `Scene "${safeId}" version mismatch: expected ${opts.expectedVersion}, got ${existing.version}`,
        )
      }

      const now = new Date().toISOString()
      const nextVersion = existing.version + 1
      db.query('UPDATE scenes SET name = ?, version = ?, updated_at = ? WHERE id = ?').run(
        newName,
        nextVersion,
        now,
        safeId,
      )

      db.query(
        `INSERT INTO scene_revisions (
             scene_id, version, graph_json, author_kind, author_id, created_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(safeId, nextVersion, existing.graph_json, 'mcp', existing.owner_id, now)

      return {
        ...rowToMeta(existing),
        name: newName,
        version: nextVersion,
        updatedAt: now,
      }
    })
  }

  async appendSceneEvent(opts: SceneEventAppendOptions): Promise<SceneEvent> {
    return this.withWriteTransaction((db) => {
      const safeId = sanitizeSlug(opts.sceneId)
      const existing = this.getRow(db, safeId)
      if (!existing) {
        throw new SceneNotFoundError(`Scene "${safeId}" not found`)
      }
      return this.insertSceneEvent(db, existing.graph_json, opts)
    })
  }

  private insertSceneEvent(
    db: SqliteDatabase,
    durableGraphJson: string,
    opts: SceneEventAppendOptions,
  ): SceneEvent {
    const safeId = sanitizeSlug(opts.sceneId)
    const existing = this.getRow(db, safeId)
    if (!existing) {
      throw new SceneNotFoundError(`Scene "${safeId}" not found`)
    }
    const hasGraph = opts.graph !== undefined
    const hasPatch = opts.patch !== undefined
    if (hasGraph === hasPatch) {
      throw new SceneInvalidError('Scene event must contain exactly one graph or patch payload')
    }
    if (opts.version !== existing.version) {
      throw new SceneVersionConflictError(
        `Scene event for "${safeId}" must match durable version ${existing.version}`,
      )
    }
    if (hasPatch && opts.baseVersion !== existing.version - 1) {
      throw new SceneVersionConflictError(
        `Scene patch for "${safeId}" must use base version ${existing.version - 1}`,
      )
    }

    const graphJson = hasGraph ? serializeGraph(opts.graph!) : '{}'
    const patchJson = hasPatch ? JSON.stringify(opts.patch) : null
    const now = new Date().toISOString()
    const result = db
      .query(
        `INSERT INTO scene_events (
           scene_id, base_version, version, kind, created_at, graph_json, patch_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(safeId, opts.baseVersion ?? null, opts.version, opts.kind, now, graphJson, patchJson)

    const eventId = Number(result.lastInsertRowid)
    this.upsertSceneSnapshot(db, safeId, opts.version, eventId, durableGraphJson)
    return {
      eventId,
      sceneId: safeId,
      baseVersion: opts.baseVersion ?? null,
      version: opts.version,
      kind: opts.kind,
      createdAt: now,
      ...(hasPatch ? { patch: opts.patch! } : { graph: opts.graph! }),
    }
  }

  async getLatestSceneEventId(sceneId: string): Promise<number> {
    const db = await this.database()
    const row = db
      .query(
        `SELECT event_id
           FROM scene_events
          WHERE scene_id = ?
          ORDER BY event_id DESC
          LIMIT 1`,
      )
      .get(sanitizeSlug(sceneId)) as { event_id?: number } | null

    return Number(row?.event_id ?? 0)
  }

  async getSceneEventCursorRange(sceneId: string): Promise<SceneEventCursorRange> {
    const db = await this.database()
    return this.getSceneEventCursorRangeWithDb(db, sanitizeSlug(sceneId))
  }

  async listSceneEvents(sceneId: string, opts: SceneEventListOptions = {}): Promise<SceneEvent[]> {
    const afterEventId = Math.max(0, opts.afterEventId ?? 0)
    const afterVersion = Math.max(0, opts.afterVersion ?? 0)
    const requestedLimit = opts.limit ?? 100
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : 100
    const db = await this.database()
    const rows = db
      .query(
        `SELECT event_id, scene_id, base_version, version, kind, created_at, graph_json, patch_json
           FROM scene_events
          WHERE scene_id = ?
            AND event_id > ?
            AND version > ?
          ORDER BY event_id ASC
          LIMIT ?`,
      )
      .all(sanitizeSlug(sceneId), afterEventId, afterVersion, limit)

    return rows.map((row) => rowToSceneEvent(row as SceneEventRow))
  }

  async compactSceneEvents(
    sceneId: string,
    opts: SceneEventCompactionOptions = {},
  ): Promise<SceneEventCompactionResult> {
    return this.withWriteTransaction((db) => {
      const safeId = sanitizeSlug(sceneId)
      const existing = this.getRow(db, safeId)
      if (!existing) {
        throw new SceneNotFoundError(`Scene "${safeId}" not found`)
      }

      const keepEvents = opts.keepEvents ?? 100
      if (!Number.isInteger(keepEvents) || keepEvents < 1) {
        throw new SceneInvalidError('keepEvents must be a positive integer')
      }
      const rangeBefore = this.getSceneEventCursorRangeWithDb(db, safeId)
      const boundary = db
        .query(
          `SELECT event_id
             FROM scene_events
            WHERE scene_id = ?
            ORDER BY event_id DESC
            LIMIT 1 OFFSET ?`,
        )
        .get(safeId, keepEvents) as { event_id?: number } | null
      const deleteThrough = boundary?.event_id
        ? rangeBefore.snapshotEventId > 0
          ? Math.min(boundary.event_id, rangeBefore.snapshotEventId - 1)
          : boundary.event_id
        : 0
      const result = deleteThrough > 0
        ? db
            .query('DELETE FROM scene_events WHERE scene_id = ? AND event_id <= ?')
            .run(safeId, deleteThrough)
        : { changes: 0 }
      const remainingEvents = this.countSceneEvents(db, safeId)
      const rangeAfter = this.getSceneEventCursorRangeWithDb(db, safeId)

      return {
        ...rangeAfter,
        deletedEvents: result.changes,
        remainingEvents,
      }
    })
  }

  close(): void {
    this.db?.close()
    this.db = null
    this.dbPromise = null
  }

  private async database(): Promise<SqliteDatabase> {
    if (this.db) return this.db
    if (!this.dbPromise) {
      this.dbPromise = (async () => {
        mkdirSync(path.dirname(this.databasePath), { recursive: true })
        const db = await openSqliteDatabase(this.databasePath)
        db.exec('PRAGMA foreign_keys = ON')
        db.exec('PRAGMA journal_mode = WAL')
        db.exec('PRAGMA busy_timeout = 5000')
        this.migrate(db)
        this.db = db
        return db
      })()
    }
    return this.dbPromise
  }

  private migrate(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS scenes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 200),
        project_id TEXT,
        owner_id TEXT,
        thumbnail_url TEXT,
        version INTEGER NOT NULL CHECK (version >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
        node_count INTEGER NOT NULL CHECK (node_count >= 0),
        graph_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS scenes_project_updated_idx
        ON scenes(project_id, updated_at DESC);

      CREATE INDEX IF NOT EXISTS scenes_owner_updated_idx
        ON scenes(owner_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS scene_revisions (
        scene_id TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version >= 1),
        graph_json TEXT NOT NULL,
        author_kind TEXT NOT NULL,
        author_id TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (scene_id, version),
        FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS scene_events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        scene_id TEXT NOT NULL,
        base_version INTEGER,
        version INTEGER NOT NULL CHECK (version >= 1),
        kind TEXT NOT NULL,
        created_at TEXT NOT NULL,
        graph_json TEXT NOT NULL,
        patch_json TEXT,
        FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS scene_events_scene_event_idx
        ON scene_events(scene_id, event_id);

      CREATE TABLE IF NOT EXISTS scene_snapshots (
        scene_id TEXT PRIMARY KEY,
        version INTEGER NOT NULL CHECK (version >= 1),
        event_id INTEGER NOT NULL CHECK (event_id >= 0),
        created_at TEXT NOT NULL,
        graph_json TEXT NOT NULL,
        FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
      );
    `)
    this.ensureColumn(db, 'scene_events', 'base_version', 'INTEGER')
    this.ensureColumn(db, 'scene_events', 'patch_json', 'TEXT')
  }

  private async withWriteTransaction<T>(fn: (db: SqliteDatabase) => T | Promise<T>): Promise<T> {
    const db = await this.database()
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = await fn(db)
      db.exec('COMMIT')
      return result
    } catch (err) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // Ignore rollback errors so the original failure is preserved.
      }
      throw err
    }
  }

  private getRow(db: SqliteDatabase, id: string): SceneRow | null {
    return asSceneRow(
      db
        .query(
          `SELECT id, name, project_id, owner_id, thumbnail_url, version,
                  created_at, updated_at, size_bytes, node_count, graph_json
             FROM scenes
            WHERE id = ?`,
        )
        .get(id),
    )
  }

  private ensureColumn(
    db: SqliteDatabase,
    tableName: string,
    columnName: string,
    definition: string,
  ): void {
    const columns = db.query(`PRAGMA table_info(${tableName})`).all() as Array<{ name?: string }>
    if (columns.some((column) => column.name === columnName)) return
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
  }

  private upsertSceneSnapshot(
    db: SqliteDatabase,
    sceneId: string,
    version: number,
    eventId: number,
    graphJson: string,
  ): void {
    db.query(
      `INSERT INTO scene_snapshots (
         scene_id, version, event_id, created_at, graph_json
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(scene_id) DO UPDATE SET
         version = excluded.version,
         event_id = excluded.event_id,
         created_at = excluded.created_at,
         graph_json = excluded.graph_json`,
    ).run(sceneId, version, eventId, new Date().toISOString(), graphJson)
  }

  private getSceneEventCursorRangeWithDb(
    db: SqliteDatabase,
    sceneId: string,
  ): SceneEventCursorRange {
    const row = db
      .query(
        `SELECT
           MIN(event_id) AS earliest_event_id,
           MAX(event_id) AS latest_event_id
         FROM scene_events
         WHERE scene_id = ?`,
      )
      .get(sceneId) as { earliest_event_id?: number | null; latest_event_id?: number | null } | null
    const snapshot = db
      .query('SELECT event_id, version FROM scene_snapshots WHERE scene_id = ?')
      .get(sceneId) as SceneSnapshotRow | null

    return {
      earliestEventId: Number(row?.earliest_event_id ?? 0),
      latestEventId: Number(row?.latest_event_id ?? 0),
      snapshotEventId: Number(snapshot?.event_id ?? 0),
      snapshotVersion: Number(snapshot?.version ?? 0),
    }
  }

  private countSceneEvents(db: SqliteDatabase, sceneId: string): number {
    const row = db
      .query('SELECT COUNT(*) AS count FROM scene_events WHERE scene_id = ?')
      .get(sceneId) as CountRow | null
    return Number(row?.count ?? 0)
  }

  private generateUniqueId(db: SqliteDatabase): string {
    for (let attempt = 0; attempt < 20; attempt++) {
      const id = generateSlug()
      if (!this.getRow(db, id)) return id
    }
    throw new SceneInvalidError('Failed to generate a unique scene id')
  }
}
