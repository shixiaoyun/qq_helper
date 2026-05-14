-- CreateTable
CREATE TABLE "vector_indices" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "knowledge_base_id" INTEGER NOT NULL,
    "chunk_id" INTEGER NOT NULL,
    "embedding" BLOB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
