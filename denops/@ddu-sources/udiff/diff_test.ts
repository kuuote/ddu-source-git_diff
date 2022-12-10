import { splitAtFile } from "./diff.ts";
import { assertEquals } from "/data/deno/std/testing/asserts.ts";
import * as path from "/data/deno/std/path/mod.ts";

const dir = path.dirname(path.fromFileUrl(import.meta.url));

Deno.test({
  name: "splitAtFile",
  fn() {
    const diff = Deno.readTextFileSync(
      path.join(dir, "test", "split_at_file.diff"),
    ).split("\n");
    const files = splitAtFile(diff);

    assertEquals(files, [
      [
        [
          "--- lao\t2002-02-21 23:30:39.942229878 -0800",
          "+++ tzu\t2002-02-21 23:30:50.442260588 -0800",
        ],
        [
          "@@ -1,7 +1,6 @@",
          "-The Way that can be told of is not the eternal Way;",
          "-The name that can be named is not the eternal name.",
          " The Nameless is the origin of Heaven and Earth;",
          "-The Named is the mother of all things.",
          "+The named is the mother of all things.",
          "+",
          " Therefore let there always be non-being,",
          "   so we may see their subtlety,",
          " And let there always be being,",
        ],
        [
          "@@ -9,3 +8,6 @@",
          " The two are the same,",
          " But after they are produced,",
          "   they have different names.",
          "+They both may be called deep and profound.",
          "+Deeper and more profound,",
          "+The door of all subtleties!",
        ],
      ],
      [
        ["--- example.diff", "+++ oneline"],
        [
          "@@ -1,19 +1 @@",
          "---- lao\t2002-02-21 23:30:39.942229878 -0800",
          "-+++ tzu\t2002-02-21 23:30:50.442260588 -0800",
          "-@@ -1,7 +1,6 @@",
          "--The Way that can be told of is not the eternal Way;",
          "--The name that can be named is not the eternal name.",
          "- The Nameless is the origin of Heaven and Earth;",
          "--The Named is the mother of all things.",
          "-+The named is the mother of all things.",
          "-+",
          "- Therefore let there always be non-being,",
          "-   so we may see their subtlety,",
          "- And let there always be being,",
          "-@@ -9,3 +8,6 @@",
          "- The two are the same,",
          "- But after they are produced,",
          "-   they have different names.",
          "-+They both may be called deep and profound.",
          "-+Deeper and more profound,",
          "-+The door of all subtleties!",
          "+hoge",
        ],
      ],
    ]);
  },
});
