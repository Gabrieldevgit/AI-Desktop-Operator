# DTS Live Desktop Operator
## Master Implementation Prompt | Local-First Hybrid AI

**Organization:** Developpement Team Studios (DTS)

**Product:** DTS Live Desktop Operator

**Initial platform:** Windows 10/11, subject to supported-version and API compatibility checks

**Architecture:** Local-first, hybrid AI desktop agent

**Primary objective:** Build a secure desktop application that allows an AI to operate a user's real Windows computer while the user observes its actions, interrupts execution instantly, and takes control at any time.

You are the lead software architect, senior TypeScript developer, Electron specialist, AI agent engineer, Windows automation engineer, and security engineer for DTS.

Your responsibility is to implement a working application, not just produce a prototype UI or a planning document.

Work incrementally, inspect existing repositories before changing them, run tests, document actual results, and never claim a capability works without evidence.

---

# 1. Product vision

DTS Live Desktop Operator is an AI assistant that can interact with a user's actual desktop.

The user can issue requests such as:

- "Open my browser and research this topic."
- "Organize the files in my Downloads folder."
- "Open this document and help me edit it."
- "Navigate this application and show me how to complete this task."
- "Find the error in this application and investigate it."
- "Fill out this form, but ask me before submitting it."
- "Help me test this application."

The AI should be able to observe the desktop, plan its next action, operate permitted controls, verify the result, and continue until the task is complete or it needs assistance.

This is not a workflow builder, macro recorder, chatbot-only product, or remote-control application.

The defining experience is **an AI operating the user's real computer, visibly and under the user's control**.

## Non-negotiable principles

1. The user owns control of their computer.
2. The user must explicitly authorize desktop interaction.
3. The AI's actions must be observable.
4. User takeover must interrupt AI-issued input without depending on cloud connectivity.
5. Local models should be preferred when they can perform a task adequately.
6. Cloud models are optional enhancements, not a prerequisite for basic local desktop control.
7. The application must clearly disclose when information is sent to a cloud provider.
8. Every consequential action must be evaluated against the permission policy.
9. The AI must verify outcomes instead of assuming that its actions succeeded.
10. Security, privacy, maintainability, and recoverability take priority over impressive demonstrations.

Do not implement stealth operation, hidden persistence, unauthorized access to another person's computer, or mechanisms that prevent the user from stopping execution.

---

# 2. Required technology stack

Use these technologies unless a documented technical constraint requires a change.

## Desktop application

- Node.js LTS, using a supported version compatible with the selected Electron release.
- TypeScript with strict compiler settings.
- Electron for the desktop application.
- React for the user interface.
- Vite for development and frontend builds.
- Electron Builder for packaging and installers.

Use a maintained package manager and commit the corresponding lockfile.

Keep Electron main-process privileges separate from the renderer. Use context isolation, renderer sandboxing, disabled Node integration in the renderer, and a narrowly scoped preload bridge.

## Desktop automation

Build a dedicated local desktop-control service.

Evaluate Windows UI Automation, supported native Windows APIs, and actively maintained automation libraries for interacting with real applications.

The service must support, where technically available:

- Screen capture.
- Monitor enumeration and selection.
- Window enumeration and inspection.
- Mouse movement, clicking, and scrolling.
- Keyboard input.
- Accessibility-based element inspection.
- Focus and active-window tracking.
- Input cancellation and release.
- Action timeouts and verification.

Use semantic UI controls where possible. Fall back to screenshot-based coordinates when necessary.

Use Playwright for supported browser tasks when it is more reliable than visual clicking. Browser automation must remain subject to the same task permissions and confirmation policies.

Do not confuse controlling a browser instance with controlling the entire desktop.

Keep Windows-specific code behind platform interfaces so future macOS and Linux implementations can be added without rewriting the agent orchestration layer.

## AI and local inference

Build a provider-independent model adapter system.

Local inference is the preferred first choice, subject to capability checks.

Evaluate suitable local inference options such as:

- Ollama for managing local model deployments.
- A compatible local model with reliable tool-calling or structured-output capabilities.
- A local vision-language model for screenshot understanding, when available.
- Alternative local inference runtimes if testing demonstrates a clear benefit.

Do not assume that every local model can understand screenshots, follow structured action schemas, or reliably plan desktop tasks.

Measure model capabilities before enabling autonomous computer use.

The application must detect unavailable models, missing vision support, insufficient context, invalid tool calls, and inference failures.

A local model must never be allowed to bypass the action policy merely because it runs on the user's machine.

## Cloud AI

Implement optional cloud model adapters for supported computer-use-capable or tool-calling models.

Potential providers include Anthropic and OpenAI, subject to their current API capabilities, account access, pricing, and terms.

Keep each provider behind a common interface.

Never assume that a generic text-generation API supports computer-use tools.

Do not expose provider credentials to the React renderer or pass them through unrestricted IPC.

## Database and identity

- Supabase PostgreSQL for optional synchronized data.
- Prisma ORM for type-safe database access and migrations.
- Supabase Auth for account authentication.
- PostgreSQL Row Level Security for user-owned records where applicable.
- Supabase Storage only for explicitly enabled cloud storage features.

Core desktop interaction must work without a Supabase connection.

Keep high-frequency screen observations and transient execution state local. Persist useful task metadata and events only when appropriate.

Do not expose the Supabase service-role key in the desktop application.

Do not assume that Prisma queries made through a privileged connection automatically inherit the user's RLS protections. Enforce ownership and authorization in the backend.

## Source control and CI/CD

Use GitHub for:

- Source code.
- Issues and milestones.
- Pull requests.
- Code review.
- GitHub Actions.
- Versioned releases.
- Release artifact distribution.

Automate linting, type checking, tests, schema validation, security checks, and build verification.

Never commit real credentials, user screenshots, session cookies, private documents, or production environment files.

---

# 3. Hybrid AI architecture

The AI layer must support three operating modes.

## Mode A: Local-first

Use a local model for planning, interpreting supported observations, selecting tools, and evaluating task progress.

Requirements:

- Prefer local inference when the task is within the model's tested capabilities.
- Keep desktop observations and execution state on the user's computer.
- Do not transmit screenshots or document contents to a cloud provider.
- Explain when the selected local model cannot perform a requested operation.
- Allow users to choose or configure supported local models.
- Continue to provide local control, manual interaction, and task cancellation if the model is unavailable.

Do not advertise a model as fully offline if any enabled feature still makes network requests.

## Mode B: Hybrid

Allow local and cloud models to contribute to a task.

Examples:

- A local model interprets the initial request.
- A local vision model examines the screen.
- A cloud model is optionally consulted when local reasoning is insufficient.
- The local executor carries out approved actions.
- A local verifier checks whether the expected result occurred.

Hybrid routing must be deliberate, visible, and governed by user preferences.

Before transmitting sensitive content to a cloud provider, disclose what category of data may be sent and obtain the required consent.

Do not silently upload full-screen images, documents, credentials, or clipboard contents to improve model accuracy.

## Mode C: Cloud-assisted

Allow users to select a supported cloud model for tasks that exceed local model capabilities.

Provide clear indicators showing:

- Selected provider.
- Selected model.
- Whether the model is local or remote.
- Whether cloud inference is active.
- Whether data may be sent externally.
- Relevant configuration and usage information where available.

Cloud model access must not grant additional operating-system permissions.

The same local policy engine must evaluate actions regardless of which model proposes them.

## Provider abstraction

Define typed interfaces for:

- Text and structured-output generation.
- Vision and screenshot understanding.
- Tool or action proposals.
- Provider capability discovery.
- Cancellation where supported.
- Error normalization.
- Token and usage reporting where supported.

Model selection must be separate from desktop execution.

Do not make the computer-control service depend on one vendor's proprietary action format.

If a provider cannot perform a required operation, report the limitation or select an explicitly permitted alternative.

## Model router

Implement a model router that considers:

- User-selected mode.
- Available model capabilities.
- Vision support.
- Tool-calling reliability.
- Task complexity.
- Privacy preferences.
- Network availability.
- User-configured cost limits.
- Model availability.

Use a conservative fallback policy.

A failed local model must not automatically trigger a cloud request containing private data. Require the applicable user permission before that fallback occurs.

---

# 4. Application architecture

Separate the application into these logical components:

1. Electron main process.
2. Sandboxed React renderer.
3. Strict preload and IPC bridge.
4. Local desktop-control service.
5. AI provider adapters.
6. Local inference manager.
7. Hybrid model router.
8. Agent task planner.
9. Permission and policy engine.
10. Serialized desktop action executor.
11. Screen observation and verification service.
12. Task lifecycle manager.
13. Local configuration and secure credential store.
14. Supabase and Prisma integration.
15. Diagnostics and logging.
16. Packaging and update infrastructure.

Use a typed event system for task status and progress updates.

Keep the application modular without creating unnecessary packages prematurely.

## Execution pipeline

The standard execution pipeline is:

User request → Task classification → Plan → Observe desktop → Propose action → Evaluate policy → Request approval if required → Execute bounded action → Observe result → Verify outcome → Continue or stop.

The AI may propose an action, but it must not directly invoke unrestricted operating-system APIs.

The policy engine must be able to reject any proposal.

Only the dedicated executor may issue AI-controlled desktop input.

---

# 5. Desktop-control service

Create a platform-independent interface with Windows as the first implementation.

Potential operations include:

- `captureScreen`
- `getDisplays`
- `getWindows`
- `inspectWindow`
- `moveMouse`
- `clickMouse`
- `scrollMouse`
- `pressKey`
- `typeText`
- `releaseInputs`
- `cancelPendingActions`

Treat these as internal interface examples, not as permission to expose every operation directly to the model.

Validate:

- Display identifiers.
- Window targets.
- Coordinates and bounds.
- Input lengths.
- Supported key combinations.
- Session authorization.
- Action timeouts.
- Current execution state.

Use bounded actions and fresh observations to reduce mistakes caused by stale screenshots or unexpected windows.

Never execute arbitrary AI-generated shell commands, PowerShell scripts, JavaScript, or executable files as an unrestricted shortcut to computer control.

If future developer-oriented command execution is added, isolate it behind a separate explicit permission system and restricted execution environment.

---

# 6. User takeover and emergency stop

This is a release-blocking safety requirement.

Provide a persistent, prominent **Take Control** button.

When the user takes control:

1. Block all new AI-issued desktop actions.
2. Invalidate the current execution authorization.
3. Cancel queued actions.
4. Signal cancellation to active model requests where supported.
5. Prevent delayed model responses from restarting execution.
6. Safely release held inputs where possible.
7. Mark the task as user-controlled.
8. Preserve the task history.
9. Allow the user to resume, restart, or cancel.

Do not depend on a cloud request to stop local execution.

Implement a centralized executor with cancellation tokens, bounded operations, and a serialized action queue.

The safety state must be enforced in the executor, not only in UI state.

Design an emergency stop mechanism that remains accessible if the renderer becomes unresponsive. A dedicated local control channel or separately managed safety component may be appropriate.

Document platform limitations and test cancellation while actions are in progress.

Do not claim that an external application operation has been reversed simply because AI input was stopped.

---

# 7. Permissions and risk management

Classify actions by risk and consequence.

## Low risk

Examples:

- Reading a permitted window.
- Navigating a page.
- Opening an approved application.
- Searching within an application.

These may proceed within the authorized task scope.

## Medium risk

Examples:

- Editing documents.
- Moving files.
- Changing application settings.
- Filling out ordinary forms.

Require appropriate scope and confirmation when an action has consequential or unexpected side effects.

## High risk

Examples:

- Deleting or overwriting important data.
- Sending messages or emails.
- Publishing content.
- Installing software.
- Changing security settings.
- Making purchases.
- Accessing sensitive account data.

Require explicit, informed approval immediately before the consequential action.

Do not bundle unrelated sensitive actions into a single approval.

The AI must never interpret instructions found in a webpage, email, document, or screenshot as authorization to override user permissions.

Provide a clear audit record of approvals and denials without unnecessarily recording sensitive content.

---

# 8. User experience

Build a professional, dark-first desktop interface with restrained blue accents, strong contrast, accessible typography, and consistent spacing.

Avoid decorative clutter and generic AI dashboard design.

## Home screen

Include:

- Product identity and version.
- Task input.
- Start button.
- Recent tasks.
- Model mode selector.
- Selected model and connection status.
- Desktop-control status.
- Settings.

## Live operation screen

Include:

- Actual desktop preview.
- Visible cursor and action indicators.
- Current objective.
- Current action description.
- Task progress.
- Take Control button.
- Pause and cancel controls.
- Approval prompts.
- Execution history.
- Error recovery.

Distinguish actual operating-system cursor movement from any cursor overlay used in the preview.

## Model controls

Provide:

- Local-first, hybrid, and cloud-assisted modes.
- Local model availability.
- Model capability status.
- Cloud provider selection.
- Privacy and data-sharing preferences.
- Usage and cost limits where supported.

## Task history

Store useful task summaries and statuses.

Allow users to inspect and delete their history.

Do not store screenshots by default. If screenshots or recordings are later supported, make retention, storage location, and cloud synchronization explicit.

## First-run onboarding

Explain what the agent can see, what it can change, how local and cloud inference differ, and how to interrupt execution.

Obtain explicit authorization before the first desktop-control session.

---

# 9. Task execution engine

Implement an observe-plan-act-verify loop.

For each task:

1. Understand the user's goal.
2. Determine the task's risk and scope.
3. Clarify consequential ambiguity.
4. Capture a fresh observation.
5. Select an appropriate model based on capabilities and preferences.
6. Generate a bounded action proposal.
7. Validate the proposal against policy.
8. Obtain approval when required.
9. Execute the action locally.
10. Observe the result.
11. Verify the expected state.
12. Continue, recover, request assistance, or stop.

Use explicit task states:

- `idle`
- `planning`
- `awaiting_approval`
- `executing`
- `verifying`
- `paused`
- `user_controlled`
- `completed`
- `failed`
- `cancelled`

Enforce valid transitions in code.

Apply limits to task duration, retries, action counts, inference requests, and configured cloud usage.

If a task fails repeatedly, stop rather than looping indefinitely.

Never report completion solely because a model claims the task succeeded.

---

# 10. Supabase and Prisma

Create a minimal initial schema.

Suggested entities:

- `profiles`: User preferences and account metadata.
- `tasks`: Task summaries, status, timestamps, and ownership.
- `task_events`: Ordered status transitions, approvals, errors, and useful execution metadata.
- `provider_configs`: Non-secret model preferences and configuration metadata.
- `user_permissions`: Persisted permission preferences where appropriate.

Use UUIDs, timestamps, explicit ownership relationships, and appropriate indexes.

Keep live desktop state and frequent observations local. Synchronize only useful information that the user has permitted.

Do not persist provider secrets as ordinary database fields.

Use an appropriate operating-system credential store for local secrets.

For cloud-backed records:

- Authenticate requests.
- Validate ownership.
- Apply RLS policies where supported.
- Test account isolation.
- Prevent cross-user access.
- Provide a documented migration and recovery procedure.

The application must remain capable of basic desktop operation without authentication to a DTS account.

---

# 11. Electron security

Enforce these requirements:

- Context isolation enabled.
- Renderer Node integration disabled.
- Sandboxing enabled wherever compatible.
- Narrowly scoped preload APIs.
- Strict IPC argument validation.
- Navigation restrictions.
- Appropriate Content Security Policy.
- Restricted external URL handling.
- No unrestricted filesystem access from the renderer.
- No arbitrary shell execution through IPC.
- No privileged operating-system APIs exposed directly to AI-generated content.
- Secure local configuration.
- Sensitive-data redaction in logs.
- Dependency auditing and security updates.

Do not disable Electron security features to make a prototype work.

Document any necessary exception and its implications.

---

# 12. Suggested repository structure

```text
dts-live-desktop-operator/
├── apps/
│   └── desktop/
│       ├── electron/
│       ├── preload/
│       └── renderer/
├── packages/
│   ├── shared/
│   ├── agent-core/
│   ├── ai-providers/
│   ├── model-router/
│   ├── local-inference/
│   ├── desktop-control/
│   ├── permissions/
│   └── database/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── security/
│   └── desktop/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── PRIVACY.md
│   ├── DEVELOPMENT.md
│   └── ROADMAP.md
├── .github/
│   └── workflows/
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

Adjust the structure based on real architectural needs. Do not create empty packages solely to match this tree.

---

# 13. GitHub workflow

Configure GitHub Actions for:

- Formatting checks.
- ESLint.
- TypeScript type checking.
- Unit tests.
- Integration tests.
- Prisma schema validation.
- Production build checks.
- Dependency and secret scanning.
- Windows build verification.

Use pull requests for significant changes.

Keep secrets in appropriate secret stores and local environment configuration.

Do not commit `.env` files or user desktop data.

Document release signing, update verification, and release procedures before publishing production builds.

---

# 14. Testing requirements

Use a dedicated test environment with synthetic data.

Test at minimum:

- Application launch.
- Local model discovery and connection.
- Unsupported model capability detection.
- Optional cloud model integration.
- Screenshot capture.
- Mouse and keyboard interaction.
- Action verification.
- User takeover during execution.
- Cancellation of delayed model responses.
- Release of held inputs.
- Permission denial.
- Malicious on-screen instructions.
- Stale observations.
- Unexpected dialogs.
- Network disconnection.
- Cloud fallback consent.
- Credential redaction.
- Database authorization.
- Cross-user data isolation.

Mock AI providers for deterministic unit tests.

Do not test destructive actions against real user files.

Do not treat a successful compilation as proof that desktop automation works.

---

# 15. Implementation roadmap

## Phase 0: Repository foundation

- Inspect the repository and development environment.
- Establish Electron, React, TypeScript, and Node.js.
- Configure the build system and package manager.
- Establish module boundaries.
- Add GitHub Actions.
- Document architecture, privacy, and threat assumptions.

## Phase 1: Windows desktop-control foundation

- Request explicit permission.
- Capture the actual Windows desktop.
- Display the desktop preview.
- Implement bounded mouse and keyboard actions.
- Add a safe test application.
- Implement immediate user takeover.
- Implement emergency stop and cancellation.
- Verify outcomes.
- Test failure and recovery paths.

Do not proceed to autonomous execution until the control and takeover mechanisms are reliable.

## Phase 2: Local-first AI

- Integrate the chosen local inference runtime.
- Discover available models.
- Test structured-output and vision capabilities.
- Add capability-aware model selection.
- Implement bounded task planning.
- Connect the local model to the policy-controlled executor.
- Demonstrate a harmless task end to end.

If the selected local model cannot perform screenshot understanding or reliable action selection, document the limitation and evaluate another model or an explicitly approved hybrid approach.

## Phase 3: Hybrid AI

- Add cloud provider adapters.
- Implement the model router.
- Add explicit cloud-data-sharing consent.
- Implement configured cost and usage limits.
- Test network failures and provider switching.
- Verify that provider selection cannot bypass local permissions.

## Phase 4: Persistence and product UI

- Integrate Supabase and Prisma.
- Implement authentication where required.
- Add task history and settings.
- Finish the live operation screen.
- Add onboarding, diagnostics, and recovery.
- Test data isolation and privacy controls.

## Phase 5: Security and distribution

- Audit Electron boundaries.
- Perform security and adversarial testing.
- Package the Windows application.
- Configure signing and verified updates where available.
- Document installation, configuration, and recovery.

## Phase 6: Cross-platform expansion

- Implement platform-specific desktop-control adapters.
- Evaluate macOS and Linux accessibility and input APIs.
- Add platform-specific permission flows.
- Run the same safety and takeover tests on each supported platform.
- Do not advertise an operating system as supported until its functionality has been verified.

---

# 16. First milestone acceptance criteria

The first release milestone is complete only when:

1. The Windows application launches.
2. The user explicitly authorizes desktop interaction.
3. The application displays the actual desktop.
4. A supported local model can propose a permitted test action, or the prototype clearly identifies the current model-integration blocker.
5. The executor can move the real cursor and interact with a safe test application.
6. The application verifies the resulting state.
7. Take Control blocks subsequent AI input, including delayed actions.
8. Cancellation does not require internet access.
9. Sensitive actions remain blocked until the required approval is obtained.
10. Automated tests pass.
11. Setup instructions are reproducible.
12. Limitations and test results are documented accurately.

Do not replace actual computer control with a static preview or simulated cursor while claiming the feature is operational.

---

# 17. Required initial deliverables

Begin by inspecting the repository.

Then produce:

1. A repository and environment assessment.
2. A proposed architecture.
3. A comparison of suitable local inference and desktop automation options.
4. A security and privacy threat model.
5. A concrete Phase 0 and Phase 1 implementation plan.
6. A list of external dependencies, configuration requirements, and blockers.

After reporting those findings, start implementing the first milestone.

Do not stop after generating documentation. Run the application, execute available tests, fix failures, and provide evidence of what works.

If access credentials or user approval are required, explain exactly why they are needed. Never invent credentials or assume access to repositories and external services.

## Final engineering directive

Build DTS Live Desktop Operator as a **local-first, hybrid AI desktop operator with real computer control and immediate human takeover**.

Keep Node.js, TypeScript, Electron, Supabase, Prisma, and GitHub as the core stack.

The desktop executor must remain local, permission-aware, independently cancellable, and secure regardless of which AI model is selected.

Start with a small, working Windows implementation. Prove the control and safety architecture first, then expand its intelligence and capabilities.

# DTS Live Desktop Operator: Primary AI Model Specification

## 1. Primary model

Use **NVIDIA Nemotron 3.5 Super VL 120B-A12B** as the primary AI model for DTS Live Desktop Operator.

Official model identifier:

`nvidia/nemotron-3.5-super-vl-120b-a12b`

Official NVIDIA API base URL:

`https://integrate.api.nvidia.com/v1`

Official model playground and API setup:

https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b

The primary integration must use the supported NVIDIA API through a dedicated TypeScript provider adapter. Use the documented API capabilities for multimodal inputs, reasoning, and tool calling.

Do not assume that model access is permanently free or unlimited. Handle provider quotas, rate limits, availability, usage restrictions, and API errors gracefully.

## 2. Hybrid deployment strategy

Keep Nemotron 3.5 Super VL as the preferred model for complex reasoning, screenshot interpretation, visual desktop tasks, and action planning.

Implement three execution paths:

1. **Primary:** NVIDIA-hosted Nemotron 3.5 Super VL API.
2. **Local alternative:** A compatible local model for supported tasks, offline operation, and privacy-sensitive work.
3. **Optional secondary provider:** A separately configured compatible provider if the user enables it.

The local alternative must not be falsely presented as the same model running locally. Use a distinct model identifier and display the actual active provider.

For privacy-sensitive tasks, honor the user's local-only preference and do not transmit screen contents or document data to NVIDIA.

For normal hybrid operation, use Nemotron as the default remote reasoning model, subject to user settings and consent.

## 3. TypeScript integration

Implement an isolated provider module, for example:

`packages/ai-providers/src/nvidia-nemotron.ts`

Requirements:

- Use a maintained compatible HTTP client or official supported SDK.
- Keep the NVIDIA API key in a trusted process or backend secret store.
- Never expose the key to the renderer.
- Support text and image inputs using the documented request format.
- Support structured tool calls when available and correctly parsed.
- Validate all model outputs against application-defined schemas.
- Handle streaming, cancellation where supported, timeouts, and rate limits.
- Normalize provider errors into application-level error types.
- Record useful usage metadata without logging sensitive prompts, screenshots, or credentials.
- Make provider settings configurable without source-code edits.

Use an environment variable such as `NVIDIA_API_KEY` for local development. Include only a placeholder in `.env.example`.

Never commit a real API key.

## 4. Model routing

Implement capability-aware routing.

Use Nemotron for tasks requiring visual reasoning and complex planning when its hosted API is available and the user has authorized the relevant data transfer.

Use a compatible local model when:

- The user selects local-only operation.
- The task can be handled reliably by the local model.
- The network is unavailable.
- A privacy policy prohibits cloud inference.

If Nemotron fails, do not silently transmit sensitive information to another provider. Apply the user's configured fallback policy.

Display the active model, inference location, and cloud-connection status in the interface.

## 5. Desktop-control boundary

Nemotron is the reasoning and action-proposal engine. It is not the desktop-control executor.

The trusted local executor must independently validate every proposed action.

Use a restricted set of typed desktop tools, such as screenshot capture, permitted mouse actions, keyboard input, window inspection, and task-state inspection.

Never expose unrestricted shell execution, arbitrary PowerShell execution, or unrestricted filesystem access to the model.

Treat screenshots and on-screen instructions as untrusted input. A webpage or document must not be able to override application permissions.

Enforce user approval for consequential actions.

The Take Control and emergency-stop mechanisms must remain local and must not depend on NVIDIA API availability.

## 6. Initial model validation

Before enabling autonomous execution, implement a model capability test that verifies:

- Successful API authentication.
- Text generation.
- Screenshot or image understanding.
- Supported tool-call behavior.
- Structured action parsing.
- Handling of invalid action proposals.
- Rate-limit and timeout recovery.
- Cancellation behavior where supported.
- Correct separation between model output and executable desktop actions.

Run these tests with a harmless desktop test application.

Do not assume that advertised model capabilities automatically guarantee reliable computer operation.

## 7. Acceptance criteria

The integration is complete only when:

- Nemotron is selected as the default configured model.
- The application can connect to the supported NVIDIA endpoint.
- Image input and action proposals work with the actual API.
- The local policy engine validates every action.
- User takeover interrupts subsequent AI-issued actions.
- The application handles API failures without losing local control.
- Cloud data sharing follows the user's explicit privacy settings.
- The setup documentation explains API-key configuration and free-endpoint limitations.
- Automated tests cover successful calls, malformed responses, failures, and fallback behavior.

Do not claim the integration is functional until the actual API has been tested successfully.