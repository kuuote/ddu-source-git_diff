import { applyPatch, DiffLine, parseDiff } from "./udiff/diff.ts";
import * as u from "jsr:@core/unknownutil@^4.0.0";
import { Denops } from "jsr:@denops/std@^7.0.0";
import { ActionData } from "jsr:@shougo/ddu-kind-file@^0.8.0";
import { GatherArguments } from "jsr:@shougo/ddu-vim@^5.0.0/source";
import {
  ActionArguments,
  ActionFlags,
  BaseSource,
  Item,
  ItemHighlight,
} from "jsr:@shougo/ddu-vim@^5.0.0/types";
import { printError } from "jsr:@shougo/ddu-vim@^5.0.0/utils";
import * as stdpath from "jsr:@std/path@^1.0.0";

const defaultParams = {
  cached: false,
  onlyFile: false,
  reverse: false,
  show: false,
  unifiedContext: 3,
};

const isDiffLine = u.isObjectOf({
  text: u.isString,
  nlinum: u.isNumber,
  olinum: u.isNumber,
});

export type Data = {
  git_diff: {
    lines: DiffLine[];
    worktree: string;
    path: string;
  };
};

const isData: u.Predicate<Data> = u.isObjectOf({
  git_diff: u.isObjectOf({
    lines: u.isArrayOf(isDiffLine),
    worktree: u.isString,
    path: u.isString,
  }),
});

const isItemWithData = u.isObjectOf({
  data: isData,
});

type Params = typeof defaultParams;

const hls: Record<string, string> = {
  "-": "diffRemoved",
  "+": "diffAdded",
};

const run = async (cmd: string[], cwd = Deno.cwd()): Promise<string> => {
  const proc = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    cwd,
  });
  const { stdout } = await proc.output();
  return new TextDecoder().decode(stdout);
};

async function getWorktreeFromPath(denops: Denops, worktree: string) {
  const type = await Deno.stat(worktree)
    .then((info) => info.isFile ? "file" : "dir")
    .catch(() => "nil");
  let dir: string;
  switch (type) {
    case "file":
      dir = stdpath.dirname(worktree);
      break;
    case "dir":
      dir = worktree;
      break;
    default:
      dir = String(await denops.call("getcwd"));
  }
  return (await run([
    "git",
    "rev-parse",
    "--show-toplevel",
  ], dir)).trim();
}

async function makeHighlight(
  denops: Denops,
  text: string,
  highlightGroup?: string,
): Promise<{
  highlights?: ItemHighlight[];
}> {
  if (highlightGroup == null) {
    return {};
  }
  if (await denops.call("hlexists", highlightGroup) != 1) {
    return {};
  }
  return {
    highlights: [
      {
        name: "git_diff_hl_" + highlightGroup,
        "hl_group": highlightGroup,
        col: 1,
        width: new TextEncoder().encode(text).length,
      },
    ],
  };
}

export class Source extends BaseSource<Params> {
  override kind = "file";

  override actions = {
    applyPatch: async (args: ActionArguments<Params>) => {
      const isNonNull = <T>(x: T): x is NonNullable<T> => x != null;
      // ファイル単位で処理
      const itemsByFiles = Map.groupBy(
        args.items
          .map((item) => u.maybe(item, isItemWithData))
          .filter(isNonNull), // 型ァ！(filter直だと上手く行かん)
        (item) => item.data.git_diff.path,
      );
      for (const [abspath, items] of itemsByFiles) {
        const worktree = items[0].data.git_diff.worktree;
        const patches = items.map((item) => item.data.git_diff.lines).flat();
        // git showにtreeishを与えるとindexのデータを取れる
        // treeishはworktree相対で与える必要がある
        const path = stdpath.relative(worktree, abspath);
        const result = (await run([
          "git",
          "show",
          ":" + path,
        ], worktree))
          .split(/\n/g);
        const patched = applyPatch(result, patches).join("\n");

        // patch algorithm from lambdalisue/gin.vim
        const renamed = abspath + Math.random();
        await Deno.rename(abspath, renamed);
        try {
          await Deno.copyFile(renamed, abspath); // copy filemode etc...
          await Deno.writeTextFile(abspath, patched);
          await run(["git", "add", path], worktree);
        } finally {
          await Deno.remove(abspath).catch(console.log);
          await Deno.rename(renamed, abspath);
        }
      }
      return ActionFlags.RefreshItems;
    },
  };

  gather({
    denops,
    sourceParams,
    sourceOptions,
  }: GatherArguments<Params>): ReadableStream<Item<ActionData>[]> {
    return new ReadableStream({
      start: async (controller) => {
        try {
          const path = String(sourceOptions.path);
          const worktree = await getWorktreeFromPath(denops, path);
          const diff = (await run(
            [
              "git",
              sourceParams.show ? "show" : "diff",
              "--no-color",
              "--no-prefix",
              "--no-relative",
              "--no-renames",
              "-U" + sourceParams.unifiedContext,
              ...(sourceParams.reverse ? ["-R"] : []),
              ...((!sourceParams.show && sourceParams.cached)
                ? ["--cached"]
                : []),
              ...(sourceParams.onlyFile ? [path] : []),
            ],
            worktree,
          )).split("\n");
          const chunks = parseDiff(diff);
          const items: Item<ActionData>[][] = [];
          for (const chunk of chunks) {
            const fileName = stdpath.join(worktree, chunk.newFileName);
            items.push(
              await Promise.all(chunk.header.map(async (line) => {
                const hl = line.startsWith("---")
                  ? "diffOldFile"
                  : line.startsWith("+++")
                  ? "diffNewFile"
                  : undefined;
                const highlight = await makeHighlight(denops, line, hl);
                return {
                  data: {
                    git_diff: {
                      lines: chunk.hunks.map((h) => h.lines).flat(),
                      worktree: worktree,
                      path: fileName,
                    },
                  } satisfies Data,
                  word: line,
                  action: {
                    lineNr: 1,
                    path: fileName,
                  },
                  ...highlight,
                };
              })),
            );
            for (const hunk of chunk.hunks) {
              items.push([{
                data: {
                  git_diff: {
                    lines: hunk.lines,
                    worktree: worktree,
                    path: fileName,
                  },
                } satisfies Data,
                word: hunk.header,
                action: {
                  lineNr: hunk.nstart,
                  path: fileName,
                },
                ...await makeHighlight(denops, hunk.header, "diffLine"),
              }]);
              items.push(
                await Promise.all(hunk.lines.map(async (line) => {
                  const highlight = await makeHighlight(
                    denops,
                    line.text,
                    hls[line.text[0]],
                  );
                  return {
                    data: {
                      git_diff: {
                        lines: [line],
                        worktree: worktree,
                        path: fileName,
                      },
                    } satisfies Data,
                    word: line.text,
                    action: {
                      lineNr: line.nlinum,
                      path: fileName,
                    },
                    ...highlight,
                  };
                })),
              );
            }
          }
          controller.enqueue(items.flat());
          controller.close();
        } catch (e: unknown) {
          await printError(denops, e, "gather failed");
        }
      },
    });
  }

  params(): Params {
    return defaultParams;
  }
}
