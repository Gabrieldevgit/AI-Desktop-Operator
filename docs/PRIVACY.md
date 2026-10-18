# Privacy

- Screenshots and transient state stay in memory on the local machine by default.
- No cloud provider is contacted in Phase 0. No model is integrated yet.
- The router enforces: local-only never reaches cloud; cloud needs consent for the data
  category involved (screenshots vs text); a failed local model never escalates to cloud
  without explicit opt-in.
- Task history will store summaries and statuses only, with user-visible deletion.
- Do not call a configuration "fully offline" if any enabled feature makes network requests.
