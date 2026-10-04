# AI setup audit reproductions

Date: 2026-10-03. These read-only audit reproductions ran from the repository
root without modifying product code or writing reproduction scripts to disk.

## Settings draft replacement

The command transpiles the current source in memory and invokes the actual
Settings reducer. It establishes that dirty AI edits survive a `loaded` action,
but a `saved` response for an earlier settings patch replaces those edits with
the response's OpenAI provider and empty model. A new reducer instance also
reloads persisted defaults when AI configuration has not been saved.

```sh
rtk proxy node <<'NODE'
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const assert = require('assert/strict');
const base = process.cwd();
const cache = new Map();
function resolveSource(request, from) {
  const candidate = request.startsWith('@/') ? path.join(base, 'src', request.slice(2)) : path.resolve(path.dirname(from), request);
  for (const suffix of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const value = candidate + suffix;
    if (fs.existsSync(value) && fs.statSync(value).isFile()) return value;
  }
  throw new Error('Missing module ' + request);
}
function load(filename) {
  if (filename.endsWith('/api/settings-api.ts')) return {};
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  let source = fs.readFileSync(filename, 'utf8');
  if (filename.endsWith('/hooks/use-settings-draft.ts')) source += '\nexport { settingsDraftReducer as auditReducer, initialDraftState as auditInitialState };\n';
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const localRequire = (request) => request.startsWith('.') || request.startsWith('@/') ? load(resolveSource(request, filename)) : require(request);
  new Function('exports','require','module','__filename','__dirname', output)(module.exports, localRequire, module, filename, path.dirname(filename));
  return module.exports;
}
const { defaultUserSettings, mergeUserSettings } = load(path.join(base,'src/features/settings/domain/index.ts'));
const { auditReducer: reduce, auditInitialState: initial } = load(path.join(base,'src/features/settings/hooks/use-settings-draft.ts'));
let state = reduce(initial, {type:'loaded',settings:defaultUserSettings});
state = reduce(state,{type:'set-ai-provider',value:'gemini'});
state = reduce(state,{type:'set-ai-model',value:'gemini-2.5-flash'});
state = reduce(state,{type:'loaded',settings:defaultUserSettings});
assert.equal(state.draft.aiAssessment.provider,'gemini');
assert.equal(state.draft.aiAssessment.model,'gemini-2.5-flash');
console.log('PASS actual reducer: dirty AI provider/model survive loaded old settings');
const savedEarlierPatch = mergeUserSettings(defaultUserSettings,{practice:{dailyGoal:9}});
state = reduce(state,{type:'saved',settings:savedEarlierPatch});
assert.equal(state.draft.aiAssessment.provider,'openai');
assert.equal(state.draft.aiAssessment.model,'');
console.log('REPRO actual reducer: edits made during earlier pending settings save are replaced with OpenAI + empty model on saved response');
state = reduce(initial,{type:'loaded',settings:defaultUserSettings});
state = reduce(state,{type:'set-ai-provider',value:'gemini'});
state = reduce(state,{type:'set-ai-model',value:'gemini-2.5-flash'});
const remounted = reduce(initial,{type:'loaded',settings:defaultUserSettings});
assert.equal(remounted.draft.aiAssessment.provider,'openai');
assert.equal(remounted.draft.aiAssessment.model,'');
console.log('REPRO actual reducer: remount without settings update reloads persisted OpenAI + empty model');
NODE
```

Observed output, exit code 0:

```text
PASS actual reducer: dirty AI provider/model survive loaded old settings
REPRO actual reducer: edits made during earlier pending settings save are replaced with OpenAI + empty model on saved response
REPRO actual reducer: remount without settings update reloads persisted OpenAI + empty model
```

This is an in-memory reducer reproduction. Settings responses and reducer action
ordering are supplied by the command; it does not exercise browser input,
navigation, extension messaging, database persistence, or the installed
extension. It proves the replacement behavior under that ordering, not the
exact cause of the user's reported live failure.

## Secret presence cache race

The command obtains the actual query/mutation options from the current GenAI
hooks, then uses the installed TanStack Query `QueryClient` and
`MutationObserver`. A simulated secret save writes `gemini: true` to the cache;
an older pending presence read subsequently overwrites it with `gemini: false`.

```sh
rtk proxy node <<'NODE'
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const assert = require('assert/strict');
const query = require('@tanstack/react-query');
const base = process.cwd();
const client = new query.QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
let finishPresence;
const stalePresence = {openai:false,anthropic:false,gemini:false};
const savedPresence = {...stalePresence,gemini:true};
const messaging = {sendMessage(method) {
  if (method === 'genai.getAiProviderSecretPresence') return new Promise(resolve => {finishPresence=()=>resolve(stalePresence);});
  if (method === 'genai.setAiProviderSecret') return Promise.resolve(savedPresence);
  throw new Error('Unexpected method');
}};
const cache = new Map();
function sourcePath(request,from) {
 const candidate=request.startsWith('@/')?path.join(base,'src',request.slice(2)):path.resolve(path.dirname(from),request);
 for (const suffix of ['', '.ts','.tsx','/index.ts','/index.tsx']) {const value=candidate+suffix;if(fs.existsSync(value)&&fs.statSync(value).isFile())return value;}
 throw new Error('Missing source');
}
function load(filename) {
 if(cache.has(filename))return cache.get(filename).exports;
 const module={exports:{}};cache.set(filename,module);
 const output=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const localRequire=request=>{
   if(request==='@tanstack/react-query')return {useQuery:opts=>opts,useMutation:opts=>opts,useQueryClient:()=>client};
   if(request==='@/extension/messaging')return messaging;
   return request.startsWith('.')||request.startsWith('@/')?load(sourcePath(request,filename)):require(request);
 };
 new Function('exports','require','module','__filename','__dirname',output)(module.exports,localRequire,module,filename,path.dirname(filename));
 return module.exports;
}
(async()=>{
 const hooks=load(path.join(base,'src/features/genai/api/genai-settings-hooks.ts'));
 const presenceOptions=hooks.useGenAiSecretPresenceQuery();
 const pending=client.fetchQuery(presenceOptions);
 await new query.MutationObserver(client,hooks.useSetAiProviderSecretMutation()).mutate({provider:'gemini',key:'fake-audit-key'});
 assert.equal(client.getQueryData(presenceOptions.queryKey).gemini,true);
 finishPresence();await pending;
 assert.equal(client.getQueryData(presenceOptions.queryKey).gemini,false);
 console.log('REPRO actual hook options + installed QueryClient: pending old presence query overwrites successful Gemini key-save cache with false; storage was not tested');
 client.clear();
})().catch(error=>{console.error(error.message);process.exitCode=1;});
NODE
```

Observed output, exit code 0:

```text
REPRO actual hook options + installed QueryClient: pending old presence query overwrites successful Gemini key-save cache with false; storage was not tested
```

This is an in-memory cache reproduction with mocked runtime responses and a fake
key. The hook entry points expose their options through stubs; React rendering
is not exercised. No durable secret was written or read, no real credential was
inspected, and no provider request was made. Stale cached presence can affect
the UI; this result does not establish that trusted-storage persistence failed.

## Focused test baseline

Exact command run:

```sh
rtk npm test -- src/features/settings/hooks/use-settings-draft.test.tsx src/features/settings/components/sections/ai-assessment-section.test.tsx src/features/genai/api/genai-settings-hooks.test.tsx
```

Observed result, exit code 0:

```text
Test Files  3 passed (3)
     Tests  32 passed (32)
```

These existing tests passed before implementation. They do not cover the two
ordering reproductions above or prove Gemini authentication. Live provider
verification, installed-extension smoke, and human screenshot/recording proof
remain unperformed. Full lint, typecheck, build, database checks, and the full
test suite were not run for this read-only audit and documentation-only handoff.

Exact formatting commands passed:

- `rtk npx prettier --write --ignore-path /dev/null docs/superpowers/handoffs/2026-10-03-ai-setup-audit.md`
- `rtk npx prettier --check --ignore-path /dev/null docs/superpowers/handoffs/2026-10-03-ai-setup-audit.md`
- `rtk npx prettier --check --ignore-path /dev/null docs/superpowers/specs/2026-10-03-ai-connection-setup-design.md docs/superpowers/specs/2026-10-03-ai-repair-and-code-analysis-design.md docs/superpowers/handoffs/2026-10-03-ai-setup-audit.md`
