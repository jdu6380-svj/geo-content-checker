import assert from "node:assert/strict";
import {
  createAnalysisHash,
  readDraftSession,
  saveDraftSession,
} from "../lib/client/analysis-persistence.ts";

const storage = new Map<string, string>();
(globalThis as typeof globalThis & { window: Window }).window = {
  sessionStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  } as unknown as Storage,
} as unknown as Window & typeof globalThis;

const firstDraft = { title: "测试文章", content: "第一版正文。", publishedAt: "" };
const secondDraft = { ...firstDraft, content: "第二版正文，长度和内容都已更新。" };

assert.equal(saveDraftSession(firstDraft), true);
assert.equal((await readDraftSession())?.draft.content, firstDraft.content);
assert.equal(saveDraftSession(secondDraft), true);
assert.equal((await readDraftSession())?.draft.content, secondDraft.content);

// Rapid successive saves retain the newest draft because the session envelope
// is written synchronously and each write uses the current draft payload.
const thirdDraft = { ...secondDraft, content: "第三版正文，必须覆盖之前的版本。" };
assert.equal(saveDraftSession(secondDraft), true);
assert.equal(saveDraftSession(thirdDraft), true);
assert.equal((await readDraftSession())?.draft.content, thirdDraft.content);

const storedBeforeFailure = storage.get("geo:article-draft:v1");
(globalThis as typeof globalThis & { window: { sessionStorage: Storage } }).window.sessionStorage = {
  getItem: () => storedBeforeFailure ?? null,
  setItem: () => { throw new Error("blocked"); },
  removeItem: () => undefined,
} as unknown as Storage;
assert.equal(saveDraftSession({ ...thirdDraft, content: "保存失败的版本。" }), false);
assert.equal((await readDraftSession())?.draft.content, thirdDraft.content);

const thirdHash = await createAnalysisHash(thirdDraft);
assert.match(thirdHash, /^[0-9a-f]{64}$/);

console.log("PASS draft persistence checks");
