//! Transaction-scoped repository boundary for authoring product state.
//!
//! W02.P06 adds the unit-of-work primitive only. Domain repositories,
//! idempotency records, and outbox writes attach to this transaction boundary in
//! later phases.

use rusqlite::{OptionalExtension, Params, Row, Transaction};

use super::{Result, Store, StoreError};
use crate::authoring::model::CommandKind;

pub trait Repository {
    fn execute<P>(&self, sql: &str, params: P) -> Result<usize>
    where
        P: Params;

    fn query_row<T, P, F>(&self, sql: &str, params: P, f: F) -> Result<T>
    where
        P: Params,
        F: FnOnce(&Row<'_>) -> rusqlite::Result<T>;

    fn query_optional<T, P, F>(&self, sql: &str, params: P, f: F) -> Result<Option<T>>
    where
        P: Params,
        F: FnOnce(&Row<'_>) -> rusqlite::Result<T>;

    fn query_collect<T, P, F>(&self, sql: &str, params: P, f: F) -> Result<Vec<T>>
    where
        P: Params,
        F: FnMut(&Row<'_>) -> rusqlite::Result<T>;

    fn query_for_each<P, F>(&self, sql: &str, params: P, f: F) -> Result<()>
    where
        P: Params,
        F: FnMut(&Row<'_>) -> Result<bool>;
}

pub struct UnitOfWork<'conn> {
    command: CommandKind,
    tx: Transaction<'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn command(&self) -> CommandKind {
        self.command
    }

    pub fn repository<'repo>(&'repo self, name: &'static str) -> SqliteRepository<'repo, 'conn> {
        SqliteRepository { name, tx: &self.tx }
    }
}

pub struct SqliteRepository<'repo, 'conn> {
    name: &'static str,
    tx: &'repo Transaction<'conn>,
}

impl SqliteRepository<'_, '_> {
    pub fn name(&self) -> &'static str {
        self.name
    }
}

impl Repository for SqliteRepository<'_, '_> {
    fn execute<P>(&self, sql: &str, params: P) -> Result<usize>
    where
        P: Params,
    {
        Ok(self.tx.execute(sql, params)?)
    }

    fn query_row<T, P, F>(&self, sql: &str, params: P, f: F) -> Result<T>
    where
        P: Params,
        F: FnOnce(&Row<'_>) -> rusqlite::Result<T>,
    {
        Ok(self.tx.query_row(sql, params, f)?)
    }

    fn query_optional<T, P, F>(&self, sql: &str, params: P, f: F) -> Result<Option<T>>
    where
        P: Params,
        F: FnOnce(&Row<'_>) -> rusqlite::Result<T>,
    {
        Ok(self.tx.query_row(sql, params, f).optional()?)
    }

    fn query_collect<T, P, F>(&self, sql: &str, params: P, f: F) -> Result<Vec<T>>
    where
        P: Params,
        F: FnMut(&Row<'_>) -> rusqlite::Result<T>,
    {
        let mut stmt = self.tx.prepare(sql)?;
        let rows = stmt.query_map(params, f)?;
        let mut items = Vec::new();
        for row in rows {
            items.push(row?);
        }
        Ok(items)
    }

    fn query_for_each<P, F>(&self, sql: &str, params: P, mut f: F) -> Result<()>
    where
        P: Params,
        F: FnMut(&Row<'_>) -> Result<bool>,
    {
        let mut stmt = self.tx.prepare(sql)?;
        let mut rows = stmt.query(params)?;
        while let Some(row) = rows.next()? {
            if !f(row)? {
                break;
            }
        }
        Ok(())
    }
}

impl Store {
    pub fn with_unit_of_work<T, F>(&mut self, command: CommandKind, f: F) -> Result<T>
    where
        F: FnOnce(&UnitOfWork<'_>) -> Result<T>,
    {
        if !command.requires_unit_of_work() {
            return Err(StoreError::ReadOnlyCommandUnitOfWork { command });
        }

        let tx = self.conn.transaction()?;
        let uow = UnitOfWork { command, tx };
        let result = f(&uow);
        match result {
            Ok(value) => {
                uow.tx.commit()?;
                Ok(value)
            }
            Err(err) => {
                let _ = uow.tx.rollback();
                Err(err)
            }
        }
    }

    pub fn with_read_unit_of_work<T, F>(&mut self, command: CommandKind, f: F) -> Result<T>
    where
        F: FnOnce(&UnitOfWork<'_>) -> Result<T>,
    {
        if command.requires_unit_of_work() {
            return Err(StoreError::ReadOnlyCommandUnitOfWork { command });
        }

        self.conn.pragma_update(None, "query_only", "ON")?;
        let outcome = (|| {
            let tx = self.conn.transaction()?;
            let uow = UnitOfWork { command, tx };
            let result = f(&uow);
            match result {
                Ok(value) => {
                    uow.tx.commit()?;
                    Ok(value)
                }
                Err(err) => {
                    let _ = uow.tx.rollback();
                    Err(err)
                }
            }
        })();
        let reset = self.conn.pragma_update(None, "query_only", "OFF");
        match (outcome, reset) {
            (Ok(value), Ok(())) => Ok(value),
            (Ok(_), Err(err)) => Err(err.into()),
            (Err(err), _) => Err(err),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Barrier};
    use std::time::Duration;

    use rusqlite::Connection;

    use super::*;
    use crate::authoring::store::db_path;

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let vault_root = dir.path().join(".vault");
        let store = Store::open(&vault_root).unwrap();
        (dir, store)
    }

    fn create_probe_table(store: &mut Store) {
        store
            .conn
            .execute_batch(
                "
                CREATE TABLE uow_probe (
                    command TEXT NOT NULL,
                    label   TEXT NOT NULL
                );
                ",
            )
            .unwrap();
    }

    fn insert_probe(uow: &UnitOfWork<'_>, label: &str) -> Result<()> {
        let repo = uow.repository("uow_probe");
        assert_eq!(repo.name(), "uow_probe");
        repo.execute(
            "INSERT INTO uow_probe (command, label) VALUES (?1, ?2)",
            (format!("{:?}", uow.command()), label),
        )?;
        Ok(())
    }

    fn probe_count(store: &Store) -> i64 {
        store
            .conn
            .query_row("SELECT count(*) FROM uow_probe", [], |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn committed_command_persists_at_transaction_boundary() {
        let (_dir, mut store) = temp_store();
        create_probe_table(&mut store);

        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                insert_probe(uow, "committed")
            })
            .unwrap();

        assert_eq!(probe_count(&store), 1);
    }

    #[test]
    fn error_rolls_back_every_repository_write() {
        let (_dir, mut store) = temp_store();
        create_probe_table(&mut store);

        let err = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                insert_probe(uow, "rolled-back")?;
                Err::<(), StoreError>(StoreError::MigrationMetadata(
                    "intentional rollback probe".to_string(),
                ))
            })
            .unwrap_err();

        assert!(err.to_string().contains("intentional rollback probe"));
        assert_eq!(probe_count(&store), 0);
    }

    #[test]
    fn sqlite_constraint_error_rolls_back_prior_repository_writes() {
        let (_dir, mut store) = temp_store();
        create_probe_table(&mut store);
        store
            .conn
            .execute_batch(
                "
                CREATE TABLE uow_unique_probe (
                    label TEXT NOT NULL PRIMARY KEY
                ) WITHOUT ROWID;
                INSERT INTO uow_unique_probe (label) VALUES ('existing');
                ",
            )
            .unwrap();

        let err = store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                insert_probe(uow, "rolled-back-by-sqlite")?;
                let repo = uow.repository("unique_probe");
                repo.execute(
                    "INSERT INTO uow_unique_probe (label) VALUES (?1)",
                    ["existing"],
                )?;
                Ok(())
            })
            .unwrap_err();

        assert!(
            matches!(err, StoreError::Sqlite(_)),
            "expected SQLite constraint error, got {err:?}"
        );
        assert_eq!(probe_count(&store), 0);
    }

    #[test]
    fn multiple_repositories_share_one_unit_of_work() {
        let (_dir, mut store) = temp_store();
        create_probe_table(&mut store);

        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                let first = uow.repository("first_probe");
                first.execute(
                    "INSERT INTO uow_probe (command, label) VALUES (?1, ?2)",
                    (format!("{:?}", uow.command()), "first"),
                )?;
                let second = uow.repository("second_probe");
                second.execute(
                    "INSERT INTO uow_probe (command, label) VALUES (?1, ?2)",
                    (format!("{:?}", uow.command()), "second"),
                )?;
                Ok(())
            })
            .unwrap();

        assert_eq!(probe_count(&store), 2);
    }

    #[test]
    fn every_mutating_command_can_open_an_explicit_unit_of_work() {
        let (_dir, mut store) = temp_store();
        create_probe_table(&mut store);

        let mut mutating = 0;
        let mut read_only = 0;
        for command in CommandKind::ALL {
            if command.requires_unit_of_work() {
                mutating += 1;
                store
                    .with_unit_of_work(*command, |uow| insert_probe(uow, "command-boundary"))
                    .unwrap();
            } else {
                read_only += 1;
                match store.with_unit_of_work(*command, |_| Ok(())) {
                    Err(StoreError::ReadOnlyCommandUnitOfWork { command: rejected }) => {
                        assert_eq!(rejected, *command);
                    }
                    other => panic!("expected read-only command rejection, got {other:?}"),
                }
            }
        }

        assert_eq!(
            read_only, 4,
            "context and stream reads stay outside mutating units"
        );
        assert_eq!(probe_count(&store), mutating);
    }

    #[test]
    fn read_only_commands_can_open_read_transactions_without_mutating_boundary() {
        let (_dir, mut store) = temp_store();
        create_probe_table(&mut store);

        for command in [
            CommandKind::ReadContext,
            CommandKind::SearchGraph,
            CommandKind::SubscribeEvents,
            CommandKind::RecoverEventStream,
        ] {
            let command_seen = store
                .with_read_unit_of_work(command, |uow| Ok(uow.command()))
                .unwrap();
            assert_eq!(command_seen, command);
        }

        match store.with_read_unit_of_work(CommandKind::CreateProposal, |_| Ok(())) {
            Err(StoreError::ReadOnlyCommandUnitOfWork { command }) => {
                assert_eq!(command, CommandKind::CreateProposal);
            }
            other => panic!("expected mutating command rejection, got {other:?}"),
        }
        assert_eq!(probe_count(&store), 0);
    }

    #[test]
    fn read_transactions_reject_repository_writes() {
        let (_dir, mut store) = temp_store();
        create_probe_table(&mut store);

        let err = store
            .with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
                insert_probe(uow, "should-roll-back")?;
                Ok(())
            })
            .unwrap_err();

        assert!(
            matches!(err, StoreError::Sqlite(_)),
            "query-only read transactions must reject writes, got {err:?}"
        );
        assert_eq!(probe_count(&store), 0);
    }

    #[test]
    fn concurrent_writers_serialize_through_sqlite_transaction_locks() {
        let dir = tempfile::tempdir().unwrap();
        let vault_root = dir.path().join(".vault");
        let path = db_path(&vault_root);
        {
            let mut store = Store::open(&vault_root).unwrap();
            create_probe_table(&mut store);
        }

        let barrier = Arc::new(Barrier::new(2));
        let first_barrier = Arc::clone(&barrier);
        let first_path = path.clone();
        let first = std::thread::spawn(move || {
            let mut store = Store::open_at(&first_path).unwrap();
            store
                .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                    insert_probe(uow, "first")?;
                    first_barrier.wait();
                    std::thread::sleep(Duration::from_millis(150));
                    Ok(())
                })
                .unwrap();
        });

        let second_barrier = Arc::clone(&barrier);
        let second_path = path.clone();
        let second = std::thread::spawn(move || {
            second_barrier.wait();
            let mut store = Store::open_at(&second_path).unwrap();
            store
                .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                    insert_probe(uow, "second")
                })
                .unwrap();
        });

        first.join().unwrap();
        second.join().unwrap();

        let conn = Connection::open(&path).unwrap();
        let count: i64 = conn
            .query_row("SELECT count(*) FROM uow_probe", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 2);
    }
}
