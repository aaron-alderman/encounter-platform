// Minimal prepared-statement binding to the host's SQLite library.
use crate::{Result, fail};
use serde_json::{Value, json};
use std::{
    ffi::{CStr, CString, c_char, c_int, c_void},
    os::unix::ffi::OsStrExt,
    path::Path,
    ptr,
};

#[link(name = "libsqlite3.so.0", kind = "dylib", modifiers = "+verbatim")]
unsafe extern "C" {
    fn sqlite3_open(filename: *const c_char, db: *mut *mut c_void) -> c_int;
    fn sqlite3_close(db: *mut c_void) -> c_int;
    fn sqlite3_errmsg(db: *mut c_void) -> *const c_char;
    fn sqlite3_exec(db: *mut c_void, sql: *const c_char, callback: Option<unsafe extern "C" fn(*mut c_void, c_int, *mut *mut c_char, *mut *mut c_char) -> c_int>,
        arg: *mut c_void, error: *mut *mut c_char) -> c_int;
    fn sqlite3_prepare_v2(db: *mut c_void, sql: *const c_char, bytes: c_int,
        stmt: *mut *mut c_void, tail: *mut *const c_char) -> c_int;
    fn sqlite3_finalize(stmt: *mut c_void) -> c_int;
    fn sqlite3_bind_int64(stmt: *mut c_void, n: c_int, value: i64) -> c_int;
    fn sqlite3_bind_text(stmt: *mut c_void, n: c_int, text: *const c_char,
        bytes: c_int, destroy: Option<unsafe extern "C" fn(*mut c_void)>) -> c_int;
    fn sqlite3_step(stmt: *mut c_void) -> c_int;
    fn sqlite3_column_count(stmt: *mut c_void) -> c_int;
    fn sqlite3_column_name(stmt: *mut c_void, n: c_int) -> *const c_char;
    fn sqlite3_column_type(stmt: *mut c_void, n: c_int) -> c_int;
    fn sqlite3_column_int64(stmt: *mut c_void, n: c_int) -> i64;
    fn sqlite3_column_text(stmt: *mut c_void, n: c_int) -> *const u8;
    fn sqlite3_column_bytes(stmt: *mut c_void, n: c_int) -> c_int;
}

pub struct Db(*mut c_void);
struct Statement(*mut c_void);

impl Drop for Db {
    fn drop(&mut self) { if !self.0.is_null() { unsafe { sqlite3_close(self.0); } } }
}

impl Drop for Statement {
    fn drop(&mut self) { unsafe { sqlite3_finalize(self.0); } }
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        let filename = CString::new(path.as_os_str().as_bytes())?;
        let mut db = Self(ptr::null_mut());
        let result = unsafe { sqlite3_open(filename.as_ptr(), &mut db.0) };
        db.check(result)?;
        Ok(db)
    }

    fn error(&self) -> Box<dyn std::error::Error> {
        if self.0.is_null() { return fail("SQLite allocation failed"); }
        fail(unsafe { CStr::from_ptr(sqlite3_errmsg(self.0)) }.to_string_lossy().into_owned())
    }

    fn check(&self, result: c_int) -> Result<()> {
        if result == 0 { Ok(()) } else { Err(self.error()) }
    }

    pub fn exec(&self, sql: &str) -> Result<()> {
        let sql = CString::new(sql)?;
        self.check(unsafe { sqlite3_exec(self.0, sql.as_ptr(), None,
            ptr::null_mut(), ptr::null_mut()) })
    }

    pub fn query(&self, sql: &str, params: &[Value]) -> Result<Vec<Value>> {
        let sql = CString::new(sql)?;
        let mut raw = ptr::null_mut();
        self.check(unsafe { sqlite3_prepare_v2(self.0, sql.as_ptr(), -1, &mut raw, ptr::null_mut()) })?;
        if raw.is_null() { return Err(fail("empty SQLite statement")); }
        // Borrowed text parameters live through finalization.
        let statement = Statement(raw);
        for (index, value) in params.iter().enumerate() {
            let index = c_int::try_from(index + 1)?;
            let status = if let Some(text) = value.as_str() {
                unsafe { sqlite3_bind_text(statement.0, index, text.as_ptr().cast(), c_int::try_from(text.len())?, None) }
            } else if let Some(number) = value.as_i64() {
                unsafe { sqlite3_bind_int64(statement.0, index, number) }
            } else {
                return Err(fail("unsupported SQLite parameter"));
            };
            self.check(status)?;
        }
        let mut rows = Vec::new();
        loop {
            match unsafe { sqlite3_step(statement.0) } {
                101 => return Ok(rows),
                100 => {
                    let mut row = serde_json::Map::new();
                    for index in 0..unsafe { sqlite3_column_count(statement.0) } {
                        let name = unsafe { CStr::from_ptr(sqlite3_column_name(statement.0, index)) }.to_str()?;
                        let value = match unsafe { sqlite3_column_type(statement.0, index) } {
                            1 => json!(unsafe { sqlite3_column_int64(statement.0, index) }),
                            3 => {
                                let text = unsafe { sqlite3_column_text(statement.0, index) };
                                if text.is_null() { return Err(self.error()); }
                                let length = unsafe { sqlite3_column_bytes(statement.0, index) };
                                json!(std::str::from_utf8(unsafe { std::slice::from_raw_parts(text, length as usize) })?)
                            }
                            5 => Value::Null,
                            _ => return Err(fail("unsupported SQLite column type")),
                        };
                        row.insert(name.to_owned(), value);
                    }
                    rows.push(Value::Object(row));
                }
                _ => return Err(self.error()),
            }
        }
    }
}
