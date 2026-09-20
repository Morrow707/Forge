import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { workoutSetEntries } from "@shared/schema";
import { SET_BLOB_COLUMNS_EXCLUDED } from "./set-blob-columns";

// SET_BLOB_COLUMNS_EXCLUDED is the list of set columns the load charts, the day view's
// history and the session overview leave in the database. It has to be exactly the json
// columns of workoutSetEntries: one missing means a new capture blob rides along on every
// one of those reads again, one extra means the list names a column that does not exist and
// drizzle silently ignores it.

describe("SET_BLOB_COLUMNS_EXCLUDED", () => {
  it("names every json column of workoutSetEntries and nothing else", () => {
    const jsonColumns = Object.entries(getTableColumns(workoutSetEntries))
      .filter(([, column]) => column.dataType === "json")
      .map(([name]) => name)
      .sort();
    expect(Object.keys(SET_BLOB_COLUMNS_EXCLUDED).sort()).toEqual(jsonColumns);
    expect(Object.values(SET_BLOB_COLUMNS_EXCLUDED).every((v) => v === false)).toBe(true);
  });
});
