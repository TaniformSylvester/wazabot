import { describe, expect, it } from "vitest";

import { recentTopics } from "@/lib/ai/tools/prefetch";
import { searchWords } from "@/lib/ai/tools/search-words";

describe("catalog search words", () => {
  it("keeps product words and drops everyday French, English and Pidgin", () => {
    expect(searchWords("Bonjour, c'est combien la robe Ankara rouge ?")).toEqual(["robe", "ankara", "rouge"]);
    expect(searchWords("How much for the black sneakers please")).toEqual(["black", "sneakers"]);
    expect(searchWords("Una get di wax for size L? How much e be")).toEqual(["wax", "size"]);
    expect(searchWords("Je prends 2")).toEqual(["prends"]);
    expect(searchWords("Bonsoir merci")).toEqual([]);
    expect(searchWords("l'ankara bleu")).toEqual(["ankara", "bleu"]);
  });

  it("looks back at what the conversation was about", () => {
    const history = [
      { role: "customer", text: "c'est combien la robe ankara ?" },
      { role: "assistant", text: "La Robe Ankara coûte 15 000 XAF." },
      { role: "customer", text: "je prends 2" },
    ];
    expect(recentTopics(history)).toEqual(["c'est combien la robe ankara ?", "La Robe Ankara coûte 15 000 XAF."]);
  });
});
