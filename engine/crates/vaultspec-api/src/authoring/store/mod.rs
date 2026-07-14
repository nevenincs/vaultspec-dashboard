//! Durable authoring store binding.
//!
//! W02.P05 establishes the physical store, migration runner, and schema
//! metadata checks. Later W02 phases attach typed repositories for unit-of-work
//! boundaries, idempotency, retention, and the transactional outbox.
#![allow(dead_code)]

pub(crate) mod idempotency;
pub(crate) mod outbox;
pub(crate) mod retention;
mod schema;
pub(crate) mod unit_of_work;

#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};

use rusqlite::Connection;

#[cfg(test)]
pub(crate) use schema::{
    AppliedMigration, METADATA_SCHEMA, Migration, SCHEMA_VERSION, STORE_KIND, user_version,
};
pub(crate) use schema::{MIGRATIONS, configure_connection, read_schema_metadata, run_migrations};
pub use schema::{Result, SchemaMetadata, StoreError};

pub const DB_FILENAME: &str = "authoring-state.sqlite3";
const AUTHORING_DATA_DIR: &str = "authoring-state";

pub fn db_path(vault_root: &Path) -> PathBuf {
    vault_root
        .join("data")
        .join(AUTHORING_DATA_DIR)
        .join(DB_FILENAME)
}

#[derive(Debug)]
pub struct Store {
    conn: Connection,
    path: PathBuf,
}

impl Store {
    pub fn open(vault_root: &Path) -> Result<Self> {
        let path = db_path(vault_root);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        Self::open_at(&path)
    }

    pub fn open_at(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        configure_connection(&conn)?;
        run_migrations(&conn, MIGRATIONS)?;
        Ok(Self {
            conn,
            path: path.to_path_buf(),
        })
    }

    pub fn schema_metadata(&self) -> Result<SchemaMetadata> {
        read_schema_metadata(&self.conn)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    #[cfg(test)]
    fn conn_for_tests(&self) -> &Connection {
        &self.conn
    }
}
