---
id: 2012
title: SQL Injection and Prepared Statements
state: draft
slug: sql-injection-and-prepared-statements
---

# [BEE-492] SQL Injection and Prepared Statements

:::info
SQL injection exploits the absence of a structural boundary between query logic and user-supplied data — prepared statements solve it completely by transmitting query structure and parameter values through entirely separate protocol channels.
:::

## Context

SQL injection was first documented publicly on December 25, 1998, by Jeff Forristal (alias "rain.forest.puppy") in Phrack issue 54, targeting Microsoft SQL Server. For over a decade it was the single most common critical web vulnerability. OWASP ranked it #1 from 2013 through 2017. In the 2021 edition it merged into the broader "A03: Injection" category — but OWASP noted that injection defects were found in 94% of the applications they tested across that analysis period.

The attacks its absence enabled have been historic in scale. Albert Gonzalez and his group used SQL injection against Heartland Payment Systems from 2006 to 2008, installing network packet sniffers that captured 134 million credit card numbers — the largest payment card breach in history at the time. Gonzalez received a 20-year federal sentence. The same group had previously spent 18 months inside TJX's systems via SQL injection, exfiltrating over 40 million card accounts.

The most recent large-scale incident was the MOVEit Transfer breach of May 2023. The Cl0p ransomware group exploited CVE-2023-34362, a SQL injection zero-day in Progress Software's managed file transfer application, to install a web shell and exfiltrate data from approximately 2,000 organizations including the BBC, British Airways, and multiple US federal agencies. The breach prompted CISA and the FBI to issue a joint Secure by Design Alert in March 2024, explicitly calling on software manufacturers to eliminate SQL injection as a class of defect — citing parameterized queries as the primary required defense.

Despite being one of the oldest documented vulnerability classes, SQL injection continues to appear in production software because its root cause is a structural property of how SQL engines work, not a failure mode that can be caught by code review or testing alone without deliberate design.

## The Root Cause: No Control/Data Boundary

SQL does not distinguish between the structural control plane (query logic) and the data plane (values being queried). When an application constructs a query by concatenating user input into a SQL string, user-supplied data enters the structural channel where it is parsed as SQL:

```sql
-- Application code
query = "SELECT * FROM users WHERE username = '" + username + "'"

-- Attacker supplies: ' OR '1'='1
-- Resulting query:
SELECT * FROM users WHERE username = '' OR '1'='1'
-- Returns all rows. Authentication bypassed.

-- Attacker supplies: '; DROP TABLE users; --
-- Resulting query:
SELECT * FROM users WHERE username = ''; DROP TABLE users; --'
-- Executes two statements. Data destroyed.
```

The single quote in the attacker's input crossed from the data channel into the control plane because the concatenation operation treats both as undifferentiated text.

## Attack Taxonomy

**Classic (in-band) injection** uses the same channel to deliver the payload and receive results. Union-based injection appends a `UNION SELECT` to retrieve data from other tables by matching the column count and types of the original query. Error-based injection deliberately triggers database error messages that expose schema names, table names, or data values in the error text.

**Blind injection** applies when the application produces no direct database output. Boolean-based blind injection infers data by observing whether the application's behavior changes (e.g., a login succeeds or fails) based on a true/false condition injected into the predicate. Time-based blind injection uses database delay functions (`WAITFOR DELAY`, `pg_sleep()`, `SLEEP()`) to encode answers to true/false questions as response latency — measurable even when responses are identical.

**Second-order (stored) injection** is the most commonly missed variant. The malicious payload is stored safely in the database via a parameterized INSERT — the storage step is safe. The injection occurs later, in a different code path, when that stored value is retrieved and interpolated into a subsequent query that assumes database-sourced data is already safe:

```sql
-- Safe storage step: username = admin'--  stored as literal string
INSERT INTO users (username) VALUES ($1)  -- parameterized, safe

-- Unsafe retrieval step (different code path, different developer):
username = db.query_value("SELECT username FROM users WHERE id = " + userId)
report  = "SELECT * FROM orders WHERE customer = '" + username + "'"
db.execute(report)
-- username is now admin'-- , which truncates the WHERE clause
-- Returns all orders for all customers
```

## Best Practices

### Use Parameterized Queries for All Database Operations

**MUST use parameterized queries (prepared statements) for every SQL statement that incorporates external data.** "External data" means user input, URL parameters, HTTP headers, data read from files, data received from third-party APIs, and data read from the database itself (second-order injection). There are no safe exceptions for data that "looks harmless."

Parameterized queries are not syntactic sugar for escaping. They work at the protocol level: the query template is transmitted to the database and parsed before any parameter values exist. Parameter values are transmitted separately as typed binary data in a distinct protocol message. The database engine never re-parses the values as SQL text.

```python
# Python (psycopg2) — UNSAFE
cursor.execute(f"SELECT * FROM accounts WHERE user_id = {user_id}")

# Python (psycopg2) — SAFE: %s placeholders, values as tuple
cursor.execute("SELECT * FROM accounts WHERE user_id = %s", (user_id,))

# Java (JDBC) — UNSAFE
stmt = conn.createStatement()
stmt.executeQuery("SELECT * FROM accounts WHERE user_id = " + userId)

# Java (JDBC) — SAFE: ? placeholders, set separately
PreparedStatement stmt = conn.prepareStatement(
    "SELECT balance FROM accounts WHERE user_id = ?"
)
stmt.setInt(1, userId)
ResultSet rs = stmt.executeQuery()

# Node.js (pg) — SAFE: $1 placeholder, values array
await pool.query(
    "SELECT balance FROM accounts WHERE user_id = $1",
    [userId]
)
```

**MUST NOT use ORM escape hatches without parameterization.** ORMs prevent injection when using their query-builder APIs. They do not prevent injection when developers bypass the ORM with raw query strings:

```python
# Django — SAFE: QuerySet API
User.objects.filter(username=username)

# Django — UNSAFE: raw() with f-string
User.objects.raw(f"SELECT * FROM auth_user WHERE username = '{username}'")

# SQLAlchemy — SAFE: text() with bindparams
session.execute(text("SELECT * FROM accounts WHERE id = :id"), {"id": user_id})

# SQLAlchemy — UNSAFE: text() with string format
session.execute(text(f"SELECT * FROM accounts WHERE id = {user_id}"))
```

CVE-2024-42005 was a Django ORM SQL injection via Q objects. CVE-2020-25638 was HQL injection in Hibernate via string concatenation in JPQL. CVE-2023-22794 was ActiveRecord column name SQL injection. ORMs provide safe APIs; developers who bypass them introduce vulnerabilities.

**SHOULD verify that the database driver is using true server-side prepared statements, not emulated ones.** Some drivers (notably some PHP PDO configurations) emulate prepared statements by interpolating parameters in the driver layer using escaping, then sending a complete SQL string to the server. This emulation is weaker than true server-side separation. In PHP PDO:

```php
// Disable emulation to use true server-side prepared statements
$pdo = new PDO($dsn, $user, $pass, [
    PDO::ATTR_EMULATE_PREPARES => false,
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);
```

### Use Allowlists for Dynamic Identifiers

Parameterization handles values — WHERE predicates, INSERT values, UPDATE assignments. It cannot handle SQL identifiers — table names, column names, ORDER BY targets — because these are structural parts of the query template parsed before parameter binding.

**MUST use an allowlist map for any user-controlled SQL identifier.** Never interpolate user input as a table or column name, even after escaping:

```python
# UNSAFE: user controls column name in ORDER BY
sort_column = request.args.get("sort", "created_at")
query = f"SELECT * FROM orders ORDER BY {sort_column}"  # injectable

# SAFE: allowlist of permitted columns
ALLOWED_SORT = {
    "date":   "created_at",
    "amount": "total_cents",
    "name":   "customer_name",
}
column = ALLOWED_SORT.get(request.args.get("sort"), "created_at")
query = text(f"SELECT * FROM orders ORDER BY {column}")
# column is always one of three hard-coded strings — no user data interpolated
```

The same applies to dynamic table names in multi-tenant architectures, dynamic schema routing, or any other case where the SQL structure itself varies based on input.

### Apply Least Privilege to Database Accounts

**MUST NOT connect applications to the database as a superuser, DBA, or schema-owner account.** Prepared statements structurally prevent SQL injection, but they do not constrain what legitimate queries the application can run. An attacker who finds another vulnerability (SSRF, RCE, path traversal) may reach the database via the application's existing connection with whatever privileges that connection holds.

Correct privilege assignment:
- Application reads → SELECT on specific tables/views only
- Application writes → INSERT, UPDATE, DELETE on specific tables only
- No DROP, CREATE, ALTER, TRUNCATE, or COPY privileges in production
- No access to system tables (`information_schema`, `pg_catalog`) beyond what the application genuinely requires
- Separate database users for read-heavy API paths and write-heavy transactional paths

**MUST NOT surface raw database error messages to clients.** Verbose error messages expose table names, column names, schema structure, and query structure to attackers — exactly the information needed to construct targeted injections. Log full errors server-side; return generic error identifiers to clients.

### Use Stored Procedures Correctly

Stored procedures can be equivalent to prepared statements if they use parameter binding internally. They are not equivalent if they execute dynamic SQL via string concatenation:

```sql
-- SAFE: stored procedure with parameter binding
CREATE PROCEDURE get_account(p_user_id INT)
AS BEGIN
    SELECT balance FROM accounts WHERE user_id = p_user_id
END

-- UNSAFE: stored procedure with internal dynamic SQL
CREATE PROCEDURE search_accounts(p_filter VARCHAR(100))
AS BEGIN
    EXEC('SELECT * FROM accounts WHERE ' + p_filter)
END
```

On SQL Server, granting `EXECUTE` permission on stored procedures may require the application account to run as `db_owner` if the procedure accesses objects the account cannot directly reach — which expands rather than reduces blast radius. Verify privilege chains before relying on stored procedures as a security boundary.

## Deep Dive: The Extended Query Protocol

Why do prepared statements actually prevent injection at a structural level? The answer is in the database wire protocol.

PostgreSQL's Extended Query Protocol (documented in the official PostgreSQL manual, protocol-flow section) separates query lifecycle into distinct message types:

1. **Parse message**: Contains the SQL template — `SELECT balance FROM accounts WHERE user_id = $1`. The server parses this into a query plan. No user data exists at this stage.

2. **Bind message**: Contains the parameter values as typed binary data. For `$1 = 42`, the wire message carries the integer 42 as a 4-byte big-endian value, with an OID identifying its type. This arrives via an entirely separate protocol channel from the Parse message. The server does not re-parse these bytes as SQL text.

3. **Execute message**: Triggers execution of the bound portal.

4. **Sync message**: Signals transaction boundary.

A user who supplies `'; DROP TABLE accounts; --` as the value for `$1` delivers those bytes in the Bind message. The PostgreSQL parser does not see them — they go directly to the executor as a typed string literal. Structural injection is impossible via this channel.

```mermaid
sequenceDiagram
    participant App as Application
    participant Driver as DB Driver
    participant DB as PostgreSQL

    App->>Driver: prepare("SELECT balance FROM accounts WHERE user_id = $1")
    Driver->>DB: Parse message — SQL template only, no user data
    DB-->>Driver: ParseComplete (query planned)

    App->>Driver: bind(userId)
    Driver->>DB: Bind message — typed binary value via separate channel
    DB-->>Driver: BindComplete

    Driver->>DB: Execute message
    DB-->>Driver: DataRow(balance)
    Driver-->>App: Result

    style DB fill:#27ae60,color:#fff
    style Driver fill:#2980b9,color:#fff
    style App fill:#8e44ad,color:#fff
```

MySQL implements equivalent separation through its binary protocol for prepared statements versus the text protocol for simple queries. The text protocol concatenates everything into a single string sent to the server; the binary protocol separates statement preparation from parameter binding.

## Common Mistakes

**Sanitizing instead of parameterizing.** Stripping or escaping quotes is an arms race — encoding tricks (URL encoding, multibyte character attacks, Unicode normalization), database-specific escape sequences, and second-order scenarios have historically bypassed sanitization. OWASP explicitly lists escaping as a deprecated defense that should not be the primary control.

**Trusting database-sourced data.** Data read from the database was put there by someone at some point. If the stored value contains SQL metacharacters and is subsequently interpolated into another query (second-order injection), the fact that it came from the database provides zero safety. Parameterize every query that uses external input, regardless of where that input originated.

**ORDER BY and dynamic identifiers.** Developers often parameterize WHERE clause values correctly but forget that ORDER BY column names and similar structural components cannot be parameterized. These must be validated against an explicit allowlist.

**Verbose error messages in production.** Database error messages that reach clients directly provide attackers with schema enumeration for free. All database exceptions must be caught and translated to generic responses at the application boundary.

**Over-permissioned application accounts.** Even with perfect parameterization, an application connected as `postgres` or `root` can read, write, and drop anything in the database via legitimate queries. Least privilege limits the damage from every other vulnerability class in addition to injection.

## Related BEEs

- [BEE-2001](owasp-top-10-for-backend.md) -- OWASP Top 10 for Backend: A03:2021 Injection is the umbrella category; this article covers the SQL-specific implementation mechanics
- [BEE-2002](input-validation-and-sanitization.md) -- Input Validation and Sanitization: the broader principle of untrusted input handling; parameterization is the definitive defense at the database boundary
- [BEE-2008](owasp-api-security-top-10.md) -- OWASP API Security Top 10: SQL injection surfaces as a risk in API contexts (API10: Unsafe Consumption when processing third-party data)

## References

- [OWASP SQL Injection Prevention Cheat Sheet — OWASP](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [OWASP Query Parameterization Cheat Sheet — OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Query_Parameterization_Cheat_Sheet.html)
- [SQL Injection — OWASP Community](https://owasp.org/www-community/attacks/SQL_Injection)
- [SQL Injection — PortSwigger Web Security Academy](https://portswigger.net/web-security/sql-injection)
- [PostgreSQL Extended Query Protocol — postgresql.org](https://www.postgresql.org/docs/current/protocol-flow.html)
- [Secure by Design Alert: Eliminating SQL Injection Vulnerabilities — CISA/FBI (March 2024)](https://www.cisa.gov/resources-tools/resources/secure-design-alert-eliminating-sql-injection-vulnerabilities-software)
- [SQL Injection — Wikipedia](https://en.wikipedia.org/wiki/SQL_injection)
- [SQL Injection — NIST CSRC Glossary (NISTIR 7682)](https://csrc.nist.gov/glossary/term/sql_injection)
