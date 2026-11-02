# System architecture

This document maps the implemented client, banking API, authentication service and databases, then follows their communication during sign-in, reads and transfers. [Implementation architecture](architecture.md) covers repository structure and tooling; [the specification](../spec.md) defines product rules.

## 1. Runtime and component diagram

The runnable demo has a browser application and **one Node process**. Authentication is a module-level service, not a separately deployed identity server. The partner network simulates an external bank through an asynchronous module interface; it has a separate database, but no network listener.

```mermaid
flowchart TB
    subgraph Browser[Browser]
        UI[React pages and transfer wizard]
        Cache[TanStack Query cache]
        Client[Typed fetch client and response validation]
        Monitor[Session transfer monitor]
        UI --> Cache --> Client
        Monitor --> Client
        Monitor -->|Invalidate on order / outcome| Cache
    end
    subgraph Node[Single Node process]
        HTTP[Hono routes and request guards]
        subgraph Auth[Authentication service]
            Identity[Credential verification and display name]
            Sessions[SessionStore and CSRF verification]
            Memory[In-memory session map]
            Sessions --> Memory
        end
        Banking[Accounts, activity, insights, lookup and order creation]
        Processor[Asynchronous transfer processor]
        Gateway[PartnerBankGateway adapter and timeout]
        Partner[Mock partner network]
        Core[(core.sqlite)]
        PartnerDB[(partner-network.sqlite)]
        HTTP --> Identity
        HTTP --> Sessions
        HTTP --> Banking
        Identity -->|Read credentials and customers| Core
        Banking -->|Reads and atomic writes| Core
        Banking -.->|Wake after order commit| Processor
        Processor -->|Atomic completion or failure| Core
        Banking -->|Account inquiry| Gateway
        Processor -->|Submit or inquire payment| Gateway
        Gateway -->|Asynchronous module calls| Partner
        Partner --> PartnerDB
    end
    Client -->|Same-origin JSON; browser attaches HttpOnly cookie| HTTP
    Shared[Shared TypeScript rules, schemas and enums] -.-> UI
    Shared -.-> Client
    Shared -.-> Banking
```

Solid arrows are calls or data access; dotted arrows are a wake-up or build-time code dependency. Only the partner module opens the partner store. The browser cannot access either database or the session map.

| Part                   | Implementation                                                                                                                              | Owns                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client app             | [src/app](../../src/app/), [src/features](../../src/features/)                                                                              | Routes, forms, accessible feedback, cached server results and status polling. Filters live in the URL; unsubmitted transfers live in React memory.                        |
| HTTP boundary          | [http/app.ts](../../server/http/app.ts), [middleware.ts](../../server/http/middleware.ts), [routes](../../server/http/routes/)              | Cookie/session discovery, Origin and CSRF checks, request parsing, error envelopes and routing.                                                                           |
| Banking API            | [banking](../../server/banking/), [serializers.ts](../../server/serializers.ts)                                                             | Ownership, account usability, balances, activity, transfer validation and serialized customer views. Client-supplied customer IDs or balances are never trusted.          |
| Authentication service | [auth/service.ts](../../server/auth/service.ts), [password.ts](../../server/auth/password.ts), [sessions.ts](../../server/auth/sessions.ts) | scrypt credential verification, uniform unknown-user verification work, session rotation, absolute expiry and CSRF tokens. The HTTP boundary calls this service directly. |
| Transfer processor     | [processor.ts](../../server/banking/processor.ts)                                                                                           | Processes committed orders independently of browser lifetime; posts money or releases holds only on a definitive result.                                                  |
| Partner integration    | [network-gateway.ts](../../server/partner-gateway/network-gateway.ts), [partner-network](../../server/partner-network/)                     | Adapts partner field names/result codes, applies timeouts and deduplicates partner payments by transfer ID.                                                               |
| Persistence            | [sqlite.ts](../../server/persistence/sqlite.ts), [schema.ts](../../server/persistence/schema.ts)                                            | SQLite connections, foreign keys, constraints, synchronous write transactions and reconciliation.                                                                         |

### Development and built-app serving

- `npm run dev`: browser → Vite on `127.0.0.1:5173` → `/api` proxy → Hono on `127.0.0.1:8787`. The original browser Origin is forwarded and checked against `APP_ORIGIN`.
- `npm run build && npm start`: Hono serves the SPA and `/api` from `127.0.0.1:8787`; unknown non-API paths serve the SPA for direct links. No browser CORS integration is required.
- Core and partner data persist in separate files under `data/`. Sessions are in memory: an API restart signs everyone out but preserves orders and balances. The processor resumes outstanding orders at startup.
- These are local-demo deployment boundaries. There is no deployed BFF, OAuth provider, remote authentication server, message broker or real interbank connection.

## 2. Authentication and protected reads

```mermaid
sequenceDiagram
    actor Customer
    participant UI as Browser app
    participant HTTP as Hono routes and guards
    participant Auth as Authentication service
    participant Sessions as SessionStore memory
    participant DB as Core SQLite
    Customer->>UI: Open protected page
    UI->>HTTP: GET /api/session
    HTTP->>Sessions: Find session or create anonymous session
    Sessions-->>HTTP: Public session state and CSRF token
    HTTP-->>UI: JSON and HttpOnly anonymous-session cookie
    UI->>UI: Anonymous state redirects to sign-in
    Customer->>UI: Enter credentials
    UI->>HTTP: POST /api/session/login + Origin + CSRF
    HTTP->>Sessions: Verify session-bound CSRF token
    Note over HTTP: Origin is checked before mutation authorization
    HTTP->>Auth: verify(username, password)
    Auth->>DB: Read credential hash
    DB-->>Auth: Stored hash, or use dummy hash for unknown user
    Auth->>Auth: Verify scrypt hash
    Auth-->>HTTP: Customer ID, or invalid credentials
    alt Valid credentials
        HTTP->>Sessions: Rotate session ID and CSRF, set eight-hour expiry
        HTTP-->>UI: Authenticated JSON and rotated HttpOnly cookie
        UI->>HTTP: GET /api/accounts with cookie
        HTTP->>Sessions: Resolve live authenticated session
        HTTP->>DB: Banking service reads open accounts owned by session customer
        DB-->>HTTP: Account rows
        HTTP-->>UI: Serialized account summaries
        UI->>UI: Validate response and cache/render it
    else Invalid credentials
        HTTP-->>UI: 401 INVALID_CREDENTIALS
        UI->>UI: Keep login form, show generic error
    end
```

The authentication service verifies identity; the banking services authorize resources using the customer ID taken from the session. Closed, unknown and other customers' account/activity IDs receive the same `404 NOT_FOUND` response. Recipient lookup deliberately has a separate minimal-disclosure policy.

For protected mutations, checks are **Origin → authenticated session → CSRF token**. Login is an authentication exception but still requires an allowed Origin and a valid pre-login CSRF token. An ended session produces `401 SESSION_EXPIRED`; a live session with the wrong token produces `403 CSRF_INVALID`.

The cookie is host-only, HttpOnly, SameSite=Lax and Path=/. HTTPS configuration uses Secure and the `__Host-session` name; loopback development uses the documented insecure development cookie. JavaScript receives public authentication state and the CSRF token, never the session ID. Neither token nor credentials are persisted in browser storage.

### Read and logout communication

| Operation                    | Communication and client behavior                                                                                                                                                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts, activity, insights | Feature query → typed fetch → HTTP guard → banking service → core SQL read → serializer → response schema validation → cache/UI. No authoritative balance is computed in the browser.                                                                                                                    |
| Account activity detail      | One response includes the activity entry and, for an owned order, its transfer details. Monitor-triggered activity refreshes therefore cannot combine mismatched entry and order responses.                                                                                                              |
| Session expiry               | Protected API returns 401; the global handler cancels queries, clears cache/CSRF and navigates to login. Unmounting the protected tree discards the React-local transfer draft and idempotency key. Processing continues on the server.                                                                  |
| Logout                       | Browser posts with Origin/CSRF; server destroys the session and expires the cookie. Client clears local customer data and navigates to login. A lost response is reported as unconfirmed; session discovery cannot automatically redirect away from that screen. Retry first obtains a fresh CSRF token. |

Session lookup/expiry and customer credential verification are separate responsibilities inside the same process. There is no SQL sessions table and no automatic persistence of active sessions.

## 3. Transfer communication and transaction boundaries

```mermaid
sequenceDiagram
    actor Customer
    participant UI as Transfer wizard and activity UI
    participant Monitor as Session transfer monitor
    participant API as Banking HTTP API
    participant DB as Core SQLite
    participant Processor as Transfer processor
    participant Gateway as Partner gateway
    participant Partner as Partner network and its SQLite
    Customer->>UI: Review and confirm
    UI->>API: POST /api/transfers + cookie + CSRF + idempotency key
    API->>API: Authenticate, parse and normalize command
    opt External recipient
        API->>Gateway: Optional account inquiry before transaction
        Gateway->>Partner: Inquire bank and account number
        Partner-->>Gateway: Found, unavailable or unusable
        Gateway-->>API: Domain inquiry result
    end
    API->>DB: BEGIN IMMEDIATE
    API->>DB: Check customer/key replay before business rules
    alt Existing matching key and command
        DB-->>API: Original stored response
        API->>DB: COMMIT
        API-->>UI: 202 original order, Idempotent-Replayed
    else New valid order
        API->>DB: Re-read ownership, usability, limit and available funds
        API->>DB: Insert Processing order, active hold, Pending debit and idempotency response
        API->>DB: Increase held balance, reset lookup counter, COMMIT
        API-->>Processor: Wake after commit
        API-->>UI: 202 order with sourceActivityId
    end
    UI->>UI: Invalidate affected caches, navigate to activity detail
    Processor->>DB: Read due Processing order
    alt Own-account or same-bank transfer
        Processor->>DB: One transaction: recheck accounts/name, capture hold, post debit and credit, update balances and order
    else External transfer
        Processor->>DB: Commit execution attempt before calling partner
        Processor->>Gateway: Submit with transfer ID as stable client reference
        Gateway->>Partner: Submit credit transfer outside core transaction
        alt Definitive settled or rejected result
            Partner-->>Gateway: Stored partner payment/result
            Gateway-->>Processor: Domain result
            Processor->>DB: One transaction: complete or fail, resolve hold and debit
        else Timeout or transport failure
            Gateway-->>Processor: Unknown outcome
            Note over Processor,DB: Keep Processing and funds reserved
            Processor->>Gateway: Later inquire using same transfer ID
            Gateway->>Partner: Find payment by client reference
            Partner-->>Gateway: Settled, rejected or not received
            Gateway-->>Processor: Domain inquiry result
            Note over Processor,Partner: Resubmit only if not received, reuse same reference
        end
    end
    loop Session monitor tracks Processing, independent of route
        Monitor->>API: GET /api/transfers/:id
        API->>DB: Read owned order
        DB-->>API: Consistent current state
        API-->>Monitor: Processing/Completed/Failed and order details
        Monitor->>Monitor: Update shared cache, invalidate dependents on outcome
        opt Activity Details is mounted
            UI->>API: Refresh activity and embedded order together
            API-->>UI: Consistent ledger and transfer view
            UI->>UI: Announce outcome
        end
    end
```

- **Rejected creation:** validation/business rejection rolls back and records no order, activity, hold or idempotency response. It returns a definitive error envelope, not a Failed transfer.
- **Lost creation response:** the browser retries the same command/key up to twice after jittered backoff. A timeout means unknown, never failed. The stored response makes retries safe.
- **Internal atomicity:** source debit, destination credit, both balances, hold and terminal order change together. No asynchronous work runs inside the SQLite write transaction.
- **External consistency:** there is no distributed transaction across the two stores. The source hold remains until a definitive partner result. A partner payment may already exist while the core order is still Processing; inquiry and the partner's unique `client_ref` resolve that uncertainty without sending twice.
- **Failure:** release the hold, cancel the pending debit and leave current balances unchanged. Completed orders cannot be reversed in this demo.
- **Client tracking:** one session-owned transfer monitor per QueryClient discovers pending orders and polls each known ID independently of React/router lifetimes. Registration precedes UI navigation; login/reload restores discovery. It checks immediately, then roughly every second for 10 seconds, backs off to 15 seconds, and continues at 30 seconds after two minutes, with jitter. Hidden/offline tabs pause; focus/reconnect reconciles. Terminal outcomes invalidate shared accounts/activity/transfers/insights queries, so balance-only routes update too. Logout/401/reset abort and discard monitoring state. Screens do not poll. The server processor remains independent.

## 4. Core database schema

The following diagram shows **declared SQL foreign keys and selected persisted fields**. Composite keys are marked on each constituent column. The complete column definitions, constraints and indexes are in [server/persistence/schema.ts](../../server/persistence/schema.ts).

```mermaid
erDiagram
    customers ||--o| credentials : authenticates
    customers ||--o{ accounts : owns
    customers ||--o{ transfers : orders
    customers ||--o{ lookup_events : counts
    customers ||--o{ idempotency_records : scopes
    accounts ||--o{ transfers : source_account_id
    accounts |o--o{ transfers : destination_account_id
    banks ||--o{ transfers : destination_bank_id
    accounts ||--o{ activity : records
    transfers |o--o{ activity : transfer_id
    accounts ||--o{ holds : reserves
    activity ||--o| holds : activity_id_unique
    transfers |o--o| holds : transfer_id_unique
    transfers ||--o{ idempotency_records : transfer_id
    customers {
        TEXT id PK
        TEXT display_name
    }
    credentials {
        TEXT customer_id PK,FK
        TEXT username UK
        TEXT password_hash
    }
    banks {
        TEXT id PK
        TEXT code UK
        TEXT name
        INTEGER is_host_bank
    }
    accounts {
        TEXT id PK
        TEXT customer_id FK
        TEXT account_number UK
        TEXT name
        TEXT holder_name
        TEXT currency
        TEXT lifecycle
        TEXT restriction
        INTEGER opening_balance_minor
        INTEGER current_balance_minor
        INTEGER held_minor
    }
    transfers {
        TEXT id PK
        TEXT customer_id FK
        TEXT source_account_id FK
        TEXT destination_account_id FK "nullable for external"
        TEXT destination_bank_id FK
        TEXT destination_account_number
        TEXT source_name_snapshot
        TEXT recipient_name_snapshot
        INTEGER amount_minor
        TEXT status
        TEXT failure_code "nullable"
        TEXT partner_payment_id "nullable; logical partner reference"
        INTEGER execution_attempts
        INTEGER next_attempt_at "nullable after completion"
    }
    activity {
        TEXT id PK
        INTEGER sequence UK
        TEXT account_id FK
        TEXT transfer_id FK "nullable for purchases and income"
        TEXT kind
        TEXT direction
        TEXT status
        INTEGER amount_minor
        INTEGER effective_at "generated"
    }
    holds {
        TEXT id PK
        TEXT account_id FK
        TEXT activity_id FK,UK
        TEXT transfer_id FK,UK "nullable for merchant holds"
        INTEGER amount_minor
        TEXT kind
        TEXT state
    }
    idempotency_records {
        TEXT customer_id PK,FK
        TEXT key PK
        TEXT transfer_id FK
        TEXT request_hash
        INTEGER response_status
        TEXT response_body
        INTEGER expires_at
    }
    lookup_events {
        INTEGER id PK
        TEXT customer_id FK
        INTEGER at
    }
    meta {
        TEXT key PK
        TEXT value
    }
```

Important physical/logical distinctions:

- `accounts` contains only host-bank accounts; there is **no `accounts.bank_id` foreign key**. [ACCOUNT_SQL](../../server/banking/accounts.ts) supplies the single host bank through a join. Partner accounts are never copied into this table.
- `destination_account_id` is required for own/same-bank orders and null for external orders. The latter retain destination bank, number and name snapshots.
- `activity.transfer_id` is nullable for purchases/income. A created order has one pending outgoing entry; successful internal execution adds one incoming entry. These business rules are stricter than the foreign-key cardinalities alone.
- SQL permits multiple idempotency records to reference a transfer; order creation writes one record for a new order. Seeded orders have none. The deduplication key is `(customer_id, key)`.
- `meta` stores the seed anchor/schema metadata; it is not a customer entity. Session state is absent from this schema by design.

### Money and consistency constraints

All core amounts are integer JPY. At each commit:

```text
current balance = opening balance + signed posted activity
held balance    = sum(active holds)
available       = current balance - held balance
0 <= held balance <= current balance
```

SQLite enforces nonnegative account balances, held/current bounds, positive activity/transfer amounts, unique account numbers and consistent status/timestamp pairs. Creation checks available funds inside `BEGIN IMMEDIATE` and reserves them in the same transaction, serializing competing requests. [reconcile()](../../server/persistence/schema.ts) additionally checks ledger totals and that each active hold matches its pending debit; these aggregate invariants are not all SQL CHECK constraints.

## 5. Partner database schema

```mermaid
erDiagram
    partner_banks ||--o{ partner_accounts : bank_code
    partner_banks {
        TEXT bank_code PK
        TEXT bank_name
        INTEGER inquiry_available
    }
    partner_accounts {
        TEXT bank_code PK,FK
        TEXT account_no PK
        TEXT account_kind
        TEXT holder_name
        TEXT status_cd
        TEXT updated_at
    }
    partner_payments {
        TEXT payment_id PK
        TEXT client_ref UK
        TEXT bank_code
        TEXT account_no
        TEXT beneficiary_name
        TEXT amount
        TEXT result_cd
        TEXT received_at
    }
```

The DDL is in [partner-network/index.ts](../../server/partner-network/index.ts). Account keys are composite `(bank_code, account_no)`. Payment `amount` is a decimal string; partner timestamps are JST `YYYYMMDDhhmmss` strings. The gateway translates these formats/result codes into core-domain results.

`partner_payments` deliberately has no foreign key to the recipient account: it also records rejected requests for missing accounts. Its unique `client_ref` is the logical link to core `transfers.id`, not a cross-database foreign key. Core `partner_payment_id` records the settled payment ID. No partner account balances or full external ledger are modeled.

## 6. Scope and verification

This is a local interview worksample. Production identity federation, MFA, idle expiry, fraud controls, deployment hardening, reversals and a full double-entry settlement ledger are outside its scope. Splitting these modules into remote services would require explicit identity propagation, durable job ownership and an operational recovery model; the demo does not claim those exist.

| Architecture claim                                                   | Evidence                                                                                                                                                                                            |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session/CSRF/ownership checks happen on the server                   | [HTTP integration tests](../../tests/integration/http.test.ts): cookie rotation, expiry, invalid Origin/token, inaccessible IDs, concurrent lookup quota.                                           |
| Money writes commit consistently and retries do not duplicate orders | [Banking tests](../../server/banking/transfers.test.ts): holds, debit/credit conservation, replay, failures, partner inquiry and reconciliation.                                                    |
| Processing survives server restarts                                  | [HTTP integration tests](../../tests/integration/http.test.ts): restart recovery without double posting.                                                                                            |
| Async results reach balance-only routes after navigation/reload      | [Monitor tests](../../src/features/transfers/monitor.test.ts), [runtime tests](../../src/features/transfers/monitor-runtime.test.ts), [browser journeys](../../tests/e2e/transfer-monitor.spec.ts). |
| Logout uncertainty stays visible instead of reopening customer data  | [Browser journeys](../../tests/e2e/journeys.spec.ts): dropped logout, reload and retry.                                                                                                             |

Automated service-level overspending concurrency coverage is not included; [the README](../../README.md#verifying-concurrent-tabs-no-overspending) documents the two-tab check. The schema transaction and balance constraints enforce the rule independently of client validation.
