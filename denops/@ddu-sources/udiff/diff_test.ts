import { parseDiff, splitAtFile } from "./diff.ts";
import { assertEquals } from "https://deno.land/std@0.211.0/assert/assert_equals.ts";
import * as path from "https://deno.land/std@0.211.0/path/mod.ts";

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

Deno.test({
  name: "parseDiff",
  fn() {
    const lines = Deno.readTextFileSync(
      path.join(dir, "test", "example.diff"),
    ).split("\n");
    const diff = parseDiff(lines);
    assertEquals(diff, [
      {
        header: [
          "--- lao\t2002-02-21 23:30:39.942229878 -0800",
          "+++ tzu\t2002-02-21 23:30:50.442260588 -0800",
        ],
        hunks: [
          {
            header: "@@ -1,7 +1,6 @@",
            lines: [
              {
                nlinum: 1,
                olinum: 1,
                text: "-The Way that can be told of is not the eternal Way;",
              },
              {
                nlinum: 1,
                olinum: 2,
                text: "-The name that can be named is not the eternal name.",
              },
              {
                nlinum: 1,
                olinum: 3,
                text: " The Nameless is the origin of Heaven and Earth;",
              },
              {
                nlinum: 2,
                olinum: 4,
                text: "-The Named is the mother of all things.",
              },
              {
                nlinum: 2,
                olinum: 5,
                text: "+The named is the mother of all things.",
              },
              {
                nlinum: 3,
                olinum: 5,
                text: "+",
              },
              {
                nlinum: 4,
                olinum: 5,
                text: " Therefore let there always be non-being,",
              },
              {
                nlinum: 5,
                olinum: 6,
                text: "   so we may see their subtlety,",
              },
              {
                nlinum: 6,
                olinum: 7,
                text: " And let there always be being,",
              },
            ],
            nstart: 1,
            ostart: 1,
          },
          {
            header: "@@ -9,3 +8,6 @@",
            lines: [
              {
                nlinum: 8,
                olinum: 9,
                text: " The two are the same,",
              },
              {
                nlinum: 9,
                olinum: 10,
                text: " But after they are produced,",
              },
              {
                nlinum: 10,
                olinum: 11,
                text: "   they have different names.",
              },
              {
                nlinum: 11,
                olinum: 12,
                text: "+They both may be called deep and profound.",
              },
              {
                nlinum: 12,
                olinum: 12,
                text: "+Deeper and more profound,",
              },
              {
                nlinum: 13,
                olinum: 12,
                text: "+The door of all subtleties!",
              },
            ],
            nstart: 8,
            ostart: 9,
          },
        ],
        newFileName: "tzu",
        oldFileName: "lao",
      },
    ]);
  },
});
