import assert from "node:assert/strict";
import test from "node:test";

import {
  SEND_PROGRESS_REPORT_INTERVAL_MS,
  isSendProgressReportDue,
} from "../shared/send-events.ts";

test("running send progress reports at most four times per second", () => {
  assert.equal(isSendProgressReportDue(249, 0), false);
  assert.equal(isSendProgressReportDue(SEND_PROGRESS_REPORT_INTERVAL_MS, 0), true);
  assert.equal(isSendProgressReportDue(499, 250), false);
  assert.equal(isSendProgressReportDue(500, 250), true);
});
