type DiffLine = {
  text: string;
  linum: number;
};

export type DiffData = {
  fileName: string;
  header: string[];
  lines: DiffLine[];
};

export const splitAtFile = (lines: string[]): string[][][] => {
  let ptr = 0;
  const files: string[][][] = [];
  while (ptr < lines.length) {
    if (lines[ptr].startsWith("---")) {
      const parsed = [[lines[ptr], lines[ptr + 1]]];
      ptr += 2;
      while (lines[ptr][0] === "@") {
        const hunkStart = ptr;
        // Note: hunk size omitted if 1
        const m = lines[ptr].match(/-(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))?/);
        if (m == null) {
          throw "invalid hunk at " + ptr;
        }
        const minusLength = parseInt(m[2] ?? "1");
        const plusLength = parseInt(m[4] ?? "1");

        let minusCount = 0;
        let plusCount = 0;

        ptr++;
        while (ptr < lines.length) {
          switch (lines[ptr][0]) {
            case " ":
              minusCount++;
              plusCount++;
              break;
            case "-":
              minusCount++;
              break;
            case "+":
              plusCount++;
              break;
          }
          if (minusCount === minusLength && plusCount === plusLength) {
            parsed.push(lines.slice(hunkStart, ++ptr));
            break;
          }
          ptr++;
        }
      }
      files.push(parsed);
    }
    ptr++;
  }
  return files;
};

export const parseHunk = (lines: string[]): DiffLine[] => {
  const parsed: DiffLine[] = [];
  const m = lines[0].match(/\+(\d+)/);
  if (m == null) {
    throw Error("m == null");
  }
  let linum = parseInt(m[0]);
  parsed.push({
    text: lines[0],
    linum,
  });
  for (let i = 1; i < lines.length; i++) {
    parsed.push({
      text: lines[i],
      linum: lines[i].startsWith("-") ? linum : linum++,
    });
  }
  return parsed;
};

export const parseDiff = (lines: string[]): DiffData[] => {
  const split = splitAtFile(lines);
  const result: DiffData[] = [];
  for (const chunk of split) {
    const fileName = chunk[0][1].slice(4).replace(/\t.*$/, "");
    const lines = chunk.slice(1).flatMap(parseHunk);
    result.push({
      fileName,
      header: chunk[0],
      lines,
    })
  }
  return result;
};
