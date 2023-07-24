import { applyPatch, DiffLine, parseDiff } from "./udiff/diff.ts";
import { groupBy } from "https://deno.land/std@0.195.0/collections/group_by.ts";
import * as stdpath from "https://deno.land/std@0.195.0/path/mod.ts";
import { ActionData } from "https://deno.land/x/ddu_kind_file@v0.5.3/file.ts";
import {
  GatherArguments,
} from "https://deno.land/x/ddu_vim@v3.4.3/base/source.ts";
import {
  ActionArguments,
  ActionFlags,
  BaseSource,
  Item,
  ItemHighlight,
} from "https://deno.land/x/ddu_vim@v3.4.3/types.ts";
import { Denops } from "https://deno.land/x/denops_std@v5.0.1/mod.ts";
import * as u from "https://deno.land/x/unknownutil@v3.2.0/mod.ts";

type _ActionData = ActionData & {
  _git_diff: number; // hack: suppress preview window closer
};

const defaultParams = {
  cached: false,
  onlyFile: false,
  show: false,
};

type Data = {
  git_diff: {
    line: DiffLine;
    worktree: string;
    path: string;
  };
};

const isData: u.Predicate<Data> = u.isObjectOf({
  git_diff: u.isObjectOf({
    line: u.isObjectOf({
      text: u.isString,
      linum: u.isNumber,
      olinum: u.isNumber,
    }),
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
  "@": "diffLine",
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

export class Source extends BaseSource<Params> {
  override kind = "file";

  override actions = {
    applyPatch: async (args: ActionArguments<Params>) => {
      const isNonNull = <T>(x: T): x is NonNullable<T> => x != null;
      // ファイル単位で処理
      const itemsByFiles = groupBy(
        args.items
          .map((item) => u.maybe(item, isItemWithData))
          .filter(isNonNull), // 型ァ！(filter直だと上手く行かん)
        (item) => item.data.git_diff.path,
      );
      for (const [abspath, items] of Object.entries(itemsByFiles)) {
        // 型ァ！
        if (items == null) {
          continue;
        }
        const worktree = items[0].data.git_diff.worktree;
        const patches = items.map((item) => item.data.git_diff.line);
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
  }: GatherArguments<Params>): ReadableStream<Item<_ActionData>[]> {
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
              ...((!sourceParams.show && sourceParams.cached)
                ? ["--cached"]
                : []),
              ...(sourceParams.onlyFile ? [path] : []),
            ],
            worktree,
          )).split("\n");
          const chunks = parseDiff(diff);
          const items: Item<_ActionData>[][] = [];
          for (const chunk of chunks) {
            const fileName = stdpath.join(worktree, chunk.fileName);
            items.push(chunk.header.map((line, idx) => {
              const hl = line.startsWith("---")
                ? "diffOldFile"
                : line.startsWith("+++")
                ? "diffNewFile"
                : "";
              const hlID = "git_diff_hl_" + hl;
              return {
                word: line,
                action: {
                  lineNr: 1,
                  path: fileName,
                  _git_diff: -idx,
                },
                highlights: [{
                  name: hlID,
                  "hl_group": hl,
                  col: 1,
                  width: new TextEncoder().encode(line).length,
                }],
              };
            }));
            items.push(chunk.lines.map((line, idx) => {
              const highlights: ItemHighlight[] = [];
              const hl = hls[line.text[0]];
              if (hl != null) {
                highlights.push({
                  name: "git_diff_hl_" + hl,
                  "hl_group": hl,
                  col: 1,
                  width: new TextEncoder().encode(line.text).length,
                });
              }
              return {
                data: {
                  git_diff: {
                    line,
                    worktree: worktree,
                    path: fileName,
                  },
                } satisfies Data,
                word: line.text,
                action: {
                  lineNr: line.linum,
                  path: fileName,
                  _git_diff: idx,
                },
                highlights,
              };
            }));
          }
          controller.enqueue(items.flat());
          controller.close();
        } catch (e: unknown) {
          console.log(e);
        }
      },
    });
  }

  params(): Params {
    return defaultParams;
  }
}
