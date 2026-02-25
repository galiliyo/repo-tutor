# CS Concepts Reference Guide

## Purpose

When explaining code, connect to established CS concepts so learners:
1. Build on existing knowledge
2. Learn transferable vocabulary
3. Recognize patterns in future codebases

## How to Reference Patterns

1. **Name the pattern explicitly**: "This uses the **Repository Pattern** to..."
2. **Explain the pattern briefly**: One sentence on what the pattern does
3. **Show how this code implements it**: Point to specific files/functions
4. **Note any deviations**: "Unlike classic MVC, this project combines..."

### Good Example

> The `UserService` follows the **Service Layer** pattern — it encapsulates business logic and coordinates between the `UserRepository` (data access) and the controllers (presentation). This separation means you can change how users are stored without touching the API handlers.

### Bad Example

> The UserService class handles user operations.

## Pattern Categories

### Creational Patterns

| Pattern | Purpose | Common Indicators |
|---------|---------|-------------------|
| **Factory** | Create objects without specifying concrete classes | `createX()`, `XFactory` |
| **Singleton** | Ensure only one instance exists | Private constructor, `getInstance()` |
| **Builder** | Construct complex objects step by step | Method chaining, `.build()` |
| **Prototype** | Clone existing objects | `clone()`, spread operator |

### Structural Patterns

| Pattern | Purpose | Common Indicators |
|---------|---------|-------------------|
| **Adapter** | Convert interface of one class to another | Wrapper classes, `XAdapter` |
| **Decorator** | Add behavior to objects dynamically | Higher-order functions, `@decorator` |
| **Facade** | Simplified interface to complex subsystem | `XService` wrapping multiple modules |
| **Proxy** | Placeholder for another object | Lazy loading, access control |
| **Composite** | Tree structures of objects | `children`, recursive operations |

### Behavioral Patterns

| Pattern | Purpose | Common Indicators |
|---------|---------|-------------------|
| **Observer** | Notify dependents of state changes | `subscribe()`, `on()`, event emitters |
| **Strategy** | Define family of interchangeable algorithms | Interface with multiple implementations |
| **Command** | Encapsulate request as object | `execute()`, undo/redo |
| **State** | Alter behavior when state changes | State classes, `setState()` |
| **Template Method** | Define algorithm skeleton, defer steps | Abstract base class with hooks |
| **Iterator** | Sequential access to elements | `next()`, `Symbol.iterator` |

### Architectural Patterns

| Pattern | Purpose | Common Indicators |
|---------|---------|-------------------|
| **MVC** | Separate model, view, controller | `models/`, `views/`, `controllers/` |
| **MVP** | Presenter mediates view and model | `presenters/`, passive views |
| **MVVM** | View model for data binding | `viewModels/`, two-way binding |
| **Layered** | Separate presentation, business, data | Clear layer boundaries, one-way deps |
| **Hexagonal** | Ports and adapters | `ports/`, `adapters/`, dependency inversion |
| **Microservices** | Independent deployable services | Multiple entry points, service boundaries |
| **Event-Driven** | Communicate via events | Event bus, message queues |
| **CQRS** | Separate read and write operations | `commands/`, `queries/` |

### Data Patterns

| Pattern | Purpose | Common Indicators |
|---------|---------|-------------------|
| **Repository** | Abstract data access | `XRepository`, CRUD methods |
| **Unit of Work** | Track changes for transaction | `commit()`, `rollback()` |
| **DTO** | Transfer data between layers | Plain objects, no behavior |
| **DAO** | Abstract database operations | `XDao`, SQL/query methods |
| **Active Record** | Object wraps database row | Model with `save()`, `find()` |
| **Data Mapper** | Separate domain from persistence | Mapper classes, ORM |

### Concurrency Patterns

| Pattern | Purpose | Common Indicators |
|---------|---------|-------------------|
| **Promise/Future** | Represent eventual result | `Promise`, `async/await` |
| **Producer-Consumer** | Decouple production and consumption | Queues, workers |
| **Pub/Sub** | Broadcast messages to subscribers | `publish()`, `subscribe()` |
| **Actor Model** | Isolated units communicate via messages | Message passing, no shared state |

### API Patterns

| Pattern | Purpose | Common Indicators |
|---------|---------|-------------------|
| **REST** | Resource-based HTTP API | HTTP verbs, `/resources/:id` |
| **GraphQL** | Query language for APIs | Schema, resolvers, single endpoint |
| **Middleware Pipeline** | Chain of handlers | `app.use()`, `(req, res, next)` |
| **Request/Response** | Synchronous communication | HTTP, RPC |

### State Management Patterns

| Pattern | Purpose | Common Indicators |
|---------|---------|-------------------|
| **Flux/Redux** | Unidirectional data flow | `dispatch()`, `reducer`, `store` |
| **Observable** | Reactive streams | `subscribe()`, operators |
| **Finite State Machine** | Explicit state transitions | States, events, transitions |

## Language-Specific Analogies

When the user's preferred language differs from the codebase, use analogies:

### JavaScript Developer Learning Python

| Python Concept | JavaScript Analogy |
|----------------|-------------------|
| Decorator | Higher-order function |
| List comprehension | `array.map()` + `array.filter()` |
| Context manager (`with`) | try/finally or using pattern |
| Generator | Generator function |
| `__init__` | Constructor |

### Python Developer Learning JavaScript

| JavaScript Concept | Python Analogy |
|-------------------|----------------|
| Closure | Closure (same concept) |
| Prototype chain | Class inheritance |
| `this` binding | `self` (but more complex) |
| Promise | `asyncio.Future` |
| Spread operator | Unpacking (`*args`, `**kwargs`) |

## External Resources

Link to authoritative explanations when appropriate:

- Martin Fowler's Catalog: https://martinfowler.com/eaaCatalog/
- Refactoring Guru: https://refactoring.guru/design-patterns
- Source Making: https://sourcemaking.com/design_patterns
