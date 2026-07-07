import test from "node:test";
import assert from "node:assert/strict";

import { AppError } from "../lib/errors";
import { parseAheadBehindCount } from "../lib/repo";

test("parseAheadBehindCount reads git rev-list counts", () => {
  assert.deepEqual(parseAheadBehindCount("2\t3"), {
    ahead: 2,
    behind: 3,
  });

  assert.deepEqual(parseAheadBehindCount("0 1\n"), {
    ahead: 0,
    behind: 1,
  });
});

test("parseAheadBehindCount rejects invalid output", () => {
  assert.throws(() => parseAheadBehindCount("not-a-count"), AppError);
  assert.throws(() => parseAheadBehindCount("1 -1"), AppError);
});
