# CLAUDE.md

# IMPORTANT RULE (ALWAYS FOLLOW):
DO NOT EVER GENERATE UNNECESSARY COMMENTS IN THE CODE UNLESS SUPER NEEDED!

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

jrggs is a Node.js/TypeScript backend application that integrates with JIRA and Bitbucket to track issues, pull requests, and generate reports. It provides a REST API with GraphQL-style querying capabilities and includes scheduled background jobs for syncing data.

## Build and Development Commands

### Building
```bash
npm run build          # Compile TypeScript to dist/
npm run build-ts       # Same as above
```

### Running
```bash
npm start              # Build then start with watch mode
npm run serve          # Run compiled code from dist/
npm run watch          # Build and watch with debugging enabled
npm run debug          # Same as watch (with --inspect)
```

### Testing
```bash
npm test               # Run all tests in test/**/*.ts
npm run int-test       # Run integration tests in test/integration/**/*.ts
npm run test-file      # Run a specific test file (provide path as argument)
```

### Type Checking
```bash
npm run tsc            # Type check without emitting files (tsc --noEmit)
```

### Other
```bash
npm run swagger        # Generate Swagger documentation
```

## Architecture

### Core Structure

- **app.ts** - Main application entry point. Sets up Express server, loads routes from `routes/` directory, configures middleware, and establishes database connections.
- **glob/** - Global configurations and singletons
  - `conn.ts` - MongoDB connection management
  - `env.ts` - Environment configuration
  - `cf.ts` - Constants and configuration values
  - `err.ts` - Error definitions
  - `hc.ts` - Hard-coded configuration values
- **serv/** - Service layer for business logic
  - `jira.ts` - JIRA API integration
  - `bitbucket.ts` - Bitbucket API integration
  - `auth.ts` - Authentication/authorization logic
  - `user.ts` - User management
  - `sess.ts` - Session management
  - `jrggs/` - Background jobs and processors
- **models/** - Data models with dual representation:
  - `*.mongo.ts` - MongoDB models and interfaces (e.g., `IJiraIssue`, `IBitbucketPR`)
  - `*.gql.ts` - GraphQL-style models using gql-ts library (e.g., `GQLJiraIssue`, `GQLBitbucketPR`)
- **routes/** - API route handlers using express-router-ts
  - Each router class handles specific resource endpoints (users, auth, jira-issues, bitbucket-prs, reports, etc.)
  - Routes are auto-loaded from this directory by ExpressRouter.loadDir()
- **utils/** - Utility functions and helpers
  - `mongo-model.ts` - MongoDB model base class with proxy pattern
  - `decors.ts` - Decorators for validation and documentation
  - `hera.ts` - Response handling utilities (AppApiResponse, AppLogicError)

### Key Patterns

#### Express Router
Routes use `express-router-ts` library with decorators:
- `@GET()`, `@PUT()`, `@POST()`, `@DELETE()` - HTTP method decorators
- `@Query()`, `@Params()`, `@Body()` - Parameter injection
- `@AuthServ.authUser(USER_ROLE.USER)` - Authentication middleware
- `@DocGQLResponse()` - Documentation for GraphQL-style responses

#### GraphQL-Style Querying
The codebase uses `gql-ts` library for GraphQL-style queries over REST:
- Models have both MongoDB interfaces (`IJiraIssue`) and GQL models (`GQLJiraIssue`)
- HTTP queries are converted to GQL queries via `GQLGlobal.queryFromHttpQuery()`
- Supports filtering, field selection, pagination, and relationships
- Example: `GET /jira-issues?select=key,metrics&filter=projectKey:PROJ`

#### MongoDB Models
MongoModel class uses Proxy pattern to transparently delegate Collection methods:
- Access collection methods directly on model instance
- Automatic index management during initialization
- Supports both regular collections and time-series collections

#### Background Jobs
Background processing services in `serv/jrggs/`:
- `sync-newly-updated-issues.ts` - Periodically syncs JIRA issues
- `issue-process.ts` - Processes synced issues to compute metrics
- `sync-bitbucket-prs.ts` - Syncs Bitbucket pull requests
- `bitbucket-pr-process.ts` - Processes PRs to compute metrics
- These are imported in app.ts and use node-schedule for scheduling

#### Data Sync Flow
1. Background jobs fetch data from JIRA/Bitbucket APIs
2. Data is stored in MongoDB with `syncStatus: PENDING`
3. Processor services compute metrics and update `syncStatus: PROCESSED`
4. Metrics are stored in denormalized format for fast querying

### Technology Stack

- **Runtime:** Node.js with TypeScript (target: ES6, strict: false)
- **Framework:** Express.js
- **Database:** MongoDB (using native driver)
- **Routing:** express-router-ts (decorator-based routing)
- **Query:** gql-ts (GraphQL-style querying)
- **Validation:** ajvs-ts
- **Authentication:** JWT (jsonwebtoken)
- **External APIs:** JIRA, Bitbucket, Google APIs
- **Scheduling:** node-schedule
- **Testing:** Mocha + Chai

## Important Notes

### When Adding New Routes
1. Create a new router class extending ExpressRouter in `routes/`
2. Use decorators for HTTP methods and authentication
3. Routes are auto-discovered - no manual registration needed
4. Follow pattern: HTTP query → GQL query → resolve → response

### When Adding New Models
1. Create MongoDB interface (e.g., `IJiraIssue`) in `*.mongo.ts`
2. Create MongoModel instance for collection access
3. Create GQL model extending GQLModel in `*.gql.ts`
4. Use `@GQLField()` decorators for queryable fields
5. Implement custom resolvers with `@GQLResolver()` if needed

### When Modifying Background Jobs
1. Jobs are imported and auto-start in app.ts (lines 14-17)
2. Use `@Locked()` decorator to prevent concurrent execution
3. Use `@Catch()` decorator for error handling
4. Update `AppConfig` collection to track sync state

### Authentication
- Auth middleware: `@AuthServ.authUser(USER_ROLE.USER)` or `@AuthServ.authUser(USER_ROLE.ADMIN)`
- Session object available at `req.session`
- JWT tokens managed by `serv/auth.ts`

### Error Handling
- Use `AppLogicError` for business logic errors
- Global error handler in Program.expressRouterError() converts errors to standard API response format
- Response format: `{ success: boolean, data?: any, err?: { message, code, params } }`
