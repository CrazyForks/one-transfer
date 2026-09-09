import assert from "node:assert/strict";
import test from "node:test";
import { getReceivedText, getTextLinks, setReceivedText } from "../src/app/receive/received-text";

test("received text preserves line breaks and replaces the previous result", () => {
  setReceivedText("第一行\n  第二行 <script>文字</script>");
  assert.equal(getReceivedText(), "第一行\n  第二行 <script>文字</script>");
  setReceivedText("");
  assert.equal(getReceivedText(), "");
});

test("links accept web URLs, remove surrounding punctuation and deduplicate", () => {
  assert.deepEqual(getTextLinks("打开：https://example.com/a?x=1&y=2。\nhttps://example.com/a?x=1&y=2 javascript:alert(1) https://user:pass@example.com"), ["https://example.com/a?x=1&y=2"]);
  assert.deepEqual(getTextLinks("普通文字 https://"), []);
});
