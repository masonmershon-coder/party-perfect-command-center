// Side-effect bootstrap: MUST be the first import in the test suite. ESM evaluates
// a module's imports in source order before the module body, so setting the memory-mode
// env here — in a dependency-free module imported first — guarantees eod.mjs reads it at
// load time. (A plain assignment in test-eod.mjs runs AFTER all imports and is too late.)
if (process.env.PP_EOD_MEMORY == null) process.env.PP_EOD_MEMORY = "1";
